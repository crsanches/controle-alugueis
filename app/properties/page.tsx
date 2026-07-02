'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Property } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const q = query(collection(db, 'properties'), orderBy('name', 'asc'));
        const snapshot = await getDocs(q);
        const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Property);
        setProperties(rows);
      } catch (err) {
        console.error(err);
        setError('Não foi possível carregar os imóveis. Confira a configuração do Firebase.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-slate">Imóveis</p>
          <h1 className="font-display text-3xl">Imóveis cadastrados</h1>
        </div>
        <Link href="/properties/new" className="bg-ink px-4 py-2 text-sm text-paper hover:opacity-90">
          + Novo imóvel
        </Link>
      </header>

      {loading && <p className="text-slate">Carregando...</p>}
      {error && <p className="text-rust">{error}</p>}

      {!loading && !error && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Endereço</th>
              <th>Administradora</th>
              <th>Taxa condominial</th>
              <th>IPTU mensal</th>
              <th>Seguro mensal</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/properties/${p.id}/edit`} className="hover:text-terracotta">
                    {p.name}
                  </Link>
                </td>
                <td>{p.address || '—'}</td>
                <td>{p.managementCompany || '—'}</td>
                <td className="money">{formatCurrency(p.condoFee)}</td>
                <td className="money">{formatCurrency(p.monthlyIptu)}</td>
                <td className="money">{formatCurrency(p.monthlyInsurance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && !error && properties.length === 0 && (
        <p className="text-slate">Nenhum imóvel encontrado.</p>
      )}
    </div>
  );
}
