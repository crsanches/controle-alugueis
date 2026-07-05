'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, Invoice, Property } from '@/lib/types';
import { formatCurrency, monthInputToTimestamp, timestampToMonthInput, timestampToDateInput, dateInputToTimestamp } from '@/lib/format';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, dangerLinkClass } from '@/lib/formStyles';
import { CurrencyInput } from '@/components/CurrencyInput';
import {
  scheduledChargeForMonth,
  describeScheduleForMonth,
  iptuSchedule,
  refundFeeSchedule,
  extraCondoFeeSchedule,
} from '@/lib/chargeSchedule';

/**
 * Valor do aluguel vigente no mês de referência (YYYY-MM), percorrendo o
 * histórico de reajustes do contrato: vale o reajuste de data mais recente
 * com data <= mês de referência. Sem nenhum reajuste aplicável ao período,
 * vale o valor original do contrato; sem histórico algum, o valor atual.
 *
 * REGRA DE OURO: boleto pago é histórico e nunca é re-carimbado a partir do
 * contrato — esta função só é usada para boletos novos ou ainda pendentes.
 */
function rentForReferenceMonth(contract: Contract, referenceMonth: string): number {
  const history = contract.adjustmentHistory ?? [];
  if (!referenceMonth || history.length === 0) {
    return contract.currentRentValue || contract.rentValue || 0;
  }
  const toYm = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const applicable = history
    .filter((a) => a.date && toYm(a.date.toDate()) <= referenceMonth)
    .sort((x, y) => (y.date?.toMillis() ?? 0) - (x.date?.toMillis() ?? 0));
  return applicable[0]?.value ?? contract.rentValue ?? 0;
}

export function InvoiceForm({ invoice }: { invoice?: Invoice }) {
  const router = useRouter();
  const isEditing = Boolean(invoice);

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [form, setForm] = useState({
    contractId: invoice?.contractId ?? '',
    referenceMonth: timestampToMonthInput(invoice?.referenceMonth),
    dueDay: String(invoice?.dueDay ?? ''),
    // usa o valor ATUAL do aluguel (currentRentAmount), nao o original/
    // congelado (rentAmount) — mesmo campo problemático dos boletos
    // migrados do sistema antigo. Boletos pendentes recebem um refresh
    // abaixo com o valor vigente no SEU mês de referência.
    rentAmount: String(invoice?.currentRentAmount || invoice?.rentAmount || 0),
    iptuAmount: String(invoice?.iptuAmount ?? 0),
    extraFeeAmount: String(invoice?.extraFeeAmount ?? 0),
    insuranceAmount: String(invoice?.insuranceAmount ?? 0),
    condoAmount: String(invoice?.condoAmount ?? 0),
    refundAmount: String(invoice?.refundAmount ?? 0),
    condoFeeAmount: String(invoice?.condoFeeAmount ?? 0),
    status: invoice?.status === 'paid' ? 'paid' : 'pending',
    paidDate: timestampToDateInput(invoice?.paidDate),
    notes: invoice?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions() {
      const [contractsSnap, propertiesSnap] = await Promise.all([
        getDocs(query(collection(db, 'contracts'), orderBy('tenantName', 'asc'))),
        getDocs(collection(db, 'properties')),
      ]);
      const loadedContracts = contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Contract);
      setContracts(loadedContracts);
      setProperties(propertiesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Property));
      setLoadingOptions(false);

      // Para boletos ainda não pagos, o valor do aluguel exibido é o valor
      // vigente no MÊS DE REFERÊNCIA do boleto (via histórico de reajustes),
      // e não o valor atual do contrato — um boleto pendente de mês
      // retroativo deve receber o valor da época, não o de hoje.
      // Boletos PAGOS nunca são atualizados: o valor deles é histórico.
      if (isEditing && invoice && invoice.status !== 'paid') {
        const contract = loadedContracts.find((c) => c.id === invoice.contractId);
        if (contract) {
          const refMonth = timestampToMonthInput(invoice.referenceMonth);
          setForm((f) => ({ ...f, rentAmount: String(rentForReferenceMonth(contract, refMonth)) }));
        }
      }
    }
    loadOptions();
  }, [isEditing, invoice]);

  // Só mostra contratos ativos na lista, exceto se o boleto sendo editado
  // já estiver vinculado a um contrato que não é mais ativo — nesse caso
  // ele continua aparecendo, senão a seleção ficaria em branco.
  const contractOptions = useMemo(() => {
    const activeOnes = contracts.filter((c) => c.status === 'active');
    if (isEditing && invoice && !activeOnes.some((c) => c.id === invoice.contractId)) {
      const current = contracts.find((c) => c.id === invoice.contractId);
      if (current) return [...activeOnes, current];
    }
    return activeOnes;
  }, [contracts, isEditing, invoice]);

  // Contrato e imóvel selecionados no momento — usados para confrontar o mês
  // de referência do boleto com os períodos de cobrança do imóvel.
  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === form.contractId),
    [contracts, form.contractId]
  );
  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedContract?.propertyId),
    [properties, selectedContract]
  );

  // Rótulos informativos ("parcela 3 de 10", "fora do período...") exibidos
  // sob os campos e reaproveitáveis no aviso ao inquilino.
  const iptuScheduleLabel = describeScheduleForMonth(iptuSchedule(selectedProperty), form.referenceMonth);
  const refundScheduleLabel = describeScheduleForMonth(refundFeeSchedule(selectedProperty), form.referenceMonth);
  const extraScheduleLabel = describeScheduleForMonth(extraCondoFeeSchedule(selectedProperty), form.referenceMonth);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Ao escolher um contrato (num boleto novo), preenche valores a partir do contrato + imóvel
  function handleContractChange(contractId: string) {
    update('contractId', contractId);
    if (isEditing) return; // nao sobrescreve dados ja existentes ao editar

    const contract = contracts.find((c) => c.id === contractId);
    if (!contract) return;
    const property = properties.find((p) => p.id === contract.propertyId);

    setForm((f) => ({
      ...f,
      contractId,
      dueDay: String(contract.dueDay ?? ''),
      // valor vigente no mês de referência do boleto (se já preenchido);
      // boleto retroativo nasce com o valor da época, não o de hoje
      rentAmount: String(rentForReferenceMonth(contract, f.referenceMonth)),
      // IPTU só entra se o mês de referência estiver dentro do período de
      // cobrança do imóvel (ex.: 10 parcelas a partir do mês de início)
      iptuAmount: contract.collectsIptu
        ? String(scheduledChargeForMonth(property?.monthlyIptu ?? 0, iptuSchedule(property), f.referenceMonth))
        : '0',
      insuranceAmount: String(property?.monthlyInsurance ?? 0),
      condoFeeAmount: String(property?.condoFee ?? 0),
      // Fundo de reserva: indefinido ou por N meses, conforme o cadastro
      refundAmount: String(
        scheduledChargeForMonth(property?.refundFee ?? 0, refundFeeSchedule(property), f.referenceMonth)
      ),
      // Outras taxas extras do condomínio → campo "Taxa extra" do boleto
      extraFeeAmount: String(
        scheduledChargeForMonth(property?.extraCondoFee ?? 0, extraCondoFeeSchedule(property), f.referenceMonth)
      ),
      // condoAmount (condomínio do mês) não é preenchido automaticamente —
      // varia todo mês, então precisa ser digitado a cada boleto.
    }));
  }

  // Num boleto novo, mudar o mês de referência re-sincroniza o aluguel e as
  // taxas com período (IPTU, fundo de reserva, taxa extra) com o valor
  // vigente naquele mês. Ao editar, os valores não são mexidos — quem
  // manda é o refresh do loadOptions (pendente) ou o valor gravado (pago).
  function handleReferenceMonthChange(referenceMonth: string) {
    if (isEditing) {
      update('referenceMonth', referenceMonth);
      return;
    }
    const contract = contracts.find((c) => c.id === form.contractId);
    const property = contract ? properties.find((p) => p.id === contract.propertyId) : undefined;
    setForm((f) => ({
      ...f,
      referenceMonth,
      rentAmount: contract ? String(rentForReferenceMonth(contract, referenceMonth)) : f.rentAmount,
      ...(contract
        ? {
            iptuAmount: contract.collectsIptu
              ? String(scheduledChargeForMonth(property?.monthlyIptu ?? 0, iptuSchedule(property), referenceMonth))
              : '0',
            refundAmount: String(
              scheduledChargeForMonth(property?.refundFee ?? 0, refundFeeSchedule(property), referenceMonth)
            ),
            extraFeeAmount: String(
              scheduledChargeForMonth(property?.extraCondoFee ?? 0, extraCondoFeeSchedule(property), referenceMonth)
            ),
          }
        : {}),
    }));
  }

  const totalAmount = useMemo(() => {
    const n = (v: string) => parseFloat(v) || 0;
    return (
      n(form.rentAmount) +
      n(form.iptuAmount) +
      n(form.extraFeeAmount) +
      n(form.insuranceAmount) +
      n(form.condoAmount) -
      n(form.refundAmount) -
      n(form.condoFeeAmount)
    );
  }, [form]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const contract = contracts.find((c) => c.id === form.contractId);
      if (!contract) {
        setError('Selecione um contrato válido.');
        setSaving(false);
        return;
      }

      const payload = {
        contractId: form.contractId,
        tenantName: contract.tenantName,
        propertyName: contract.propertyName,
        referenceMonth: monthInputToTimestamp(form.referenceMonth),
        dueDay: parseInt(form.dueDay, 10) || null,
        // Vencimento é no mês SEGUINTE ao mês de referência (ex: referente a
        // maio, vence em junho). form.referenceMonth é "YYYY-MM" com mês
        // 1-based; numericamente esse valor já corresponde ao índice
        // 0-based do mês seguinte, então não subtraímos 1 aqui.
        dueDate:
          form.referenceMonth && form.dueDay
            ? new Date(
                Date.UTC(
                  Number(form.referenceMonth.slice(0, 4)),
                  Number(form.referenceMonth.slice(5, 7)),
                  parseInt(form.dueDay, 10)
                )
              )
            : null,
        rentAmount: parseFloat(form.rentAmount) || 0,
        // BLINDAGEM: nunca carimbar contract.currentRentValue aqui.
        // - Boleto PAGO: preserva o valor do formulário (histórico; só muda
        //   se você editar o campo Aluguel de propósito).
        // - Boleto novo/pendente: valor vigente no mês de referência,
        //   derivado do histórico de reajustes do contrato.
        currentRentAmount:
          isEditing && invoice?.status === 'paid'
            ? parseFloat(form.rentAmount) || 0
            : rentForReferenceMonth(contract, form.referenceMonth),
        iptuAmount: parseFloat(form.iptuAmount) || 0,
        extraFeeAmount: parseFloat(form.extraFeeAmount) || 0,
        insuranceAmount: parseFloat(form.insuranceAmount) || 0,
        condoAmount: parseFloat(form.condoAmount) || 0,
        refundAmount: parseFloat(form.refundAmount) || 0,
        condoFeeAmount: parseFloat(form.condoFeeAmount) || 0,
        totalAmount,
        // Rótulos dos períodos de cobrança no mês do boleto (ex.: "parcela
        // 3 de 10"). Gravados no boleto para o recibo em PDF e o aviso por
        // WhatsApp exibirem ao inquilino sem precisar reconsultar o imóvel.
        iptuScheduleLabel: (parseFloat(form.iptuAmount) || 0) > 0 ? iptuScheduleLabel : null,
        refundScheduleLabel: (parseFloat(form.refundAmount) || 0) > 0 ? refundScheduleLabel : null,
        extraFeeScheduleLabel: (parseFloat(form.extraFeeAmount) || 0) > 0 ? extraScheduleLabel : null,
        status: form.status,
        paidDate: form.status === 'paid' ? dateInputToTimestamp(form.paidDate) : null,
        notes: form.notes,
        pdfUrl: invoice?.pdfUrl ?? null,
        whatsappSentAt: invoice?.whatsappSentAt ?? null,
      };

      if (isEditing && invoice) {
        await updateDoc(doc(db, 'invoices', invoice.id), payload);
      } else {
        await addDoc(collection(db, 'invoices'), payload);
      }
      router.push('/invoices');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível salvar. Tente novamente.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!invoice) return;
    if (!confirm('Excluir este boleto? Essa ação não pode ser desfeita.')) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'invoices', invoice.id));
      router.push('/invoices');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível excluir.');
      setSaving(false);
    }
  }

  if (loadingOptions) return <p className="text-slate">Carregando...</p>;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <div>
        <label className={labelClass}>Contrato</label>
        <select
          className={inputClass}
          value={form.contractId}
          onChange={(e) => handleContractChange(e.target.value)}
          required
        >
          <option value="">Selecione...</option>
          {contractOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.tenantName} — {c.propertyName}
              {c.status !== 'active' ? ' (inativo)' : ''}
            </option>
          ))}
        </select>
        {!isEditing && (
          <p className="mt-1 text-xs text-slate">
            Os valores abaixo são pré-preenchidos a partir do contrato e do imóvel — IPTU, fundo de reserva e taxa
            extra respeitam o período de cobrança cadastrado no imóvel para o mês de referência.
          </p>
        )}
        {isEditing && invoice?.status !== 'paid' && (
          <p className="mt-1 text-xs text-slate">
            O valor do aluguel abaixo foi atualizado para o valor vigente no mês de referência do boleto.
          </p>
        )}
        {isEditing && invoice?.status === 'paid' && (
          <p className="mt-1 text-xs text-slate">
            Boleto pago: os valores gravados são preservados e não acompanham reajustes do contrato.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Mês de referência</label>
          <input
            type="month"
            className={inputClass}
            value={form.referenceMonth}
            onChange={(e) => handleReferenceMonthChange(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Dia de vencimento</label>
          <input
            type="number"
            min={1}
            max={31}
            className={inputClass}
            value={form.dueDay}
            onChange={(e) => update('dueDay', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Aluguel</label>
          <CurrencyInput className={inputClass} value={form.rentAmount} onChange={(v) => update('rentAmount', v)} />
        </div>
        <div>
          <label className={labelClass}>IPTU</label>
          <CurrencyInput className={inputClass} value={form.iptuAmount} onChange={(v) => update('iptuAmount', v)} />
          {iptuScheduleLabel && <p className="mt-1 text-xs text-slate">{iptuScheduleLabel}</p>}
        </div>
        <div>
          <label className={labelClass}>Taxa extra</label>
          <CurrencyInput className={inputClass} value={form.extraFeeAmount} onChange={(v) => update('extraFeeAmount', v)} />
          {extraScheduleLabel && <p className="mt-1 text-xs text-slate">{extraScheduleLabel}</p>}
        </div>
        <div>
          <label className={labelClass}>Seguro</label>
          <CurrencyInput className={inputClass} value={form.insuranceAmount} onChange={(v) => update('insuranceAmount', v)} />
        </div>
        <div>
          <label className={labelClass}>Condomínio do mês (soma)</label>
          <CurrencyInput className={inputClass} value={form.condoAmount} onChange={(v) => update('condoAmount', v)} />
          <p className="mt-1 text-xs text-slate">Varia todo mês — digite o valor do boleto do condomínio atual.</p>
        </div>
        <div>
          <label className={labelClass}>Reembolso / fundo de reserva (desconto)</label>
          <CurrencyInput className={inputClass} value={form.refundAmount} onChange={(v) => update('refundAmount', v)} />
          {refundScheduleLabel && <p className="mt-1 text-xs text-slate">{refundScheduleLabel}</p>}
        </div>
        <div>
          <label className={labelClass}>Taxa condominial do imóvel (desconto)</label>
          <CurrencyInput className={inputClass} value={form.condoFeeAmount} onChange={(v) => update('condoFeeAmount', v)} />
        </div>
      </div>

      <div className="rounded-md border border-hairline bg-paperDim/60 px-4 py-3">
        <p className={labelClass}>Total calculado</p>
        <p className="font-display text-xl money">{formatCurrency(totalAmount)}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Status</label>
          <select
            className={inputClass}
            value={form.status}
            onChange={(e) => {
              const newStatus = e.target.value;
              setForm((f) => ({
                ...f,
                status: newStatus,
                paidDate: newStatus === 'paid' && !f.paidDate ? new Date().toISOString().slice(0, 10) : f.paidDate,
              }));
            }}
          >
            <option value="pending">Pendente</option>
            <option value="paid">Pago</option>
          </select>
          <p className="mt-1 text-xs text-slate">
            "Atrasado" aparece sozinho na listagem quando a data de vencimento passa — não precisa marcar manualmente.
          </p>
        </div>

        {form.status === 'paid' && (
          <div>
            <label className={labelClass}>Data do pagamento</label>
            <input
              type="date"
              className={inputClass}
              value={form.paidDate}
              onChange={(e) => update('paidDate', e.target.value)}
              required
            />
          </div>
        )}
      </div>

      <div>
        <label className={labelClass}>Observações:</label>
        <textarea
          className={inputClass}
          rows={8}
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={() => router.push('/invoices')} className={secondaryButtonClass}>
          Cancelar
        </button>
        {isEditing && (
          <button type="button" onClick={handleDelete} disabled={saving} className={`ml-auto ${dangerLinkClass}`}>
            Excluir boleto
          </button>
        )}
      </div>
    </form>
  );
}