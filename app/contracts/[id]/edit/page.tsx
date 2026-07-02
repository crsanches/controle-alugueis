'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract } from '@/lib/types';
import { ContractForm } from '@/components/ContractForm';

export default function EditContractPage({ params }: { params: { id: string } }) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'contracts', params.id));
      if (snap.exists()) setContract({ id: snap.id, ...snap.data() } as Contract);
      setLoading(false);
    }
    load();
  }, [params.id]);

  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Contratos</p>
        <h1 className="font-display text-3xl">Editar contrato</h1>
      </header>
      {loading && <p className="text-slate">Carregando...</p>}
      {!loading && contract && <ContractForm contract={contract} />}
      {!loading && !contract && <p className="text-rust">Contrato não encontrado.</p>}
    </div>
  );
}
