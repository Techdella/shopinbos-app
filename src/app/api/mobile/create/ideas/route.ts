import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { loadCreateContext } from "@/lib/create/jobs.server";
import { CREATE_TIPS, publicIdea, selectIdeas } from "@shared/create-with-rex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Make a post" ideas for the phone app, per role (sellers: new stock, a deal, packing, a delivery; suppliers: new
// for shops, a bulk price; partners: a new route, a new pickup point), built from the person's own products and
// routes → { ideas: [{ id, title, line, format }], tip }.
export const GET = withAuth(async (_req: NextRequest, { user }) => {
  const context = await loadCreateContext(user);
  return ok({ ideas: selectIdeas(context.role, context.facts).map(publicIdea), tip: CREATE_TIPS[context.role] });
}, ["seller", "supplier", "logistics_partner"]);
