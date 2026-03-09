type ErrorPanelProps = {
  title: string;
  message: string;
};

export function ErrorPanel({ title, message }: ErrorPanelProps) {
  return (
    <section className="rounded-2xl border border-[var(--color-danger-text)]/20 bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger-text)]">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1 break-words">{message}</p>
    </section>
  );
}
