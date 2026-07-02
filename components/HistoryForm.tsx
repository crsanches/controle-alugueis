'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, HistoryEntry, HistoryEntryType } from '@/lib/types';
import { timestampToDateInput, dateInputToTimestamp } from '@/lib/format';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, dangerLinkClass } from '@/lib/formStyles';

const TYPE_OPTIONS: { value: HistoryEntryType; label: string }[] = [
  { value: 'general', label: 'Observação geral' },
  { value: 'renewal', label: 'Renovação de contrato' },
  { value: 'adjustment', label: 'Reajuste' },
  { value: 'incident', label: 'Ocorrência' },
];

export function HistoryForm({ entry }: { entry?: HistoryEntry }) {
  const router = useRouter();
  const isEditing = Boolean(entry);

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [form, setForm] = useState({
    contractId: entry?.contractId ?? '',
    date: timestampToDateInput(entry?.date) || new Date().toISOString().slice(0, 10),
    type: entry?.type ?? ('general' as HistoryEntryType),
    note: entry?.note ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions() {
      const snap = await getDocs(query(collection(db, 'contracts'), orderBy('tenantName', 'asc')));
      setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Contract));
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
        date: dateInputToTimestamp(form.date),
        type: form.type,
        note: form.note,
      };

      if (isEditing && entry) {
        await updateDoc(doc(db, 'history', entry.id), payload);
      } else {
        await addDoc(collection(db, 'history'), payload);
      }
      router.push('/history');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível salvar. Tente novamente.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    if (!confirm('Excluir este registro de histórico? Essa ação não pode ser desfeita.')) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'history', entry.id));
      router.push('/history');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Não foi possível excluir.');
      setSaving(false);
    }
  }

  if (loadingOptions) return <p className="text-slate">Carregando...</p>;

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <div>
        <label className={labelClass}>Contrato</label>
        <select className={inputClass} value={form.contractId} onChange={(e) => update('contractId', e.target.value)} required>
          <option value="">Selecione...</option>
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.tenantName} — {c.propertyName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Data</label>
          <input type="date" className={inputClass} value={form.date} onChange={(e) => update('date', e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>Tipo</label>
          <select className={inputClass} value={form.type} onChange={(e) => update('type', e.target.value as HistoryEntryType)}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Observação</label>
        <textarea
          className={inputClass}
          rows={5}
          value={form.note}
          onChange={(e) => update('note', e.target.value)}
          required
        />
      </div>

      {error && <p className="text-sm text-rust">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={() => router.push('/history')} className={secondaryButtonClass}>
          Cancelar
        </button>
        {isEditing && (
          <button type="button" onClick={handleDelete} disabled={saving} className={`ml-auto ${dangerLinkClass}`}>
            Excluir registro
          </button>
        )}
      </div>
    </form>
  );
}
