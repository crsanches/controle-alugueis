import { InvoiceForm } from '@/components/InvoiceForm';

export default function NewInvoicePage() {
  return (
    <div>
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Boletos</p>
        <h1 className="font-display text-2xl">Novo boleto</h1>
      </header>
      <InvoiceForm />
    </div>
  );
}
