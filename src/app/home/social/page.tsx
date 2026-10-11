import { redirect } from "next/navigation";

// Social selling lives at /channels (catalog feeds, tagged links, the post composer and per-channel results).
export default function SocialHubRedirect() {
  redirect("/channels");
}
