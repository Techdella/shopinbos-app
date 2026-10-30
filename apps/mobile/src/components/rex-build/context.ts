import type { FrameProps } from "./Frame";
import type { FlowMode, FlowScreen, OnboardingEvent, OnboardingState, RexBuildMemory } from "@/lib/seller-onboarding";

// What every screen of the guided build gets from app/onboarding/index.tsx: the loaded shop, the answers so far, and
// the moves (save, next, Rex's pick, back, Save-and-leave). Saving is on the server (PATCH /api/mobile/onboarding),
// so the app reopens on the same screen.

export type LoadedState = OnboardingState & { store: NonNullable<OnboardingState["store"]> };

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
  /** Loads the shop again (after adding products, coming back from Find stock or the editor). */
  reload: () => Promise<LoadedState | null>;
  setError: (message: string | null) => void;
  /** The frame's common props: step, back, Save, the flash, the error and the welcome-back line. */
  frame: Pick<FrameProps, "step" | "basics" | "onBack" | "onSave" | "flash" | "error" | "notice" | "close">;
}
