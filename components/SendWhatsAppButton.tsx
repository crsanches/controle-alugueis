'use client';

import { useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { toBlob } from 'html-to-image';
import { db } from '@/lib/firebase';
import type { Invoice, Contract, Tenant, Property } from '@/lib/types';
import { ReceiptImageCard } from '@/components/ReceiptImageCard';
import { formatCurrency, formatDate, formatMonth } from '@/lib/format';

type Status = 'idle' | 'working' | 'shared' | 'copied' | 'downloaded' | 'error';

// Formata o telefone salvo (varia bastante no cadastro: "11-98765-4321", "11987654321", etc.)
// para o formato que o wa.me espera: código do país + DDD + número, só dígitos.
function formatPhoneForWhatsApp(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length >= 12) return digits; // já parece incluir o 55
  return `55${digits}`;
}

// Detecta se o navegador suporta compartilhar ARQUIVOS via share sheet nativo
// (iPhone/Android). Precisa ser checado com um File de verdade.
function supportsFileShare(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    const probe = new File([''], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

// Mesmo critério do recibo: só o rótulo de parcelamento ("parcela 3 de 10")
// interessa ao inquilino; "cobrança por prazo indefinido" é dado interno.
function installmentNote(label?: string | null): string | null {
  if (!label) return null;
  return label.includes('parcela') ? label : null;
}

// Linhas extras da mensagem para taxas parceladas — o inquilino vê no texto
// quantas parcelas faltam, sem precisar abrir a imagem do recibo.
function buildScheduleLines(invoice: Invoice): string[] {
  const lines: string[] = [];
  const iptuNote = installmentNote(invoice.iptuScheduleLabel);
  if (invoice.iptuAmount && iptuNote) {
    lines.push(`IPTU: ${formatCurrency(invoice.iptuAmount)} (${iptuNote})`);
  }
  const extraNote = installmentNote(invoice.extraFeeScheduleLabel);
  if (invoice.extraFeeAmount && extraNote) {
    lines.push(`Taxa extra: ${formatCurrency(invoice.extraFeeAmount)} (${extraNote})`);
  }
  const refundNote = installmentNote(invoice.refundScheduleLabel);
  if (invoice.refundAmount && refundNote) {
    lines.push(`Fundo de reserva (desconto): ${formatCurrency(invoice.refundAmount)} (${refundNote})`);
  }
  return lines;
}

export function SendWhatsAppButton({ invoice, compact = false }: { invoice: Invoice; compact?: boolean }) {
  const [status, setStatus] = useState<Status>('idle');
  const [captureData, setCaptureData] = useState<{ tenant: Tenant | null; property: Property | null } | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  async function handleClick() {
    // ── Decisões SÍNCRONAS, ainda dentro do gesto do clique ────────────────
    const useShareSheet = supportsFileShare();

    // Desktop: abre a janela AGORA, vazia. O Safari/Chrome só permitem
    // window.open síncrono; depois de qualquer await ele seria bloqueado
    // como popup. A navegação de uma janela JÁ aberta é sempre permitida.
    const waWindow = useShareSheet ? null : window.open('', '_blank');

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

      const phone = tenant ? formatPhoneForWhatsApp(tenant.phone) : null;
      const message = [
        `Olá ${invoice.tenantName.split(' ')[0]}, segue o recibo referente a ${formatMonth(invoice.referenceMonth)}.`,
        `Valor: ${formatCurrency(invoice.totalAmount)}`,
        // taxas parceladas (IPTU, taxa extra, fundo de reserva), quando houver
        ...buildScheduleLines(invoice),
        `Vencimento: ${formatDate(invoice.dueDate)}`,
      ].join('\n');
      const waUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;

      // ── CAMINHO 1: celular (iPhone/Android) → share sheet nativo ─────────
      if (useShareSheet) {
        const file = new File([blob], `recibo-${invoice.id}.png`, { type: 'image/png' });
        try {
          await navigator.share({ files: [file] });
          // no share sheet o usuário escolhe o WhatsApp e o contato;
          // a imagem já vai anexada, sem precisar colar nada.
          setStatus('shared');
          setTimeout(() => setStatus('idle'), 5000);
          return;
        } catch (shareErr) {
          // usuário fechou o sheet sem escolher app: não é erro, só desiste
          if (shareErr instanceof DOMException && shareErr.name === 'AbortError') {
            setStatus('idle');
            return;
          }
          // NotAllowedError (gesto expirou) ou outro problema:
          // cai pro plano B — baixa a imagem e abre o wa.me na MESMA aba
          // (navegação da própria aba não sofre bloqueio de popup).
          console.warn('Share sheet indisponível, usando fallback de download.', shareErr);
          downloadBlob(blob);
          setStatus('downloaded');
          setTimeout(() => {
            window.location.href = waUrl;
          }, 800);
          return;
        }
      }

      // ── CAMINHO 2: desktop → clipboard + janela pré-aberta ────────────────
      let copied = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        copied = true;
      } catch (clipErr) {
        console.warn('Área de transferência indisponível, baixando a imagem em vez de copiar.', clipErr);
      }

      if (!copied) downloadBlob(blob);

      if (waWindow && !waWindow.closed) {
        waWindow.location.href = waUrl;
      } else {
        // janela foi bloqueada mesmo síncrona (raro) ou fechada pelo usuário:
        // navega a aba atual como último recurso
        window.location.href = waUrl;
      }

      setStatus(copied ? 'copied' : 'downloaded');
      setTimeout(() => setStatus('idle'), 5000);
    } catch (err) {
      console.error(err);
      // não deixa a aba em branco órfã se algo deu errado no meio
      waWindow?.close();
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recibo-${invoice.tenantName.trim().toLowerCase().replace(/\s+/g, '-')}-${invoice.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const labels: Record<Status, string> = {
    idle: compact ? 'Zap' : 'Enviar por WhatsApp',
    working: 'Preparando...',
    shared: compact ? 'Enviado!' : 'Recibo compartilhado',
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