import { redirect } from "next/navigation";

// The build-path picker is now the "Where are you starting from?" question inside seller onboarding.
export default function PathPickerPage() {
  redirect("/onboarding/rex");
}
