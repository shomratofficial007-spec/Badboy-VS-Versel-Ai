import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { BadboyLogo } from '@/components/BadboyLogo';

type IconName = ComponentProps<typeof Feather>['name'];
export type QuickAction = { label: string; icon: IconName; prompt: string; more?: boolean };

/** The eight tiles shown in the chat quick-action grid. "More Tools" expands MORE_TOOLS. */
export const QUICK_ACTIONS: QuickAction[] = [
  { label: 'General Chat', icon: 'message-circle', prompt: 'আমার সাথে সাধারণ কথোপকথন করো: ' },
  { label: 'Code Helper', icon: 'code', prompt: 'আমাকে coding-এ সাহায্য করো।' },
  { label: 'Creative Ideas', icon: 'sun', prompt: 'সৃজনশীলভাবে এটি তৈরি করো: ' },
  { label: 'Study Helper', icon: 'book-open', prompt: 'ধাপে ধাপে সহজ ভাষায় আমাকে শেখাও: ' },
  { label: 'Image Generator', icon: 'image', prompt: 'এই ছবির জন্য একটি বিস্তারিত image prompt তৈরি করো: ' },
  { label: 'Music Assistant', icon: 'music', prompt: 'আমি একটি গান শুনতে চাই: ' },
  { label: 'Android Control', icon: 'smartphone', prompt: 'Android control-এর জন্য সাহায্য করো: ' },
  { label: 'More Tools', icon: 'grid', prompt: '', more: true },
];

/** Earlier quick actions stay reachable behind "More Tools". */
export const MORE_TOOLS: QuickAction[] = [
  { label: 'Research', icon: 'search', prompt: 'এই বিষয়ে বিস্তারিত research করো: ' },
  { label: 'Memory', icon: 'database', prompt: 'আমার saved memory থেকে প্রাসঙ্গিক তথ্য খুঁজে দাও।' },
  { label: 'Developer', icon: 'terminal', prompt: 'Developer mode-এ এই কাজটি বিশ্লেষণ করো: ' },
  { label: 'Voice', icon: 'mic', prompt: 'Voice settings ও voice workflow সাহায্য করো।' },
  { label: 'Tools', icon: 'tool', prompt: 'উপযুক্ত tools ব্যবহার করে কাজটি করো: ' },
];

const TILE_BORDERS = ['#7C3AED', '#A21CAF', '#C026D3', '#EF4444'];
const TILE_ICONS = ['#38BDF8', '#A78BFA', '#5EEAD4', '#FB923C', '#60A5FA', '#818CF8', '#4ADE80', '#F1F5F9'];

export function QuickActionGrid({ onPick }: { onPick: (prompt: string) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <View style={s.gridWrap}>
      <View style={s.grid}>
        {QUICK_ACTIONS.map((item, index) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => (item.more ? setMoreOpen((open) => !open) : onPick(item.prompt))}
            style={[s.tile, { borderColor: TILE_BORDERS[index % TILE_BORDERS.length] }]}
          >
            <Feather name={item.icon} size={24} color={TILE_ICONS[index % TILE_ICONS.length]} />
            <Text style={s.tileText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {moreOpen ? (
        <View style={s.moreRow}>
          {MORE_TOOLS.map((item) => (
            <Pressable key={item.label} accessibilityRole="button" onPress={() => { setMoreOpen(false); onPick(item.prompt); }} style={s.chip}>
              <Feather name={item.icon} size={14} color="#C4B5FD" />
              <Text style={s.chipText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ChatHeader({ topInset, avatarScale, online, subtitle, subtitleColor, quickActionsExpanded, onAvatar, onToggleQuick, onOptions }: {
  topInset: number;
  avatarScale: Animated.Value;
  online: boolean;
  subtitle: string;
  subtitleColor: string;
  quickActionsExpanded: boolean;
  onAvatar: () => void;
  onToggleQuick: () => void;
  onOptions: () => void;
}) {
  return (
    <View style={[s.header, { paddingTop: Math.max(topInset, 8) }]}>
      <Pressable onPress={onAvatar} accessibilityRole="button" accessibilityLabel="সাইড মেনু খুলুন" style={s.avatarWrap}>
        <Animated.View style={[s.avatarRing, { transform: [{ scale: avatarScale }] }]}>
          <BadboyLogo size={42} />
        </Animated.View>
        <View style={[s.onlineBadge, { backgroundColor: online ? '#22C55E' : '#8E8A9C' }]} />
      </Pressable>
      <View style={s.titleBlock}>
        <Text style={s.title}>Badboy <Text style={s.titleRed}>AI</Text></Text>
        <Text numberOfLines={1} style={[s.subtitle, { color: subtitleColor }]}>{subtitle}</Text>
      </View>
      <View style={s.ownerPill}>
        <Feather name="award" size={16} color="#F5B942" />
        <Text style={s.ownerText}>Owner</Text>
      </View>
      <Pressable onPress={onToggleQuick} accessibilityRole="button" accessibilityLabel={quickActionsExpanded ? 'Quick actions hide করুন' : 'Quick actions দেখান'} style={s.headerButton}>
        <Feather name="settings" size={22} color={quickActionsExpanded ? '#E9D5FF' : '#9B8FBF'} />
      </Pressable>
      <Pressable onPress={onOptions} accessibilityRole="button" accessibilityLabel="চ্যাট অপশন খুলুন" style={s.headerButton}>
        <Feather name="more-vertical" size={22} color="#E9D5FF" />
      </Pressable>
    </View>
  );
}

export function ProviderModelStrip({ providerName, modelName, online, onProvider, onModel }: {
  providerName: string;
  modelName: string;
  online: boolean;
  onProvider: () => void;
  onModel: () => void;
}) {
  return (
    <View style={s.strip}>
      <Pressable onPress={onProvider} accessibilityRole="button" accessibilityLabel="Provider বদলান" style={s.stripCell}>
        <Feather name="hexagon" size={22} color="#B25CFF" />
        <View style={s.stripText}>
          <Text style={s.stripLabel}>Provider</Text>
          <Text numberOfLines={1} style={s.stripValue}>{providerName}</Text>
        </View>
        <Feather name="chevron-down" size={16} color="#C7B9FF" />
      </Pressable>
      <View style={s.stripDivider} />
      <Pressable onPress={onModel} accessibilityRole="button" accessibilityLabel="Model বদলান" style={s.stripCell}>
        <Feather name="cpu" size={22} color="#B25CFF" />
        <View style={s.stripText}>
          <Text style={s.stripLabel}>Model</Text>
          <Text numberOfLines={1} style={s.stripValue}>{modelName}</Text>
        </View>
        <Feather name="chevron-down" size={16} color="#C7B9FF" />
      </Pressable>
      <View style={s.stripDivider} />
      <View style={s.status}>
        <View style={[s.statusDot, { backgroundColor: online ? '#22C55E' : '#8E8A9C' }]} />
        <View>
          <Text style={[s.statusText, { color: online ? '#4ADE80' : '#A39EB5' }]}>{online ? 'Online' : 'Offline'}</Text>
          <View style={s.bars}>
            {[6, 9, 12, 15].map((height) => <View key={height} style={[s.bar, { height, backgroundColor: online ? '#8E8A9C' : '#4A4660' }]} />)}
          </View>
        </View>
      </View>
    </View>
  );
}

function ThroneArt() {
  return (
    <Svg viewBox="0 0 170 200" width="100%" height="100%">
      <Defs>
        <SvgGradient id="tHood" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#222B45" /><Stop offset=".5" stopColor="#090C18" /><Stop offset="1" stopColor="#2B0A33" /></SvgGradient>
        <SvgGradient id="tGold" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#FFE08A" /><Stop offset="1" stopColor="#B7791F" /></SvgGradient>
      </Defs>
      <Circle cx="85" cy="100" r="78" fill="#7C1BFF" opacity=".16" />
      <Circle cx="85" cy="100" r="62" fill="#FF2350" opacity=".1" />
      <Path d="M18 196 L18 52 L28 30 L38 52 L46 34 L54 54 L116 54 L124 34 L132 52 L142 30 L152 52 L152 196 Z" fill="#0B0716" stroke="#5B2DB0" strokeWidth="2" />
      <Path d="M45 64 Q85 22 125 64 L140 150 Q118 190 85 194 Q52 190 30 150 Z" fill="url(#tHood)" stroke="#6221A7" strokeWidth="2" />
      <Path d="M54 74 Q85 38 116 74 L106 122 Q85 140 64 122 Z" fill="#03050B" stroke="#2D2452" strokeWidth="1.5" />
      <Path d="M62 96 Q73 86 82 98 L70 103 Z" fill="#FF2349" />
      <Path d="M88 98 Q97 86 108 96 L100 103 Z" fill="#FF2349" />
      <Path d="M58 52 L64 24 L76 40 L85 14 L94 40 L106 24 L112 52 Z" fill="url(#tGold)" stroke="#7A4B0E" strokeWidth="1.5" />
      <Circle cx="85" cy="38" r="4" fill="#FF2349" />
      <Path d="M32 150 Q14 170 34 188 L58 180 M138 150 Q156 170 136 188 L112 180" fill="#080B15" stroke="#4823A0" strokeWidth="3" />
    </Svg>
  );
}

export function WelcomeBanner() {
  return (
    <View style={s.banner}>
      <View style={s.bannerArt}><ThroneArt /></View>
      <View style={s.bannerText}>
        <View style={s.welcomeRow}>
          <Feather name="award" size={20} color="#A855F7" />
          <Text style={s.welcomeTo}>Welcome to</Text>
        </View>
        <Text style={s.bannerBrand}>Badboy <Text style={s.titleRed}>AI</Text></Text>
        <Text style={s.bannerTag}>Smart • Secure • Powerful</Text>
        <Text style={s.bannerDesc}>Ask anything, explore ideas, get help — I'm here for you!</Text>
        <View style={s.poweredPill}>
          <Feather name="zap" size={14} color="#FF4D6D" />
          <Text style={s.poweredText}>Powered by Multi-AI</Text>
        </View>
        <Text style={s.bannerFoot}>Free • Fast • Reliable</Text>
      </View>
    </View>
  );
}

export function ChatFooter({ bottomInset }: { bottomInset: number }) {
  return (
    <View style={[s.footer, { paddingBottom: Math.max(bottomInset, 6) }]}>
      <View style={s.footerLine}>
        <View style={[s.line, { backgroundColor: '#7C3AED' }]} />
        <Text style={s.version}>Badboy AI v1.0.0</Text>
        <View style={[s.line, { backgroundColor: '#EF4444' }]} />
      </View>
      <Text style={s.built}>Built with <Text style={{ color: '#FF3B5C' }}>♥</Text> for Smart People...</Text>
    </View>
  );
}

const s = StyleSheet.create({
  gridWrap: { paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  tile: { width: '23.5%', minHeight: 74, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 6, backgroundColor: 'rgba(12,8,28,0.85)' },
  tileText: { color: '#E4E0F5', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  moreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#5B2DB0', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(12,8,28,0.85)' },
  chipText: { color: '#E4E0F5', fontSize: 12, fontWeight: '600' },
  header: { paddingHorizontal: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrap: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#A855F7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#0B0716' },
  onlineBadge: { position: 'absolute', right: 1, bottom: 3, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: '#05030D' },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { color: '#F6F4FF', fontSize: 25, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.8 },
  titleRed: { color: '#FF284F' },
  subtitle: { fontSize: 12, marginTop: 1 },
  ownerPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#7C3AED', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: 'rgba(60,20,110,0.35)' },
  ownerText: { color: '#F6F4FF', fontSize: 13, fontWeight: '700' },
  headerButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  strip: { marginHorizontal: 12, marginBottom: 10, minHeight: 64, borderWidth: 1, borderColor: '#6D28D9', borderRadius: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(12,8,28,0.9)', paddingHorizontal: 6 },
  stripCell: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 6, paddingVertical: 8 },
  stripText: { flex: 1, minWidth: 0 },
  stripLabel: { color: '#A39EB5', fontSize: 11 },
  stripValue: { color: '#F6F4FF', fontSize: 14, fontWeight: '700' },
  stripDivider: { width: 1, height: 38, backgroundColor: '#2E2150' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 8 },
  statusDot: { width: 11, height: 11, borderRadius: 6 },
  statusText: { fontSize: 14, fontWeight: '700' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 2 },
  bar: { width: 3, borderRadius: 1 },
  banner: { marginHorizontal: 12, marginBottom: 10, minHeight: 190, borderWidth: 1, borderColor: '#6D28D9', borderRadius: 18, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(14,8,32,0.9)' },
  bannerArt: { width: '40%', height: 190 },
  bannerText: { flex: 1, paddingVertical: 12, paddingRight: 12, justifyContent: 'center', gap: 4 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  welcomeTo: { color: '#F6F4FF', fontSize: 17, fontWeight: '700' },
  bannerBrand: { color: '#F6F4FF', fontSize: 32, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },
  bannerTag: { color: '#C084FC', fontSize: 13, fontWeight: '700' },
  bannerDesc: { color: '#CFC8E3', fontSize: 12, lineHeight: 17, marginTop: 4 },
  poweredPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#7C3AED', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },
  poweredText: { color: '#F6F4FF', fontSize: 12, fontWeight: '600' },
  bannerFoot: { color: '#B7ADD0', fontSize: 11, marginTop: 2 },
  footer: { alignItems: 'center', gap: 2, paddingTop: 2 },
  footerLine: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', paddingHorizontal: 12 },
  line: { flex: 1, height: 1, opacity: 0.8 },
  version: { color: '#D946EF', fontSize: 15, fontWeight: '800' },
  built: { color: '#B7ADD0', fontSize: 13, fontStyle: 'italic' },
});
