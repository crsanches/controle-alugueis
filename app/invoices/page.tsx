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

const selectClass = 'rounded-md border border-hairline bg-white/70 px-2 py-1.5 text-sm focus:border-accent focus:outline-none';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const [referenceMonthFilter, setReferenceMonthFilter] = useState('');
  const [dueMonthFilter, setDueMonthFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');

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

  const tenantOptions = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.tenantName))).sort(),
    [invoices]
  );
  const propertyOptions = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.propertyName))).sort(),
    [invoices]
  );

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (filter !== 'all' && getEffectiveInvoiceStatus(i) !== filter) return false;
      if (tenantFilter && i.tenantName !== tenantFilter) return false;
      if (propertyFilter && i.propertyName !== propertyFilter) return false;
      if (referenceMonthFilter) {
        const ref = i.referenceMonth?.toDate();
        const refKey = ref ? `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, '0')}` : '';
        if (refKey !== referenceMonthFilter) return false;
      }
      if (dueMonthFilter) {
        const due = i.dueDate?.toDate();
        const dueKey = due ? `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, '0')}` : '';
        if (dueKey !== dueMonthFilter) return false;
      }
      return true;
    });
  }, [invoices, filter, tenantFilter, propertyFilter, referenceMonthFilter, dueMonthFilter]);

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'late', label: 'Atrasados' },
    { key: 'paid', label: 'Pagos' },
  ];

  function clearFilters() {
    setFilter('all');
    setReferenceMonthFilter('');
    setDueMonthFilter('');
    setTenantFilter('');
    setPropertyFilter('');
  }

  const hasActiveFilters =
    filter !== 'all' || referenceMonthFilter || dueMonthFilter || tenantFilter || propertyFilter;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">Boletos</p>
          <h1 className="font-display text-2xl">Cobranças mensais</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                  filter === f.key
                    ? 'bg-ink text-paper'
                    : 'bg-transparent text-slate hover:bg-paperDim'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Link href="/invoices/new" className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:opacity-90">
            + Novo boleto
          </Link>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate">Mês de referência</label>
          <input
            type="month"
            className={selectClass}
            value={referenceMonthFilter}
            onChange={(e) => setReferenceMonthFilter(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate">Vencimento</label>
          <input
            type="month"
            className={selectClass}
            value={dueMonthFilter}
            onChange={(e) => setDueMonthFilter(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate">Inquilino</label>
          <select className={selectClass} value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}>
            <option value="">Todos</option>
            {tenantOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate">Imóvel</label>
          <select className={selectClass} value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
            <option value="">Todos</option>
            {propertyOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {hasActiveFilters && (
          <button type="button" onClick={clearFilters} className="text-xs text-accent hover:underline">
            Limpar filtros
          </button>
        )}
      </div>

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
                    <Link href={`/invoices/${inv.id}/edit`} className="hover:text-accent">
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