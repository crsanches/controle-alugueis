import { Timestamp } from 'firebase/firestore';

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function formatMonth(ts: Timestamp | null | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Converte Timestamp -> string "YYYY-MM-DD" para uso em <input type="date">
export function timestampToDateInput(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  return ts.toDate().toISOString().slice(0, 10);
}

// Converte string "YYYY-MM-DD" (de <input type="date">) -> Timestamp (meia-noite UTC)
export function dateInputToTimestamp(value: string): Timestamp | null {
  if (!value) return null;
  return Timestamp.fromDate(new Date(`${value}T00:00:00.000Z`));
}

// Converte Timestamp -> string "YYYY-MM" para uso em <input type="month">
export function timestampToMonthInput(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  return ts.toDate().toISOString().slice(0, 7);
}

// Converte string "YYYY-MM" (de <input type="month">) -> Timestamp (dia 1, meia-noite UTC)
export function monthInputToTimestamp(value: string): Timestamp | null {
  if (!value) return null;
  return Timestamp.fromDate(new Date(`${value}-01T00:00:00.000Z`));
}
