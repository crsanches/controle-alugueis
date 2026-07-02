import type { Timestamp } from 'firebase/firestore';

export type EffectiveInvoiceStatus = 'paid' | 'late' | 'pending';

/**
 * O status "atrasado" nunca é guardado manualmente — é sempre calculado
 * comparando a data de vencimento com hoje. Isso evita a inconsistência do
 * sistema antigo, onde "pendente" e "aberto" eram a mesma coisa digitada de
 * jeitos diferentes. A partir de agora só existem dois valores manuais no
 * banco: "pending" e "paid". Qualquer outro valor legado é tratado como pending.
 */
export function getEffectiveInvoiceStatus(invoice: {
  status: string;
  dueDate: Timestamp | null;
}): EffectiveInvoiceStatus {
  if (invoice.status === 'paid') return 'paid';

  const due = invoice.dueDate?.toDate();
  if (due && due.getTime() < startOfToday()) return 'late';

  return 'pending';
}

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
