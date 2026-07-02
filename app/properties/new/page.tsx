import { PropertyForm } from '@/components/PropertyForm';

export default function NewPropertyPage() {
  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Imóveis</p>
        <h1 className="font-display text-3xl">Novo imóvel</h1>
      </header>
      <PropertyForm />
    </div>
  );
}
