import React from 'react';
import { useWindowDimensions } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const items = [
  { name: 'index', label: 'চ্যাট', icon: 'message-circle' as const, route: '/(tabs)' },
  { name: 'memory', label: 'মেমোরি', icon: 'bookmark' as const, route: '/(tabs)/memory' },
  { name: 'settings', label: 'সেটিংস', icon: 'sliders' as const, route: '/(tabs)/settings' },
];

function TopNavigation() {
  const colors = useColors();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: Math.max(insets.top, 8) + 7,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.headerInner}>
        <View style={styles.brand}>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Feather name="zap" size={17} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.brandText, { color: colors.foreground }]}>Badboy</Text>
        </View>
        <View style={[styles.nav, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {items.map((item) => {
            const active =
              item.name === 'index'
                ? pathname === '/' || pathname.endsWith('/(tabs)') || pathname.endsWith('/index')
                : pathname.endsWith('/' + item.name);

            return (
              <Pressable
                key={item.name}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => router.push(item.route as never)}
                style={[styles.navItem, active && { backgroundColor: colors.secondary }]}
              >
                <Feather
                  name={item.icon}
                  size={16}
                  color={active ? colors.primary : colors.mutedForeground}
                />
                {!compact && (
                  <Text style={[styles.navText, { color: active ? colors.foreground : colors.mutedForeground }]}>
                    {item.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  return <View style={{flex:1,backgroundColor:colors.background}}><TopNavigation/><View style={{flex:1,width:'100%',maxWidth:960,alignSelf:'center'}}><Tabs screenOptions={{headerShown:false,tabBarStyle:{display:'none'}}}><Tabs.Screen name="index"/><Tabs.Screen name="memory"/><Tabs.Screen name="settings"/></Tabs></View></View>;
}

const styles=StyleSheet.create({header:{paddingHorizontal:14,paddingBottom:10,borderBottomWidth:1},headerInner:{gap:10},brand:{height:34,flexDirection:'row',alignItems:'center',gap:8},logo:{width:29,height:29,borderRadius:10,alignItems:'center',justifyContent:'center'},brandText:{fontSize:17,fontWeight:'800',letterSpacing:0.2},nav:{flexDirection:'row',borderWidth:1,borderRadius:15,padding:4,gap:4},navItem:{flex:1,minHeight:39,borderRadius:11,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},navText:{fontSize:12,fontWeight:'700'}});
