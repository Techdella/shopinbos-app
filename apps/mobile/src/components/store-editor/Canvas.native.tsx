import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { API_URL } from "@/lib/api";
import { CANVAS_PATH, canvasScript, parseCanvasMessage, type CanvasInbound, type CanvasOutbound } from "@/lib/store-editor";
import { colors } from "@/theme";

// The shop on the editor's canvas: the web's /store-canvas page (src/app/store-canvas) in a WebView, so it is the real
// storefront renderer with the seller's theme, fonts and sections. The phone sends it the draft and every change as
// messages (no reload, so a change shows the moment it's made); it sends back what the seller taps. It never leaves
// that page: links on the shop don't navigate the WebView.

export interface CanvasHandle {
  send: (message: CanvasInbound) => void;
}

export const CANVAS_URL = `${API_URL}${CANVAS_PATH}`;

export const StoreCanvas = forwardRef<CanvasHandle, {
  onMessage: (message: CanvasOutbound) => void;
  onFailed?: () => void;
  style?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}>(function StoreCanvas({ onMessage, onFailed, style, scrollEnabled = true, accessibilityLabel, testID }, ref) {
  const web = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  useImperativeHandle(ref, () => ({
    send: (message) => web.current?.injectJavaScript(canvasScript(message)),
  }), []);

  const handle = useCallback((event: WebViewMessageEvent) => {
    const message = parseCanvasMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.t === "ready") setLoading(false);
    onMessage(message);
  }, [onMessage]);

  return (
    <View style={[{ overflow: "hidden", backgroundColor: "#FFFFFF" }, style]} testID={testID} accessibilityLabel={accessibilityLabel}>
      <WebView
        ref={web}
        source={{ uri: CANVAS_URL }}
        onMessage={handle}
        originWhitelist={["https://*", "http://*"]}
        // Only the canvas page itself: a link on the shop never takes the editor somewhere else.
        onShouldStartLoadWithRequest={(request) => request.isTopFrame === false || request.url.startsWith(CANVAS_URL) || request.url === "about:blank"}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        // Typing on the page: the keyboard opens when the page puts the cursor in the words (iOS asks for this).
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        scrollEnabled={scrollEnabled}
        decelerationRate="normal"
        textZoom={100}
        overScrollMode="never"
        pullToRefreshEnabled={false}
        onError={() => onFailed?.()}
        onHttpError={(event) => {
          if (event.nativeEvent.statusCode >= 500) onFailed?.();
        }}
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        webviewDebuggingEnabled={__DEV__}
      />
      {loading ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
});

/** True on Android and iPhone: the canvas is the real shop in a WebView. */
export const CANVAS_SUPPORTED = true;
