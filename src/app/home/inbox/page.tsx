import { redirect } from "next/navigation";

// The inbox itself lives at /home/messages; /home/inbox/channels and /home/inbox/settings configure it.
export default function InboxIndex() {
  redirect("/home/messages");
}
