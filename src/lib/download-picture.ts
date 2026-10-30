// "Download" for a picture on another host (a Rex logo in storage): a plain <a download> is ignored across origins,
// so the file is fetched and saved from a local blob URL. If that fails (the host refuses), it opens in a new tab,
// where the person can save it themselves.

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

export async function downloadPicture(url: string, name: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const local = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = local;
    link.download = `${name}.${EXTENSIONS[blob.type] ?? "png"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(local), 10_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
