import { llmsResponse } from "./llms-response";

// /llms.txt (https://llmstxt.org): a short markdown summary of a live store for AI assistants and answer engines.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return llmsResponse(request, (await params).slug, "short");
}
