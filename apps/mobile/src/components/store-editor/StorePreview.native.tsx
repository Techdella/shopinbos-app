import { useState } from "react";
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "@/theme";

// The real shop, as customers see it, in a card (the Shop tab's preview, SE-01, and "Your changes are live", SE-14).
// Only to look at: taps go to the card around it, and the page never navigates.

export function StorePreview({ url, style, accessibilityLabel }: { url: string; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const [loading, setLoading] = useState(true);
  return (
    <View pointerEvents="none" accessible accessibilityLabel={accessibilityLabel} style={[{ overflow: "hidden", backgroundColor: "#FFFFFF" }, style]}>
      <WebView
        source={{ uri: url }}
        onLoadEnd={() => setLoading(false)}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        textZoom={100}
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      />
      {loading ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
}
