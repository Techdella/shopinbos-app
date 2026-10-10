import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { buttonColors, t, type ButtonVariant } from '../styles';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  children: string;
  variant?: ButtonVariant;
  loading?: boolean;
  leading?: ReactNode;
}

/** Pill button, min height 52 on mobile. */
export function Button({
  children,
  variant = 'primary',
  loading,
  leading,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const col = buttonColors(variant);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      style={(state) => [
        styles.base,
        {
          backgroundColor: col.bg,
          borderColor: col.border ?? col.bg,
          opacity: disabled ? 0.5 : state.pressed ? 0.85 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={col.fg} /> : leading}
        <Text style={[styles.label, { color: col.fg }]}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: t.sizes.buttonMinHeight.mobile,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    paddingHorizontal: t.spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] },
  label: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: t.fontSizes.md },
});
