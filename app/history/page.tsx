'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, HistoryEntry, HistoryEntryType } from '@/lib/types';
import { formatDate } from '@/lib/format';

const TYPE_LABELS: Record<HistoryEntryType, string> = {
  general: 'Observação',
  renewal: 'Renovação',
  adjustment: 'Reajuste',
  incident: 'Ocorrência',
};

const TYPE_STYLES: Record<HistoryEntryType, string> = {
  general: 'bg-slate/15 text-slate',
  renewal: 'bg-sage/15 text-sage',
  adjustment: 'bg-terracotta/15 text-terracotta',
  incident: 'bg-rust/15 text-rust',
};

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        const [historySnap, contractsSnap] = await Promise.all([
          getDocs(query(collection(db, 'history'), orderBy('date', 'desc'))),
          getDocs(collection(db, 'contracts')),
        ]);

        // mapa contractId -> nomes, usado para preencher registros antigos
        // que foram migrados sem tenantName/propertyName denormalizados
        const contractsById = new Map<string, Contract>();
        contractsSnap.docs.forEach((d) => {
          contractsById.set(d.id, { id: d.id, ...d.data() } as Contract);
        });

        const rows = historySnap.docs.map((d) => {
          const data = d.data();
          const contract = contractsById.get(data.contractId);
          return {
            id: d.id,
            contractId: data.contractId,
            tenantName: data.tenantName || contract?.tenantName || '—',
            propertyName: data.propertyName || contract?.propertyName || '—',
            date: data.date ?? null,
            note: data.note || '',
            type: (data.type as HistoryEntryType) || 'general',
          } as HistoryEntry;
        });

        setEntries(rows);
      } catch (err) {
        console.error(err);
        setError('Não foi possível carregar o histórico. Confira a configuração do Firebase.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const properties = useMemo(() => {
    const set = new Set(entries.map((e) => e.propertyName));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    if (propertyFilter === 'all') return entries;
    return entries.filter((e) => e.propertyName === propertyFilter);
  }, [entries, propertyFilter]);

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-slate">Histórico</p>
          <h1 className="font-display text-3xl">Observações e ocorrências</h1>
        </div>
        <Link href="/history/new" className="bg-ink px-4 py-2 text-sm text-paper hover:opacity-90">
          + Novo registro
        </Link>
      </header>

      {!loading && !error && (
        <div className="mb-4">
          <label className="mr-2 font-mono text-xs uppercase tracking-widest text-slate">Imóvel:</label>
          <select
            className="border border-hairline bg-white/60 px-2 py-1 text-sm"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            {properties.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && <p className="text-slate">Carregando...</p>}
      {error && <p className="text-rust">{error}</p>}

      {!loading && !error && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Imóvel</th>
              <th>Inquilino</th>
              <th>Tipo</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h) => (
              <tr key={h.id}>
                <td className="money whitespace-nowrap">
                  <Link href={`/history/${h.id}/edit`} className="hover:text-terracotta">
                    {formatDate(h.date)}
                  </Link>
                </td>
                <td>{h.propertyName}</td>
                <td>{h.tenantName}</td>
                <td>
                  <span
                    className={`inline-block rounded-sm px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${TYPE_STYLES[h.type]}`}
                  >
                    {TYPE_LABELS[h.type]}
                  </span>
                </td>
                <td className="max-w-md">{h.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-slate">Nenhum registro encontrado.</p>
      )}
    </div>
  );
}
