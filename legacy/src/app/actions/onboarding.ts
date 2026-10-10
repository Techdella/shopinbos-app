"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { getCurrentAppUser } from "@/lib/server-auth";
import type { OnboardingState } from "@/lib/onboarding-router";

async function getSellerUserOrThrow() {
  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user || user.role !== "seller") {
    redirect("/login");
  }
  return user;
}

export async function setOnboardingPath(_formData: FormData) {
  const user = await getSellerUserOrThrow();
  const path = String(_formData.get("path") || "");

  if (path !== "rex" && path !== "template" && path !== "skip") {
    return;
  }

  const stateMap: Record<string, OnboardingState> = {
    rex: "BUILDING_REX",
    template: "BUILDING_TEMPLATE",
    skip: "SKIPPED",
  };

  const onboardingState = stateMap[path];

  const existing = await db.store.findUnique({ where: { userId: user.id } });

  await db.store.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      name: `${user.name}'s Store`,
      slug: `${user.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${user.id.slice(0, 6)}`,
      country: user.country || "Nigeria",
      city: user.city || "Lagos",
      onboardingState,
    },
    update: {
      onboardingState,
    },
  });

  if (path === "rex") {
    redirect("/onboarding/rex");
  } else if (path === "template") {
    redirect("/builder/templates?onboarding=true");
  } else {
    await db.store.update({
      where: { userId: user.id },
      data: { firstDashboardVisitComplete: true },
    });
    redirect("/home");
  }
}

export async function completeFirstDashboardVisit() {
  const user = await getSellerUserOrThrow();

  await db.store.update({
    where: { userId: user.id },
    data: { firstDashboardVisitComplete: true },
  });

  redirect("/home");
}

export async function markStoreComplete() {
  const user = await getSellerUserOrThrow();

  await db.store.updateMany({
    where: { userId: user.id },
    data: {
      onboardingState: "LIVE",
      firstDashboardVisitComplete: true,
    },
  });

  redirect("/home");
}
