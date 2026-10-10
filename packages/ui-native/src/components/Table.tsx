import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../styles';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  flex?: number;
}

/** Mobile "table": a card of rows. Long lists should use FlatList with the same row style. */
export function Table<T>({
  columns,
  rows,
  rowKey,
  empty,
  onRowPress,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  empty?: string;
  onRowPress?: (r: T) => void;
}) {
  return (
    <View style={styles.card}>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{empty ?? 'Nothing here yet.'}</Text>
      ) : (
        rows.map((row, i) => (
          <Pressable
            key={rowKey(row)}
            disabled={!onRowPress}
            onPress={() => onRowPress?.(row)}
            style={[styles.row, i > 0 && styles.divider]}
          >
            {columns.map((c) => (
              <View
                key={c.key}
                style={{
                  flex: c.flex ?? 1,
                  alignItems: c.align === 'right' ? 'flex-end' : 'flex-start',
                }}
              >
                {(() => {
                  const v = c.cell(row);
                  return typeof v === 'string' || typeof v === 'number' ? (
                    <Text style={styles.cell}>{v}</Text>
                  ) : (
                    v
                  );
                })()}
              </View>
            ))}
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: t.colors.paper,
    borderRadius: t.radius.cardMobile,
    paddingHorizontal: t.spacing[4],
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: t.spacing[3] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.line },
  cell: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: t.fontSizes.base,
    color: t.colors.ink,
  },
  empty: {
    paddingVertical: t.spacing[8],
    textAlign: 'center',
    color: t.colors.sub,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
});
