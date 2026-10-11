import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "@/theme";

// Line icons for the app chrome (tab bar, quick actions, Peggy tasks). 24px grid, 1.9 stroke.

export type AppIconName = "home" | "box" | "chat" | "bag" | "grid" | "plus" | "search" | "bell" | "mic" | "receipt" | "play" | "megaphone" | "sparkle" | "truck" | "mail" | "coin" | "chevron" | "store" | "user" | "printer";

const PATHS: Record<AppIconName, (color: string) => React.ReactNode> = {
  home: () => <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  box: () => <><Path d="M21 8l-9-5-9 5 9 5 9-5z" /><Path d="M3 8v8l9 5 9-5V8M12 13v8" /></>,
  chat: () => <Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" />,
  bag: () => <><Path d="M5 8h14l-1 13H6L5 8z" /><Path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  grid: () => <><Rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><Rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><Rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><Rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  plus: () => <Path d="M12 5v14M5 12h14" />,
  search: () => <><Circle cx="11" cy="11" r="6.5" /><Path d="M20 20l-4-4" /></>,
  bell: () => <><Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" /><Path d="M10 20a2 2 0 0 0 4 0" /></>,
  mic: () => <><Rect x="9" y="3" width="6" height="11" rx="3" /><Path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  receipt: () => <><Path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><Path d="M9 8h6M9 12h6" /></>,
  play: () => <Path d="M7 5l12 7-12 7V5z" />,
  printer: () => <><Path d="M7 9V3h10v6" /><Path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><Path d="M7 14h10v7H7z" /></>,
  megaphone: () => <><Path d="M4 10v4l11 5V5L4 10z" /><Path d="M15 9a3 3 0 0 1 0 6M7 14l1 5h3" /></>,
  sparkle: () => <Path d="M12 3l2.2 6.3L20 12l-5.8 2.7L12 21l-2.2-6.3L4 12l5.8-2.7z" />,
  truck: () => <><Path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><Circle cx="7" cy="18" r="1.8" /><Circle cx="17" cy="18" r="1.8" /></>,
  mail: () => <><Rect x="3" y="5" width="18" height="14" rx="2" /><Path d="M3 7l9 6 9-6" /></>,
  coin: () => <><Circle cx="12" cy="12" r="8" /><Path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></>,
  chevron: () => <Path d="M9 6l6 6-6 6" />,
  store: () => <><Path d="M4 9l1.5-5h13L20 9" /><Path d="M4 9h16v2a3 3 0 0 1-5.3 2A3 3 0 0 1 12 14a3 3 0 0 1-2.7-1A3 3 0 0 1 4 11V9zM5 13v7h14v-7" /></>,
  user: () => <><Circle cx="12" cy="8" r="4" /><Path d="M4 21a8 8 0 0 1 16 0" /></>,
};

export function AppIcon({ name, size = 22, color = colors.ink, strokeWidth = 1.9 }: { name: AppIconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name](color)}
    </Svg>
  );
}
