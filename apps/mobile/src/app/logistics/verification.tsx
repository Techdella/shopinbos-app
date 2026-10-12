import { VerificationScreen } from "@/components/VerificationScreen";
import { fetchLogisticsMe } from "@/lib/logistics";

export default function LogisticsVerification() {
  return (
    <VerificationScreen
      role="logistics_partner"
      load={async () => {
        const me = await fetchLogisticsMe();
        return { status: me.partner.verificationStatus, docs: me.partner.verificationDocuments, trustScore: me.partner.trustScore };
      }}
    />
  );
}
