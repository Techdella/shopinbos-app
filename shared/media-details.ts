// Zod schema for editing a media library entry's title and alt text (PATCH /api/app/media/[id], the Media page).
// Kept apart from the pure rules in ./media.ts so the phone app needn't load zod.

import { z } from "zod";
import { MEDIA_ALT_MAX, MEDIA_TITLE_MAX, cleanMediaText } from "./media.ts";

// Too long is refused (rather than cut) so nothing the person typed is lost without them knowing.
const text = (max: number, tooLong: string) =>
  z.union([z.string().max(max * 2, tooLong), z.null()])
    .transform((value) => cleanMediaText(value, max * 2))
    .refine((value) => value === null || value.length <= max, tooLong);

export const MediaDetailsSchema = z
  .object({
    title: text(MEDIA_TITLE_MAX, `Keep the title under ${MEDIA_TITLE_MAX} characters.`).optional(),
    alt: text(MEDIA_ALT_MAX, `Keep the alt text under ${MEDIA_ALT_MAX} characters.`).optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.alt !== undefined, "Change the title or the alt text.");

/** { title?, alt? }: each cleaned, null clears it, a missing key leaves it as it is. */
export type MediaDetails = z.output<typeof MediaDetailsSchema>;
