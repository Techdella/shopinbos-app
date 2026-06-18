import "server-only";
import { db } from "@/lib/db/client";

export type OnboardingState = "NEW" | "BUILDING_REX" | "BUILDING_TEMPLATE" | "SKIPPED" | "INCOMPLETE" | "LIVE";

const ONBOARDING_STATES = ["NEW", "BUILDING_REX", "BUILDING_TEMPLATE", "SKIPPED", "INCOMPLETE", "LIVE"] as const;

export function isValidOnboardingState(value: string | null | undefined): value is OnboardingState {
  return ONBOARDING_STATES.includes(value as OnboardingState);
}

export type OnboardingDestination = "/onboarding/path-picker" | "/onboarding/rex" | "/builder/templates?onboarding=true" | "/home";

export async function getOnboardingDestination(userId: string): Promise<OnboardingDestination> {
  const store = await db.store.findUnique({
    where: { userId },
    select: { onboardingState: true, firstDashboardVisitComplete: true },
  });

  if (!store) {
    return "/onboarding/path-picker";
  }

  if (store.firstDashboardVisitComplete) {
    return "/home";
  }

  const state = store.onboardingState;

  if (state === "BUILDING_REX") {
    return "/onboarding/rex";
  }

  if (state === "BUILDING_TEMPLATE") {
    return "/builder/templates?onboarding=true";
  }

  if (state === "SKIPPED" || state === "INCOMPLETE" || state === "LIVE") {
    return "/home";
  }

  return "/onboarding/path-picker";
}
