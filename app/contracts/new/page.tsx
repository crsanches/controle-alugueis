import { ContractForm } from '@/components/ContractForm';

export default function NewContractPage() {
  return (
    <div>
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Contratos</p>
        <h1 className="font-display text-2xl">Novo contrato</h1>
      </header>
      <ContractForm />
    </div>
  );
}
