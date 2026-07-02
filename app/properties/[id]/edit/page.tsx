'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Property } from '@/lib/types';
import { PropertyForm } from '@/components/PropertyForm';

export default function EditPropertyPage({ params }: { params: { id: string } }) {
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'properties', params.id));
      if (snap.exists()) setProperty({ id: snap.id, ...snap.data() } as Property);
      setLoading(false);
    }
    load();
  }, [params.id]);

  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Imóveis</p>
        <h1 className="font-display text-3xl">Editar imóvel</h1>
      </header>
      {loading && <p className="text-slate">Carregando...</p>}
      {!loading && property && <PropertyForm property={property} />}
      {!loading && !property && <p className="text-rust">Imóvel não encontrado.</p>}
    </div>
  );
}
