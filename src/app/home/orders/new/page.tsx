import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function NewOrderPage() {
  redirect("/home/orders?new=1");
}
