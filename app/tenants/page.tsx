'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Tenant } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const q = query(collection(db, 'tenants'), orderBy('name', 'asc'));
        const snapshot = await getDocs(q);
        const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Tenant);
        setTenants(rows);
      } catch (err) {
        console.error(err);
        setError('Não foi possível carregar os inquilinos. Confira a configuração do Firebase.');
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
          <p className="font-mono text-xs uppercase tracking-widest text-slate">Inquilinos</p>
          <h1 className="font-display text-3xl">Inquilinos cadastrados</h1>
        </div>
        <Link href="/tenants/new" className="bg-ink px-4 py-2 text-sm text-paper hover:opacity-90">
          + Novo inquilino
        </Link>
      </header>

      {loading && <p className="text-slate">Carregando...</p>}
      {error && <p className="text-rust">{error}</p>}

      {!loading && !error && (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>CPF</th>
              <th>E-mail</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="cursor-pointer">
                <td>
                  <Link href={`/tenants/${t.id}/edit`} className="hover:text-terracotta">
                    {t.name}
                  </Link>
                </td>
                <td className="money">{t.phone || '—'}</td>
                <td className="money">{t.cpf || '—'}</td>
                <td>{t.email || '—'}</td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && !error && tenants.length === 0 && (
        <p className="text-slate">Nenhum inquilino encontrado.</p>
      )}
    </div>
  );
}
