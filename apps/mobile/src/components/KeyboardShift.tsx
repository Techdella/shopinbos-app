import { useEffect, type ReactNode, type RefObject } from "react";
import { Keyboard, KeyboardAvoidingView, type ScrollView, type StyleProp, type ViewStyle } from "react-native";

// Keeps what is typed in sight when the phone's keyboard opens, on Android and iOS alike.
//
// Android apps draw edge to edge (Expo SDK 54 and later), so the window no longer shrinks for the keyboard and a
// composer pinned at the bottom of the screen ended up under it (the owner's Android test of onboarding's Rex chat).
// "padding" works on both systems: KeyboardAvoidingView pads by how much the keyboard actually overlaps this view,
// which is 0 when the system has already made room (an older Android that still resizes the window), so it never
// adds the space twice. `offset` is for a view that doesn't start at the top of the screen (a header above it).

export const KEYBOARD_BEHAVIOR = "padding" as const;

export function KeyboardShift({ children, offset = 0, style }: { children: ReactNode; offset?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior={KEYBOARD_BEHAVIOR} keyboardVerticalOffset={offset}>
      {children}
    </KeyboardAvoidingView>
  );
}

/** Chats: the newest message stays above the composer when the keyboard opens. */
export function useScrollToEndOnKeyboard(scroll: RefObject<ScrollView | null>) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      if (timer) clearTimeout(timer);
      // After the padding is laid out, so the end is the end of the smaller list.
      timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
    });
    return () => {
      subscription.remove();
      if (timer) clearTimeout(timer);
    };
  }, [scroll]);
}
