import { ContractForm } from '@/components/ContractForm';

export default function NewContractPage() {
  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Contratos</p>
        <h1 className="font-display text-3xl">Novo contrato</h1>
      </header>
      <ContractForm />
    </div>
  );
}
