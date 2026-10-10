import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../styles';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Bottom sheet (e.g. the Create sheet). */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.grabber} />
        <View style={styles.head}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22,20,31,0.4)' },
  sheet: {
    backgroundColor: t.colors.paper,
    borderTopLeftRadius: t.radius.cardMobile,
    borderTopRightRadius: t.radius.cardMobile,
    padding: t.spacing[5],
    paddingBottom: t.spacing[10],
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: t.colors.line,
    marginBottom: t.spacing[3],
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: t.spacing[3],
  },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: t.fontSizes.lg, color: t.colors.ink },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 26, color: t.colors.ink },
});
