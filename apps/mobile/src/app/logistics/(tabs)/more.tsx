import { PartnerMore } from "@/components/PartnerMore";

// Delivery partner More: verification, cash, coverage and prices, riders' app links, settings.
export default function LogisticsMore() {
  return (
    <PartnerMore
      sections={[
        {
          title: "Your company",
          links: [
            { label: "Verification", icon: "shield", path: "app:/logistics/verification", hint: "Documents and review status" },
            { label: "Cash on delivery", icon: "wallet", path: "/logistics/cash", hint: "Record a pay-in (opens the web)" },
            { label: "Payouts and bank", icon: "coin", path: "/logistics/payouts", hint: "Opens the web" },
            { label: "Coverage and prices", icon: "pin", path: "/logistics/coverage", hint: "Where you deliver and what it costs (opens the web)" },
            { label: "Delivery quotes", icon: "tag", path: "/logistics/quotes", hint: "Shops asking for a price (opens the web)" },
          ],
        },
        {
          title: "Team and settings",
          links: [
            { label: "Add riders and send app links", icon: "users", path: "/logistics/couriers", hint: "Opens the web" },
            { label: "Company profile", icon: "store", path: "/logistics/profile", hint: "Opens the web" },
            { label: "Settings", icon: "settings", path: "/logistics/settings", hint: "Opens the web" },
          ],
        },
      ]}
    />
  );
}
