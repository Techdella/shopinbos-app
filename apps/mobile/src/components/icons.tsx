import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "@/theme";

// Line icons for the app chrome (tab bar, quick actions, Peggy tasks). 24px grid, 1.9 stroke.

export type AppIconName = "home" | "box" | "chat" | "bag" | "grid" | "plus" | "search" | "bell" | "mic" | "receipt" | "play" | "megaphone" | "sparkle" | "truck" | "mail" | "coin" | "chevron" | "store" | "user" | "printer" | "tag" | "wifiOff" | "star" | "check" | "clock" | "share" | "doc" | "send" | "settings" | "image" | "bot" | "phone" | "pin" | "camera" | "shield" | "users" | "help" | "wallet" | "logout" | "x" | "globe" | "link" | "route" | "filter" | "lock" | "copy" | "chart" | "zap" | "popup";

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
  tag: () => <><Path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><Circle cx="7.5" cy="7.5" r="1.5" /></>,
  star: () => <Path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  check: () => <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: () => <><Circle cx="12" cy="12" r="8.5" /><Path d="M12 7.5V12l3 2" /></>,
  share: () => <><Path d="M12 15V4M8 8l4-4 4 4" /><Path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" /></>,
  doc: () => <><Path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><Path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  send: () => <Path d="M4 12l16-8-6 16-2.5-6.5L4 12z" />,
  settings: () => <><Circle cx="12" cy="12" r="3" /><Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  image: () => <><Rect x="3.5" y="4.5" width="17" height="15" rx="2" /><Circle cx="9" cy="10" r="1.8" /><Path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" /></>,
  bot: () => <><Rect x="4.5" y="8" width="15" height="11" rx="3" /><Path d="M12 4v4M9 13h.01M15 13h.01" /></>,
  phone: () => <Path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />,
  pin: () => <><Path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><Circle cx="12" cy="9.5" r="2.5" /></>,
  globe: () => <><Circle cx="12" cy="12" r="9" /><Path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  camera: () => <><Path d="M4 8h3.5L9 5.5h6L16.5 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><Circle cx="12" cy="13" r="3.5" /></>,
  shield: () => <><Path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><Path d="M9 12l2 2 4-4" /></>,
  users: () => <><Circle cx="9" cy="8.5" r="3.5" /><Path d="M3 20a6 6 0 0 1 12 0M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.5a6 6 0 0 1 3 5.5" /></>,
  help: () => <><Circle cx="12" cy="12" r="8.5" /><Path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" /></>,
  wallet: () => <><Path d="M4 7a2 2 0 0 1 2-2h11v4" /><Rect x="3.5" y="7" width="17" height="12.5" rx="2" /><Path d="M16 13.5h2" /></>,
  logout: () => <><Path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><Path d="M10 8l-4 4 4 4M6 12h9" /></>,
  x: () => <Path d="M6 6l12 12M18 6L6 18" />,
  link: () => <><Path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><Path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  route: () => <><Circle cx="6" cy="18" r="2.5" /><Circle cx="18" cy="6" r="2.5" /><Path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" /></>,
  wifiOff: () => <><Path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0" /><Path d="M3 3l18 18" /></>,
  filter: () => <Path d="M4 6h16M7 12h10M10 18h4" />,
  lock: () => <><Rect x="5" y="11" width="14" height="10" rx="2" /><Path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  copy: () => <><Rect x="9" y="9" width="11" height="11" rx="2" /><Path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9" /></>,
  // Insights, Automations and Popups (canvas board M-Menu).
  chart: () => <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  zap: () => <Path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  popup: () => <><Rect x="3" y="3" width="18" height="18" rx="3" /><Rect x="7" y="8" width="10" height="8" rx="2" /></>,
};

export function AppIcon({ name, size = 22, color = colors.ink, strokeWidth = 1.9 }: { name: AppIconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name](color)}
    </Svg>
  );
}
