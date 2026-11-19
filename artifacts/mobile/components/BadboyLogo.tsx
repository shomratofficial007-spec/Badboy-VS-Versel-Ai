import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface BadboyLogoProps {
  size?: number;
}

/** Lightweight React Native-only brand mark; safe in native and server-rendered test environments. */
export function BadboyLogo({ size = 40 }: BadboyLogoProps) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Badboy AI logo"
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: Math.max(9, size * 0.25),
          borderWidth: Math.max(1, size * 0.035),
        },
      ]}
    >
      <View style={[styles.inner, { borderRadius: Math.max(6, size * 0.19) }]}>
        <Text style={[styles.mark, { fontSize: size * 0.68 }]}>B</Text>
      </View>
      <View style={[styles.redAccent, { width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#100718',
    borderColor: '#c026ff',
    shadowColor: '#c026ff',
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  inner: {
    flex: 1,
    width: '88%',
    margin: '6%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07030d',
    borderWidth: 1,
    borderColor: '#ff315e',
  },
  mark: {
    color: '#f5d0fe',
    fontWeight: '900',
    fontStyle: 'italic',
    textShadowColor: '#c026ff',
    textShadowRadius: 9,
  },
  redAccent: {
    position: 'absolute',
    right: '8%',
    top: '8%',
    backgroundColor: '#ff315e',
    borderWidth: 1,
    borderColor: '#fff',
  },
});
