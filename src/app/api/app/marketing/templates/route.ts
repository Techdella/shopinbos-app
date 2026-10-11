import { z } from "zod";
import { created, ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { copyLibraryTemplate, listTemplates, saveTemplate } from "@/lib/marketing/templates";
import { TemplateSchema } from "../schemas";

export const GET = marketingRoute(async ({ store }) => ok(await listTemplates(store.id)));

// Save a template, or copy one from the library ({ copy: "<key>" }).
export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, z.union([z.object({ copy: z.string().max(40) }), TemplateSchema]));
  if ("copy" in input) return created(await copyLibraryTemplate(store.id, input.copy));
  return created(await saveTemplate(store.id, input));
});
