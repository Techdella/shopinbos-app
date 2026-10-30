import type { FlowMode, FlowScreen, OnboardingEvent, RexBuildMemory } from "@shared/seller-onboarding";
import type { LoadedState } from "./api";
import type { FrameProps } from "./Frame";

// What every screen of the web's guided build gets from ./SellerRexBuild.tsx (the same shape as the phone's
// apps/mobile/src/components/rex-build/context.ts): the loaded shop, the answers so far, and the moves (save, next,
// Rex's pick, back, Save & exit). Saving is on the server (PATCH /api/mobile/onboarding), so the seller reopens on the
// same screen here or on the phone.

export interface StepCtx {
  data: LoadedState;
  flow: RexBuildMemory;
  mode: FlowMode;
  screen: FlowScreen;
  /** Saves answers without moving on. False when it didn't save (the error shows). */
  save: (patch: Partial<RexBuildMemory>, event?: OnboardingEvent, props?: Record<string, unknown>) => Promise<boolean>;
  /** Saves the answers and goes to the next screen (recording the step for analytics). */
  next: (patch?: Partial<RexBuildMemory>, options?: { rex?: boolean }) => Promise<void>;
  /** "Let Rex choose for me": "✓ Rex chose: …" for a second, then the next screen. */
  rexChose: (label: string, patch: Partial<RexBuildMemory>) => void;
  /** Goes to a screen without saving answers (the review's "Fix it", the builder's "Check and go live"). */
  go: (screen: FlowScreen) => void;
  /** Loads the shop again (after adding products, coming back from Find stock or the builder). */
  reload: () => Promise<LoadedState | null>;
  setError: (message: string | null) => void;
  /** The frame's common props: step, back, Save & exit, the flash, the error and the welcome-back line. */
  frame: Pick<FrameProps, "step" | "basics" | "onBack" | "onSave" | "flash" | "error" | "notice" | "close">;
}
