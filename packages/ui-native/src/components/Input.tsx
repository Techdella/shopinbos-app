import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { t } from '../styles';

export interface InputProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
}

export function Input({ label, hint, error, leading, style, ...rest }: InputProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[styles.field, { borderColor: error ? t.colors['accent-text'] : t.colors.line }]}
      >
        {leading ? <View>{leading}</View> : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={t.colors.sub}
          style={[styles.input, style]}
          {...rest}
        />
      </View>
      {error || hint ? (
        <Text style={[styles.hint, error ? { color: t.colors['accent-text'] } : null]}>
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: t.spacing[2] },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: t.fontSizes.sm,
    color: t.colors.ink,
  },
  field: {
    minHeight: t.sizes.buttonMinHeight.mobile,
    borderWidth: 1,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.paper,
    paddingHorizontal: t.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[2],
  },
  input: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: t.fontSizes.md,
    color: t.colors.ink,
  },
  hint: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: t.fontSizes.sm, color: t.colors.sub },
});
