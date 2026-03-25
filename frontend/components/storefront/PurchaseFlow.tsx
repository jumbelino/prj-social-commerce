import type { ReactNode } from "react";

type SectionCardProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
};

type StatusCalloutProps = {
  tone?: "neutral" | "success" | "warning" | "danger";
  eyebrow?: string;
  title: string;
  message: string;
  action?: ReactNode;
};

export function PurchaseSectionCard({
  eyebrow,
  title,
  description,
  children,
}: SectionCardProps) {
  return (
    <section className="rounded-[28px] border border-[var(--color-line)] bg-[linear-gradient(180deg,rgba(16,26,47,0.96),rgba(10,18,33,0.96))] p-5 shadow-[0_20px_54px_rgba(0,0,0,0.24)] sm:p-6">
      <div className="mb-5 space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display text-2xl font-semibold text-[var(--color-text-primary)] sm:text-[2rem]">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function PurchaseSummaryCard({
  eyebrow,
  title,
  description,
  children,
}: SectionCardProps) {
  return (
    <aside className="rounded-[28px] border border-[var(--color-line)] bg-[var(--color-surface-2)]/92 p-5 shadow-[0_20px_54px_rgba(0,0,0,0.24)] sm:p-6">
      <div className="mb-5 space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{description}</p>
        ) : null}
      </div>
      {children}
    </aside>
  );
}

export function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        strong ? "text-base font-semibold text-[var(--color-text-primary)]" : "text-sm text-[var(--color-text-secondary)]"
      }`}
    >
      <dt>{label}</dt>
      <dd className={strong ? "text-[var(--color-text-primary)]" : "font-semibold text-[var(--color-text-primary)]"}>
        {value}
      </dd>
    </div>
  );
}

export function StatusCallout({
  tone = "neutral",
  eyebrow,
  title,
  message,
  action,
}: StatusCalloutProps) {
  const toneClasses =
    tone === "success"
      ? "border-[var(--color-success-text)]/18 bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
      : tone === "warning"
        ? "border-[var(--color-warning-text)]/18 bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]"
        : tone === "danger"
          ? "border-[var(--color-danger-text)]/20 bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]"
          : "border-[var(--color-line)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)]";

  return (
    <div className={`rounded-[22px] border px-4 py-4 shadow-[0_12px_30px_rgba(0,0,0,0.16)] ${toneClasses}`}>
      {eyebrow ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">{eyebrow}</p>
      ) : null}
      <p className="mt-1 font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 opacity-90">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
