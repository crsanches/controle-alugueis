'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Invoice } from '@/lib/types';
import { formatCurrency, formatDate, formatMonth } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { GenerateReceiptButton } from '@/components/GenerateReceiptButton';
import { SendWhatsAppButton } from '@/components/SendWhatsAppButton';
import { getEffectiveInvoiceStatus } from '@/lib/invoiceStatus';

type StatusFilter = 'all' | 'pending' | 'paid' | 'late';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    async function load() {
      try {
        const q = query(collection(db, 'invoices'), orderBy('dueDate', 'desc'));
        const snapshot = await getDocs(q);
        const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Invoice);
        setInvoices(rows);
      } catch (err) {
        console.error(err);
        setError('Não foi possível carregar os boletos. Confira a configuração do Firebase.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return invoices;
    return invoices.filter((i) => getEffectiveInvoiceStatus(i) === filter);
  }, [invoices, filter]);

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'late', label: 'Atrasados' },
    { key: 'paid', label: 'Pagos' },
  ];

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-slate">Boletos</p>
          <h1 className="font-display text-3xl">Cobranças mensais</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                  filter === f.key
                    ? 'bg-ink text-paper'
                    : 'bg-transparent text-slate hover:bg-paperDim'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Link href="/invoices/new" className="bg-ink px-4 py-2 text-sm text-paper hover:opacity-90">
            + Novo boleto
          </Link>
        </div>
      </header>

      {loading && <p className="text-slate">Carregando...</p>}
      {error && <p className="text-rust">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Referência</th>
                <th>Inquilino</th>
                <th>Imóvel</th>
                <th>Vencimento</th>
                <th>Valor total</th>
                <th>Status</th>
                <th>Recibo</th>
                <th>WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id}>
                  <td className="capitalize">
                    <Link href={`/invoices/${inv.id}/edit`} className="hover:text-terracotta">
                      {formatMonth(inv.referenceMonth)}
                    </Link>
                  </td>
                  <td>{inv.tenantName}</td>
                  <td>{inv.propertyName}</td>
                  <td className="money">{formatDate(inv.dueDate)}</td>
                  <td className="money">{formatCurrency(inv.totalAmount)}</td>
                  <td>
                    <StatusBadge status={getEffectiveInvoiceStatus(inv)} />
                  </td>
                  <td>
                    <GenerateReceiptButton invoice={inv} compact />
                  </td>
                  <td>
                    <SendWhatsAppButton invoice={inv} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-slate">Nenhum boleto encontrado para esse filtro.</p>
      )}
    </div>
  );
}
