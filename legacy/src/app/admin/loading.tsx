export default function AdminLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--canvas)" }}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--ink-200)] border-t-[var(--teal-700)]" />
    </div>
  );
}
