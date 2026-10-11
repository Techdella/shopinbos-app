import "server-only";

import { meterAi } from "@/lib/ai/usage";
import { runPeggy } from "@/lib/ai/peggy/agent";

// Kept for existing importers (src/app/actions/ai.ts). Peggy now lives in src/lib/ai/peggy/.
export { buildSellerSnapshot, fmtMoney, greetingFor, orderItemCount, sellerSystemPrompt, type SellerSnapshot } from "@/lib/ai/peggy/context";

/** Peggy's reply to a single seller message (she can use her tools). Prefer runPeggy for a conversation. */
export async function answerPeggy(userId: string, message: string): Promise<{ text?: string; error?: string }> {
  try {
    const limited = await meterAi(userId, "text");
    if (limited) {
      const body = (await limited.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { error: body?.error?.message ?? "You've reached today's AI limit." };
    }
    const result = await runPeggy({ id: userId }, [{ role: "user", content: message.slice(0, 4000) }]);
    if ("error" in result) return { error: result.error };
    return { text: result.text };
  } catch (error) {
    console.error("Peggy AI error:", error);
    return { error: "Something went wrong. Please try again in a moment." };
  }
}
