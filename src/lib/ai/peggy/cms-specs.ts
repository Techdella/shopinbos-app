// Peggy's content (CMS collections) tools: input schemas. Pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";

export const CMS_TOOL_SPECS = {
  cms_list_items: {
    write: false,
    description:
      "The store's content collections (Blog, Size guide, Recipe book, Course, FAQ…) with how many items each has, or, given a collection name, its latest items with status (draft, published, scheduled) and edit links.",
    schema: z.object({ collection: z.string().trim().max(80).nullable().describe("Collection name, or null to list the collections") }).strict(),
  },
  cms_draft_item: {
    write: true,
    description:
      "Write a new item in one of the store's content collections (a blog post, a size guide, a recipe, a lesson, an FAQ answer…) and save it as a DRAFT with search details. Never publishes; the seller reviews and publishes it in Content. Pictures, videos, links and products are left for the seller to add.",
    schema: z
      .object({
        collection: z.string().trim().min(1).max(80).describe("The collection's name, e.g. Blog or Size guide"),
        brief: z.string().trim().min(3).max(1500).describe("What to write about, the angle and anything to include"),
        title: z.string().trim().max(200).nullable().describe("A title, or null to choose one"),
      })
      .strict(),
  },
} as const;
