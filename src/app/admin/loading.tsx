export default function AdminLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-app-canvas" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-app-line border-t-app-ink" />
    </div>
  );
}
