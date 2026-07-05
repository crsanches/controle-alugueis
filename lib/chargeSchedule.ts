import type { Property } from './types';

/**
 * Período de cobrança de uma taxa do imóvel (IPTU, fundo de reserva,
 * taxas extras do condomínio).
 *
 * - `months === null`  → cobrança por prazo indefinido
 * - `startMonth === null` → sem mês de início definido (comportamento
 *   legado: cobra em todo mês, como era antes desta funcionalidade —
 *   garante compatibilidade com imóveis já cadastrados)
 *
 * Meses são sempre strings "YYYY-MM", que comparam corretamente como texto.
 */
export interface ChargeSchedule {
  months: number | null;
  startMonth: string | null;
}

/** Soma `months` meses a um "YYYY-MM". */
export function addMonthsToYm(ym: string, months: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Diferença em meses entre dois "YYYY-MM" (b - a). */
export function ymDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return by * 12 + (bm - 1) - (ay * 12 + (am - 1));
}

/**
 * A taxa está ativa para o mês de referência do boleto?
 * Sem mês de início cadastrado, cobra sempre (legado). Com início e sem
 * quantidade de meses, cobra do início em diante (indefinido). Com início
 * e quantidade, cobra dentro da janela [início, início + meses).
 */
export function isChargeActiveForMonth(schedule: ChargeSchedule, referenceMonth: string): boolean {
  const { months, startMonth } = schedule;
  if (!startMonth) return true; // legado: sem início definido, cobra sempre
  if (!referenceMonth) return true; // mês do boleto ainda não escolhido
  if (referenceMonth < startMonth) return false;
  if (months == null) return true; // indefinido
  return referenceMonth < addMonthsToYm(startMonth, months);
}

/** Valor a cobrar no mês: o próprio valor se ativo, 0 se fora do período. */
export function scheduledChargeForMonth(
  amount: number,
  schedule: ChargeSchedule,
  referenceMonth: string
): number {
  if (!amount) return 0;
  return isChargeActiveForMonth(schedule, referenceMonth) ? amount : 0;
}

/**
 * Rótulo amigável para o boleto/aviso ao inquilino.
 * Ex.: "parcela 3 de 10", "cobrança por prazo indefinido",
 * "fora do período de cobrança neste mês", ou null quando não há
 * período configurado (legado).
 */
export function describeScheduleForMonth(
  schedule: ChargeSchedule,
  referenceMonth: string
): string | null {
  if (!schedule.startMonth || !referenceMonth) return null;
  if (!isChargeActiveForMonth(schedule, referenceMonth)) {
    return 'fora do período de cobrança neste mês';
  }
  if (schedule.months == null) return 'cobrança por prazo indefinido';
  const installment = ymDiff(schedule.startMonth, referenceMonth) + 1;
  return `parcela ${installment} de ${schedule.months}`;
}

// ── Leitura dos períodos a partir do imóvel ────────────────────────────────

export function iptuSchedule(property?: Property | null): ChargeSchedule {
  return {
    months: property?.iptuChargeMonths ?? null,
    startMonth: property?.iptuChargeStartMonth ?? null,
  };
}

export function refundFeeSchedule(property?: Property | null): ChargeSchedule {
  return {
    months: property?.refundFeeChargeMonths ?? null,
    startMonth: property?.refundFeeChargeStartMonth ?? null,
  };
}

export function extraCondoFeeSchedule(property?: Property | null): ChargeSchedule {
  return {
    months: property?.extraCondoFeeChargeMonths ?? null,
    startMonth: property?.extraCondoFeeChargeStartMonth ?? null,
  };
}   