import type { ReactNode } from "react";

type StateBlockProps = {
  title: string;
  message: string;
  action?: ReactNode;
};

function StateCard({
  title,
  message,
  action,
  tone,
}: StateBlockProps & { tone: "neutral" | "danger" | "success" }) {
  const toneClasses =
    tone === "danger"
      ? "border-[var(--color-danger-text)]/25 bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]"
      : tone === "success"
        ? "border-[var(--color-success-text)]/20 bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
        : "border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]";

  return (
    <section className={`rounded-[24px] border px-5 py-8 text-center shadow-[0_16px_44px_rgba(0,0,0,0.2)] ${toneClasses}`}>
      <h2 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6">{message}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  );
}

export function LoadingState({ title, message }: StateBlockProps) {
  return (
    <section className="rounded-[24px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-5 py-10 text-center text-[var(--color-text-secondary)] shadow-[0_16px_44px_rgba(0,0,0,0.2)]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-line-strong)] border-t-[var(--color-accent)] animate-spin" />
      <h2 className="mt-5 font-display text-2xl font-semibold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6">{message}</p>
    </section>
  );
}

export function EmptyState(props: StateBlockProps) {
  return <StateCard {...props} tone="neutral" />;
}

export function ErrorState(props: StateBlockProps) {
  return <StateCard {...props} tone="danger" />;
}

export function SuccessState(props: StateBlockProps) {
  return <StateCard {...props} tone="success" />;
}
