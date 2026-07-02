'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Painel' },
  { href: '/contracts', label: 'Contratos' },
  { href: '/invoices', label: 'Boletos' },
  { href: '/tenants', label: 'Inquilinos' },
  { href: '/properties', label: 'Imóveis' },
  { href: '/history', label: 'Histórico' },
  { href: '/ir', label: 'Imposto de Renda' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col justify-between bg-ink px-6 py-8 text-paper">
      <div>
        <div className="mb-10">
          <p className="font-display text-2xl leading-none">Livro de Aluguéis</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-paper/50">
            registro &amp; cobrança
          </p>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-sm px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-paper/10 text-paper'
                    : 'text-paper/60 hover:bg-paper/5 hover:text-paper'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-widest text-paper/30">
        v1 · dados migrados
      </p>
    </aside>
  );
}
