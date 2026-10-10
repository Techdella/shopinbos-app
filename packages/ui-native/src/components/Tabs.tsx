import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../styles';

export interface TabItem {
  key: string;
  label: string;
  content: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
}) {
  const active = items.find((i) => i.key === value) ?? items[0];
  return (
    <View>
      <View accessibilityRole="tablist" style={styles.bar}>
        {items.map((i) => {
          const selected = i.key === active?.key;
          return (
            <Pressable
              key={i.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(i.key)}
              style={[styles.tab, selected && styles.tabOn]}
            >
              <Text style={[styles.label, { color: selected ? t.colors.ink : t.colors.sub }]}>
                {i.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.panel}>{active?.content}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: t.spacing[5],
    borderBottomWidth: 1,
    borderBottomColor: t.colors.line,
  },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabOn: { borderBottomColor: t.colors.ink },
  label: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: t.fontSizes.base },
  panel: { paddingTop: t.spacing[4] },
});
