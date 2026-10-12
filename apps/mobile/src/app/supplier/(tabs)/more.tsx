import { PartnerMore } from "@/components/PartnerMore";

// Supplier More: payouts and bank, verification, team and settings (web portal pages open signed in).
export default function SupplierMore() {
  return (
    <PartnerMore
      sections={[
        {
          title: "Your business",
          links: [
            { label: "Verification", icon: "shield", path: "app:/supplier/verification", hint: "Documents and review status" },
            { label: "Payouts and bank", icon: "coin", path: "/supplier/payouts", hint: "What you've earned, your bank account (opens the web)" },
            { label: "Wholesale price tiers", icon: "tag", path: "/supplier/wholesale", hint: "Opens the web" },
            { label: "Reviews", icon: "star", path: "/supplier/reviews", hint: "Opens the web" },
          ],
        },
        {
          title: "Settings",
          links: [
            { label: "Team", icon: "users", path: "/supplier/team", hint: "Who can manage orders (opens the web)" },
            { label: "Business profile", icon: "store", path: "/supplier/profile", hint: "Logo, description, categories (opens the web)" },
            { label: "Settings", icon: "settings", path: "/supplier/settings", hint: "Notifications and account (opens the web)" },
          ],
        },
      ]}
    />
  );
}
