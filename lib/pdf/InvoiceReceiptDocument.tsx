import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Timestamp } from 'firebase/firestore';
import type { Invoice, Tenant, Property } from '@/lib/types';
import { LANDLORD } from '@/lib/landlordConfig';

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10, fontFamily: 'Helvetica', color: '#14231F' },
  title: { fontSize: 20, marginBottom: 2, color: '#1D4ED8' },
  subtitle: {
    fontSize: 10,
    color: '#5B6B63',
    marginBottom: 24,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  grid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 },
  col: { width: '48%' },
  label: { fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: '#5B6B63', marginBottom: 3 },
  value: { fontSize: 11, marginBottom: 10 },
  section: { marginBottom: 18 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    borderBottomColor: '#D8D2C2',
    paddingVertical: 7,
  },
  rowLabel: { fontSize: 10 },
  rowNote: { fontSize: 8, color: '#5B6B63' },
  rowValue: { fontSize: 10 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#14231F',
  },
  totalLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  totalValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#C1602C' },
  footer: { marginTop: 44, fontSize: 8, color: '#5B6B63', lineHeight: 1.5 },
});

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateStr(ts: Timestamp | null) {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function monthStr(ts: Timestamp | null) {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Mesmo critério do recibo por imagem (ReceiptImageCard): só o rótulo de
// parcelamento ("parcela 3 de 10") interessa ao inquilino; "cobrança por
// prazo indefinido" é dado interno do cadastro do imóvel e não é exibido.
function installmentNote(label?: string | null): string | null {
  if (!label) return null;
  return label.includes('parcela') ? label : null;
}

interface ReceiptItem {
  label: string;
  value: number;
  note?: string | null;
}

interface Props {
  invoice: Invoice;
  tenant: Tenant | null;
  property: Property | null;
}

export function InvoiceReceiptDocument({ invoice, tenant, property }: Props) {
  const items: ReceiptItem[] = [{ label: 'Aluguel', value: invoice.rentAmount }];
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
  if (invoice.condoFeeAmount) items.push({ label: 'Taxa condominial (desconto)', value: -invoice.condoFeeAmount });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Recibo de Aluguel</Text>
        <Text style={styles.subtitle}>Referente a {monthStr(invoice.referenceMonth)}</Text>

        <View style={styles.grid}>
          <View style={styles.col}>
            <Text style={styles.label}>Locador</Text>
            <Text style={styles.value}>{LANDLORD.name}</Text>
            <Text style={styles.label}>CPF/CNPJ</Text>
            <Text style={styles.value}>{LANDLORD.cpf}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Locatário</Text>
            <Text style={styles.value}>{invoice.tenantName}</Text>
            <Text style={styles.label}>CPF</Text>
            <Text style={styles.value}>{tenant?.cpf || '—'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Imóvel</Text>
          <Text style={styles.value}>
            {invoice.propertyName}
            {property?.address ? ` — ${property.address}` : ''}
          </Text>
        </View>

        <View style={styles.section}>
          {items.map((item) => (
            <View key={item.label} style={styles.row}>
              <Text style={styles.rowLabel}>
                {item.label}
                {item.note ? <Text style={styles.rowNote}>  ({item.note})</Text> : null}
              </Text>
              <Text style={styles.rowValue}>{money(item.value)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(invoice.totalAmount)}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.col}>
            <Text style={styles.label}>Vencimento</Text>
            <Text style={styles.value}>{dateStr(invoice.dueDate)}</Text>
          </View>
          {invoice.status === 'paid' && invoice.paidDate ? (
            <View style={styles.col}>
              <Text style={styles.label}>Pago em</Text>
              <Text style={styles.value}>{dateStr(invoice.paidDate)}</Text>
            </View>
          ) : LANDLORD.pixKey ? (
            <View style={styles.col}>
              <Text style={styles.label}>Chave PIX para pagamento</Text>
              <Text style={styles.value}>{LANDLORD.pixKey}</Text>
            </View>
          ) : null}
        </View>

        {invoice.notes ? (
          <View style={styles.section}>
            <Text style={styles.label}>Observações</Text>
            <Text style={styles.value}>{invoice.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Recibo gerado eletronicamente em {new Date().toLocaleDateString('pt-BR')}. Este documento não possui código
          de barras bancário — o pagamento deve ser combinado diretamente entre as partes (ex: PIX, transferência).
        </Text>
      </Page>
    </Document>
  );
}