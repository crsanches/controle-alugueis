'use client';

import { useState, useEffect } from 'react';
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
  const [mobileOpen, setMobileOpen] = useState(false);

  // fecha o menu mobile automaticamente ao navegar
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Topo mobile: logo + botão hambúrguer (some em telas md+) */}
      <header className="flex items-center justify-between bg-ink px-4 py-3 text-paper md:hidden">
        <div>
          <p className="font-display text-xl leading-none">Livro de Aluguéis</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-sm border border-paper/30"
        >
          <span className="font-mono text-lg leading-none">{mobileOpen ? '×' : '≡'}</span>
        </button>
      </header>

      {/* Menu mobile: painel que desliza abaixo do topo, some em telas md+ */}
      {mobileOpen && (
        <nav className="flex flex-col gap-1 bg-ink px-4 pb-4 md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-sm px-3 py-2.5 text-sm ${
                  active ? 'bg-paper/10 text-paper' : 'text-paper/70'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Sidebar fixa de desktop: some em telas menores que md */}
      <aside className="hidden h-screen w-60 flex-col justify-between bg-ink px-6 py-8 text-paper md:flex">
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
    </>
  );
}
