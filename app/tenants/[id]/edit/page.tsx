'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Tenant } from '@/lib/types';
import { TenantForm } from '@/components/TenantForm';

export default function EditTenantPage({ params }: { params: { id: string } }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'tenants', params.id));
      if (snap.exists()) setTenant({ id: snap.id, ...snap.data() } as Tenant);
      setLoading(false);
    }
    load();
  }, [params.id]);

  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Inquilinos</p>
        <h1 className="font-display text-3xl">Editar inquilino</h1>
      </header>
      {loading && <p className="text-slate">Carregando...</p>}
      {!loading && tenant && <TenantForm tenant={tenant} />}
      {!loading && !tenant && <p className="text-rust">Inquilino não encontrado.</p>}
    </div>
  );
}
