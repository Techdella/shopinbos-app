import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  const spec = await readFile(join(process.cwd(), "docs", "openapi.yaml"), "utf8");

  return new Response(spec, {
    status: 200,
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
