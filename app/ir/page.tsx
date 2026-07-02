'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, Invoice, Property } from '@/lib/types';
import { formatCurrency, formatMonth } from '@/lib/format';

interface Row {
  invoiceId: string;
  contractId: string;
  tenantName: string;
  propertyName: string;
  referenceMonth: Timestamp | null;
  collectionDate: Date | null;
  rentValue: number;
  refundFee: number;
  base: number;
}

interface CollectionGroup {
  key: string; // "YYYY-MM"
  label: string;
  total: number;
}

// Mes de recolhimento: dois meses apos o mes de referencia, sempre dia 30
// (dia 28 em fevereiro, ja que fevereiro nunca chega no dia 30).
function computeCollectionDate(referenceMonth: Timestamp | null): Date | null {
  if (!referenceMonth) return null;
  const ref = referenceMonth.toDate();
  const targetIndex = ref.getUTCMonth() + 2; // 0-based; +2 = dois meses depois
  const year = ref.getUTCFullYear() + Math.floor(targetIndex / 12);
  const month = ((targetIndex % 12) + 12) % 12;
  const day = month === 1 ? 28 : 30; // indice 1 = fevereiro
  return new Date(Date.UTC(year, month, day));
}

export default function IRPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [contractsSnap, propertiesSnap, invoicesSnap] = await Promise.all([
          getDocs(collection(db, 'contracts')),
          getDocs(collection(db, 'properties')),
          getDocs(collection(db, 'invoices')),
        ]);

        const contractsById = new Map<string, Contract>();
        contractsSnap.docs.forEach((d) => contractsById.set(d.id, { id: d.id, ...d.data() } as Contract));

        const propertiesById = new Map<string, Property>();
        propertiesSnap.docs.forEach((d) => propertiesById.set(d.id, { id: d.id, ...d.data() } as Property));

        const invoices = invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invoice);

        // todos os boletos PAGOS de contratos que recolhem IR — independente
        // do contrato ainda estar ativo hoje, ja que isso e um historico do
        // que foi efetivamente recebido
        const computed = invoices
          .filter((inv) => inv.status === 'paid')
          .map((inv) => {
            const contract = contractsById.get(inv.contractId);
            if (!contract || !contract.collectsIncomeTax) return null;

            const property = propertiesById.get(contract.propertyId);
            // Usa o valor ATUAL do aluguel (currentRentAmount), não o valor
            // original/congelado (rentAmount) — mesmo campo problemático que
            // já identificamos nos boletos migrados do sistema antigo.
            const rentValue = inv.currentRentAmount || inv.rentAmount || 0;
            const refundFee = property?.refundFee || 0;

            const row: Row = {
              invoiceId: inv.id,
              contractId: contract.id,
              tenantName: inv.tenantName,
              propertyName: inv.propertyName,
              referenceMonth: inv.referenceMonth,
              collectionDate: computeCollectionDate(inv.referenceMonth),
              rentValue,
              refundFee,
              base: rentValue - refundFee,
            };
            return row;
          })
          .filter((r): r is Row => r !== null)
          .sort((a, b) => (b.referenceMonth?.toMillis() ?? 0) - (a.referenceMonth?.toMillis() ?? 0));

        setRows(computed);
      } catch (err) {
        console.error(err);
        setError('Não foi possível calcular o IR. Confira a configuração do Firebase.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  

  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Imposto de Renda</p>
        <h1 className="font-display text-3xl">Recolhimento — código 0190</h1>
      </header>

      {loading && <p className="text-slate">Carregando...</p>}
      {error && <p className="text-rust">{error}</p>}

      {!loading && !error && (
        <>
          

          <p className="mb-4 text-xs text-slate">
            Base de cálculo = valor do aluguel do boleto pago, deduzida a taxa de reembolso do imóvel. Mês para
            recolhimento = mês de referência + 2 meses, sempre dia 30 (dia 28 em fevereiro).
          </p>

          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Inquilino</th>
                  <th>Imóvel</th>
                  <th>Mês de referência</th>
                  <th>Mês para recolhimento</th>
                  <th>Aluguel</th>
                  <th>Dedução</th>
                  <th>Base de cálculo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.invoiceId}>
                    <td>{r.tenantName}</td>
                    <td>{r.propertyName}</td>
                    <td className="capitalize">{formatMonth(r.referenceMonth)}</td>
                    <td className="money capitalize">
                      {r.collectionDate
                        ? r.collectionDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                        : '—'}
                    </td>
                    <td className="money">{formatCurrency(r.rentValue)}</td>
                    <td className="money">{formatCurrency(r.refundFee)}</td>
                    <td className="money">{formatCurrency(r.base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <p className="text-slate">Nenhum boleto pago de contrato com recolhimento de IR encontrado.</p>
          )}
        </>
      )}
    </div>
  );
}