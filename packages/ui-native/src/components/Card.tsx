import { StyleSheet, View, type ViewProps } from 'react-native';
import { t } from '../styles';

export interface CardProps extends ViewProps {
  tone?: 'paper' | 'ai' | 'ink' | 'accent';
}

const bg = {
  paper: t.colors.paper,
  ai: t.colors['ai-soft'],
  ink: t.colors.ink,
  accent: t.colors['accent-soft'],
};

/** 24px radius on mobile, no border. */
export function Card({ tone = 'paper', style, ...rest }: CardProps) {
  return <View style={[styles.card, { backgroundColor: bg[tone] }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: t.radius.cardMobile, padding: t.spacing[5] },
});
