import { Redirect } from "expo-router";

// The old phone set-up wizard (company, coverage, rates, bank) is gone: delivery partners sign up in one flow of 4
// steps on /logistics/verification, and pricing is set later from the portal. This keeps old links working.
export default function LogisticsSetup() {
  return <Redirect href="/logistics/verification" />;
}
