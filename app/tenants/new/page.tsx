import { TenantForm } from '@/components/TenantForm';

export default function NewTenantPage() {
  return (
    <div>
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Inquilinos</p>
        <h1 className="font-display text-2xl">Novo inquilino</h1>
      </header>
      <TenantForm />
    </div>
  );
}
