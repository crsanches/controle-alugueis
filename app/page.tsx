'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, HistoryEntry, Invoice } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/format';
import { getEffectiveInvoiceStatus } from '@/lib/invoiceStatus';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

interface Summary {
  activeContracts: number;
  monthlyRentTotal: number;
  pendingCount: number;
  lateCount: number;
}

export default function DashboardPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [contractsSnap, invoicesSnap, historySnap] = await Promise.all([
        getDocs(collection(db, 'contracts')),
        getDocs(collection(db, 'invoices')),
        getDocs(collection(db, 'history')),
      ]);

      setContracts(contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Contract));
      setInvoices(invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invoice));
      setHistory(historySnap.docs.map((d) => ({ id: d.id, ...d.data() }) as HistoryEntry));
      setLoading(false);
    }
    load();
  }, []);

  const summary: Summary = useMemo(() => {
    const active = contracts.filter((c) => c.status === 'active');
    return {
      activeContracts: active.length,
      monthlyRentTotal: active.reduce((sum, c) => sum + (c.currentRentValue || c.rentValue || 0), 0),
      pendingCount: invoices.filter((i) => getEffectiveInvoiceStatus(i) === 'pending').length,
      lateCount: invoices.filter((i) => getEffectiveInvoiceStatus(i) === 'late').length,
    };
  }, [contracts, invoices]);

  const expiringContracts = useMemo(() => {
    const now = Date.now();
    return contracts
      .filter((c) => c.status === 'active' && c.endDate)
      .filter((c) => {
        const end = c.endDate!.toDate().getTime();
        return end >= now && end <= now + SIXTY_DAYS_MS;
      })
      .sort((a, b) => a.endDate!.toDate().getTime() - b.endDate!.toDate().getTime());
  }, [contracts]);

  const renewedContracts = useMemo(() => {
    const now = Date.now();
    return history
      .filter((h) => h.type === 'renewal' && h.date)
      .filter((h) => {
        const date = h.date!.toDate().getTime();
        return date >= now - SIXTY_DAYS_MS && date <= now;
      })
      .sort((a, b) => b.date!.toDate().getTime() - a.date!.toDate().getTime());
  }, [history]);

  const lateInvoices = useMemo(
    () =>
      invoices
        .filter((i) => getEffectiveInvoiceStatus(i) === 'late')
        .sort((a, b) => (a.dueDate?.toMillis() ?? 0) - (b.dueDate?.toMillis() ?? 0)),
    [invoices]
  );

  const pendingInvoices = useMemo(
    () =>
      invoices
        .filter((i) => getEffectiveInvoiceStatus(i) === 'pending')
        .sort((a, b) => (a.dueDate?.toMillis() ?? 0) - (b.dueDate?.toMillis() ?? 0)),
    [invoices]
  );

  const cards = [
    { label: 'Contratos ativos', value: String(summary.activeContracts) },
    { label: 'Receita mensal (ativos)', value: formatCurrency(summary.monthlyRentTotal) },
    { label: 'Boletos pendentes', value: String(summary.pendingCount) },
    { label: 'Boletos atrasados', value: String(summary.lateCount) },
  ];

  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Visão geral</p>
        <h1 className="font-display text-3xl">Painel</h1>
      </header>

      {loading && <p className="text-slate">Carregando...</p>}

      {!loading && (
        <div className="space-y-10">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {cards.map((card) => (
              <div key={card.label} className="border border-hairline bg-white/40 p-5">
                <p className="font-mono text-[11px] uppercase tracking-widest text-slate">{card.label}</p>
                <p className="mt-2 font-display text-2xl money">{card.value}</p>
              </div>
            ))}
          </div>

          {lateInvoices.length > 0 && (
            <AlertSection title="Boletos atrasados" accent="text-rust">
              <InvoiceAlertTable rows={lateInvoices} />
            </AlertSection>
          )}

          {pendingInvoices.length > 0 && (
            <AlertSection title="Boletos pendentes" accent="text-terracotta">
              <InvoiceAlertTable rows={pendingInvoices} />
            </AlertSection>
          )}

          {expiringContracts.length > 0 && (
            <AlertSection title="Contratos a vencer nos próximos 60 dias" accent="text-terracotta">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Inquilino</th>
                    <th>Imóvel</th>
                    <th>Fim do contrato</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringContracts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/contracts/${c.id}/edit`} className="hover:text-terracotta">
                          {c.tenantName}
                        </Link>
                      </td>
                      <td>{c.propertyName}</td>
                      <td className="money">{formatDate(c.endDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AlertSection>
          )}

          {renewedContracts.length > 0 && (
            <AlertSection title="Contratos renovados nos últimos 60 dias" accent="text-sage">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Inquilino</th>
                    <th>Imóvel</th>
                    <th>Data da renovação</th>
                  </tr>
                </thead>
                <tbody>
                  {renewedContracts.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <Link href={`/contracts/${h.contractId}/edit`} className="hover:text-terracotta">
                          {h.tenantName}
                        </Link>
                      </td>
                      <td>{h.propertyName}</td>
                      <td className="money">{formatDate(h.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AlertSection>
          )}
        </div>
      )}
    </div>
  );
}

function AlertSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className={`mb-3 font-mono text-xs uppercase tracking-widest ${accent}`}>{title}</h2>
      <div className="table-scroll">{children}</div>
    </section>
  );
}

function InvoiceAlertTable({ rows }: { rows: Invoice[] }) {
  return (
    <table className="ledger-table">
      <thead>
        <tr>
          <th>Inquilino</th>
          <th>Imóvel</th>
          <th>Vencimento</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((inv) => (
          <tr key={inv.id}>
            <td>
              <Link href={`/invoices/${inv.id}/edit`} className="hover:text-terracotta">
                {inv.tenantName}
              </Link>
            </td>
            <td>{inv.propertyName}</td>
            <td className="money">{formatDate(inv.dueDate)}</td>
            <td className="money">{formatCurrency(inv.totalAmount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
