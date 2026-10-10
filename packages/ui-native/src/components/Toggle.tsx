import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../styles';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** 50×30 switch. */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.desc}>{description}</Text> : null}
      </View>
      <View style={[styles.track, { backgroundColor: checked ? t.colors.ok : t.colors.line }]}>
        <View style={[styles.thumb, { transform: [{ translateX: checked ? 22 : 2 }] }]} />
      </View>
    </Pressable>
  );
}

const { width, height } = t.sizes.toggle.mobile;
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing[4],
    minHeight: t.sizes.touchTarget,
  },
  text: { flex: 1 },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: t.fontSizes.base,
    color: t.colors.ink,
  },
  desc: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: t.fontSizes.sm, color: t.colors.sub },
  track: { width, height, borderRadius: t.radius.pill, justifyContent: 'center' },
  thumb: {
    width: height - 4,
    height: height - 4,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.paper,
  },
});
