import React from 'react';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

interface BadboyLogoProps {
  size?: number;
}

export function BadboyLogo({ size = 40 }: BadboyLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Defs>
        <LinearGradient id="bgGlow" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#061a2d" />
          <Stop offset="100%" stopColor="#020b18" />
        </LinearGradient>
        <LinearGradient id="cyanNeon" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#00d9ff" />
          <Stop offset="60%" stopColor="#168bff" />
          <Stop offset="100%" stopColor="#7c3aed" />
        </LinearGradient>
        <LinearGradient id="borderGlow" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
          <Stop offset="100%" stopColor="#168bff" stopOpacity="0.3" />
        </LinearGradient>
      </Defs>

      {/* Rounded Hexagonal / Futuristic Badge Background */}
      <Rect
        x="1.5"
        y="1.5"
        width="37"
        height="37"
        rx="10"
        fill="url(#bgGlow)"
        stroke="url(#borderGlow)"
        strokeWidth="1.5"
      />

      {/* Corner Accents */}
      <Path d="M4 10 L4 4 L10 4" stroke="#00d9ff" strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M36 30 L36 36 L30 36" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round" />

      {/* Sharp Futuristic Stylized "B" */}
      <Path
        d="M12 9 H22 C26.5 9 28.5 11.5 28.5 15 C28.5 17.5 27 19.2 24.5 20 C27.5 20.8 29 23 29 26 C29 29.8 26.5 32 22 32 H12 V9 Z M17 13.5 V18.2 H21.5 C23 18.2 24 17.3 24 15.8 C24 14.3 23 13.5 21.5 13.5 H17 Z M17 22.5 V27.5 H22 C23.8 27.5 24.8 26.5 24.8 25 C24.8 23.5 23.8 22.5 22 22.5 H17 Z"
        fill="url(#cyanNeon)"
      />
    </Svg>
  );
}
