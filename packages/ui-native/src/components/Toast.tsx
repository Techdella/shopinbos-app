import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../styles';

export interface ToastOptions {
  message: string;
  tone?: 'ink' | 'ok' | 'error';
  action?: { label: string; onPress: () => void };
  durationMs?: number;
}

const Ctx = createContext<((o: ToastOptions) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const id = useRef(0);
  const show = useCallback((o: ToastOptions) => setToast({ ...o, id: ++id.current }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.durationMs ?? 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const bg =
    toast?.tone === 'ok'
      ? t.colors.ok
      : toast?.tone === 'error'
        ? t.colors['accent-text']
        : t.colors.ink;
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={styles.layer}>
          <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: bg }]}>
            <Text style={styles.text}>{toast.message}</Text>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => {
                  toast.action?.onPress();
                  setToast(null);
                }}
              >
                <Text style={styles.action}>{toast.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, bottom: 110, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[4],
    borderRadius: t.radius.pill,
    paddingHorizontal: t.spacing[5],
    paddingVertical: t.spacing[3],
  },
  text: {
    color: t.colors.paper,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: t.fontSizes.sm,
  },
  action: {
    color: t.colors['ai-mid'],
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: t.fontSizes.sm,
  },
});
