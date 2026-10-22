import { redirect } from "next/navigation";

// Posting lives at Marketing > Social posts (calendar, queue, one-tap posts); marketplaces at /channels.
export default function SocialHubRedirect() {
  redirect("/home/marketing/social");
}
