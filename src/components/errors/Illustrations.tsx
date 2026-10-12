// Little animated scenes for the storefront 404, error and "not open yet" pages (the app's own pages use Peggy
// and Rex from MascotScenes). Decorative (aria-hidden), drawn in the --sx-* colours ErrorScene sets, animated by
// errors.css (transforms only; off under reduced motion).

const INK = "var(--sx-ink)";
const ACCENT = "var(--sx-accent)";
const WARM = "var(--sx-warm)";
const PAPER = "var(--sx-paper)";

/** A little repair robot, mid-fix with a screwdriver, sparks flying. (Storefront errors: a generic character, not Rex.) */
export function RepairBotScene() {
  return (
    <svg viewBox="0 0 320 200" width="100%" height="100%" aria-hidden focusable="false">
      <line x1={20} y1={180} x2={300} y2={180} stroke={INK} strokeOpacity={0.14} strokeWidth={2} />
      <g className="sbx-a-roll">
        <path d="M58 170l8-5 8 5v9l-8 5-8-5z" fill={INK} fillOpacity={0.55} />
        <circle cx={66} cy={174.5} r={3} fill={PAPER} />
      </g>
      <g className="sbx-a-wobble">
        <rect x={138} y={162} width={16} height={18} rx={4} fill={INK} />
        <rect x={176} y={162} width={16} height={18} rx={4} fill={INK} />
        <rect x={120} y={86} width={90} height={80} rx={22} fill={INK} />
        <rect x={140} y={116} width={50} height={32} rx={7} fill={PAPER} stroke={ACCENT} strokeWidth={2} />
        <path d="M146 140l7-12 7 10 7-12 7 12 7-8" fill="none" stroke={WARM} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <rect x={102} y={104} width={20} height={10} rx={5} fill={INK} />
        <rect x={100} y={104} width={10} height={36} rx={5} fill={INK} />
        <line x1={165} y1={30} x2={165} y2={16} stroke={INK} strokeWidth={4} strokeLinecap="round" />
        <circle className="sbx-a-flicker" cx={165} cy={11} r={6} fill={WARM} />
        <rect x={126} y={30} width={78} height={58} rx={18} fill={INK} />
        <rect x={136} y={40} width={58} height={36} rx={11} fill={ACCENT} />
        <g className="sbx-a-blink">
          <rect x={150} y={50} width={8} height={12} rx={4} fill={INK} />
          <rect x={172} y={50} width={8} height={12} rx={4} fill={INK} />
        </g>
        <path d="M156 69q4.5-3 9 0t9 0" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
        <g className="sbx-a-twist">
          <rect x={206} y={107} width={42} height={11} rx={5.5} fill={INK} />
          <rect x={244} y={104} width={18} height={17} rx={5} fill={WARM} />
          <path d="M262 112.5H284" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        </g>
      </g>
      <g transform="translate(292 112)">
        <path className="sbx-a-spark" d="M0-12V-4M0 4V12" stroke={WARM} strokeWidth={3} strokeLinecap="round" />
        <path className="sbx-a-spark2" d="M-9-9l5 5M4 4l5 5" stroke={WARM} strokeWidth={3} strokeLinecap="round" />
        <path className="sbx-a-spark3" d="M9-9l-5 5M-4 4l-5 5" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
      </g>
      <path className="sbx-a-float" d="M114 34c0 5-3 8-6 8s-6-3-6-8 6-12 6-12 6 7 6 12z" fill={ACCENT} fillOpacity={0.8} />
    </svg>
  );
}

/** A parcel hopping and flipping over its own shadow. (Storefront 404.) */
export function TumblingParcelScene() {
  return (
    <svg viewBox="0 0 240 180" width="100%" height="100%" aria-hidden focusable="false">
      <ellipse className="sbx-a-shadow" cx={120} cy={164} rx={42} ry={6} fill={INK} fillOpacity={0.25} />
      <g className="sbx-a-hop">
        <rect x={90} y={100} width={60} height={58} rx={7} fill={ACCENT} />
        <path d="M90 116H150" stroke={INK} strokeOpacity={0.18} strokeWidth={2} />
        <rect x={113} y={100} width={14} height={58} fill={PAPER} fillOpacity={0.7} />
        <text x={120} y={146} textAnchor="middle" fontSize={22} fontWeight={700} fill={INK} fillOpacity={0.75} fontFamily="inherit">?</text>
      </g>
      <g className="sbx-a-float" fill={WARM}>
        <circle cx={60} cy={60} r={4} />
        <circle cx={186} cy={44} r={3} />
        <circle cx={196} cy={92} r={2.5} />
      </g>
    </svg>
  );
}

/** A hanging "Opening soon" sign swinging on its nail. (Store not open yet.) */
export function OpeningSoonScene({ label = ["OPENING", "SOON"] }: { label?: [string, string] }) {
  return (
    <svg viewBox="0 0 240 180" width="100%" height="100%" aria-hidden focusable="false">
      <g className="sbx-a-swing">
        <path d="M120 16L76 66M120 16L164 66" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        <rect x={54} y={64} width={132} height={70} rx={14} fill={ACCENT} />
        <circle cx={76} cy={74} r={3} fill={PAPER} fillOpacity={0.7} />
        <circle cx={164} cy={74} r={3} fill={PAPER} fillOpacity={0.7} />
        <text x={120} y={96} textAnchor="middle" fontSize={17} fontWeight={700} letterSpacing={2} fill={PAPER} fontFamily="inherit">{label[0]}</text>
        <text x={120} y={120} textAnchor="middle" fontSize={17} fontWeight={700} letterSpacing={2} fill={PAPER} fontFamily="inherit">{label[1]}</text>
      </g>
      <circle cx={120} cy={14} r={4.5} fill={INK} />
      <g className="sbx-a-float" fill={WARM}>
        <path d="M40 120l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
        <path d="M200 40l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      </g>
    </svg>
  );
}
