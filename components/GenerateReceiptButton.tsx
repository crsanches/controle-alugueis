'use client';

import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { pdf } from '@react-pdf/renderer';
import { db } from '@/lib/firebase';
import type { Invoice, Contract, Tenant, Property } from '@/lib/types';
import { InvoiceReceiptDocument } from '@/lib/pdf/InvoiceReceiptDocument';

export function GenerateReceiptButton({
  invoice,
  compact = false,
}: {
  invoice: Invoice;
  compact?: boolean;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setGenerating(true);
    setError(null);
    try {
      const contractSnap = await getDoc(doc(db, 'contracts', invoice.contractId));
      const contract = contractSnap.exists() ? ({ id: contractSnap.id, ...contractSnap.data() } as Contract) : null;

      let tenant: Tenant | null = null;
      let property: Property | null = null;

      if (contract) {
        const [tenantSnap, propertySnap] = await Promise.all([
          getDoc(doc(db, 'tenants', contract.tenantId)),
          getDoc(doc(db, 'properties', contract.propertyId)),
        ]);
        tenant = tenantSnap.exists() ? ({ id: tenantSnap.id, ...tenantSnap.data() } as Tenant) : null;
        property = propertySnap.exists() ? ({ id: propertySnap.id, ...propertySnap.data() } as Property) : null;
      }

      const blob = await pdf(
        <InvoiceReceiptDocument invoice={invoice} tenant={tenant} property={property} />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const tenantSlug = invoice.tenantName.trim().toLowerCase().replace(/\s+/g, '-');
      link.download = `recibo-${tenantSlug}-${invoice.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError('Não foi possível gerar o PDF.');
    } finally {
      setGenerating(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={generating}
        className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-accent disabled:opacity-50"
      >
        {generating ? '...' : 'PDF'}
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={generating}
        className="border border-ink px-4 py-2 text-sm text-ink transition-colors hover:bg-ink hover:text-paper disabled:opacity-50"
      >
        {generating ? 'Gerando PDF...' : 'Baixar recibo em PDF'}
      </button>
      {error && <p className="mt-2 text-sm text-rust">{error}</p>}
    </div>
  );
}
