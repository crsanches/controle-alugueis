'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const q = query(collection(db, 'contracts'), orderBy('endDate', 'asc'));
        const snapshot = await getDocs(q);
        const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Contract);
        setContracts(rows);
      } catch (err) {
        console.error(err);
        setError('Não foi possível carregar os contratos. Confira a configuração do Firebase.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-slate">Contratos</p>
          <h1 className="font-display text-3xl">Contratos de locação</h1>
        </div>
        <Link href="/contracts/new" className="bg-ink px-4 py-2 text-sm text-paper hover:opacity-90">
          + Novo contrato
        </Link>
      </header>

      {loading && <p className="text-slate">Carregando...</p>}
      {error && <p className="text-rust">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="ledger-table">
          <thead>
            <tr>
              <th>Inquilino</th>
              <th>Imóvel</th>
              <th>Vencimento</th>
              <th>Valor atual</th>
              <th>Fim do contrato</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/contracts/${c.id}/edit`} className="hover:text-terracotta">
                    {c.tenantName}
                  </Link>
                </td>
                <td>{c.propertyName}</td>
                <td className="money">dia {c.dueDay ?? '—'}</td>
                <td className="money">{formatCurrency(c.currentRentValue || c.rentValue)}</td>
                <td className="money">{formatDate(c.endDate)}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}

      {!loading && !error && contracts.length === 0 && (
        <p className="text-slate">Nenhum contrato encontrado.</p>
      )}
    </div>
  );
}
