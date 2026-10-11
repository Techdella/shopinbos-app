import { redirect } from "next/navigation";

// The tax settings live on /home/taxes; this older address showed sample numbers, so it now forwards there.
export default function SellerTaxAliasPage() {
  redirect("/home/taxes");
}
