'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, Invoice, Property } from '@/lib/types';
import { formatCurrency, monthInputToTimestamp, timestampToMonthInput, timestampToDateInput, dateInputToTimestamp } from '@/lib/format';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, dangerLinkClass } from '@/lib/formStyles';
import { CurrencyInput } from '@/components/CurrencyInput';

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
    // migrados do sistema antigo. Vale tanto pra boletos pagos quanto
    // pendentes; pendentes ainda recebem um refresh abaixo com o valor
    // mais recente do contrato.
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

      // Boletos migrados do sistema antigo tinham dois campos de aluguel
      // separados ("valorAluguel" e "valorAtualContrato") que podiam ficar
      // dessincronizados. Para boletos ainda não pagos, usamos sempre o
      // valor atual do contrato, que é a fonte confiável — evita marcar
      // como pago um valor desatualizado.
      if (isEditing && invoice && invoice.status !== 'paid') {
        const contract = loadedContracts.find((c) => c.id === invoice.contractId);
        if (contract) {
          const currentRent = contract.currentRentValue || contract.rentValue || 0;
          setForm((f) => ({ ...f, rentAmount: String(currentRent) }));
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
      rentAmount: String(contract.currentRentValue || contract.rentValue || 0),
      iptuAmount: contract.collectsIptu ? String(property?.monthlyIptu ?? 0) : '0',
      insuranceAmount: String(property?.monthlyInsurance ?? 0),
      condoFeeAmount: String(property?.condoFee ?? 0),
      refundAmount: String(property?.refundFee ?? 0),
      // condoAmount (condomínio do mês) não é preenchido automaticamente —
      // varia todo mês, então precisa ser digitado a cada boleto.
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
        currentRentAmount: contract.currentRentValue || 0,
        iptuAmount: parseFloat(form.iptuAmount) || 0,
        extraFeeAmount: parseFloat(form.extraFeeAmount) || 0,
        insuranceAmount: parseFloat(form.insuranceAmount) || 0,
        condoAmount: parseFloat(form.condoAmount) || 0,
        refundAmount: parseFloat(form.refundAmount) || 0,
        condoFeeAmount: parseFloat(form.condoFeeAmount) || 0,
        totalAmount,
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
            Os valores abaixo são pré-preenchidos a partir do contrato e do imóvel — ajuste se necessário.
          </p>
        )}
        {isEditing && invoice?.status !== 'paid' && (
          <p className="mt-1 text-xs text-slate">
            O valor do aluguel abaixo foi atualizado para o valor atual do contrato.
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
            onChange={(e) => update('referenceMonth', e.target.value)}
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
        </div>
        <div>
          <label className={labelClass}>Taxa extra</label>
          <CurrencyInput className={inputClass} value={form.extraFeeAmount} onChange={(v) => update('extraFeeAmount', v)} />
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
          <label className={labelClass}>Reembolso (desconto)</label>
          <CurrencyInput className={inputClass} value={form.refundAmount} onChange={(v) => update('refundAmount', v)} />
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
