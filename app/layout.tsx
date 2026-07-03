import type { Metadata } from 'next';
import { Manrope, Inter, IBM_Plex_Mono } from 'next/font/google';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  weight: ['500', '600', '700'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Controle de Aluguéis',
  description: 'Gestão de contratos, boletos e pagamentos de aluguel',
  appleWebApp: {
    title: 'Aluguéis',
  },

};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${manrope.variable} ${inter.variable} ${plexMono.variable} font-sans`}>
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}


