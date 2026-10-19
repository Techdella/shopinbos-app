// A small drawing of each menu look for the header's "Menu style" and "Phone menu" pickers.

const INK = "#1A1A18";
const SOFT = "#C9C4BA";
const ACCENT = "#2F66F6";

export function MenuStyleThumb({ value }: { value: string }) {
  const bar = (children: React.ReactNode) => (
    <svg viewBox="0 0 120 60" className="mb-1.5 block h-auto w-full rounded-[8px] border border-app-line bg-white" aria-hidden>
      <rect x="8" y="9" width="16" height="6" rx="2" fill={INK} />
      {children}
    </svg>
  );
  const words = (y: number, color = SOFT, h = 3) => [36, 54, 72, 90].map((x) => <rect key={x} x={x} y={y} width="13" height={h} rx="1.5" fill={color} />);
  switch (value) {
    case "underline":
      return bar(<>{words(11)}<rect x="36" y="17" width="13" height="1.6" rx=".8" fill={ACCENT} /></>);
    case "pills":
      return bar(<><rect x="33" y="7.5" width="19" height="9" rx="4.5" fill={INK} />{[56, 74, 92].map((x) => <rect key={x} x={x} y="10.5" width="13" height="3" rx="1.5" fill={SOFT} />)}<rect x="37" y="10.5" width="11" height="3" rx="1.5" fill="#fff" /></>);
    case "caps":
      return bar(<>{[36, 52, 68, 84, 100].map((x) => <rect key={x} x={x} y="11" width="10" height="2" rx="1" fill={SOFT} />)}</>);
    case "mega":
      return bar(<>{words(11)}<rect x="6" y="22" width="108" height="32" rx="3" fill="#F4F1EA" />{[12, 38, 64, 90].map((x) => <rect key={x} x={x} y="27" width="20" height="14" rx="2" fill={SOFT} />)}{[12, 38, 64, 90].map((x) => <rect key={`t${x}`} x={x} y="45" width="14" height="3" rx="1.5" fill={INK} opacity=".5" />)}</>);
    case "drawer":
      return phone(<><rect x="0" y="0" width="30" height="60" fill="#fff" />{[10, 18, 26, 34].map((y) => <rect key={y} x="5" y={y} width="18" height="3" rx="1.5" fill={INK} opacity=".6" />)}</>);
    case "fullscreen":
      return phone(<><rect x="0" y="0" width="44" height="60" fill="#fff" />{[12, 23, 34].map((y) => <rect key={y} x="6" y={y} width="28" height="6" rx="2" fill={INK} />)}</>);
    case "sheet":
      return phone(<><rect x="0" y="28" width="44" height="32" rx="6" fill="#fff" /><rect x="17" y="31" width="10" height="1.6" rx=".8" fill={SOFT} />{[37, 44, 51].map((y) => <rect key={y} x="6" y={y} width="26" height="3" rx="1.5" fill={INK} opacity=".6" />)}</>);
    default:
      return bar(<>{words(11, INK, 3)}<path d="M98 17l2 2 2-2" stroke={INK} strokeWidth="1" fill="none" /><rect x="72" y="20" width="34" height="22" rx="3" fill="#fff" stroke={SOFT} />{[25, 31, 37].map((y) => <rect key={y} x="76" y={y} width="20" height="2.4" rx="1.2" fill={SOFT} />)}</>);
  }
}

function phone(children: React.ReactNode) {
  return (
    <svg viewBox="0 0 120 60" className="mb-1.5 block h-auto w-full rounded-[8px] border border-app-line bg-[#F4F1EA]" aria-hidden>
      <g transform="translate(38 0)">
        <rect x="0" y="0" width="44" height="60" fill="#3a3a3a" opacity=".35" />
        {children}
      </g>
    </svg>
  );
}
