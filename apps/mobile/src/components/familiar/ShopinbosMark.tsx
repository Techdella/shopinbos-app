import { Image, View } from "react-native";

// The Shopinbos logo in a navy circle: Shopinbos's own ring in the Status row and its picture in the Status viewer
// (the same mark TeamUpdatesRing uses).

const MARK = require("../../../assets/brand/mark-white.png") as number;

export function ShopinbosMark({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#0E2A38", alignItems: "center", justifyContent: "center" }} accessibilityIgnoresInvertColors>
      <Image source={MARK} style={{ width: size * 0.47, height: size * 0.53 }} resizeMode="contain" />
    </View>
  );
}
