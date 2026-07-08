'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, Invoice } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

interface Row {
  invoiceId: string;
  contractId: string;
  tenantName: string;
  propertyName: string;
  referenceMonth: Timestamp | null;
  receiptMonth: Date | null;
  collectionDate: Date | null;
  rentValue: number;
  refundFee: number;
  extraFeeDeduction: number; // taxa extra devida pelo proprietário (gravada no boleto)
  base: number;
}

// Soma N meses ao mês de referência, mantendo o cálculo em UTC.
function addMonthsToReference(referenceMonth: Timestamp | null, months: number): { year: number; month: number } | null {
  if (!referenceMonth) return null;
  const ref = referenceMonth.toDate();
  const targetIndex = ref.getUTCMonth() + months; // 0-based
  const year = ref.getUTCFullYear() + Math.floor(targetIndex / 12);
  const month = ((targetIndex % 12) + 12) % 12;
  return { year, month };
}

// Mês do recebimento: um mês após o mês de referência.
function computeReceiptMonth(referenceMonth: Timestamp | null): Date | null {
  const target = addMonthsToReference(referenceMonth, 1);
  if (!target) return null;
  return new Date(Date.UTC(target.year, target.month, 1));
}

// Mês de recolhimento: dois meses após o mês de referência, sempre dia 30
// (dia 28 em fevereiro, já que fevereiro nunca chega no dia 30).
function computeCollectionDate(referenceMonth: Timestamp | null): Date | null {
  const target = addMonthsToReference(referenceMonth, 2);
  if (!target) return null;
  const day = target.month === 1 ? 28 : 30; // índice 1 = fevereiro
  return new Date(Date.UTC(target.year, target.month, day));
}

// Formato curto de mês: "mai/26" (o toLocaleDateString gera "mai.", tiramos o ponto)
function formatMonthShort(d: Date | null): string {
  if (!d) return '—';
  const month = d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
  const year = d.toLocaleDateString('pt-BR', { year: '2-digit', timeZone: 'UTC' });
  return `${month}/${year}`;
}

function formatTimestampMonthShort(ts: Timestamp | null): string {
  if (!ts) return '—';
  return formatMonthShort(ts.toDate());
}

export default function IRPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // A coleção de imóveis não é mais consultada aqui: todas as deduções
        // vêm do próprio boleto (menos leituras no Firestore).
        const [contractsSnap, invoicesSnap] = await Promise.all([
          getDocs(collection(db, 'contracts')),
          getDocs(collection(db, 'invoices')),
        ]);

        const contractsById = new Map<string, Contract>();
        contractsSnap.docs.forEach((d) => contractsById.set(d.id, { id: d.id, ...d.data() } as Contract));

        const invoices = invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invoice);

        // todos os boletos PAGOS de contratos que recolhem IR — independente
        // do contrato ainda estar ativo hoje, já que isso é um histórico do
        // que foi efetivamente recebido
        const computed = invoices
          .filter((inv) => inv.status === 'paid')
          .map((inv) => {
            const contract = contractsById.get(inv.contractId);
            if (!contract || !contract.collectsIncomeTax) return null;

            // Valores sempre do PRÓPRIO boleto (histórico congelado no
            // pagamento), nunca do cadastro atual do imóvel — alterar o
            // cadastro no futuro não pode reescrever meses já declarados.
            const rentValue = inv.currentRentAmount || inv.rentAmount || 0;
            const refundFee = inv.refundAmount || 0;
            // Taxa extra do condomínio devida pelo proprietário: deduzida da
            // base. Só entra quando o boleto foi gravado com o flag de
            // desconto; taxa extra do inquilino não afeta a base.
            const extraFeeDeduction = inv.extraFeeIsDiscount ? inv.extraFeeAmount || 0 : 0;

            const row: Row = {
              invoiceId: inv.id,
              contractId: contract.id,
              tenantName: inv.tenantName,
              propertyName: inv.propertyName,
              referenceMonth: inv.referenceMonth,
              receiptMonth: computeReceiptMonth(inv.referenceMonth),
              collectionDate: computeCollectionDate(inv.referenceMonth),
              rentValue,
              refundFee,
              extraFeeDeduction,
              base: rentValue - refundFee - extraFeeDeduction,
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
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Imposto de Renda</p>
        <h1 className="font-display text-2xl">Recolhimento — código 0190</h1>
      </header>

      {loading && <p className="text-slate">Carregando...</p>}
      {error && <p className="text-rust">{error}</p>}

      {!loading && !error && (
        <>
          <p className="mb-4 text-xs text-slate">
            Base de cálculo = valor do aluguel do boleto pago, deduzidos o fundo de reserva e as taxas extras de
            condomínio de responsabilidade do proprietário, conforme gravados no próprio boleto. Mês do recebimento
            = mês de referência + 1 mês. Mês para recolhimento = mês de referência + 2 meses, sempre dia 30 (dia 28
            em fevereiro).
          </p>

          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Inquilino</th>
                  <th>Imóvel</th>
                  <th>Mês referência</th>
                  <th>Mês recebimento</th>
                  <th>Data para recolhimento</th>
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
                    <td>{formatTimestampMonthShort(r.referenceMonth)}</td>
                    <td>{formatMonthShort(r.receiptMonth)}</td>
                    <td className="money capitalize">
                      {r.collectionDate
                        ? r.collectionDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                        : '—'}
                    </td>
                    <td className="money">{formatCurrency(r.rentValue)}</td>
                    <td className="money">{formatCurrency(r.refundFee + r.extraFeeDeduction)}</td>
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