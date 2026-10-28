import { View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { T } from "@/components/ui";
import type { ShopLook } from "@/lib/templates";
import { fonts } from "@/theme";

// A shop look drawn small (Shop looks, apps/mobile/src/app/templates.tsx, and "Pick a look" in sign-up): the look's own
// colours with its sample store's banner photo and two products. `storeName` puts the seller's shop name on it.

/** A little shop in the look's colours: its sample store's name, banner photo and two products. */
export function MiniShop({ look, height, big = false, storeName }: { look: ShopLook; height: number; big?: boolean; storeName?: string }) {
  const { bg, ink, accent } = look.preview;
  const [first, second] = look.demo.products;
  return (
    <View style={{ height, borderRadius: big ? 26 : 16, overflow: "hidden", backgroundColor: bg }}>
      <View style={{ height: big ? 40 : 26, justifyContent: "center", paddingHorizontal: big ? 14 : 8 }}>
        <T weight="extrabold" numberOfLines={1} style={{ fontSize: big ? 12 : 9, letterSpacing: 0.4, color: ink, textTransform: "uppercase" }}>{storeName || look.demo.storeName}</T>
      </View>
      <View style={{ height: big ? 170 : Math.round(height * 0.39), backgroundColor: accent }}>
        {look.demo.hero ? <Image source={{ uri: look.demo.hero }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
        {/* A dark scrim under the theme's name, so it reads on any photo. */}
        <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.62)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: big ? 90 : 48 }} />
        <T
          numberOfLines={1}
          style={{ position: "absolute", left: big ? 14 : 8, right: big ? 14 : 8, bottom: big ? 12 : 6, fontFamily: look.preview.nameFont === "serif" ? fonts.displayBold : fonts.display, fontSize: big ? 24 : 14, lineHeight: big ? 28 : 17, color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 6 }}
        >
          {look.name}
        </T>
      </View>
      <View style={{ flex: 1, flexDirection: "row", gap: big ? 8 : 5, padding: big ? 10 : 6 }}>
        {[first, second].map((uri, index) => (
          <View key={index} style={{ flex: 1, borderRadius: big ? 12 : 7, overflow: "hidden", backgroundColor: look.preview.line }}>
            {uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

