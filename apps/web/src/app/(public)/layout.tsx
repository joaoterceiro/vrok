/**
 * Layout público para páginas legais (LGPD compliance).
 * Sem auth — qualquer cidadão pode consultar.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = {
  title: '2º Ofício de Registro Civil — Documentos Legais',
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold">
            2º Ofício de Registro Civil e Notas
          </Link>
          <nav className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link href="/termos" className="hover:text-foreground">Termos</Link>
            <Link href="/exclusao-de-dados" className="hover:text-foreground">Excluir Dados</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        <article className="prose prose-invert prose-headings:font-semibold prose-h1:text-3xl prose-h2:mt-12 prose-h2:text-xl prose-h3:text-base prose-p:leading-relaxed prose-li:my-1 max-w-none">
          {children}
        </article>
      </main>

      <footer className="border-t border-border bg-surface mt-16">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">
            2º Ofício de Registro Civil das Pessoas Naturais e Notas de Jaboatão dos Guararapes
          </p>
          <p>Rua Santo Amaro, 54 — Centro, Jaboatão dos Guararapes/PE · Seg-Sex 8h às 16h</p>
          <p>Oficial Titular: Taisa Tiaen · CNPJ: pendente · Servindo desde 1888</p>
          <p>
            Encarregado de Dados (DPO):{' '}
            <a href="mailto:dpo@cartoriocentrojaboatao.com.br" className="underline">
              dpo@cartoriocentrojaboatao.com.br
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
