'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Tenant } from '@/lib/types';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, dangerLinkClass } from '@/lib/formStyles';

export function TenantForm({ tenant }: { tenant?: Tenant }) {
  const router = useRouter();
  const isEditing = Boolean(tenant);

  const [form, setForm] = useState({
    name: tenant?.name ?? '',
    phone: tenant?.phone ?? '',
    cpf: tenant?.cpf ?? '',
    email: tenant?.email ?? '',
    status: tenant?.status === 'inactive' ? 'inactive' : 'active',
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
      if (isEditing && tenant) {
        await updateDoc(doc(db, 'tenants', tenant.id), { ...form });
      } else {
        await addDoc(collection(db, 'tenants'), { ...form });
      }
      router.push('/tenants');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível salvar. Tente novamente.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!tenant) return;
    if (!confirm(`Excluir o inquilino "${tenant.name}"? Essa ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'tenants', tenant.id));
      router.push('/tenants');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível excluir.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <div>
        <label className={labelClass}>Nome completo</label>
        <input className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Telefone</label>
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="11-98765-4321"
          />
        </div>
        <div>
          <label className={labelClass}>CPF</label>
          <input
            className={inputClass}
            value={form.cpf}
            onChange={(e) => update('cpf', e.target.value)}
            placeholder="000.000.000-00"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>E-mail</label>
        <input type="email" className={inputClass} value={form.email} onChange={(e) => update('email', e.target.value)} />
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
        <button type="button" onClick={() => router.push('/tenants')} className={secondaryButtonClass}>
          Cancelar
        </button>
        {isEditing && (
          <button type="button" onClick={handleDelete} disabled={saving} className={`ml-auto ${dangerLinkClass}`}>
            Excluir inquilino
          </button>
        )}
      </div>
    </form>
  );
}
