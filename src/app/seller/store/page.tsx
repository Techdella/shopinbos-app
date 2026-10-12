import { redirect } from "next/navigation";

// Old store hub: the store lives at /home/store now (like the other /seller/* aliases).
export default function SellerStoreAliasPage() {
  redirect("/home/store");
}
