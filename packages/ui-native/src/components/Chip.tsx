import { Pressable, StyleSheet, Text } from 'react-native';
import { t } from '../styles';

export interface ChipProps {
  label: string;
  selected?: boolean;
  count?: number;
  onPress?: () => void;
}

/** 38px pill; selected = ink. */
export function Chip({ label, selected = false, count, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={3}
      style={[styles.chip, selected ? styles.on : styles.off]}
    >
      <Text style={[styles.text, { color: selected ? t.colors.paper : t.colors.ink }]}>
        {label}
        {count !== undefined ? `  ${count}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: t.sizes.chipHeight.mobile,
    borderRadius: t.radius.pill,
    paddingHorizontal: t.spacing[4],
    justifyContent: 'center',
  },
  on: { backgroundColor: t.colors.ink },
  off: { backgroundColor: t.colors.paper },
  text: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: t.fontSizes.sm },
});
