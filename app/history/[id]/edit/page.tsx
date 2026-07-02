'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { HistoryEntry } from '@/lib/types';
import { HistoryForm } from '@/components/HistoryForm';

export default function EditHistoryPage({ params }: { params: { id: string } }) {
  const [entry, setEntry] = useState<HistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'history', params.id));
      if (snap.exists()) setEntry({ id: snap.id, ...snap.data() } as HistoryEntry);
      setLoading(false);
    }
    load();
  }, [params.id]);

  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Histórico</p>
        <h1 className="font-display text-3xl">Editar registro</h1>
      </header>
      {loading && <p className="text-slate">Carregando...</p>}
      {!loading && entry && <HistoryForm entry={entry} />}
      {!loading && !entry && <p className="text-rust">Registro não encontrado.</p>}
    </div>
  );
}
