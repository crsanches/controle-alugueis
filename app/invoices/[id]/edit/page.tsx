'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Invoice } from '@/lib/types';
import { InvoiceForm } from '@/components/InvoiceForm';
import { GenerateReceiptButton } from '@/components/GenerateReceiptButton';
import { SendWhatsAppButton } from '@/components/SendWhatsAppButton';

export default function EditInvoicePage({ params }: { params: { id: string } }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'invoices', params.id));
      if (snap.exists()) setInvoice({ id: snap.id, ...snap.data() } as Invoice);
      setLoading(false);
    }
    load();
  }, [params.id]);

  return (
    <div>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-slate">Boletos</p>
          <h1 className="font-display text-3xl">Editar boleto</h1>
        </div>
        {!loading && invoice && (
          <div className="flex gap-3">
            <GenerateReceiptButton invoice={invoice} />
            <SendWhatsAppButton invoice={invoice} />
          </div>
        )}
      </header>
      {loading && <p className="text-slate">Carregando...</p>}
      {!loading && invoice && <InvoiceForm invoice={invoice} />}
      {!loading && !invoice && <p className="text-rust">Boleto não encontrado.</p>}
    </div>
  );
}
