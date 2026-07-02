'use client';

import { useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { toBlob } from 'html-to-image';
import { db } from '@/lib/firebase';
import type { Invoice, Contract, Tenant, Property } from '@/lib/types';
import { ReceiptImageCard } from '@/components/ReceiptImageCard';
import { formatCurrency, formatDate, formatMonth } from '@/lib/format';

type Status = 'idle' | 'working' | 'copied' | 'downloaded' | 'error';

// Formata o telefone salvo (varia bastante no cadastro: "11-98765-4321", "11987654321", etc.)
// para o formato que o wa.me espera: código do país + DDD + número, só dígitos.
function formatPhoneForWhatsApp(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length >= 12) return digits; // já parece incluir o 55
  return `55${digits}`;
}

export function SendWhatsAppButton({ invoice, compact = false }: { invoice: Invoice; compact?: boolean }) {
  const [status, setStatus] = useState<Status>('idle');
  const [captureData, setCaptureData] = useState<{ tenant: Tenant | null; property: Property | null } | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  async function handleClick() {
    setStatus('working');
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

      setCaptureData({ tenant, property });

      // espera o React desenhar o cartão oculto e as fontes carregarem antes de tirar o "print"
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (document.fonts?.ready) await document.fonts.ready;

      if (!captureRef.current) throw new Error('Nó de captura não encontrado.');

      const blob = await toBlob(captureRef.current, { pixelRatio: 2 });
      if (!blob) throw new Error('Falha ao gerar a imagem.');

      let copied = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        copied = true;
      } catch (clipErr) {
        console.warn('Área de transferência indisponível, baixando a imagem em vez de copiar.', clipErr);
      }

      if (!copied) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `recibo-${invoice.tenantName.trim().toLowerCase().replace(/\s+/g, '-')}-${invoice.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      const phone = tenant ? formatPhoneForWhatsApp(tenant.phone) : null;
      const message = [
        `Olá ${invoice.tenantName.split(' ')[0]}, segue o recibo referente a ${formatMonth(invoice.referenceMonth)}.`,
        `Valor: ${formatCurrency(invoice.totalAmount)}`,
        `Vencimento: ${formatDate(invoice.dueDate)}`,
      ].join('\n');

      const waUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;

      window.open(waUrl, '_blank');
      setStatus(copied ? 'copied' : 'downloaded');
      setTimeout(() => setStatus('idle'), 5000);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }

  const labels: Record<Status, string> = {
    idle: compact ? 'Zap' : 'Enviar por WhatsApp',
    working: 'Preparando...',
    copied: compact ? 'Copiado!' : 'Imagem copiada — cole no WhatsApp (Ctrl+V)',
    downloaded: compact ? 'Baixado' : 'Imagem baixada — anexe no WhatsApp',
    error: 'Erro, tente de novo',
  };

  return (
    <div className={compact ? 'inline-block' : ''}>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'working'}
        className={
          compact
            ? 'font-mono text-[11px] uppercase tracking-wide text-sage hover:text-accent disabled:opacity-50'
            : 'bg-sage px-4 py-2 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50'
        }
      >
        {labels[status]}
      </button>

      {/* Nó fora da tela, usado só para renderizar e capturar a imagem do recibo */}
      <div style={{ position: 'fixed', top: 0, left: -9999, pointerEvents: 'none' }} aria-hidden>
        <div ref={captureRef}>
          {captureData && (
            <ReceiptImageCard invoice={invoice} tenant={captureData.tenant} property={captureData.property} />
          )}
        </div>
      </div>
    </div>
  );
}
