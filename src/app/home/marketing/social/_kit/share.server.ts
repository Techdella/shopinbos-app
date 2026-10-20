import "server-only";

import { captionFor, channelLink } from "@/lib/social-posts/server";
import { channelSpec, readResults, type PostChannel } from "@/lib/social-posts/pure";
import { fitCaption } from "@/lib/social/share";

// What a one-tap button needs for a post: the text to paste (caption + tagged link), the app's own share page
// where it has one, and the picture at the post's size.

export function shareProps(post: { id: string; caption: string; link: string | null; mediaUrl: string | null; renderedUrl: string | null; results: unknown }, channel: PostChannel) {
  const text = captionFor(channel, post);
  const link = channelLink(channel, post.link);
  const body = fitCaption(post.caption, channelSpec(channel).limit - (link ? 24 : 0));
  const intentUrl =
    channel === "whatsapp"
      ? `https://wa.me/?text=${encodeURIComponent(text)}`
      : channel === "x"
        ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(body)}${link ? `&url=${encodeURIComponent(link)}` : ""}`
        : null;
  return {
    postId: post.id,
    channel,
    label: channelSpec(channel).label,
    text,
    intentUrl,
    mediaUrl: post.renderedUrl ?? post.mediaUrl,
    done: readResults(post.results)[channel]?.status === "shared",
  };
}
