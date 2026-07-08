import type { Invoice, Tenant, Property } from '@/lib/types';
import { formatCurrency, formatDate, formatMonth } from '@/lib/format';
import { LANDLORD } from '@/lib/landlordConfig';

interface Props {
  invoice: Invoice;
  tenant: Tenant | null;
  property: Property | null;
}

// Só mostramos ao inquilino os rótulos de parcelamento ("parcela 3 de 10").
// "cobrança por prazo indefinido" é informação interna do cadastro do imóvel
// e não agrega nada no recibo — a taxa aparece como linha normal recorrente.
function installmentNote(label?: string | null): string | null {
  if (!label) return null;
  return label.includes('parcela') ? label : null;
}

export function ReceiptImageCard({ invoice, tenant, property }: Props) {
  const items: { label: string; value: number; note?: string | null }[] = [
    { label: 'Aluguel', value: invoice.rentAmount },
  ];
  if (invoice.iptuAmount)
    items.push({ label: 'IPTU', value: invoice.iptuAmount, note: installmentNote(invoice.iptuScheduleLabel) });
  if (invoice.insuranceAmount) items.push({ label: 'Seguro', value: invoice.insuranceAmount });
  if (invoice.extraFeeAmount)
    items.push({
      label: invoice.extraFeeIsDiscount ? 'Taxa extra condomínio (desconto)' : 'Taxa extra',
      value: invoice.extraFeeIsDiscount ? -invoice.extraFeeAmount : invoice.extraFeeAmount,
      note: installmentNote(invoice.extraFeeScheduleLabel),
    });
  if (invoice.condoAmount) items.push({ label: 'Condomínio do mês', value: invoice.condoAmount });
  if (invoice.refundAmount)
    items.push({
      label: 'Fundo de reserva (desconto)',
      value: -invoice.refundAmount,
      note: installmentNote(invoice.refundScheduleLabel),
    });
  if (invoice.condoFeeAmount)
    items.push({ label: 'Taxa condominial (desconto)', value: -invoice.condoFeeAmount });

  return (
    <div className="w-[800px] bg-paper p-12 font-sans text-ink">
      <p className="font-display text-4xl text-[#1D4ED8]">Recibo de Aluguel</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-accent">
        Referente a {formatMonth(invoice.referenceMonth)}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-8">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-slate">Locador</p>
          <p className="mt-1 text-lg">{LANDLORD.name}</p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-slate">Locatário</p>
          <p className="mt-1 text-lg">{invoice.tenantName}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="font-mono text-[11px] uppercase tracking-wide text-slate">Imóvel</p>
        <p className="mt-1 text-lg">
          {invoice.propertyName}
          {property?.address ? ` — ${property.address}` : ''}
        </p>
      </div>

      <div className="mt-8 border-t border-hairline">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between border-b border-hairline py-3 text-base">
            <span>
              {item.label}
              {item.note && <span className="ml-2 font-mono text-[11px] text-slate">({item.note})</span>}
            </span>
            <span className="font-mono">{formatCurrency(item.value)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t-2 border-ink py-4">
          <span className="text-xl font-semibold">Total</span>
          <span className="font-mono text-2xl font-semibold text-accent">
            {formatCurrency(invoice.totalAmount)}
          </span>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-8">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-slate">Vencimento</p>
          <p className="mt-1 text-lg">{formatDate(invoice.dueDate)}</p>
        </div>
        {invoice.status === 'paid' && invoice.paidDate ? (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-slate">Pago em</p>
            <p className="mt-1 text-lg text-sage">{formatDate(invoice.paidDate)}</p>
          </div>
        ) : (
          LANDLORD.pixKey && (
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-slate">Chave PIX</p>
              <p className="mt-1 text-lg">{LANDLORD.pixKey}</p>
            </div>
          )
        )}
      </div>

      {tenant?.cpf && (
        <p className="mt-8 font-mono text-[11px] text-slate">CPF do locatário: {tenant.cpf}</p>
      )}
    </div>
  );
}