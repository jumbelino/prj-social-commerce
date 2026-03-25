import type { ReactNode } from "react";

type PublicSectionProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

export function PublicHero({
  eyebrow,
  title,
  description,
  actions,
  children,
}: PublicSectionProps) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[var(--color-line)] bg-[linear-gradient(180deg,rgba(16,26,47,0.96),rgba(10,18,33,0.96))] px-5 py-8 shadow-[0_22px_70px_rgba(0,0,0,0.28)] sm:px-8 sm:py-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-end">
        <div>
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-accent)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-[0.96] text-[var(--color-text-primary)] sm:text-5xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)] sm:text-base">
              {description}
            </p>
          ) : null}
          {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {children ? <div>{children}</div> : null}
      </div>
    </section>
  );
}

export function PublicSection({
  eyebrow,
  title,
  description,
  actions,
  children,
}: PublicSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-text-primary)] sm:text-3xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)] sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function PublicPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-[var(--color-line)] bg-[var(--color-surface-2)]/92 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      {children}
    </div>
  );
}
