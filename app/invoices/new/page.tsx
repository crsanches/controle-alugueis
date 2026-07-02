import { InvoiceForm } from '@/components/InvoiceForm';

export default function NewInvoicePage() {
  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Boletos</p>
        <h1 className="font-display text-3xl">Novo boleto</h1>
      </header>
      <InvoiceForm />
    </div>
  );
}
