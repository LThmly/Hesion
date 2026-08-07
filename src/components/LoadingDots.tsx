export function LoadingDots({ label = "Loading" }: { label?: string }) {
  return (
    <span className="loading-dots" role="status" aria-label={label}>
      <span />
      <span />
      <span />
    </span>
  );
}
