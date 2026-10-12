import { VerificationScreen } from "@/components/VerificationScreen";
import { fetchSupplierMe } from "@/lib/supplier";

export default function SupplierVerification() {
  return (
    <VerificationScreen
      role="supplier"
      load={async () => {
        const me = await fetchSupplierMe();
        return { status: me.supplier.verificationStatus, docs: me.supplier.verificationDocuments, trustScore: me.supplier.trustScore };
      }}
    />
  );
}
