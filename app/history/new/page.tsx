import { HistoryForm } from '@/components/HistoryForm';

export default function NewHistoryPage() {
  return (
    <div>
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Histórico</p>
        <h1 className="font-display text-2xl">Novo registro</h1>
      </header>
      <HistoryForm />
    </div>
  );
}
