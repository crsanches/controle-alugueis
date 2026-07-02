'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Property } from '@/lib/types';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, dangerLinkClass } from '@/lib/formStyles';

export function PropertyForm({ property }: { property?: Property }) {
  const router = useRouter();
  const isEditing = Boolean(property);

  const [form, setForm] = useState({
    name: property?.name ?? '',
    address: property?.address ?? '',
    code: property?.code ?? '',
    iptuCode: property?.iptuCode ?? '',
    energyCode: property?.energyCode ?? '',
    managementCompany: property?.managementCompany ?? '',
    monthlyIptu: String(property?.monthlyIptu ?? 0),
    monthlyInsurance: String(property?.monthlyInsurance ?? 0),
    refundFee: String(property?.refundFee ?? 0),
    condoFee: String(property?.condoFee ?? 0),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        code: form.code,
        iptuCode: form.iptuCode,
        energyCode: form.energyCode,
        managementCompany: form.managementCompany,
        monthlyIptu: parseFloat(form.monthlyIptu) || 0,
        monthlyInsurance: parseFloat(form.monthlyInsurance) || 0,
        refundFee: parseFloat(form.refundFee) || 0,
        condoFee: parseFloat(form.condoFee) || 0,
      };

      if (isEditing && property) {
        await updateDoc(doc(db, 'properties', property.id), payload);
      } else {
        await addDoc(collection(db, 'properties'), payload);
      }
      router.push('/properties');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível salvar. Tente novamente.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!property) return;
    if (!confirm(`Excluir o imóvel "${property.name}"? Essa ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'properties', property.id));
      router.push('/properties');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível excluir.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <div>
        <label className={labelClass}>Nome do imóvel</label>
        <input className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} required />
      </div>

      <div>
        <label className={labelClass}>Endereço</label>
        <input className={inputClass} value={form.address} onChange={(e) => update('address', e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Código</label>
          <input className={inputClass} value={form.code} onChange={(e) => update('code', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Código IPTU</label>
          <input className={inputClass} value={form.iptuCode} onChange={(e) => update('iptuCode', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Código Enel</label>
          <input className={inputClass} value={form.energyCode} onChange={(e) => update('energyCode', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Administradora</label>
        <input
          className={inputClass}
          value={form.managementCompany}
          onChange={(e) => update('managementCompany', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Taxa condominial mensal (R$)</label>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.condoFee}
            onChange={(e) => update('condoFee', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>IPTU mensal (R$)</label>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.monthlyIptu}
            onChange={(e) => update('monthlyIptu', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Seguro mensal (R$)</label>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.monthlyInsurance}
            onChange={(e) => update('monthlyInsurance', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Taxa de reembolso (R$)</label>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.refundFee}
            onChange={(e) => update('refundFee', e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={() => router.push('/properties')} className={secondaryButtonClass}>
          Cancelar
        </button>
        {isEditing && (
          <button type="button" onClick={handleDelete} disabled={saving} className={`ml-auto ${dangerLinkClass}`}>
            Excluir imóvel
          </button>
        )}
      </div>
    </form>
  );
}
