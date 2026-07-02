const STATUS_STYLES: Record<string, string> = {
  active: 'bg-sage/15 text-sage',
  paid: 'bg-sage/15 text-sage',
  inactive: 'bg-slate/15 text-slate',
  pending: 'bg-accent/15 text-accent',
  late: 'bg-rust/15 text-rust',
  unknown: 'bg-slate/15 text-slate',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  paid: 'Pago',
  inactive: 'Inativo',
  pending: 'Pendente',
  late: 'Atrasado',
  unknown: '—',
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span className={`inline-block rounded-md px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${style}`}>
      {label}
    </span>
  );
}
