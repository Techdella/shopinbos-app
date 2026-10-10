import { StyleSheet, Text, View } from 'react-native';
import { badgeColors, t, type BadgeTone } from '../styles';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const col = badgeColors(tone);
  return (
    <View style={[styles.badge, { backgroundColor: col.bg }]}>
      <Text style={[styles.text, { color: col.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: t.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  text: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: t.fontSizes.xs },
});
