import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { IntroScene, SceneArt } from "@shared/feature-intros";
import { fonts } from "@/theme";

// The phone's motion-graphics kit for the 60-second feature intros (shared/feature-intros.ts SCENE_ARTS): the
// same scenes as the web kit (src/components/learn/scenes.tsx), drawn with Views and react-native-svg shapes on a
// 360×220 board and moved by two Animated values on the native driver: `t` runs once (0 → 1 over ANIM_MS) to
// build the scene, `loop` repeats for things that keep moving (coins, the bike). With reduced motion `t` starts
// at 1, so each scene is a still frame.

export const LC = {
  navy: "#0E2A38",
  deep: "#0A2230",
  panel: "#143A4C",
  line: "#24546A",
  mint: "#73D8C8",
  mintSoft: "#B5EBE2",
  cream: "#F4F1EA",
  amber: "#F2A93B",
  coral: "#E86A4F",
  teal: "#2E7E78",
  plum: "#A88BCB",
  whatsapp: "#25D366",
} as const;

export const ANIM_MS = 5000;
export const BOARD = { w: 360, h: 220 };
export const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
const DOTS = [LC.mint, LC.amber, LC.coral, LC.plum, LC.mintSoft];

interface SceneState {
  t: Animated.Value;
  loop: Animated.Value;
  paused: boolean;
  still: boolean;
}
const SceneContext = createContext<SceneState | null>(null);
function useScene() {
  const value = useContext(SceneContext);
  if (!value) throw new Error("Scene parts must be inside <SceneBoard>");
  return value;
}

type Kind = "pop" | "rise" | "fade" | "grow" | "growx" | "move";

/** An absolutely placed piece that appears at `at` (0–1 of the build), in one of a few ways. */
function Appear({ at = 0, kind = "pop", x, y, w, h, dx = 0, dy = 0, style, children }: { at?: number; kind?: Kind; x: number; y: number; w?: number; h?: number; dx?: number; dy?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const { t } = useScene();
  const end = Math.min(1, at + (kind === "move" || kind === "grow" || kind === "growx" ? 0.2 : 0.12));
  const easing = kind === "pop" ? Easing.out(Easing.back(1.6)) : Easing.out(Easing.cubic);
  const range = { inputRange: [at, end], extrapolate: "clamp" as const, easing };
  const opacity = kind === "grow" || kind === "growx" || kind === "move" ? 1 : t.interpolate({ ...range, outputRange: [0, 1] });
  const transform =
    kind === "pop"
      ? [{ scale: t.interpolate({ ...range, outputRange: [0.3, 1] }) }]
      : kind === "rise"
        ? [{ translateY: t.interpolate({ ...range, outputRange: [14, 0] }) }]
        : kind === "grow"
          ? [{ scaleY: t.interpolate({ ...range, outputRange: [0.001, 1] }) }]
          : kind === "growx"
            ? [{ scaleX: t.interpolate({ ...range, outputRange: [0.001, 1] }) }]
            : kind === "move"
              ? [{ translateX: t.interpolate({ ...range, outputRange: [dx, 0] }) }, { translateY: t.interpolate({ ...range, outputRange: [dy, 0] }) }]
              : [];
  const origin = kind === "grow" ? "bottom" : kind === "growx" ? "left" : "center";
  return <Animated.View style={[{ position: "absolute", left: x, top: y, width: w, height: h, opacity, transform, transformOrigin: origin }, style]}>{children}</Animated.View>;
}

/** Something that keeps travelling by (dx, dy) and fading out, offset in the loop by `phase`. */
function Mover({ x, y, dx, dy, phase = 0, children }: { x: number; y: number; dx: number; dy: number; phase?: number; children: ReactNode }) {
  const { loop, still } = useScene();
  const p = Animated.modulo(Animated.add(loop, phase), 1);
  const style = still
    ? { opacity: 1, transform: [{ translateX: dx / 2 }, { translateY: dy / 2 }] }
    : {
        opacity: p.interpolate({ inputRange: [0, 0.12, 0.85, 1], outputRange: [0, 1, 1, 0] }),
        transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) }, { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) }],
      };
  return <Animated.View style={[{ position: "absolute", left: x, top: y }, style]}>{children}</Animated.View>;
}

function Box({ w, h, r = 12, bg, border, style, children }: { w: number; h: number; r?: number; bg: string; border?: string; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: bg, borderWidth: border ? 2 : 0, borderColor: border }, style]}>{children}</View>;
}

function L({ children, size = 11, color = LC.cream, weight = "extrabold", mono = false, style }: { children: ReactNode; size?: number; color?: string; weight?: keyof typeof fonts; mono?: boolean; style?: StyleProp<TextStyle> }) {
  return (
    <Text numberOfLines={1} style={[{ fontFamily: mono ? MONO : fonts[weight], fontSize: size, color }, style]}>
      {children}
    </Text>
  );
}

function Chip({ x, y, text, bg = LC.panel, color = LC.cream, at = 0 }: { x: number; y: number; text: string; bg?: string; color?: string; at?: number }) {
  const w = Math.max(40, text.length * 6.6 + 22);
  return (
    <Appear at={at} kind="rise" x={x - w / 2} y={y - 11} w={w} h={22}>
      <Box w={w} h={22} r={11} bg={bg} style={{ alignItems: "center", justifyContent: "center" }}>
        <L color={color}>{text}</L>
      </Box>
    </Appear>
  );
}

function rand(seed: number) {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return value - Math.floor(value);
}

/** Steps 0 → total, one every `stepMs` after `startMs`, stopping while paused (for typing and counting). */
function useTicker(total: number, stepMs: number, startMs: number) {
  const { paused, still } = useScene();
  const [step, setStep] = useState(still ? total : 0);
  useEffect(() => {
    if (paused || still || step >= total) return;
    const timer = setTimeout(() => setStep((current) => Math.min(total, current + 1)), step === 0 ? startMs : stepMs);
    return () => clearTimeout(timer);
  }, [step, total, stepMs, startMs, paused, still]);
  return still ? total : step;
}

function Counter({ value, from = 0, startMs, size, color = LC.cream }: { value: string; from?: number; startMs: number; size: number; color?: string }) {
  const match = value.match(/^(\D*)([\d,.]+)(.*)$/);
  const target = match ? Number(match[2]!.replace(/,/g, "")) : 0;
  const step = useTicker(match ? 18 : 0, 55, startMs);
  const text = match ? `${match[1]}${Math.round(from + ((target - from) * step) / 18).toLocaleString("en-NG")}${match[3]}` : value;
  return <L size={size} color={color}>{text}</L>;
}

function Typed({ text, startMs, size = 12, color = LC.cream }: { text: string; startMs: number; size?: number; color?: string }) {
  const shown = useTicker(text.length, 85, startMs);
  return (
    <L mono size={size} color={color}>
      {text.slice(0, shown)}
      <Text style={{ color: LC.mint }}>▍</Text>
    </L>
  );
}

const at = (seconds: number) => seconds / (ANIM_MS / 1000);

// ─── Scenes ───

function PhoneStore({ scene }: { scene: IntroScene }) {
  const chips = scene.chips ?? [];
  return (
    <>
      <Appear at={0} kind="fade" x={132} y={22}>
        <Box w={96} h={176} r={16} bg={LC.deep} border={LC.line} />
      </Appear>
      <Appear at={at(0.4)} kind="pop" x={140} y={40}>
        <Box w={80} h={26} r={8} bg={scene.label ? LC.mint : LC.teal} style={{ alignItems: "center", justifyContent: "center" }}>
          {scene.label ? <L size={9} color={LC.navy}>{scene.label.slice(0, 16)}</L> : null}
        </Box>
      </Appear>
      {[0, 1, 2, 3].map((i) => (
        <Appear key={i} at={at(0.9 + i * 0.25)} x={140 + (i % 2) * 42} y={74 + Math.floor(i / 2) * 44}>
          <Box w={38} h={38} r={8} bg={LC.panel} style={{ padding: 7 }}>
            <Box w={22} h={14} r={4} bg={DOTS[i]!} />
          </Box>
        </Appear>
      ))}
      <Appear at={at(2.2)} kind="rise" x={140} y={168}>
        <Box w={80} h={14} r={7} bg={LC.amber} />
      </Appear>
      {scene.value ? (
        <Appear at={at(2.6)} x={234} y={140}>
          <Box w={104} h={46} r={14} bg={LC.cream} style={{ paddingHorizontal: 12, justifyContent: "center" }}>
            <L mono size={8} color={LC.teal}>PAID</L>
            <Counter value={scene.value} startMs={2900} size={15} color={LC.navy} />
          </Box>
        </Appear>
      ) : null}
      {chips.map((chip, i) => (
        <Chip key={chip} x={i % 2 ? 290 : 68} y={44 + i * 48} text={chip} bg={/whatsapp/i.test(chip) ? LC.whatsapp : [LC.coral, LC.plum, LC.amber][i % 3]} color={LC.navy} at={at(1.2 + i * 0.4)} />
      ))}
    </>
  );
}

function DotsSort({ scene }: { scene: IntroScene }) {
  const groups = scene.chips?.length ? scene.chips.slice(0, 3) : ["Everyone"];
  const n = groups.length;
  const centers = groups.map((_, i) => ({ x: n === 1 ? 180 : 70 + (220 / (n - 1)) * i, y: 96 }));
  return (
    <>
      {centers.map((center, i) => (
        <Appear key={i} at={at(1.6 + i * 0.2)} x={center.x - (n === 1 ? 72 : 50)} y={center.y - (n === 1 ? 62 : 44)}>
          <Box w={n === 1 ? 144 : 100} h={n === 1 ? 124 : 88} r={70} bg={LC.panel} style={{ borderWidth: 1, borderStyle: "dashed", borderColor: DOTS[n === 1 ? 0 : i] }} />
        </Appear>
      ))}
      {Array.from({ length: 21 }, (_, i) => {
        const group = i % n;
        const k = Math.floor(i / n);
        const ring = n === 1 ? 7 : Math.ceil(21 / n);
        const angle = (k / ring) * Math.PI * 2 + group;
        const radius = n === 1 ? 18 + (i % 3) * 16 : 12 + (k % 2) * 16;
        const fx = centers[group]!.x + Math.cos(angle) * radius;
        const fy = centers[group]!.y + Math.sin(angle) * radius * 0.85;
        return (
          <Appear key={i} kind="move" at={at(0.5 + rand(i + 9) * 1.4)} x={fx - 7} y={fy - 7} dx={20 + rand(i + 1) * 320 - fx} dy={20 + rand(i + 50) * 170 - fy}>
            <Box w={14} h={14} r={7} bg={n === 1 ? DOTS[i % 4]! : DOTS[group]!} />
          </Appear>
        );
      })}
      {groups.map((group, i) => (
        <Chip key={group} x={centers[i]!.x} y={188} text={group} bg={n === 1 ? LC.mint : DOTS[i]} color={LC.navy} at={at(2.6 + i * 0.25)} />
      ))}
    </>
  );
}

function ChatBubbles({ scene }: { scene: IntroScene }) {
  const bubbles = [
    { me: false, w: 120, y: 34 },
    { me: true, w: 96, y: 70 },
    { me: false, w: 84, y: 106 },
  ];
  return (
    <>
      <Appear kind="fade" x={70} y={14}>
        <Box w={220} h={196} r={20} bg={LC.deep} border={LC.line} />
      </Appear>
      {bubbles.map((bubble, i) => (
        <Appear key={i} at={at(0.4 + i * 0.6)} x={bubble.me ? 278 - bubble.w : 82} y={bubble.y}>
          <Box w={bubble.w} h={26} r={12} bg={bubble.me ? LC.teal : LC.panel} style={{ justifyContent: "center", paddingHorizontal: 12 }}>
            <Box w={bubble.w - 30} h={4} r={2} bg="rgba(244,241,234,0.45)" />
          </Box>
        </Appear>
      ))}
      <Appear at={at(3.4)} x={82} y={140}>
        <Box w={196} h={50} r={16} bg={LC.mint} style={{ justifyContent: "center", paddingHorizontal: 14 }}>
          <Typed text={(scene.label ?? "Thank you!").slice(0, 24)} startMs={3800} color={LC.navy} />
        </Box>
      </Appear>
    </>
  );
}

function SendBurst({ scene }: { scene: IntroScene }) {
  const targets = [
    { dx: -110, dy: -50, color: LC.amber, label: "Email" },
    { dx: 110, dy: -50, color: LC.whatsapp, label: "WhatsApp" },
    { dx: 0, dy: 70, color: LC.plum, label: "SMS" },
  ];
  return (
    <>
      <Appear kind="fade" at={at(1)} x={0} y={0}>
        <Svg width={360} height={220}>
          {targets.map((target) => <Path key={target.label} d={`M180 100 L${180 + target.dx} ${100 + target.dy}`} stroke={target.color} strokeWidth={2} opacity={0.6} />)}
        </Svg>
      </Appear>
      <Appear at={at(0.2)} x={146} y={76}>
        <Svg width={68} height={48}>
          <Rect width={68} height={48} rx={10} fill={LC.cream} />
          <Path d="M0 6 L34 30 L68 6" fill="none" stroke={LC.navy} strokeWidth={3} strokeLinejoin="round" />
        </Svg>
      </Appear>
      {targets.map((target, i) => (
        <Appear key={target.label} kind="move" at={at(1.1 + i * 0.25)} x={180 + target.dx - 34} y={100 + target.dy - 14} dx={-target.dx} dy={-target.dy}>
          <Box w={68} h={28} r={14} bg={target.color} style={{ alignItems: "center", justifyContent: "center" }}>
            <L size={10.5} color={LC.navy}>{target.label}</L>
          </Box>
        </Appear>
      ))}
      {[[28, 96], [52, 132], [332, 96], [308, 132], [128, 196], [232, 196]].map(([x, y], i) => (
        <Appear key={i} at={at(2.4 + i * 0.15)} x={x! - 6} y={y! - 6}>
          <Box w={12} h={12} r={6} bg={DOTS[i % 4]!} />
        </Appear>
      ))}
      {scene.label ? <Chip x={180} y={20} text={scene.label} bg={LC.mint} color={LC.navy} at={at(0.6)} /> : null}
    </>
  );
}

function ChartGrow({ scene }: { scene: IntroScene }) {
  const bars = [38, 52, 46, 70, 88, 120];
  return (
    <>
      <View style={{ position: "absolute", left: 50, top: 180, width: 270, height: 2, backgroundColor: LC.line }} />
      {bars.map((height, i) => (
        <Appear key={i} kind="grow" at={at(0.3 + i * 0.18)} x={64 + i * 42} y={180 - height}>
          <Box w={26} h={height} r={6} bg={i === bars.length - 1 ? LC.mint : LC.teal} />
        </Appear>
      ))}
      <Appear kind="fade" at={at(1.6)} x={0} y={0}>
        <Svg width={360} height={220}>
          <Path d="M77 130 L119 118 L161 124 L203 96 L245 78 L287 44" fill="none" stroke={LC.amber} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={287} cy={44} r={6} fill={LC.amber} />
        </Svg>
      </Appear>
      {scene.value ? (
        <Appear kind="rise" at={at(2.4)} x={52} y={22}>
          <Box w={130} h={44} r={14} bg={LC.cream} style={{ justifyContent: "center", paddingHorizontal: 14 }}>
            <Counter value={scene.value} startMs={2600} size={20} color={LC.navy} />
          </Box>
        </Appear>
      ) : null}
    </>
  );
}

function Bank() {
  return (
    <Svg width={84} height={86}>
      <Path d="M0 22 L42 0 L84 22 Z" fill={LC.mint} />
      {[0, 1, 2, 3].map((i) => <Rect key={i} x={8 + i * 20} y={28} width={8} height={44} rx={2} fill={LC.mint} />)}
      <Rect x={0} y={76} width={84} height={10} rx={3} fill={LC.mint} />
    </Svg>
  );
}

function MoneyFlow({ scene }: { scene: IntroScene }) {
  return (
    <>
      <Appear at={at(0.2)} x={34} y={60}>
        <Box w={92} h={92} r={18} bg={LC.panel} style={{ alignItems: "center", justifyContent: "center" }}>
          <Box w={44} h={44} r={22} bg={LC.amber} style={{ alignItems: "center", justifyContent: "center" }}>
            <L size={20} color={LC.navy}>₦</L>
          </Box>
        </Box>
      </Appear>
      {[0, 0.25, 0.5, 0.75].map((phase) => (
        <Mover key={phase} x={124} y={98} dx={116} dy={0} phase={phase}>
          <Box w={16} h={16} r={8} bg={LC.amber} border={LC.navy} />
        </Mover>
      ))}
      <Appear at={at(0.8)} x={250} y={60}>
        <Bank />
      </Appear>
      {scene.value ? (
        <Appear kind="rise" at={at(2.2)} x={222} y={158} w={140} style={{ alignItems: "center" }}>
          <Counter value={scene.value} startMs={2400} size={17} />
        </Appear>
      ) : null}
      {scene.label ? (
        <Appear kind="fade" at={at(2.6)} x={212} y={186} w={160} style={{ alignItems: "center" }}>
          <L mono size={10} color={LC.mintSoft}>{scene.label}</L>
        </Appear>
      ) : null}
    </>
  );
}

function StoreCard({ scene }: { scene: IntroScene }) {
  return (
    <>
      <Appear kind="rise" at={at(0.2)} x={40} y={18}>
        <Box w={280} h={186} r={18} bg={LC.cream} style={{ overflow: "hidden" }}>
          <View style={{ height: 30, backgroundColor: LC.mintSoft, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
            <Box w={16} h={16} r={8} bg={LC.teal} />
            <L size={11.5} color={LC.navy}>{(scene.label ?? "Your shop").slice(0, 28)}</L>
          </View>
        </Box>
      </Appear>
      <Appear kind="growx" at={at(0.6)} x={56} y={58}>
        <Box w={248} h={40} r={10} bg={LC.teal} style={{ justifyContent: "center", paddingHorizontal: 14 }}>
          <L size={12}>New in · Shop now</L>
        </Box>
      </Appear>
      {[0, 1, 2].map((i) => (
        <Appear key={i} at={at(1.2 + i * 0.3)} x={56 + i * 84} y={108}>
          <Box w={76} h={80} r={10} bg="#FFFFFF" style={{ padding: 8, gap: 6 }}>
            <Box w={60} h={36} r={6} bg={[LC.amber, LC.coral, LC.plum][i]!} />
            <L size={10} color={LC.navy}>₦{[15, 9, 22][i]},000</L>
          </Box>
        </Appear>
      ))}
    </>
  );
}

function ProductStock({ scene }: { scene: IntroScene }) {
  const chips = scene.chips ?? [];
  const target = Number((scene.value ?? "12").replace(/\D/g, "")) || 12;
  return (
    <>
      <Appear kind="rise" at={at(0.2)} x={60} y={20}>
        <Box w={150} h={184} r={18} bg={LC.cream} style={{ padding: 14, gap: 10 }}>
          <Box w={122} h={84} r={12} bg={LC.mintSoft} style={{ alignItems: "center", justifyContent: "center" }}>
            <Svg width={64} height={50}>
              <Path d="M16 2 c0 -16 30 -16 30 0" transform="translate(0 16)" fill="none" stroke={LC.navy} strokeWidth={3} />
              <Path d="M6 18 h50 l6 30 h-62 Z" fill={LC.teal} />
            </Svg>
          </Box>
          <L size={12} color={LC.navy}>{(scene.label ?? "Product").slice(0, 18)}</L>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {chips.map((chip, i) => (
              <Box key={chip} w={32} h={22} r={11} bg={i === 1 ? LC.navy : "#FFFFFF"} style={{ alignItems: "center", justifyContent: "center" }}>
                <L size={10} color={i === 1 ? LC.cream : LC.navy}>{chip}</L>
              </Box>
            ))}
          </View>
        </Box>
      </Appear>
      <Appear at={at(1.4)} x={226} y={50}>
        <Box w={100} h={80} r={16} bg={LC.panel} border={LC.line} style={{ alignItems: "center", justifyContent: "center" }}>
          <L mono size={9} color={LC.mintSoft}>IN STOCK</L>
          <Counter value={String(target)} from={target + 9} startMs={1800} size={32} color={target <= 3 ? LC.amber : LC.cream} />
        </Box>
      </Appear>
      <Chip x={276} y={156} text={target <= 5 ? "Low stock" : "Updated"} bg={target <= 5 ? LC.amber : LC.mint} color={LC.navy} at={at(3)} />
    </>
  );
}

const ROUTE: [number, number][] = [[60, 170], [96, 160], [118, 110], [150, 86], [180, 90], [220, 84], [260, 56], [300, 50]];

function BikeRoute({ scene }: { scene: IntroScene }) {
  const { loop, still } = useScene();
  const input = ROUTE.map((_, i) => (i / (ROUTE.length - 1)) * 0.8);
  const bike = still
    ? { transform: [{ translateX: ROUTE[0]![0] - 14 }, { translateY: ROUTE[0]![1] - 16 }] }
    : {
        transform: [
          { translateX: loop.interpolate({ inputRange: [...input, 1], outputRange: [...ROUTE.map(([x]) => x - 14), ROUTE.at(-1)![0] - 14] }) },
          { translateY: loop.interpolate({ inputRange: [...input, 1], outputRange: [...ROUTE.map(([, y]) => y - 16), ROUTE.at(-1)![1] - 16] }) },
        ],
      };
  return (
    <>
      <Svg width={360} height={220} style={{ position: "absolute" }}>
        {[50, 100, 150].map((y) => <Path key={y} d={`M20 ${y} H340`} stroke={LC.panel} strokeWidth={10} strokeLinecap="round" />)}
        {[90, 180, 270].map((x) => <Path key={x} d={`M${x} 20 V200`} stroke={LC.panel} strokeWidth={10} strokeLinecap="round" />)}
      </Svg>
      <Appear kind="fade" at={at(0.4)} x={0} y={0}>
        <Svg width={360} height={220}>
          <Path d={`M${ROUTE.map(([x, y]) => `${x} ${y}`).join(" L")}`} fill="none" stroke={LC.mint} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={60} cy={170} r={10} fill={LC.amber} />
          <Circle cx={300} cy={44} r={10} fill={LC.coral} />
        </Svg>
      </Appear>
      <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, bike]}>
        <Svg width={30} height={30}>
          <Circle cx={6} cy={22} r={5} fill="none" stroke={LC.cream} strokeWidth={2.5} />
          <Circle cx={24} cy={22} r={5} fill="none" stroke={LC.cream} strokeWidth={2.5} />
          <Path d="M6 22 L13 12 L22 12 L24 22 M13 12 L11 6" fill="none" stroke={LC.cream} strokeWidth={2.5} strokeLinecap="round" />
          <Rect x={14} y={2} width={12} height={9} rx={2} fill={LC.amber} />
        </Svg>
      </Animated.View>
      {scene.label ? <Chip x={180} y={196} text={scene.label} bg={LC.cream} color={LC.navy} at={at(0.8)} /> : null}
    </>
  );
}

function DomainType({ scene }: { scene: IntroScene }) {
  const domain = scene.label ?? "yourshop.com";
  const done = 1.2 + (domain.length * 85) / 1000;
  return (
    <>
      <Appear kind="rise" at={at(0.1)} x={30} y={22}>
        <Box w={300} h={180} r={16} bg={LC.cream} style={{ overflow: "hidden" }}>
          <View style={{ height: 44, backgroundColor: LC.panel, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 6 }}>
            {[LC.coral, LC.amber, LC.mint].map((color) => <Box key={color} w={8} h={8} r={4} bg={color} />)}
            <View style={{ flex: 1, height: 30, borderRadius: 15, backgroundColor: LC.deep, marginLeft: 8, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 6 }}>
              <Box w={12} h={10} r={2.5} bg={LC.mint} />
              <Typed text={domain} startMs={1200} size={12} />
            </View>
          </View>
        </Box>
      </Appear>
      <Appear kind="fade" at={at(done + 0.3)} x={50} y={82}>
        <Box w={260} h={40} r={10} bg={LC.teal} />
        <View style={{ flexDirection: "row", gap: 9, marginTop: 10 }}>
          {[LC.mintSoft, "#E8E2D5", LC.mintSoft, "#E8E2D5"].map((color, i) => <Box key={i} w={58} h={52} r={8} bg={color} />)}
        </View>
      </Appear>
      <Chip x={268} y={102} text="Secure ✓" bg={LC.mint} color={LC.navy} at={at(done + 0.8)} />
    </>
  );
}

function House({ fill, door }: { fill: string; door: string }) {
  return (
    <Svg width={80} height={90}>
      <Path d="M0 30 L40 0 L80 30 V90 H0 Z" fill={fill} />
      <Rect x={30} y={52} width={20} height={38} rx={3} fill={door} />
    </Svg>
  );
}

function SupplierShip({ scene }: { scene: IntroScene }) {
  return (
    <>
      <Appear at={at(0.2)} x={30} y={74} w={100} style={{ alignItems: "center", gap: 8 }}>
        <Svg width={100} height={100}>
          <Path d="M0 30 L50 0 L100 30 V100 H0 Z" fill={LC.panel} stroke={LC.line} strokeWidth={2} />
          <Rect x={30} y={54} width={40} height={46} rx={4} fill={LC.deep} />
        </Svg>
        <L mono size={10} color={LC.mintSoft}>SUPPLIER</L>
      </Appear>
      <Appear kind="growx" at={at(0.6)} x={136} y={150}>
        <Box w={100} h={3} r={2} bg={LC.mint} />
      </Appear>
      <Mover x={140} y={128} dx={86} dy={0}>
        <Box w={26} h={22} r={3} bg={LC.amber} />
      </Mover>
      <Appear at={at(1)} x={250} y={82} w={80} style={{ alignItems: "center", gap: 8 }}>
        <House fill={LC.cream} door={LC.teal} />
        <L mono size={10} color={LC.mintSoft}>CUSTOMER</L>
      </Appear>
      <Appear at={at(3)} x={306} y={74}>
        <Box w={24} h={24} r={12} bg={LC.mint} style={{ alignItems: "center", justifyContent: "center" }}>
          <L size={12} color={LC.navy}>✓</L>
        </Box>
      </Appear>
      {scene.label ? <Chip x={180} y={40} text={scene.label} bg={LC.cream} color={LC.navy} at={at(0.5)} /> : null}
    </>
  );
}

function FlowNodes({ scene }: { scene: IntroScene }) {
  const steps = (scene.chips?.length ? scene.chips : ["When", "Wait", "Send"]).slice(0, 3);
  const x = (i: number) => 28 + i * 112;
  return (
    <>
      {steps.slice(1).map((_, i) => (
        <Appear key={i} kind="growx" at={at(0.8 + i * 1.3)} x={x(i) + 96} y={109}>
          <Box w={16} h={3} r={1.5} bg={LC.mint} />
        </Appear>
      ))}
      {steps.map((step, i) => (
        <View key={step}>
          <Appear kind="rise" at={at(0.1 + i * 0.15)} x={x(i)} y={84}>
            <Box w={96} h={52} r={14} bg={LC.panel} border={LC.line} />
          </Appear>
          <Appear kind="fade" at={at(0.5 + i * 1.3)} x={x(i)} y={84}>
            <Box w={96} h={52} r={14} bg={i === steps.length - 1 ? LC.mint : LC.teal} border={LC.mint} style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
              <L size={11} color={i === steps.length - 1 ? LC.navy : LC.cream}>{step}</L>
            </Box>
          </Appear>
          <Appear at={at(0.7 + i * 1.3)} x={x(i) + 37} y={52}>
            <Box w={22} h={22} r={11} bg={LC.amber} style={{ alignItems: "center", justifyContent: "center" }}>
              <L size={10.5} color={LC.navy}>{i + 1}</L>
            </Box>
          </Appear>
        </View>
      ))}
      <Appear kind="fade" at={at(4)} x={0} y={168} w={360} style={{ alignItems: "center" }}>
        <L mono size={10.5} color={LC.mintSoft}>RUNS BY ITSELF · 24/7</L>
      </Appear>
    </>
  );
}

function CartRemind({ scene }: { scene: IntroScene }) {
  const paid = /paid/i.test(scene.label ?? "");
  return (
    <>
      <Appear at={at(0.2)} x={56} y={64}>
        <Svg width={124} height={102}>
          <Path d="M4 6 H26 L40 76 H104 L116 26 H32" fill="none" stroke={LC.cream} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={48} cy={92} r={7} fill={LC.cream} />
          <Circle cx={96} cy={92} r={7} fill={LC.cream} />
          <Rect x={48} y={32} width={22} height={28} rx={4} fill={LC.amber} />
          <Rect x={76} y={36} width={22} height={24} rx={4} fill={LC.coral} />
        </Svg>
      </Appear>
      {scene.label ? <Chip x={116} y={190} text={scene.label} bg={paid ? LC.mint : LC.panel} color={paid ? LC.navy : LC.cream} at={at(1)} /> : null}
      <Appear kind="fade" at={at(1.4)} x={202} y={40}>
        <Svg width={48} height={48}>
          <Circle cx={24} cy={24} r={21} fill="none" stroke={LC.line} strokeWidth={3} />
          <Path d="M24 10 V24 L34 30" fill="none" stroke={LC.cream} strokeWidth={3} strokeLinecap="round" />
        </Svg>
      </Appear>
      <Appear at={at(2.6)} x={196} y={104}>
        <Box w={142} h={44} r={14} bg={LC.cream} style={{ justifyContent: "center", paddingLeft: 40 }}>
          <View style={{ position: "absolute", left: 14, top: 13, width: 16, height: 18, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: LC.amber }} />
          <L size={10.5} color={LC.navy}>Still want it?</L>
          <L size={9.5} color={LC.teal} weight="bold">Tap to finish</L>
        </Box>
      </Appear>
      <Appear at={at(4)} x={284} y={162}>
        <Box w={32} h={32} r={16} bg={LC.mint} style={{ alignItems: "center", justifyContent: "center" }}>
          <L size={16} color={LC.navy}>✓</L>
        </Box>
      </Appear>
    </>
  );
}

function AdFunnel({ scene }: { scene: IntroScene }) {
  const tiers = scene.chips?.length ? scene.chips.slice(0, 3) : ["Saw it", "Tapped", "Bought"];
  const numbers = ["1,000", "30", "6"];
  return (
    <>
      {tiers.map((tier, i) => {
        const width = 200 - i * 56;
        return (
          <Appear key={tier} kind="pop" at={at(0.3 + i * 0.6)} x={130 - width / 2} y={40 + i * 54}>
            <Box w={width} h={42} r={12} bg={[LC.teal, LC.mint, LC.amber][i]!} style={{ alignItems: "center", justifyContent: "center" }}>
              <L size={10.5} color={LC.navy}>{tier}</L>
              <L mono size={11} color={LC.navy}>{numbers[i]}</L>
            </Box>
          </Appear>
        );
      })}
      {scene.value ? (
        <Appear at={at(2.4)} x={250} y={74}>
          <Box w={88} h={72} r={18} bg={LC.cream} style={{ alignItems: "center", justifyContent: "center" }}>
            <Counter value={scene.value} startMs={2600} size={24} color={LC.navy} />
          </Box>
        </Appear>
      ) : null}
    </>
  );
}

function Person({ color }: { color: string }) {
  return (
    <Svg width={40} height={40}>
      <Circle cx={20} cy={20} r={20} fill={color} />
      <Circle cx={20} cy={15} r={6} fill={LC.navy} />
      <Path d="M10 32 a10 9 0 0 1 20 0" fill={LC.navy} />
    </Svg>
  );
}

function LinkShare({ scene }: { scene: IntroScene }) {
  const friends = [{ x: 60, y: 46 }, { x: 300, y: 46 }, { x: 60, y: 176 }, { x: 300, y: 176 }];
  return (
    <>
      <Appear kind="fade" at={at(0.8)} x={0} y={0}>
        <Svg width={360} height={220}>
          {friends.map((friend, i) => <Path key={i} d={`M180 110 L${friend.x} ${friend.y}`} stroke={LC.line} strokeWidth={2} />)}
        </Svg>
      </Appear>
      {friends.map((friend, i) => (
        <View key={i}>
          <Appear at={at(1 + i * 0.2)} x={friend.x - 20} y={friend.y - 20}>
            <Person color={DOTS[i]!} />
          </Appear>
          <Mover x={friend.x - 6} y={friend.y - 6} dx={180 - friend.x} dy={110 - friend.y} phase={i * 0.25}>
            <Box w={12} h={12} r={6} bg={LC.amber} />
          </Mover>
        </View>
      ))}
      <Appear at={at(0.2)} x={100} y={92}>
        <Box w={160} h={36} r={18} bg={LC.cream} style={{ justifyContent: "center", paddingHorizontal: 14 }}>
          <L mono size={10} color={LC.navy}>🔗 {(scene.label ?? "shop.ng/?ref=you").slice(0, 18)}</L>
        </Box>
      </Appear>
    </>
  );
}

function QuoteTags({ scene }: { scene: IntroScene }) {
  const prices = scene.chips?.length ? scene.chips.slice(0, 3) : ["₦1,100", "₦950", "₦900"];
  return (
    <>
      {[{ x: 26, label: "SHOP", color: LC.mint }, { x: 274, label: "SUPPLIER", color: LC.amber }].map((side, i) => (
        <Appear key={side.label} at={at(0.1 + i * 0.2)} x={side.x} y={70} w={60} style={{ alignItems: "center", gap: 10 }}>
          <Box w={60} h={60} r={30} bg={LC.panel} border={LC.line} style={{ alignItems: "center", justifyContent: "center" }}>
            <Box w={26} h={22} r={4} bg={side.color} />
          </Box>
          <L mono size={10} color={LC.mintSoft}>{side.label}</L>
        </Appear>
      ))}
      {prices.map((price, i) => {
        const fromRight = i % 2 === 0;
        const last = i === prices.length - 1;
        return (
          <Appear key={price} kind="move" at={at(0.9 + i * 1.1)} x={140} y={40 + i * 42} dx={fromRight ? 90 : -90} dy={0}>
            <Box w={80} h={28} r={6} bg={last ? LC.mint : LC.cream} style={{ alignItems: "center", justifyContent: "center" }}>
              <L size={11.5} color={LC.navy}>{price}</L>
            </Box>
          </Appear>
        );
      })}
      <Chip x={180} y={198} text="Deal ✓" bg={LC.mint} color={LC.navy} at={at(0.9 + prices.length * 1.1)} />
    </>
  );
}

function CashCollect({ scene }: { scene: IntroScene }) {
  return (
    <>
      <Appear at={at(0.1)} x={24} y={80}>
        <House fill={LC.cream} door={LC.teal} />
      </Appear>
      <Appear at={at(0.3)} x={108} y={108}>
        <Box w={24} h={24} r={12} bg={LC.amber} />
        <Box w={20} h={34} r={8} bg={LC.amber} style={{ marginTop: 2, marginLeft: 2 }} />
      </Appear>
      <Appear at={at(0.5)} x={184} y={104}>
        <Box w={24} h={24} r={12} bg={LC.mint} />
        <Box w={20} h={36} r={8} bg={LC.mint} style={{ marginTop: 2, marginLeft: 2 }} />
      </Appear>
      {[0, 0.33, 0.66].map((phase) => (
        <Mover key={phase} x={124} y={128} dx={56} dy={-6} phase={phase}>
          <Box w={24} h={14} r={2} bg={LC.whatsapp} border={LC.navy} />
        </Mover>
      ))}
      <Appear at={at(2.6)} x={270} y={92}>
        <Svg width={60} height={76}>
          <Path d="M30 2 L58 14 V38 C58 58 44 70 30 74 C16 70 2 58 2 38 V14 Z" fill={LC.panel} stroke={LC.mint} strokeWidth={2.5} />
          <Rect x={20} y={32} width={20} height={16} rx={3} fill={LC.mint} />
          <Path d="M24 32 v-5 a6 6 0 0 1 12 0 v5" fill="none" stroke={LC.mint} strokeWidth={2.5} />
        </Svg>
      </Appear>
      {scene.value ? (
        <Appear kind="rise" at={at(1.4)} x={80} y={30} w={160} style={{ alignItems: "center" }}>
          <Counter value={scene.value} startMs={1600} size={22} />
          <L mono size={9.5} color={LC.mintSoft}>CASH AT THE DOOR</L>
        </Appear>
      ) : null}
      {scene.label ? <Chip x={252} y={196} text={scene.label} bg={LC.cream} color={LC.navy} at={at(3)} /> : null}
    </>
  );
}

const THEMES = [
  { bg: LC.cream, top: LC.teal, card: LC.amber, ink: LC.navy },
  { bg: "#1B1B22", top: LC.coral, card: LC.plum, ink: LC.cream },
  { bg: LC.mintSoft, top: LC.navy, card: LC.coral, ink: LC.navy },
];

function ThemeSwap({ scene }: { scene: IntroScene }) {
  const { loop, still } = useScene();
  const chips = scene.chips?.length ? scene.chips.slice(0, 3) : ["Market", "Boutique", "Bold"];
  const count = Math.max(2, chips.length);
  return (
    <>
      {THEMES.slice(0, count).map((theme, i) => {
        const start = i / count;
        const opacity = i === 0 || still ? (i === 0 ? 1 : 0) : loop.interpolate({ inputRange: [0, Math.max(0.001, start - 0.04), start, start + 1 / count - 0.04, Math.min(1, start + 1 / count), 1], outputRange: [0, 0, 1, 1, 0, 0] });
        return (
          <Animated.View key={i} style={{ position: "absolute", left: 70, top: 16, opacity }}>
            <Box w={220} h={150} r={16} bg={theme.bg} style={{ overflow: "hidden" }}>
              <View style={{ height: 36, backgroundColor: theme.top }} />
              <View style={{ padding: 16, gap: 6 }}>
                <Box w={110} h={10} r={5} bg={theme.ink} />
                <Box w={70} h={7} r={3.5} bg={theme.ink} style={{ opacity: 0.4 }} />
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  {[0, 1, 2].map((k) => <Box key={k} w={58} h={54} r={10} bg={theme.card} style={{ opacity: 0.9 - k * 0.15 }} />)}
                </View>
              </View>
            </Box>
          </Animated.View>
        );
      })}
      {chips.map((chip, i) => (
        <Chip key={chip} x={110 + i * (chips.length === 2 ? 140 : 70)} y={192} text={chip} bg={[LC.teal, LC.coral, LC.mint][i]} color={i === 0 ? LC.cream : LC.navy} at={at(0.4 + i * 0.2)} />
      ))}
    </>
  );
}

// ─── Scenes for orders, money, customers, brand and partners ───

/** Keeps gently pulsing (or swinging) on the loop; still frames rest at the middle. */
function Pulse({ x, y, w, h, swing = false, children }: { x: number; y: number; w: number; h: number; swing?: boolean; children: ReactNode }) {
  const { loop, still } = useScene();
  const transform = still
    ? []
    : swing
      ? [{ rotate: loop.interpolate({ inputRange: [0, 0.08, 0.18, 0.28, 0.38, 0.55, 1], outputRange: ["0deg", "14deg", "-11deg", "7deg", "-4deg", "0deg", "0deg"] }) }]
      : [{ scale: loop.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 1.1, 1, 1.1, 1] }) }];
  return <Animated.View style={{ position: "absolute", left: x, top: y, width: w, height: h, transform, transformOrigin: swing ? "top" : "center" }}>{children}</Animated.View>;
}

function Tick({ size = 20, color = LC.navy }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d="M4 10 l4 4 l8 -9" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function starPoints(cx: number, cy: number, r: number) {
  return `M${Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    return `${(cx + Math.cos(angle) * radius).toFixed(1)} ${(cy + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" L")} Z`;
}

function Star({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size}>
      <Path d={starPoints(size / 2, size / 2 + size * 0.04, size / 2)} fill={color} />
    </Svg>
  );
}

const chipW = (text: string) => Math.max(40, text.length * 6.6 + 22);

function chipColor(text: string, i: number) {
  if (/whatsapp/i.test(text)) return LC.whatsapp;
  if (/insta|reels/i.test(text)) return LC.plum;
  if (/live/i.test(text)) return LC.mint;
  if (/form/i.test(text)) return LC.amber;
  if (/tiktok/i.test(text)) return LC.coral;
  return DOTS[i % DOTS.length]!;
}

const STATUSES = ["New", "Paid", "Packed", "On the way", "Delivered"];

function OrderPipeline({ scene }: { scene: IntroScene }) {
  const steps = (scene.chips?.length ? scene.chips : STATUSES).slice(0, 5);
  const n = steps.length;
  const x = (i: number) => (n === 1 ? 180 : 44 + (272 / (n - 1)) * i);
  const y = 122;
  const gap = 0.7;
  return (
    <>
      <View style={{ position: "absolute", left: x(0), top: y - 4, width: Math.max(1, x(n - 1) - x(0)), height: 8, borderRadius: 4, backgroundColor: LC.panel }} />
      <Appear kind="growx" at={at(0.6)} x={x(0)} y={y - 2}>
        <Box w={Math.max(1, x(n - 1) - x(0))} h={4} r={2} bg={LC.mint} />
      </Appear>
      {steps.map((step, i) => {
        const last = i === n - 1;
        return (
          <View key={`${step}-${i}`}>
            <View style={{ position: "absolute", left: x(i) - 15, top: y - 15, width: 30, height: 30, borderRadius: 15, backgroundColor: LC.panel, borderWidth: 2, borderColor: LC.line }} />
            <Appear at={at(0.6 + i * gap)} x={x(i) - 15} y={y - 15}>
              <Box w={30} h={30} r={15} bg={last ? LC.mint : LC.teal} border={LC.mint} style={{ alignItems: "center", justifyContent: "center" }}>
                <Tick size={18} color={last ? LC.navy : LC.cream} />
              </Box>
            </Appear>
            <View style={{ position: "absolute", left: x(i) - 36, top: y + 24, width: 72, alignItems: "center", opacity: 0.45 }}>
              <L size={10} color={LC.mintSoft}>{step}</L>
            </View>
            <Appear kind="fade" at={at(0.6 + i * gap)} x={x(i) - 36} y={y + 24} w={72} style={{ alignItems: "center" }}>
              <L size={10} color={last ? LC.mint : LC.cream}>{step}</L>
            </Appear>
          </View>
        );
      })}
      <Appear kind="move" at={at(0.6)} x={x(n - 1) - 14} y={y - 58} dx={x(0) - x(n - 1)} dy={0}>
        <Box w={28} h={24} r={4} bg={LC.amber} style={{ alignItems: "center" }}>
          <View style={{ width: 28, height: 2, backgroundColor: LC.navy, marginTop: 7 }} />
        </Box>
      </Appear>
      {scene.label ? <Chip x={180} y={28} text={scene.label} bg={LC.cream} color={LC.navy} at={at(0.2)} /> : null}
    </>
  );
}

function Receipt({ scene }: { scene: IntroScene }) {
  const lines = (scene.chips ?? []).slice(0, 3);
  const rows = Math.max(2, lines.length);
  const w = 136;
  const h = 188;
  const teeth = 10;
  const zig = Array.from({ length: teeth + 1 }, (_, i) => `L${(w - (i * w) / teeth).toFixed(1)} ${i % 2 ? h - 6 : h}`).join(" ");
  const rule = 70 + rows * 20;
  return (
    <>
      <View style={{ position: "absolute", left: 100, top: 10, width: 160, height: 10, borderRadius: 5, backgroundColor: LC.line }} />
      <Appear kind="rise" at={at(0.1)} x={112} y={18}>
        <Svg width={w} height={h}>
          <Path d={`M0 0 H${w} V${h} ${zig} Z`} fill={LC.cream} />
          <Circle cx={w / 2} cy={22} r={10} fill={LC.teal} />
          <Path d={`M10 58 H${w - 10}`} stroke={LC.navy} strokeOpacity={0.3} strokeDasharray="3 4" />
          <Path d={`M10 ${rule} H${w - 10}`} stroke={LC.navy} strokeOpacity={0.3} strokeDasharray="3 4" />
        </Svg>
      </Appear>
      <Appear kind="fade" at={at(0.3)} x={112} y={56} w={w} style={{ alignItems: "center" }}>
        <L size={10.5} color={LC.navy}>{(scene.label ?? "Receipt").slice(0, 20)}</L>
      </Appear>
      {Array.from({ length: rows }, (_, i) => (
        <Appear key={i} kind="rise" at={at(0.7 + i * 0.4)} x={124} y={86 + i * 20}>
          {lines[i] ? <L mono size={9.5} color={LC.navy}>{lines[i]!.slice(0, 21)}</L> : <Box w={70} h={5} r={2.5} bg="#C9C6D3" />}
        </Appear>
      ))}
      {scene.value ? (
        <Appear kind="rise" at={at(1 + rows * 0.4)} x={124} y={18 + rule + 8} w={w - 24} style={{ alignItems: "flex-end" }}>
          <Counter value={scene.value} startMs={1200 + rows * 400} size={16} color={LC.navy} />
        </Appear>
      ) : null}
      <Appear at={at(Math.min(4.2, 2.4 + rows * 0.2))} x={146} y={158}>
        <Box w={80} h={28} r={6} bg="rgba(46,126,120,0.08)" border={LC.teal} style={{ alignItems: "center", justifyContent: "center", borderWidth: 2.5, transform: [{ rotate: "-12deg" }] }}>
          <L mono size={13} color={LC.teal}>PAID</L>
        </Box>
      </Appear>
      <Appear at={at(1)} x={34} y={70}>
        <Box w={48} h={28} r={4} bg={LC.whatsapp} />
      </Appear>
      <Appear at={at(1.3)} x={34} y={122}>
        <Box w={48} h={32} r={6} bg={LC.plum} style={{ paddingTop: 8 }}>
          <View style={{ height: 6, backgroundColor: "rgba(14,42,56,0.5)" }} />
        </Box>
      </Appear>
      <Appear at={at(2)} x={284} y={56}>
        <Box w={32} h={32} r={16} bg={LC.mint} style={{ alignItems: "center", justifyContent: "center" }}>
          <Tick size={20} />
        </Box>
      </Appear>
      {[0, 1, 2].map((i) => (
        <Appear key={i} at={at(2.4 + i * 0.15)} x={283 + i * 10} y={141 - i * 8}>
          <Box w={18} h={18} r={9} bg={LC.amber} border={LC.navy} />
        </Appear>
      ))}
    </>
  );
}

function InvoicePaper({ scene }: { scene: IntroScene }) {
  const chips = scene.chips ?? [];
  const stamp = chips.find((chip) => /✓|paid/i.test(chip));
  const pills = chips.filter((chip) => chip !== stamp).slice(0, 2);
  const rows = scene.value ? 4 : 6;
  return (
    <>
      <Appear kind="rise" at={at(0.1)} x={92} y={12}>
        <View>
          <Box w={168} h={196} r={10} bg={LC.panel} style={{ position: "absolute", left: 6, top: 6 }} />
          <Box w={168} h={196} r={10} bg={LC.cream} style={{ overflow: "hidden" }}>
            <View style={{ height: 6, backgroundColor: LC.teal }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, marginTop: 12 }}>
              <Box w={20} h={20} r={10} bg={LC.teal} />
              <L mono size={10.5} color={LC.navy}>{(scene.label ?? "INVOICE").slice(0, 16)}</L>
            </View>
            <View style={{ height: 2, backgroundColor: "#E8E2D5", marginHorizontal: 16, marginTop: 12 }} />
          </Box>
        </View>
      </Appear>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i}>
          <Appear kind="growx" at={at(0.5 + i * 0.2)} x={108} y={76 + i * 16}>
            <Box w={[86, 64, 78, 52, 90, 70][i]!} h={6} r={3} bg="#D9D3C4" />
          </Appear>
          {scene.value ? (
            <Appear kind="fade" at={at(0.7 + i * 0.2)} x={208} y={76 + i * 16}>
              <Box w={36} h={6} r={3} bg="#C9C6D3" />
            </Appear>
          ) : null}
        </View>
      ))}
      {scene.value ? (
        <Appear kind="rise" at={at(1.6)} x={108} y={152} w={136}>
          <View style={{ height: 2, backgroundColor: "rgba(14,42,56,0.2)" }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <Box w={30} h={7} r={3.5} bg={LC.teal} />
            <Counter value={scene.value} startMs={1800} size={16} color={LC.navy} />
          </View>
        </Appear>
      ) : null}
      {pills.map((pill, i) => <Chip key={pill} x={Math.max(268 + chipW(pill) / 2, 312)} y={64 + i * 32} text={pill} bg={LC.amber} color={LC.navy} at={at(1.4 + i * 0.3)} />)}
      {stamp ? (
        <Appear at={at(2.6)} x={122} y={102}>
          <Box w={108} h={36} r={8} bg="rgba(46,126,120,0.1)" border={LC.teal} style={{ alignItems: "center", justifyContent: "center", borderWidth: 3, transform: [{ rotate: "-12deg" }] }}>
            <L mono size={14} color={LC.teal}>{stamp.toUpperCase().slice(0, 10)}</L>
          </Box>
        </Appear>
      ) : null}
      <Appear at={at(1)} x={34} y={94}>
        <Svg width={42} height={40}>
          <Path d="M0 18 L40 0 L28 38 L20 24 Z" fill={LC.mint} />
          <Path d="M20 24 L40 0" stroke={LC.navy} strokeWidth={1.5} />
        </Svg>
      </Appear>
    </>
  );
}

function StarReviews({ scene }: { scene: IntroScene }) {
  const value = scene.value ?? "4.8";
  const full = Math.round(Math.min(5, Math.max(0, Number.parseFloat(value) || 5)));
  return (
    <>
      <Appear at={at(0.1)} x={20} y={38}>
        <Box w={124} h={144} r={20} bg={LC.panel} border={LC.line} style={{ alignItems: "center", paddingTop: 26 }}>
          <L size={38} color={LC.cream}>{value}</L>
        </Box>
      </Appear>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i}>
          <View style={{ position: "absolute", left: 33 + i * 20, top: 119 }}>
            <Star size={18} color={LC.line} />
          </View>
          {i < full ? (
            <Appear at={at(0.6 + i * 0.18)} x={33 + i * 20} y={119}>
              <Star size={18} color={LC.amber} />
            </Appear>
          ) : null}
        </View>
      ))}
      <Appear kind="growx" at={at(1.6)} x={42} y={152}>
        <Box w={80} h={6} r={3} bg={LC.line} />
      </Appear>
      {[0, 1, 2].map((i) => (
        <Appear key={i} kind="move" at={at(1 + i * 0.55)} x={160} y={22 + i * 62} dx={60} dy={0}>
          <Box w={184} h={52} r={14} bg={i === 0 ? LC.cream : LC.panel} style={{ paddingHorizontal: 12, paddingTop: 9, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Box w={18} h={18} r={9} bg={[LC.mint, LC.amber, LC.plum][i]!} />
              {[0, 1, 2, 3, 4].map((k) => <Star key={k} size={11} color={i === 2 && k === 4 ? LC.line : LC.amber} />)}
            </View>
            {i === 0 && scene.label ? <L size={10.5} color={LC.navy}>“{scene.label.slice(0, 24)}”</L> : <Box w={[120, 96, 110][i]!} h={5} r={2.5} bg={i === 0 ? "#C9C6D3" : LC.line} />}
          </Box>
        </Appear>
      ))}
    </>
  );
}

function CustomerCards({ scene }: { scene: IntroScene }) {
  const name = scene.label ?? "Customer";
  const initials = name.split(/\s+/).map((word) => word[0] ?? "").join("").slice(0, 2).toUpperCase();
  const chips = (scene.chips ?? []).slice(0, 3);
  return (
    <>
      <Appear kind="fade" at={at(0.1)} x={96} y={20}>
        <Box w={190} h={150} r={18} bg={LC.line} />
      </Appear>
      <Appear kind="fade" at={at(0.2)} x={84} y={32}>
        <Box w={190} h={150} r={18} bg={LC.panel} />
      </Appear>
      <Appear kind="rise" at={at(0.3)} x={70} y={46}>
        <Box w={196} h={158} r={18} bg={LC.cream} style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Box w={40} h={40} r={20} bg={LC.mint} style={{ alignItems: "center", justifyContent: "center" }}>
              <L size={13} color={LC.navy}>{initials}</L>
            </Box>
            <View style={{ gap: 6 }}>
              <L size={12.5} color={LC.navy}>{name.slice(0, 17)}</L>
              <Box w={70} h={5} r={2.5} bg="#C9C6D3" />
            </View>
          </View>
        </Box>
      </Appear>
      {chips.map((chip, i) => {
        const left = 86 + chips.slice(0, i).reduce((sum, item) => sum + chipW(item) + 6, 0);
        return <Chip key={chip} x={left + chipW(chip) / 2} y={124} text={chip} bg={[LC.amber, LC.mintSoft, LC.plum][i]} color={LC.navy} at={at(0.9 + i * 0.25)} />;
      })}
      <Appear kind="growx" at={at(1.6)} x={92} y={170}>
        <Box w={156} h={3} r={1.5} bg="#E8E2D5" />
      </Appear>
      {[0, 1, 2, 3].map((i) => (
        <Appear key={i} at={at(1.8 + i * 0.25)} x={92 + i * 46} y={164}>
          <Box w={16} h={16} r={8} bg={i === 3 ? LC.mint : LC.teal} />
        </Appear>
      ))}
      {scene.value ? (
        <Appear at={at(2.4)} x={276} y={56}>
          <Box w={78} h={50} r={16} bg={LC.mint} style={{ alignItems: "center", justifyContent: "center", gap: 2 }}>
            <Star size={14} color={LC.navy} />
            <Counter value={scene.value} startMs={2600} size={12.5} color={LC.navy} />
          </Box>
        </Appear>
      ) : null}
    </>
  );
}

function DiscountTicket({ scene }: { scene: IntroScene }) {
  const code = scene.label ?? "SALE10";
  const value = scene.value ?? "10%";
  return (
    <>
      <Appear at={at(0.1)} x={48} y={58}>
        <Box w={264} h={104} r={14} bg={LC.amber} style={{ flexDirection: "row", alignItems: "center", transform: [{ rotate: "-5deg" }] }}>
          <View style={{ position: "absolute", left: -13, top: 39, width: 26, height: 26, borderRadius: 13, backgroundColor: LC.deep }} />
          <View style={{ position: "absolute", right: -13, top: 39, width: 26, height: 26, borderRadius: 13, backgroundColor: LC.deep }} />
          <View style={{ width: 86, alignItems: "center" }}>
            <Counter value={value} startMs={700} size={value.length > 4 ? 17 : 26} color={LC.navy} />
          </View>
          <View style={{ width: 0, height: 88, borderLeftWidth: 2, borderStyle: "dashed", borderColor: "rgba(14,42,56,0.4)" }} />
          <View style={{ paddingLeft: 16, gap: 8 }}>
            <Typed text={code.slice(0, 14)} startMs={900} size={code.length > 10 ? 13 : 16} color={LC.navy} />
            <Box w={140} h={4} r={2} bg="rgba(14,42,56,0.25)" />
          </View>
        </Box>
      </Appear>
      <Pulse x={280} y={24} w={40} h={40}>
        <Appear at={at(1.6)} x={0} y={0}>
          <Box w={40} h={40} r={20} bg={LC.coral} style={{ alignItems: "center", justifyContent: "center" }}>
            <L size={20} color={LC.cream}>%</L>
          </Box>
        </Appear>
      </Pulse>
      {([[70, 36, LC.mint], [40, 186, LC.plum], [250, 192, LC.mint], [330, 172, LC.amber]] as const).map(([x, y, color], i) => (
        <Appear key={i} at={at(2 + i * 0.2)} x={x - 5} y={y - 5}>
          <Box w={10} h={10} r={5} bg={color} />
        </Appear>
      ))}
    </>
  );
}

function swatchColor(name: string, i: number) {
  if (/mint|green/i.test(name)) return LC.mint;
  if (/gold|amber|yellow/i.test(name)) return LC.amber;
  if (/coral|red|orange/i.test(name)) return LC.coral;
  if (/plum|purple/i.test(name)) return LC.plum;
  if (/navy|blue|dark/i.test(name)) return LC.deep;
  return [LC.mint, LC.amber, LC.coral, LC.deep][i % 4]!;
}

function BrandPalette({ scene }: { scene: IntroScene }) {
  const name = scene.label ?? "Your brand";
  const chips = (scene.chips ?? []).slice(0, 4);
  const swatches = chips.length ? chips.map(swatchColor) : [LC.mint, LC.amber, LC.coral, LC.deep];
  return (
    <>
      <Appear at={at(0.1)} x={40} y={42}>
        <Box w={84} h={84} r={42} bg={LC.mint} style={{ alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "absolute", left: 9, top: 9, width: 66, height: 66, borderRadius: 33, borderWidth: 2.5, borderColor: LC.navy }} />
          <L size={32} color={LC.navy}>{name.trim()[0]?.toUpperCase() ?? "B"}</L>
        </Box>
      </Appear>
      <Appear kind="fade" at={at(0.5)} x={2} y={138} w={160} style={{ alignItems: "center" }}>
        <L size={12}>{name.slice(0, 18)}</L>
      </Appear>
      {swatches.map((color, i) => (
        <Appear key={i} at={at(0.8 + i * 0.2)} x={164 + i * 44} y={30} w={36} style={{ alignItems: "center", gap: 6 }}>
          <Box w={36} h={36} r={10} bg={color} border={color === LC.deep ? "rgba(244,241,234,0.5)" : undefined} />
          {chips[i] ? <L mono size={9} color={LC.mintSoft}>{chips[i]!.slice(0, 7)}</L> : null}
        </Appear>
      ))}
      <Appear at={at(1.7)} x={166} y={106}>
        <L size={32}>Aa</L>
      </Appear>
      <Appear at={at(1.9)} x={214} y={106}>
        <Text style={{ fontSize: 30, color: LC.mint, fontStyle: "italic", fontFamily: Platform.select({ ios: "Georgia", default: "serif" }) }}>Aa</Text>
      </Appear>
      <Appear kind="rise" at={at(2.3)} x={270} y={104}>
        <Box w={44} h={60} r={6} bg={LC.cream} style={{ overflow: "hidden", alignItems: "center" }}>
          <View style={{ height: 16, alignSelf: "stretch", backgroundColor: swatches[0] }} />
          <Box w={16} h={16} r={8} bg={swatches[1] ?? LC.amber} style={{ marginTop: 8 }} />
        </Box>
      </Appear>
      <Appear kind="rise" at={at(2.6)} x={314} y={120}>
        <Svg width={36} height={40}>
          <Path d="M8 0 H36 V40 H8 L0 20 Z" fill={swatches[1] ?? LC.amber} />
          <Circle cx={23} cy={20} r={7} fill={LC.cream} />
        </Svg>
      </Appear>
      <Appear kind="growx" at={at(2.8)} x={166} y={176}>
        <Box w={180} h={6} r={3} bg={swatches[0]!} style={{ opacity: 0.6 }} />
      </Appear>
    </>
  );
}

function ImportShip({ scene }: { scene: IntroScene }) {
  const chips = (scene.chips ?? []).slice(0, 2);
  const containers = [LC.amber, LC.mint, LC.plum, LC.coral, LC.teal, LC.amber, LC.mintSoft, LC.plum];
  return (
    <>
      <Svg width={360} height={220} style={{ position: "absolute" }}>
        {[0, 1, 2].map((row) => (
          <Path key={row} d={`M${10 + row * 14} ${170 + row * 12} ${Array.from({ length: 13 }, () => "q 12 -8 24 0").join(" ")}`} fill="none" stroke={LC.line} strokeWidth={2.5} strokeLinecap="round" />
        ))}
        <Path d="M24 150 H300" stroke={LC.mint} strokeWidth={2} strokeDasharray="6 6" opacity={0.5} />
      </Svg>
      <Appear at={at(0.2)} x={290} y={0}>
        <Svg width={66} height={162}>
          <Rect x={2} y={148} width={60} height={12} rx={3} fill={LC.panel} />
          <Path d="M40 148 V58 M40 64 H6 M10 64 V86" fill="none" stroke={LC.cream} strokeWidth={3} strokeLinecap="round" />
          <Rect x={3} y={86} width={14} height={10} rx={2} fill={LC.amber} />
          <Path d="M40 32 c-10 -12 -10 -26 0 -26 s10 14 0 26 Z" fill={LC.coral} />
          <Circle cx={40} cy={14} r={3.5} fill={LC.navy} />
        </Svg>
      </Appear>
      <Appear kind="move" at={at(0.5)} x={92} y={88} dx={-80} dy={0}>
        <Svg width={180} height={74}>
          {containers.map((color, i) => <Rect key={i} x={24 + (i % 4) * 22} y={28 - Math.floor(i / 4) * 15} width={20} height={13} rx={2} fill={color} />)}
          <Rect x={120} y={10} width={22} height={34} rx={3} fill={LC.cream} />
          <Path d="M10 44 H170 L156 72 H26 Z" fill={LC.coral} />
          <Path d="M18 54 H164" stroke={LC.cream} strokeWidth={2} opacity={0.7} />
        </Svg>
      </Appear>
      <Mover x={40} y={48} dx={220} dy={-14}>
        <Svg width={38} height={22}>
          <Path d="M0 11 L26 11 L34 7 L36 11 L34 15 L26 11 Z M10 11 L4 1 L10 1 L18 11 L10 21 L4 21 Z" fill={LC.mint} />
        </Svg>
      </Mover>
      {scene.label ? <Chip x={150} y={24} text={scene.label} bg={LC.cream} color={LC.navy} at={at(0.6)} /> : null}
      {chips.map((chip, i) => <Chip key={chip} x={i ? 250 : 110} y={202} text={chip} bg={i ? LC.amber : LC.mint} color={LC.navy} at={at(1.8 + i * 0.3)} />)}
    </>
  );
}

function VideoReel({ scene }: { scene: IntroScene }) {
  const { loop, still } = useScene();
  const frames = [LC.amber, LC.coral, LC.plum];
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Appear key={i} at={at(0.2 + i * 0.2)} x={30 + (i % 2) * 18} y={34 + i * 46}>
          <Box w={60} h={42} r={6} bg={LC.cream} style={{ padding: 5 }}>
            <Box w={50} h={32} r={4} bg={frames[i]!} />
          </Box>
        </Appear>
      ))}
      <Appear kind="growx" at={at(0.9)} x={104} y={108}>
        <Box w={24} h={3} r={1.5} bg={LC.mint} />
      </Appear>
      <Appear kind="rise" at={at(0.1)} x={136} y={12}>
        <Box w={92} h={196} r={16} bg={LC.deep} border={LC.line} />
      </Appear>
      {frames.map((color, i) => {
        const opacity = still ? (i === 0 ? 1 : 0) : i === 0 ? 1 : loop.interpolate({ inputRange: [0, i / 3 - 0.02, i / 3, (i + 1) / 3 - 0.02, (i + 1) / 3, 1].map((n) => Math.min(1, Math.max(0, n))), outputRange: [0, 0, 1, 1, 0, 0] });
        return (
          <Animated.View key={i} style={{ position: "absolute", left: 144, top: 28, opacity }}>
            <Box w={76} h={150} r={8} bg={color} style={{ justifyContent: "flex-end", padding: 12 }}>
              <Box w={52} h={20} r={8} bg="rgba(244,241,234,0.9)" />
            </Box>
          </Animated.View>
        );
      })}
      <Pulse x={166} y={68} w={32} h={32}>
        <Appear at={at(1.4)} x={0} y={0}>
          <Box w={32} h={32} r={16} bg="rgba(244,241,234,0.92)" style={{ alignItems: "center", justifyContent: "center" }}>
            <Svg width={14} height={16}>
              <Path d="M1 0 L14 8 L1 16 Z" fill={LC.navy} />
            </Svg>
          </Box>
        </Appear>
      </Pulse>
      <View style={{ position: "absolute", left: 144, top: 182, width: 76, height: 4, borderRadius: 2, backgroundColor: LC.line }} />
      <Appear kind="growx" at={at(1.6)} x={144} y={182}>
        <Box w={76} h={4} r={2} bg={LC.mint} />
      </Appear>
      {scene.label ? (
        <Appear kind="rise" at={at(2)} x={146} y={152}>
          <Box w={72} h={20} r={6} bg="rgba(14,42,56,0.82)" style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
            <L size={8} color={LC.cream}>{scene.label.slice(0, 18)}</L>
          </Box>
        </Appear>
      ) : null}
      {scene.value ? <Chip x={268} y={34} text={scene.value} bg={LC.mint} color={LC.navy} at={at(1.2)} /> : null}
      {([[262, 64], [296, 100], [262, 140]] as const).map(([x, y], i) => (
        <Appear key={i} at={at(1.6 + i * 0.3)} x={x} y={y}>
          <L size={24} color={[LC.mint, LC.amber, LC.plum][i]}>♪</L>
        </Appear>
      ))}
    </>
  );
}

function DashboardTiles({ scene }: { scene: IntroScene }) {
  const tasks = (scene.chips ?? []).slice(0, 3);
  const bars = [22, 30, 26, 38, 34, 44, 52];
  return (
    <>
      <Appear kind="fade" at={0} x={20} y={12}>
        <Box w={320} h={196} r={18} bg={LC.deep} border={LC.line} />
      </Appear>
      <Appear kind="fade" at={at(0.3)} x={38} y={26}>
        <L size={13}>{(scene.label ?? "Good morning").slice(0, 26)}</L>
      </Appear>
      <Appear kind="rise" at={at(0.5)} x={36} y={54}>
        <Box w={150} h={78} r={14} bg={LC.cream} style={{ padding: 14, gap: 8 }}>
          <Box w={40} h={5} r={2.5} bg="#C9C6D3" />
          {scene.value ? <Counter value={scene.value} startMs={900} size={20} color={LC.navy} /> : null}
        </Box>
      </Appear>
      <Appear kind="fade" at={at(1.2)} x={36} y={54}>
        <Svg width={150} height={78}>
          <Path d="M14 66 L40 60 L64 64 L90 52 L114 56 L136 42" fill="none" stroke={LC.teal} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Appear>
      {(tasks.length ? tasks : ["", "", ""]).map((task, i) => (
        <Appear key={i} kind="move" at={at(0.9 + i * 0.35)} x={198} y={54 + i * 27} dx={24} dy={0}>
          <Box w={128} h={22} r={11} bg={LC.panel} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 }}>
            <Box w={10} h={10} r={5} bg={[LC.amber, LC.mint, LC.coral][i]!} />
            {task ? <L size={10}>{task.slice(0, 17)}</L> : <Box w={70} h={5} r={2.5} bg={LC.line} />}
          </Box>
        </Appear>
      ))}
      <View style={{ position: "absolute", left: 36, top: 195, width: 288, height: 2, backgroundColor: LC.line }} />
      {bars.map((height, i) => (
        <Appear key={i} kind="grow" at={at(1.6 + i * 0.12)} x={44 + i * 28} y={196 - height}>
          <Box w={18} h={height} r={4} bg={i === bars.length - 1 ? LC.mint : LC.teal} />
        </Appear>
      ))}
      <Appear at={at(2.6)} x={250} y={150}>
        <Box w={74} h={36} r={12} bg={LC.mint} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 }}>
          <L size={16} color={LC.navy}>✦</L>
          <View style={{ gap: 5 }}>
            <Box w={28} h={5} r={2.5} bg="rgba(14,42,56,0.5)" />
            <Box w={20} h={5} r={2.5} bg="rgba(14,42,56,0.3)" />
          </View>
        </Box>
      </Appear>
    </>
  );
}

const ZONES = [
  { x: 104, y: 86, r: 54 },
  { x: 208, y: 120, r: 46 },
  { x: 282, y: 66, r: 40 },
];

function MapZones({ scene }: { scene: IntroScene }) {
  const zones = (scene.chips?.length ? scene.chips : ["Zone A", "Zone B", "Zone C"]).slice(0, 3);
  return (
    <>
      <Svg width={360} height={220} style={{ position: "absolute" }}>
        <Rect x={16} y={12} width={328} height={196} rx={18} fill={LC.deep} />
        <Path d="M16 162 C 90 142, 150 192, 230 170 S 330 152, 344 162 V 196 a12 12 0 0 1 -12 12 H 28 a12 12 0 0 1 -12 -12 Z" fill={LC.teal} opacity={0.35} />
        {["M16 60 H344", "M16 128 H344", "M70 12 V208", "M160 12 V208", "M250 12 V208"].map((d) => <Path key={d} d={d} stroke={LC.panel} strokeWidth={7} />)}
      </Svg>
      {zones.map((zone, i) => {
        const off = /✕|×|off/i.test(zone);
        const color = off ? LC.coral : [LC.mint, LC.amber, LC.plum][i]!;
        const spot = ZONES[i]!;
        return (
          <View key={zone}>
            <Appear at={at(0.5 + i * 0.45)} x={spot.x - spot.r} y={spot.y - spot.r}>
              <Svg width={spot.r * 2 + 4} height={spot.r * 2 + 4}>
                <Circle cx={spot.r + 2} cy={spot.r + 2} r={spot.r} fill={off ? "none" : color} fillOpacity={0.22} stroke={color} strokeWidth={2} strokeDasharray="5 5" />
                {off ? <Path d={`M${spot.r * 0.4 + 2} ${spot.r * 0.4 + 2} L${spot.r * 1.6 + 2} ${spot.r * 1.6 + 2}`} stroke={LC.coral} strokeWidth={2.5} /> : null}
              </Svg>
            </Appear>
            <Chip x={Math.min(spot.x, 340 - chipW(zone) / 2)} y={spot.y} text={zone} bg={off ? LC.panel : color} color={off ? LC.cream : LC.navy} at={at(0.8 + i * 0.45)} />
          </View>
        );
      })}
      <Appear at={at(1.8)} x={94} y={4}>
        <Svg width={20} height={30}>
          <Path d="M10 28 c-10 -12 -10 -26 0 -26 s10 14 0 26 Z" fill={LC.coral} />
          <Circle cx={10} cy={10} r={3.5} fill={LC.navy} />
        </Svg>
      </Appear>
      {scene.value ? (
        <Appear at={at(2.4)} x={260} y={165}>
          <Box w={76} h={30} r={6} bg={LC.cream} style={{ alignItems: "center", justifyContent: "center" }}>
            <Counter value={scene.value} startMs={2600} size={14} color={LC.navy} />
          </Box>
        </Appear>
      ) : null}
    </>
  );
}

function BadgeVerify({ scene }: { scene: IntroScene }) {
  const chips = (scene.chips ?? []).slice(0, 3);
  return (
    <>
      <Appear kind="rise" at={at(0.1)} x={30} y={34}>
        <Box w={172} h={120} r={14} bg={LC.cream} style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Box w={46} h={56} r={8} bg={LC.mintSoft} style={{ alignItems: "center", justifyContent: "flex-end", overflow: "hidden" }}>
              <Box w={18} h={18} r={9} bg={LC.navy} style={{ marginBottom: 4 }} />
              <Box w={28} h={14} r={14} bg={LC.navy} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} />
            </Box>
            <View style={{ gap: 10, paddingTop: 6 }}>
              {[84, 60, 72].map((width) => <Box key={width} w={width} h={6} r={3} bg="#C9C6D3" />)}
            </View>
          </View>
          <Box w={144} h={20} r={4} bg="#E8E2D5" style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6 }}>
            {Array.from({ length: 22 }, (_, i) => <View key={i} style={{ width: i % 3 ? 2 : 3.5, height: 12, backgroundColor: "rgba(14,42,56,0.55)" }} />)}
          </Box>
        </Box>
      </Appear>
      <Mover x={26} y={36} dx={0} dy={110}>
        <Box w={180} h={3} r={1.5} bg={LC.mint} />
      </Mover>
      <Appear kind="growx" at={at(1.6)} x={208} y={95}>
        <Box w={24} h={3} r={1.5} bg={LC.mint} />
      </Appear>
      <Appear at={at(2.1)} x={240} y={30}>
        <Svg width={84} height={110}>
          <Path d="M42 0 L84 16 V52 C84 82 64 100 42 108 C20 100 0 82 0 52 V16 Z" fill={LC.mint} />
          <Path d="M28 54 l10 10 l20 -22" fill="none" stroke={LC.navy} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Appear>
      {scene.label ? <Chip x={282} y={164} text={scene.label} bg={LC.cream} color={LC.navy} at={at(2.6)} /> : null}
      {chips.map((chip, i) => {
        const text = `✓ ${chip}`;
        const left = 30 + chips.slice(0, i).reduce((sum, item) => sum + chipW(`✓ ${item}`) + 6, 0);
        return <Chip key={chip} x={left + chipW(text) / 2} y={180} text={text} bg={LC.panel} color={LC.mintSoft} at={at(1 + i * 0.35)} />;
      })}
    </>
  );
}

function RiderTeam({ scene }: { scene: IntroScene }) {
  const names = (scene.chips?.length ? scene.chips : ["Rider 1", "Rider 2", "Rider 3"]).slice(0, 3);
  return (
    <>
      {names.map((name, i) => {
        const x = 24 + i * 108;
        const busy = i === 1;
        return (
          <View key={name}>
            <Appear kind="rise" at={at(0.2 + i * 0.25)} x={x} y={34}>
              <Box w={96} h={150} r={16} bg={LC.panel} border={i === 0 ? LC.mint : LC.line} style={{ alignItems: "center", paddingTop: 16 }}>
                <Box w={48} h={48} r={24} bg={[LC.mint, LC.amber, LC.plum][i]!} style={{ overflow: "hidden", alignItems: "center" }}>
                  <View style={{ marginTop: 6, width: 40, height: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: LC.navy }} />
                  <Box w={32} h={9} r={4.5} bg="rgba(244,241,234,0.85)" style={{ marginTop: -4 }} />
                </Box>
                <L size={12} style={{ marginTop: 10 }}>{name.slice(0, 12)}</L>
                <Box w={12} h={12} r={6} bg={busy ? LC.amber : LC.mint} style={{ marginTop: 10 }} />
                <Box w={60} h={6} r={3} bg={LC.line} style={{ marginTop: 10 }} />
              </Box>
            </Appear>
            <Appear kind="growx" at={at(1.2 + i * 0.3)} x={x + 18} y={162}>
              <Box w={[52, 34, 46][i]!} h={6} r={3} bg={busy ? LC.amber : LC.mint} />
            </Appear>
            {busy ? (
              <Appear at={at(1.6)} x={x + 64} y={44}>
                <Box w={22} h={18} r={3} bg={LC.amber} border={LC.navy} />
              </Appear>
            ) : null}
          </View>
        );
      })}
      <Appear at={at(2.6)} x={169} y={193}>
        <Box w={22} h={22} r={11} bg={LC.mint} style={{ alignItems: "center", justifyContent: "center" }}>
          <L size={15} color={LC.navy}>+</L>
        </Box>
      </Appear>
    </>
  );
}

function InboxList({ scene }: { scene: IntroScene }) {
  const chips = scene.chips ?? [];
  const rows = Math.max(3, Math.min(4, chips.length || 4));
  return (
    <>
      <Appear kind="fade" at={0} x={36} y={12}>
        <Box w={288} h={196} r={18} bg={LC.deep} border={LC.line} style={{ paddingLeft: 18, paddingTop: 14 }}>
          <Box w={72} h={8} r={4} bg="rgba(244,241,234,0.75)" />
        </Box>
      </Appear>
      {scene.value ? (
        <Appear at={at(1.8)} x={289} y={19}>
          <Box w={22} h={22} r={11} bg={LC.coral} style={{ alignItems: "center", justifyContent: "center" }}>
            <L size={11}>{scene.value.slice(0, 3)}</L>
          </Box>
        </Appear>
      ) : null}
      {Array.from({ length: rows }, (_, i) => {
        const chip = chips[i];
        return (
          <Appear key={i} kind="rise" at={at(0.3 + i * 0.3)} x={48} y={48 + i * 39}>
            <Box w={264} h={32} r={12} bg={LC.panel} border={i === 0 ? LC.mint : undefined} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, gap: 8, borderWidth: i === 0 ? 1.5 : 0 }}>
              <Box w={20} h={20} r={10} bg={chipColor(chip ?? "", i)} />
              <View style={{ flex: 1, gap: 4 }}>
                {chip ? <L size={10.5}>{chip.slice(0, 18)}</L> : <Box w={60} h={6} r={3} bg="rgba(244,241,234,0.6)" />}
                {i === 0 && scene.label ? <L mono size={9} color={LC.mintSoft}>{scene.label.slice(0, 30)}</L> : <Box w={130 - i * 16} h={4} r={2} bg={LC.line} />}
              </View>
              {i < 2 ? <Box w={9} h={9} r={4.5} bg={LC.mint} /> : null}
            </Box>
          </Appear>
        );
      })}
    </>
  );
}

function BellAlerts({ scene }: { scene: IntroScene }) {
  const alerts = (scene.chips?.length ? scene.chips : ["", "", ""]).slice(0, 3);
  return (
    <>
      <Pulse x={40} y={64} w={60} h={84} swing>
        <Appear at={at(0.1)} x={0} y={0}>
          <Svg width={60} height={84}>
            <Circle cx={30} cy={6} r={5} fill={LC.amber} />
            <Path d="M10 60 C10 24 18 10 30 10 C42 10 50 24 50 60 L58 68 H2 Z" fill={LC.amber} />
            <Circle cx={30} cy={76} r={6} fill={LC.amber} />
          </Svg>
        </Appear>
      </Pulse>
      <Appear at={at(0.6)} x={82} y={68}>
        <Box w={20} h={20} r={10} bg={LC.coral} style={{ alignItems: "center", justifyContent: "center" }}>
          <L size={11}>{alerts.length}</L>
        </Box>
      </Appear>
      {alerts.map((alert, i) => (
        <Appear key={i} kind="move" at={at(0.8 + i * 0.6)} x={128} y={30 + i * 56} dx={40} dy={0}>
          <Box w={212} h={46} r={14} bg={i === 0 ? LC.cream : LC.panel} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 11 }}>
            <Box w={22} h={22} r={11} bg={[LC.mint, LC.amber, LC.coral][i]!} />
            <View style={{ gap: 5 }}>
              {alert ? <L size={10.5} color={i === 0 ? LC.navy : LC.cream}>{alert.slice(0, 24)}</L> : <Box w={110} h={6} r={3} bg={i === 0 ? "#C9C6D3" : LC.line} />}
              <Box w={[70, 54, 62][i]!} h={4} r={2} bg={i === 0 ? "#C9C6D3" : LC.line} />
            </View>
          </Box>
        </Appear>
      ))}
    </>
  );
}

function SearchRank({ scene }: { scene: IntroScene }) {
  const query = (scene.label ?? "your shop").slice(0, 24);
  const typed = Math.min(3, 1 + query.length * 0.085);
  return (
    <>
      <Appear kind="rise" at={at(0.1)} x={30} y={16}>
        <Box w={300} h={38} r={19} bg={LC.cream} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 }}>
          <Svg width={18} height={18}>
            <Circle cx={7.5} cy={7.5} r={6} fill="none" stroke={LC.navy} strokeWidth={2.5} />
            <Path d="M12 12 l5 5" stroke={LC.navy} strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
          <View style={{ flex: 1 }}>
            <Typed text={query} startMs={1000} size={12} color={LC.navy} />
          </View>
          {[LC.mint, LC.amber, LC.coral, LC.plum].map((color) => <Box key={color} w={7} h={7} r={3.5} bg={color} />)}
        </Box>
      </Appear>
      {[1, 2].map((slot) => (
        <Appear key={slot} kind="rise" at={at(typed + 0.2 + slot * 0.2)} x={30} y={70 + slot * 46}>
          <Box w={300} h={38} r={12} bg={LC.panel} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 10 }}>
            <Box w={16} h={16} r={8} bg={LC.line} />
            <View style={{ gap: 6 }}>
              <Box w={130 - slot * 20} h={6} r={3} bg={LC.line} />
              <Box w={180} h={4} r={2} bg="rgba(36,84,106,0.6)" />
            </View>
          </Box>
        </Appear>
      ))}
      <Appear kind="move" at={at(typed + 0.9)} x={30} y={70} dx={0} dy={92}>
        <Box w={300} h={38} r={12} bg={LC.cream} border={LC.mint} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 10, borderWidth: 2.5 }}>
          <Box w={16} h={16} r={8} bg={LC.teal} />
          <View style={{ flex: 1, gap: 6 }}>
            <Box w={150} h={6} r={3} bg={LC.navy} />
            <Box w={92} h={4} r={2} bg={LC.teal} />
          </View>
          <Box w={22} h={22} r={11} bg={LC.amber} style={{ alignItems: "center", justifyContent: "center" }}>
            <L size={11} color={LC.navy}>1</L>
          </Box>
        </Box>
      </Appear>
    </>
  );
}

/** Scene art id → illustration. tests/learn.test.mjs checks every SCENE_ARTS id has an entry here. */
export const MOBILE_SCENE_KIT: Record<SceneArt, (props: { scene: IntroScene }) => ReactNode> = {
  "phone-store": PhoneStore,
  "dots-sort": DotsSort,
  "chat-bubbles": ChatBubbles,
  "send-burst": SendBurst,
  "chart-grow": ChartGrow,
  "money-flow": MoneyFlow,
  "store-card": StoreCard,
  "product-stock": ProductStock,
  "bike-route": BikeRoute,
  "domain-type": DomainType,
  "supplier-ship": SupplierShip,
  "flow-nodes": FlowNodes,
  "cart-remind": CartRemind,
  "ad-funnel": AdFunnel,
  "link-share": LinkShare,
  "quote-tags": QuoteTags,
  "cash-collect": CashCollect,
  "theme-swap": ThemeSwap,
  "order-pipeline": OrderPipeline,
  "receipt": Receipt,
  "invoice-paper": InvoicePaper,
  "star-reviews": StarReviews,
  "customer-cards": CustomerCards,
  "discount-ticket": DiscountTicket,
  "brand-palette": BrandPalette,
  "import-ship": ImportShip,
  "video-reel": VideoReel,
  "dashboard-tiles": DashboardTiles,
  "map-zones": MapZones,
  "badge-verify": BadgeVerify,
  "rider-team": RiderTeam,
  "inbox-list": InboxList,
  "bell-alerts": BellAlerts,
  "search-rank": SearchRank,
};

/**
 * One scene on a 360×220 board scaled to `width`. `t` and `loop` are owned by the sheet (so pause and replay
 * reach every piece); remount with a new key to rebuild a scene.
 */
export function SceneBoard({ scene, width, t, loop, paused, still }: { scene: IntroScene; width: number; t: Animated.Value; loop: Animated.Value; paused: boolean; still: boolean }) {
  const Art = MOBILE_SCENE_KIT[scene.art];
  const scale = width / BOARD.w;
  return (
    <SceneContext.Provider value={{ t, loop, paused, still }}>
      <View style={{ width, height: BOARD.h * scale, overflow: "hidden" }} accessible accessibilityRole="image" accessibilityLabel={scene.caption}>
        <View style={{ position: "absolute", width: BOARD.w, height: BOARD.h, left: (width - BOARD.w) / 2, top: (BOARD.h * scale - BOARD.h) / 2, transform: [{ scale }] }}>
          <Art scene={scene} />
        </View>
      </View>
    </SceneContext.Provider>
  );
}
