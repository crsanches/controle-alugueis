import { HistoryForm } from '@/components/HistoryForm';

export default function NewHistoryPage() {
  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Histórico</p>
        <h1 className="font-display text-3xl">Novo registro</h1>
      </header>
      <HistoryForm />
    </div>
  );
}
