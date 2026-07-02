'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, Property, Tenant } from '@/lib/types';
import { timestampToDateInput, dateInputToTimestamp, formatDate } from '@/lib/format';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, dangerLinkClass } from '@/lib/formStyles';

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
        // preserva o historico de reajustes existente; nao editavel neste formulario ainda
        adjustmentHistory: contract?.adjustmentHistory ?? [],
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Valor original do contrato (R$)</label>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.rentValue}
            onChange={(e) => update('rentValue', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Valor atual do aluguel (R$)</label>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.currentRentValue}
            onChange={(e) => update('currentRentValue', e.target.value)}
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
