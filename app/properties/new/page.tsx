import { PropertyForm } from '@/components/PropertyForm';

export default function NewPropertyPage() {
  return (
    <div>
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Imóveis</p>
        <h1 className="font-display text-2xl">Novo imóvel</h1>
      </header>
      <PropertyForm />
    </div>
  );
}
