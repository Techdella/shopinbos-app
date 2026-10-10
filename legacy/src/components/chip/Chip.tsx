export type ChipPose = "idle" | "wave" | "think" | "shop" | "wink";

interface ChipProps {
  size?: number;
  pose?: ChipPose;
  className?: string;
}

export function Chip({ size = 36, pose = "idle", className }: ChipProps) {
  const mouth =
    pose === "think" ? (
      <path d="M8.5 15.5 Q12 14.5 15.5 15.5" stroke="#0E2A38" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    ) : pose === "wave" ? (
      <path d="M8.5 14.5 Q12 17 15.5 14.5" stroke="#0E2A38" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    ) : (
      <path d="M9 15 Q12 16.5 15 15" stroke="#0E2A38" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-label="Rex"
    >
      {/* Face */}
      <circle cx="12" cy="12" r="11" fill="#73D8C8" />
      <circle cx="12" cy="12" r="11" fill="none" stroke="#0E2A38" strokeWidth="0.6" />

      {/* Eyes */}
      {pose === "wink" ? (
        <>
          <circle cx="9"  cy="11" r="1.4" fill="#0E2A38" />
          <path d="M13.5 10.5 Q15 9.5 16.5 10.5" stroke="#0E2A38" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="9"  cy="11" r="1.4" fill="#0E2A38" />
          <circle cx="15" cy="11" r="1.4" fill="#0E2A38" />
        </>
      )}

      {/* Mouth */}
      {mouth}

      {/* Subtle freckles */}
      <circle cx="6"  cy="14" r="0.6" fill="#0E2A38" opacity="0.3" />
      <circle cx="18" cy="14" r="0.6" fill="#0E2A38" opacity="0.3" />
    </svg>
  );
}
