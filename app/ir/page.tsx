'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract, Property } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

interface Row {
  contractId: string;
  tenantName: string;
  propertyName: string;
  rentValue: number;
  refundFee: number;
  base: number;
}

export default function IRPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [contractsSnap, propertiesSnap] = await Promise.all([
          getDocs(collection(db, 'contracts')),
          getDocs(collection(db, 'properties')),
        ]);

        const propertiesById = new Map<string, Property>();
        propertiesSnap.docs.forEach((d) => propertiesById.set(d.id, { id: d.id, ...d.data() } as Property));

        const contracts = contractsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Contract)
          .filter((c) => c.status === 'active' && c.collectsIncomeTax);

        const computed = contracts.map((c) => {
          const property = propertiesById.get(c.propertyId);
          const rentValue = c.currentRentValue || c.rentValue || 0;
          const refundFee = property?.refundFee || 0;
          return {
            contractId: c.id,
            tenantName: c.tenantName,
            propertyName: c.propertyName,
            rentValue,
            refundFee,
            base: rentValue - refundFee,
          };
        });

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

  const total = useMemo(() => rows.reduce((sum, r) => sum + r.base, 0), [rows]);

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
          <div className="mb-8 border border-hairline bg-paperDim/60 px-6 py-5">
            <p className="font-mono text-[11px] uppercase tracking-widest text-slate">
              Valor base total a recolher (código 0190)
            </p>
            <p className="mt-1 font-display text-3xl money text-terracotta">{formatCurrency(total)}</p>
            <p className="mt-2 text-xs text-slate">
              Soma dos aluguéis vigentes em contratos que recolhem IR, deduzida a taxa de reembolso de cada imóvel.
            </p>
          </div>

          <table className="ledger-table">
            <thead>
              <tr>
                <th>Inquilino</th>
                <th>Imóvel</th>
                <th>Aluguel vigente</th>
                <th>Taxa de reembolso (dedução)</th>
                <th>Base de cálculo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.contractId}>
                  <td>{r.tenantName}</td>
                  <td>{r.propertyName}</td>
                  <td className="money">{formatCurrency(r.rentValue)}</td>
                  <td className="money">{formatCurrency(r.refundFee)}</td>
                  <td className="money">{formatCurrency(r.base)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length === 0 && (
            <p className="text-slate">Nenhum contrato ativo com recolhimento de IR no momento.</p>
          )}
        </>
      )}
    </div>
  );
}
