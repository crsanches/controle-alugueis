'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, HistoryEntry, Property, Tenant } from '@/lib/types';
import { timestampToDateInput, dateInputToTimestamp, formatDate, formatCurrency } from '@/lib/format';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, dangerLinkClass } from '@/lib/formStyles';
import { CurrencyInput } from '@/components/CurrencyInput';

export function ContractForm({ contract }: { contract?: Contract }) {
  const router = useRouter();
  const isEditing = Boolean(contract);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [form, setForm] = useState({
    tenantId: contract?.tenantId ?? '',
    propertyId: contract?.propertyId ?? '',
    startDate: timestampToDateInput(contract?.startDate),
    endDate: timestampToDateInput(contract?.endDate),
    dueDay: String(contract?.dueDay ?? ''),
    rentValue: String(contract?.rentValue ?? 0),
    currentRentValue: String(contract?.currentRentValue ?? 0),
    adjustmentType: contract?.adjustmentType ?? 'IGPM',
    nextAdjustmentDate: timestampToDateInput(contract?.nextAdjustmentDate),
    collectsIncomeTax: contract?.collectsIncomeTax ?? false,
    collectsIptu: contract?.collectsIptu ?? true,
    status: contract?.status === 'inactive' ? 'inactive' : 'active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // reajustes adicionados nesta sessão de edição, ainda não salvos
  const [pendingAdjustments, setPendingAdjustments] = useState<{ date: string; value: string }[]>([]);
  const [newAdjustmentDate, setNewAdjustmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [newAdjustmentValue, setNewAdjustmentValue] = useState('0');

  const existingAdjustments = contract?.adjustmentHistory ?? [];

  function handleAddAdjustment() {
    const value = parseFloat(newAdjustmentValue) || 0;
    if (!newAdjustmentDate || value <= 0) return;

    setPendingAdjustments((list) => [...list, { date: newAdjustmentDate, value: newAdjustmentValue }]);

    // se esse for o reajuste mais recente até agora, já atualiza o valor
    // atual do aluguel automaticamente (dá pra ajustar na mão depois)
    const allDates = [
      ...existingAdjustments.map((a) => a.date?.toDate().getTime() ?? 0),
      ...pendingAdjustments.map((a) => new Date(a.date).getTime()),
    ];
    const newDateMs = new Date(newAdjustmentDate).getTime();
    if (allDates.length === 0 || newDateMs >= Math.max(...allDates)) {
      update('currentRentValue', newAdjustmentValue);
    }

    setNewAdjustmentDate(new Date().toISOString().slice(0, 10));
    setNewAdjustmentValue('0');
  }

  function handleRemovePendingAdjustment(index: number) {
    setPendingAdjustments((list) => list.filter((_, i) => i !== index));
  }

  // --- renovação (sempre por 30 meses) ---
  const [renewalHistory, setRenewalHistory] = useState<HistoryEntry[]>([]);
  const [renewalDateOverride, setRenewalDateOverride] = useState('');

  function addMonths(dateStr: string, months: number): string {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  const suggestedRenewalDate = addMonths(form.endDate, 30);
  const renewalDateValue = renewalDateOverride || suggestedRenewalDate;

  function handleApplyRenewal() {
    if (!renewalDateValue) return;
    update('endDate', renewalDateValue);
    setRenewalDateOverride('');
  }

  const renewalPending = isEditing && contract && form.endDate !== timestampToDateInput(contract.endDate);

  useEffect(() => {
    async function loadOptions() {
      const [tenantsSnap, propertiesSnap] = await Promise.all([
        getDocs(query(collection(db, 'tenants'), orderBy('name', 'asc'))),
        getDocs(query(collection(db, 'properties'), orderBy('name', 'asc'))),
      ]);
      setTenants(tenantsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Tenant));
      setProperties(propertiesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Property));
      setLoadingOptions(false);
    }
    loadOptions();
  }, []);

  useEffect(() => {
    async function loadRenewalHistory() {
      if (!isEditing || !contract) return;
      const snap = await getDocs(
        query(collection(db, 'history'), where('contractId', '==', contract.id), where('type', '==', 'renewal'))
      );
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as HistoryEntry)
        .sort((a, b) => (b.date?.toMillis() ?? 0) - (a.date?.toMillis() ?? 0));
      setRenewalHistory(rows);
    }
    loadRenewalHistory();
  }, [isEditing, contract]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const tenant = tenants.find((t) => t.id === form.tenantId);
      const property = properties.find((p) => p.id === form.propertyId);

      if (!tenant || !property) {
        setError('Selecione um inquilino e um imóvel válidos.');
        setSaving(false);
        return;
      }

      const newAdjustmentEntries = pendingAdjustments.map((a) => ({
        date: dateInputToTimestamp(a.date),
        value: parseFloat(a.value) || 0,
      }));

      const payload = {
        tenantId: form.tenantId,
        tenantName: tenant.name,
        propertyId: form.propertyId,
        propertyName: property.name,
        startDate: dateInputToTimestamp(form.startDate),
        endDate: dateInputToTimestamp(form.endDate),
        dueDay: parseInt(form.dueDay, 10) || null,
        rentValue: parseFloat(form.rentValue) || 0,
        currentRentValue: parseFloat(form.currentRentValue) || 0,
        adjustmentType: form.adjustmentType,
        nextAdjustmentDate: dateInputToTimestamp(form.nextAdjustmentDate),
        collectsIncomeTax: form.collectsIncomeTax,
        collectsIptu: form.collectsIptu,
        status: form.status,
        adjustmentHistory: [...existingAdjustments, ...newAdjustmentEntries],
      };

      if (isEditing && contract) {
        await updateDoc(doc(db, 'contracts', contract.id), payload);

        // registra automaticamente uma "renovação" no histórico quando o
        // fim do contrato é estendido para uma data mais distante
        const previousEndDate = contract.endDate?.toDate();
        const newEndDate = payload.endDate?.toDate();
        if (previousEndDate && newEndDate && newEndDate.getTime() > previousEndDate.getTime()) {
          await addDoc(collection(db, 'history'), {
            contractId: contract.id,
            tenantName: tenant.name,
            propertyName: property.name,
            date: payload.endDate,
            type: 'renewal',
            note: `Contrato renovado. Novo vencimento: ${formatDate(payload.endDate)} (anterior: ${formatDate(contract.endDate)}).`,
          });
        }

        // registra cada reajuste novo no histórico também
        for (const entry of newAdjustmentEntries) {
          await addDoc(collection(db, 'history'), {
            contractId: contract.id,
            tenantName: tenant.name,
            propertyName: property.name,
            date: entry.date,
            type: 'adjustment',
            note: `Reajuste registrado. Novo valor do aluguel: ${formatCurrency(entry.value)}.`,
          });
        }
      } else {
        await addDoc(collection(db, 'contracts'), payload);
      }
      router.push('/contracts');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível salvar. Tente novamente.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!contract) return;
    if (!confirm(`Excluir o contrato de "${contract.tenantName}"? Essa ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'contracts', contract.id));
      router.push('/contracts');
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Inquilino</label>
          <select className={inputClass} value={form.tenantId} onChange={(e) => update('tenantId', e.target.value)} required>
            <option value="">Selecione...</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Imóvel</label>
          <select className={inputClass} value={form.propertyId} onChange={(e) => update('propertyId', e.target.value)} required>
            <option value="">Selecione...</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Início do contrato</label>
          <input type="date" className={inputClass} value={form.startDate} onChange={(e) => update('startDate', e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>Fim do contrato</label>
          <input type="date" className={inputClass} value={form.endDate} onChange={(e) => update('endDate', e.target.value)} required />
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
            placeholder="Ex: 15"
          />
        </div>
      </div>

      {isEditing && (
        <div className="border border-hairline bg-paperDim/40 p-4">
          <p className={labelClass}>Histórico de renovações</p>

          {renewalHistory.length === 0 && !renewalPending && (
            <p className="mt-2 text-sm text-slate">Nenhuma renovação registrada ainda.</p>
          )}

          {renewalHistory.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {renewalHistory.map((h) => (
                <li key={h.id} className="flex justify-between border-b border-hairline/70 py-1.5">
                  <span>{formatDate(h.date)}</span>
                  <span className="text-slate">novo vencimento registrado</span>
                </li>
              ))}
            </ul>
          )}

          {renewalPending && (
            <p className="mt-2 rounded-sm bg-sage/10 px-3 py-2 text-sm text-sage">
              Renovação pendente: vencimento alterado para {formatDate(dateInputToTimestamp(form.endDate))} — será
              registrada no Histórico ao salvar.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className={labelClass}>Novo vencimento (sugestão: +30 meses)</label>
              <input
                type="date"
                className={inputClass}
                value={renewalDateValue}
                onChange={(e) => setRenewalDateOverride(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={handleApplyRenewal}
              className="border border-ink px-4 py-2 text-sm text-ink hover:bg-ink hover:text-paper"
            >
              + Registrar renovação
            </button>
          </div>
          <p className="mt-2 text-xs text-slate">
            Isso atualiza o campo "Fim do contrato" acima. A renovação fica salva no Histórico assim que você clicar
            em "Salvar" no final do formulário.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Valor original do contrato</label>
          <CurrencyInput className={inputClass} value={form.rentValue} onChange={(v) => update('rentValue', v)} />
        </div>
        <div>
          <label className={labelClass}>Valor atual do aluguel</label>
          <CurrencyInput
            className={inputClass}
            value={form.currentRentValue}
            onChange={(v) => update('currentRentValue', v)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Índice de reajuste</label>
          <select className={inputClass} value={form.adjustmentType} onChange={(e) => update('adjustmentType', e.target.value)}>
            <option value="IGPM">IGP-M</option>
            <option value="IPCA">IPCA</option>
            <option value="OUTRO">Outro</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Próximo reajuste</label>
          <input
            type="date"
            className={inputClass}
            value={form.nextAdjustmentDate}
            onChange={(e) => update('nextAdjustmentDate', e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-8">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.collectsIptu}
            onChange={(e) => update('collectsIptu', e.target.checked)}
          />
          Recolhe IPTU
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.collectsIncomeTax}
            onChange={(e) => update('collectsIncomeTax', e.target.checked)}
          />
          Recolhe Imposto de Renda
        </label>
      </div>

      {isEditing && (
        <div className="border border-hairline bg-paperDim/40 p-4">
          <p className={labelClass}>Histórico de reajustes</p>

          {existingAdjustments.length === 0 && pendingAdjustments.length === 0 && (
            <p className="mt-2 text-sm text-slate">Nenhum reajuste registrado ainda.</p>
          )}

          {(existingAdjustments.length > 0 || pendingAdjustments.length > 0) && (
            <ul className="mt-2 space-y-1 text-sm">
              {existingAdjustments
                .slice()
                .sort((a, b) => (b.date?.toMillis() ?? 0) - (a.date?.toMillis() ?? 0))
                .map((a, i) => (
                  <li key={`existing-${i}`} className="flex justify-between border-b border-hairline/70 py-1.5">
                    <span>{formatDate(a.date)}</span>
                    <span className="money">{formatCurrency(a.value)}</span>
                  </li>
                ))}
              {pendingAdjustments.map((a, i) => (
                <li
                  key={`pending-${i}`}
                  className="flex items-center justify-between border-b border-hairline/70 py-1.5 text-sage"
                >
                  <span>{new Date(a.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} (novo)</span>
                  <span className="flex items-center gap-3">
                    <span className="money">{formatCurrency(parseFloat(a.value) || 0)}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePendingAdjustment(i)}
                      className="text-xs text-rust hover:underline"
                    >
                      remover
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
            <div>
              <label className={labelClass}>Data do reajuste</label>
              <input
                type="date"
                className={inputClass}
                value={newAdjustmentDate}
                onChange={(e) => setNewAdjustmentDate(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Novo valor do aluguel</label>
              <CurrencyInput className={inputClass} value={newAdjustmentValue} onChange={setNewAdjustmentValue} />
            </div>
            <button
              type="button"
              onClick={handleAddAdjustment}
              className="border border-ink px-4 py-2 text-sm text-ink hover:bg-ink hover:text-paper"
            >
              + Adicionar reajuste
            </button>
          </div>
          <p className="mt-2 text-xs text-slate">
            Registrar aqui atualiza o "Valor atual do aluguel" acima (se for o reajuste mais recente) e fica salvo no
            Histórico assim que você clicar em "Salvar" no final do formulário.
          </p>
        </div>
      )}

      <div>
        <label className={labelClass}>Status</label>
        <select className={inputClass} value={form.status} onChange={(e) => update('status', e.target.value)}>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={() => router.push('/contracts')} className={secondaryButtonClass}>
          Cancelar
        </button>
        {isEditing && (
          <button type="button" onClick={handleDelete} disabled={saving} className={`ml-auto ${dangerLinkClass}`}>
            Excluir contrato
          </button>
        )}
      </div>
    </form>
  );
}