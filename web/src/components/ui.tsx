/** Peças visuais reaproveitadas pelas telas (botão, painel, cabeçalho...). */
import type { ButtonHTMLAttributes, ReactNode } from "react";

const BUTTON_VARIANTS = {
  default: "bg-panel-2 text-ink",
  fold: "bg-[#3a1d1d] text-ink",
  allin: "bg-[#4a3a12] text-ink",
  ghost: "bg-transparent text-muted",
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      className={`cursor-pointer rounded-lg border border-line px-3.5 py-2 hover:border-gold ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export const inputClass = "rounded-lg border border-line bg-bg px-2.5 py-1.5 text-ink";

/** Faixa horizontal usada pela barra de ações e pelo formulário de entrada. */
export const barClass = "flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-3";

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-xl border border-line bg-panel px-3.5 py-3">
      {title && <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">{title}</h3>}
      {children}
    </div>
  );
}

/** Carimbo de relógio lógico (ex.: L123·n3). */
export function Stamp({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="mr-1.5 inline-block min-w-16 font-mono text-[11px] text-info" title={title}>
      {children}
    </span>
  );
}

export function PageHeader({ title, link, children }: { title: string; link: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-3 flex flex-wrap items-center gap-4">
      <h1 className="text-xl font-bold">
        <span className="text-gold">♠</span> {title}
      </h1>
      {children}
      <div className="ml-auto text-sm text-gold">{link}</div>
    </header>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return <div className="p-16 text-center text-muted">{children}</div>;
}
