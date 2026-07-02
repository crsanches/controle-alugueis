import { TenantForm } from '@/components/TenantForm';

export default function NewTenantPage() {
  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Inquilinos</p>
        <h1 className="font-display text-3xl">Novo inquilino</h1>
      </header>
      <TenantForm />
    </div>
  );
}
