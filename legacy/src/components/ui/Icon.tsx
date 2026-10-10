import type { SVGProps } from "react";

export type IconName =
  | "home" | "chip" | "bag" | "box" | "truck" | "card" | "chart"
  | "megaphone" | "users" | "shop" | "sparkle" | "plug" | "settings"
  | "search" | "bell" | "plus" | "arrow" | "check" | "x" | "play"
  | "pause" | "pulse" | "leaf" | "moon" | "chevron" | "dot"
  | "instagram" | "tiktok" | "whatsapp" | "facebook" | "edit"
  | "star" | "people" | "send" | "monitor" | "phone" | "undo" | "store"
  | "cart" | "coin" | "tag" | "package" | "bank" | "download" | "dots"
  | "palette" | "chat" | "arrowUp" | "arrowDown" | "minus" | "filter"
  | "refresh" | "calendar" | "clock" | "info" | "warn" | "lock"
  | "eye" | "chevDown" | "image" | "globe" | "pin" | "layers"
  | "automation" | "wand" | "rocket" | "bolt" | "user" | "flag"
  | "heart" | "list" | "upload" | "link" | "tag2"
  | "document" | "mail" | "target" | "code" | "cards" | "message" | "grid" | "book"
  | "logout" | "arrowLeft"
  | "copy" | "paperclip" | "moreHorizontal" | "chevRight" | "checkCircle" | "trash";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const paths: Record<IconName, React.ReactNode> = {
  home:      <><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></>,
  chip:      <><circle cx="12" cy="12" r="9"/><circle cx="9" cy="11" r="1.2" fill="currentColor"/><circle cx="15" cy="11" r="1.2" fill="currentColor"/><path d="M9 15c1 .8 2 1.2 3 1.2s2-.4 3-1.2"/></>,
  bag:       <><path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 016 0"/></>,
  box:       <><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></>,
  truck:     <><rect x="2" y="7" width="13" height="10" rx="1"/><path d="M15 10h4l2 3v4h-6"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
  card:      <><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/></>,
  chart:     <><path d="M4 20V8"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></>,
  megaphone: <><path d="M3 11v3l11 5V6z"/><path d="M14 9c2 0 4 1 4 3.5S16 16 14 16"/></>,
  users:     <><circle cx="9" cy="8" r="3"/><path d="M3 20c1-3 3.5-5 6-5s5 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c2 0 4 1.5 5 4"/></>,
  shop:      <><path d="M3 9l1-4h16l1 4"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></>,
  sparkle:   <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></>,
  plug:      <><path d="M9 4v6"/><path d="M15 4v6"/><rect x="7" y="10" width="10" height="6" rx="1"/><path d="M12 16v4"/></>,
  settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3h.1a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/></>,
  search:    <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></>,
  bell:      <><path d="M6 9a6 6 0 1112 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/><path d="M10 21a2 2 0 004 0"/></>,
  plus:      <><path d="M12 5v14M5 12h14"/></>,
  arrow:     <><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></>,
  check:     <><path d="M5 12l4 4 10-10"/></>,
  x:         <><path d="M6 6l12 12M18 6L6 18"/></>,
  play:      <path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>,
  pause:     <><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></>,
  pulse:     <><path d="M3 12h4l2-7 4 14 2-7h6"/></>,
  leaf:      <><path d="M5 19c0-9 7-15 16-15-1 11-7 17-16 16z"/><path d="M5 19l9-9"/></>,
  moon:      <><path d="M21 13a8 8 0 11-9-10 6 6 0 009 10z"/></>,
  chevron:   <path d="M9 6l6 6-6 6"/>,
  dot:       <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none"/></>,
  tiktok:    <><path d="M14 4v10a4 4 0 11-4-4"/><path d="M14 4c0 3 2 5 5 5"/></>,
  whatsapp:  <><path d="M21 12a9 9 0 11-3.5-7.1L21 4l-1 4"/><path d="M8 11c.6 2 2 3.4 4 4l2-2c1 .4 2 .6 3 .6"/></>,
  facebook:  <path d="M14 21v-7h2.5l.5-3H14V9c0-1 .5-1.5 1.6-1.5H17V5h-2.4C12 5 11 6 11 8.5V11H8.5v3H11v7z"/>,
  edit:      <><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M14 5l4 4"/></>,
  star:      <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7L2 9l7-1z"/>,
  people:    <><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.85"/></>,
  send:      <><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4z"/></>,
  monitor:   <><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/></>,
  phone:     <><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/><path d="M10 5h4"/></>,
  undo:      <><path d="M9 7H4v5"/><path d="M4 12a8 8 0 111.7 5"/></>,
  store:     <><path d="M4 8l1.4-4h13.2L20 8"/><path d="M5 8h14v11a1 1 0 01-1 1H6a1 1 0 01-1-1V8z"/><path d="M9 12h6"/><path d="M10 16h4"/></>,

  /* Extended icon set used across dashboard surfaces */
  cart:       <><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.7 11.4a2 2 0 002 1.6h7.5a2 2 0 002-1.5L21 8H6"/></>,
  coin:       <><circle cx="12" cy="12" r="9"/><path d="M9 10.5h5a1.5 1.5 0 010 3h-4a1.5 1.5 0 000 3h5M12 7v2M12 15v2"/></>,
  tag:        <><path d="M20 12.4L12.4 20 3 10.6V3h7.6z"/><circle cx="8" cy="8" r="1.4"/></>,
  tag2:       <><path d="M20 12.4L12.4 20 3 10.6V3h7.6z"/><circle cx="8" cy="8" r="1.4"/></>,
  package:    <><path d="M3 7v10l9 4 9-4V7l-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></>,
  bank:       <><path d="M3 10l9-6 9 6v2H3z"/><path d="M5 12v6M9 12v6M15 12v6M19 12v6M3 21h18"/></>,
  download:   <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/></>,
  dots:       <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></>,
  palette:    <><path d="M12 3a9 9 0 000 18c1.5 0 2-1 2-2 0-.6-.2-1-.5-1.5s-.5-.9-.5-1.5c0-1 .8-2 2-2h2a4 4 0 004-4 9 9 0 00-9-7z"/><circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="9.5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="6.5" r="1" fill="currentColor" stroke="none"/></>,
  chat:       <><path d="M21 12a8 8 0 11-3.7-6.7L21 4l-1 4.3A7.9 7.9 0 0121 12z"/></>,
  arrowUp:    <><path d="M12 19V5M6 11l6-6 6 6"/></>,
  arrowDown:  <><path d="M12 5v14M6 13l6 6 6-6"/></>,
  minus:      <><path d="M5 12h14"/></>,
  filter:     <><path d="M4 5h16l-6 8v6l-4-2v-4z"/></>,
  refresh:    <><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M21 4v4h-4M21 12a9 9 0 01-15 6.7L3 16"/><path d="M3 20v-4h4"/></>,
  calendar:   <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
  clock:      <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
  info:       <><circle cx="12" cy="12" r="9"/><path d="M12 8.5v.01M12 11v6"/></>,
  warn:       <><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.01"/></>,
  lock:       <><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></>,
  eye:        <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  chevDown:   <><path d="M6 9l6 6 6-6"/></>,
  image:      <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9.5" r="1.5"/><path d="M3 17l5-5 4 4 3-3 6 6"/></>,
  globe:      <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></>,
  pin:        <><path d="M12 22s7-7.4 7-12a7 7 0 10-14 0c0 4.6 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></>,
  layers:     <><path d="M12 2L2 8l10 6 10-6z"/><path d="M2 12l10 6 10-6M2 16l10 6 10-6"/></>,
  automation: <><circle cx="12" cy="12" r="3"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2 2M15.7 15.7l2 2M6.3 17.7l2-2M15.7 8.3l2-2"/></>,
  wand:       <><path d="M14 6l4 4-10 10-4-4z"/><path d="M14 6l-2-2-1 3 3-1zM20 8l1-3-3 1z"/></>,
  rocket:     <><path d="M5 19c0-3 1.5-6 5-9l5-5 5 5-5 5c-3 3.5-6 5-9 5z"/><circle cx="14.5" cy="9.5" r="1.5"/><path d="M9 14l-3 1 1 3 3-1"/></>,
  bolt:       <><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></>,
  user:       <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>,
  flag:       <><path d="M5 21V4M5 4l9 1.5L5 14"/><path d="M14 5.5L21 7l-3 4 3 4-8-1.5"/></>,
  heart:      <><path d="M20.8 6.6a5 5 0 00-7-.6L12 7.5l-1.7-1.5a5 5 0 00-7 .6 5 5 0 00.6 7L12 21l8.1-7.4a5 5 0 00.7-7z"/></>,
  list:       <><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></>,
  upload:     <><path d="M12 3v12M7 8l5-5 5 5"/><path d="M4 17v3h16v-3"/></>,
  link:       <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7L11.3 7.3"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7L12.7 16.7"/></>,
  document:   <><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V7l-6-6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></>,
  mail:       <><path d="M4 6l8 5 8-5M4 6v12a2 2 0 002 2h12a2 2 0 002-2V6"/></>,
  target:     <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  code:       <><path d="M10 8l-4 4 4 4M14 8l4 4-4 4"/></>,
  cards:      <><rect x="2" y="8" width="16" height="12" rx="2"/><path d="M6 8V6a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2h-2"/></>,
  message:    <><path d="M21 12a8 8 0 01-4 6.9L12 21v-3H8a8 8 0 110-16h2"/></>,
  grid:       <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
  book:       <><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></>,
  logout:     <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></>,
  arrowLeft:  <><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></>,
  copy:       <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>,
  paperclip:  <><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></>,
  moreHorizontal: <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></>,
  chevRight:  <><path d="M9 6l6 6-6 6"/></>,
  checkCircle: <><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></>,
  trash:      <><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6"/></>,
};

export function Icon({ name, size = 18, color = "currentColor", strokeWidth = 1.6, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
