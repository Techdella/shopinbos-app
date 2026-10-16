import { llmsResponse } from "../llms.txt/llms-response";

// /llms-full.txt: the long version, with every product's description, the store's FAQ answers and its articles.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return llmsResponse(request, (await params).slug, "full");
}
