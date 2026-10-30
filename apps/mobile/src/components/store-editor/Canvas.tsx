import { forwardRef, useImperativeHandle } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { CanvasInbound, CanvasOutbound } from "@/lib/store-editor";

// The web build of the phone app has no WebView: the store editor (app/store-editor.tsx) shows its "use the web
// builder" note instead (CANVAS_SUPPORTED false). Android and iPhone use Canvas.native.tsx.

export interface CanvasHandle {
  send: (message: CanvasInbound) => void;
}

export const CANVAS_URL = "";

export const StoreCanvas = forwardRef<CanvasHandle, {
  onMessage: (message: CanvasOutbound) => void;
  onFailed?: () => void;
  style?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}>(function StoreCanvas({ style, testID }, ref) {
  useImperativeHandle(ref, () => ({ send: () => undefined }), []);
  return <View style={style} testID={testID} />;
});

export const CANVAS_SUPPORTED = false;
