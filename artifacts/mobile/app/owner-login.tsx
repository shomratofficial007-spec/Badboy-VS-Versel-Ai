import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { useOwnerAuth } from '@/context/OwnerAuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function DarkAiEmblem() {
  return <Svg viewBox="0 0 360 300" width="100%" height="100%">
    <Defs>
      <SvgGradient id="hood" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#253047"/><Stop offset=".45" stopColor="#080B16"/><Stop offset="1" stopColor="#300A32"/></SvgGradient>
      <SvgGradient id="red" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#FF3B70"/><Stop offset="1" stopColor="#FF1717"/></SvgGradient>
      <SvgGradient id="gold" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#FFE08A"/><Stop offset="1" stopColor="#B7791F"/></SvgGradient>
    </Defs>
    <Circle cx="180" cy="150" r="128" fill="#2A0A5E" opacity=".5"/>
    <Circle cx="180" cy="147" r="134" fill="none" stroke="#7100FF" strokeWidth="2" opacity=".48"/>
    <Circle cx="180" cy="147" r="123" fill="none" stroke="#FF174D" strokeWidth="1.5" opacity=".25" strokeDasharray="2 11"/>
    <Circle cx="151" cy="161" r="17" fill="#FF174D" opacity=".13"/>
    <Circle cx="209" cy="161" r="17" fill="#FF174D" opacity=".13"/>
    <Circle cx="180" cy="147" r="115" fill="none" stroke="#F01869" strokeWidth="2" opacity=".3" strokeDasharray="5 8"/>
    <Path d="M18 70 L72 70 L92 48 M342 70 L288 70 L268 48 M20 220 L72 220 L91 242 M340 220 L288 220 L269 242" stroke="#6A20FF" strokeWidth="2" opacity=".7" fill="none"/>
    <Path d="M38 95 L63 95 L78 80 M322 95 L297 95 L282 80" stroke="#FF244F" strokeWidth="2" opacity=".65" fill="none"/>
    <Ellipse cx="46" cy="176" rx="30" ry="40" fill="#0B1226" stroke="#4B3BFF" strokeWidth="2"/>
    <Circle cx="46" cy="160" r="6" fill="#7A5CFF"/>
    <Ellipse cx="314" cy="176" rx="30" ry="40" fill="#1A0A14" stroke="#FF244F" strokeWidth="2"/>
    <Circle cx="314" cy="160" r="6" fill="#FF244F"/>
    <Path d="M104 96 Q180 22 256 96 L278 228 Q246 276 180 282 Q114 276 82 228 Z" fill="url(#hood)" stroke="#6221A7" strokeWidth="3"/>
    <Path d="M108 116 Q180 35 252 116 L231 192 Q180 228 129 192 Z" fill="#03050B" stroke="#2D2452" strokeWidth="2"/>
    <Path d="M128 158 Q148 135 169 158 L151 168 Z" fill="url(#red)"/>
    <Path d="M192 158 Q213 135 232 158 L209 168 Z" fill="url(#red)"/>
    <Path d="M132 160 L164 155 M196 155 L228 160" stroke="#FF2349" strokeWidth="6" strokeLinecap="round"/>
    <Path d="M24 137 L49 126 L40 147 L63 140 M336 137 L311 126 L320 147 L297 140" stroke="#B12BFF" strokeWidth="2.5" fill="none" opacity=".8"/>
    <Path d="M180 167 L165 210 L180 221 L195 210 Z" fill="#090D18" stroke="#8B1D7A" strokeWidth="2"/>
    <Path d="M91 184 Q51 162 39 193 Q24 224 65 241 L120 230 M269 184 Q309 162 321 193 Q336 224 295 241 L240 230" fill="#080B15" stroke="#4823A0" strokeWidth="5"/>
    <Path d="M180 229 Q139 251 116 282 L244 282 Q221 251 180 229Z" fill="#080A13" stroke="#A21BFF" strokeWidth="2"/>
    <Path d="M136 74 L144 38 L162 60 L180 24 L198 60 L216 38 L224 74 Z" fill="url(#gold)" stroke="#7A4B0E" strokeWidth="2"/>
    <Circle cx="180" cy="52" r="5" fill="#FF2349"/>
  </Svg>;
}

const FEATURES: Array<{ icon: 'shield' | 'award' | 'zap' | 'star'; color: string; label: string }> = [
  { icon: 'shield', color: '#18D9FF', label: 'Secure Access' },
  { icon: 'award', color: '#FFBF4A', label: 'Owner Control' },
  { icon: 'zap', color: '#24D7FF', label: 'Full Features Unlocked' },
  { icon: 'star', color: '#D34DFF', label: 'Badboy AI Premium' },
];

export default function OwnerLoginScreen() {
  const { signIn } = useOwnerAuth();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (busy || !token.trim()) return;
    setBusy(true); setError(null);
    try { await signIn(token.trim()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Owner Login করা যায়নি। আবার চেষ্টা করুন।'); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#03040A','#0A0617','#100510']} style={StyleSheet.absoluteFill}/>
      <View pointerEvents="none" style={styles.ambientPurple}/>
      <View pointerEvents="none" style={styles.ambientRed}/>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content,{paddingTop:Math.max(insets.top,12)+8,paddingBottom:Math.max(insets.bottom,16)+14,minHeight:height}]}>
          <View style={styles.topRow}>
            <View>
              <Text style={styles.think}>THINK</Text>
              <Text style={styles.think}>BEYOND</Text>
              <Text style={styles.limits}>LIMITS...</Text>
            </View>
            <View style={styles.cornerBrand}>
              <Feather name="award" size={22} color="#FF3158"/>
              <Text style={styles.cornerText}>Badboy <Text style={styles.red}>AI</Text></Text>
            </View>
          </View>
          <View style={[styles.hero,{height:Math.min(290,Math.max(180,height*.31))}]}><DarkAiEmblem/></View>
          <View style={styles.brandWrap}>
            <Text style={styles.brand}>Badboy <Text style={styles.red}>AI</Text></Text>
            <View style={styles.taglineRow}>
              <View style={[styles.line,{backgroundColor:'#7C3AED'}]}/>
              <Text style={styles.tagline}>Smart  •  Secure  •  Powerful</Text>
              <View style={[styles.line,{backgroundColor:'#EF4444'}]}/>
            </View>
          </View>
          <LinearGradient colors={['#9A16FF','#2D7BFF','#FF234E']} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.frame}>
            <View style={styles.panel}>
              <View style={styles.shield}><Feather name="lock" size={22} color="#FFFFFF"/></View>
              <Text style={styles.loginTitle}>OWNER <Text style={styles.red}>LOGIN</Text></Text>
              <Text style={styles.subtitle}>Enter your Owner Token to access</Text>
              <Text style={styles.subtitle}>Badboy AI features</Text>
              <View style={styles.inputWrap}>
                <Feather name="key" size={20} color="#C7B9FF"/>
                <TextInput value={token} onChangeText={setToken} placeholder="Owner Token" placeholderTextColor="#77748A" autoCapitalize="none" autoCorrect={false} secureTextEntry={!showToken} textContentType="password" style={styles.input} editable={!busy} onSubmitEditing={()=>void handleSignIn()} returnKeyType="go"/>
                <Pressable onPress={()=>setShowToken(v=>!v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={showToken?'Hide token':'Show token'}><Feather name={showToken?'eye':'eye-off'} size={20} color="#C7B9FF"/></Pressable>
              </View>
              {error?<View style={styles.errorBox}><Feather name="alert-triangle" color="#FF536B" size={16}/><Text style={styles.errorText}>{error}</Text></View>:null}
              <Pressable onPress={()=>void handleSignIn()} disabled={busy||!token.trim()} style={({pressed})=>[styles.button,pressed&&{opacity:.82},(busy||!token.trim())&&{opacity:.55}]}>
                <LinearGradient colors={['#9B18FF','#5B32F5','#EF174C']} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.buttonGradient}>
                  {busy?<ActivityIndicator color="#FFFFFF"/>:<><Feather name="log-in" size={22} color="#FFFFFF"/><Text style={styles.buttonText}>Login Now</Text></>}
                </LinearGradient>
              </Pressable>
              <View style={styles.orRow}>
                <View style={[styles.line,{backgroundColor:'#3A2A5A'}]}/>
                <Text style={styles.orText}>OR</Text>
                <View style={[styles.line,{backgroundColor:'#3A2A5A'}]}/>
              </View>
              <View style={styles.warning}>
                <Feather name="alert-triangle" size={30} color="#FF344F"/>
                <View style={{flex:1}}>
                  <Text style={styles.warningText}>Without Owner Login,</Text>
                  <Text style={styles.warningRed}>You cannot access the main app!</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
          <View style={styles.features}>
            {FEATURES.map((item)=>(
              <View key={item.label} style={styles.feature}>
                <Feather name={item.icon} size={24} color={item.color}/>
                <Text style={styles.featureText}>{item.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.footerLine}>
            <View style={[styles.line,{backgroundColor:'#7C3AED'}]}/>
            <Text style={styles.version}>Badboy AI v1.0.0</Text>
            <View style={[styles.line,{backgroundColor:'#EF4444'}]}/>
          </View>
          <Text style={styles.footer}>Built for the Real Power Users...</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#03040A'},
 ambientPurple:{position:'absolute',top:30,left:-110,width:260,height:260,borderRadius:130,backgroundColor:'#6D00FF',opacity:.13},
 ambientRed:{position:'absolute',top:210,right:-130,width:260,height:260,borderRadius:130,backgroundColor:'#FF123F',opacity:.10},
 content:{paddingHorizontal:17,justifyContent:'center',gap:8},
 topRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
 think:{color:'#E4E4F0',fontSize:15,fontWeight:'900',fontStyle:'italic',letterSpacing:1,lineHeight:17},
 limits:{color:'#FF3158',fontSize:17,fontWeight:'900',fontStyle:'italic',letterSpacing:1,lineHeight:20},
 cornerBrand:{alignItems:'center',marginTop:4},
 cornerText:{color:'#F6F4FF',fontSize:22,fontWeight:'900',fontStyle:'italic',letterSpacing:-0.5},
 red:{color:'#FF284F'},
 hero:{height:220,width:'100%',alignSelf:'center'},
 brandWrap:{alignItems:'center',marginTop:-8,marginBottom:9},
 brand:{color:'#F6F4FF',fontSize:46,fontWeight:'900',fontStyle:'italic',letterSpacing:-1.5,textShadowColor:'#A100FF',textShadowRadius:15},
 taglineRow:{flexDirection:'row',alignItems:'center',gap:8,width:'100%',paddingHorizontal:6},
 line:{flex:1,height:1,opacity:.85},
 tagline:{color:'#D6CEE8',fontSize:14,fontWeight:'700',fontStyle:'italic',letterSpacing:.5},
 frame:{borderRadius:23,padding:2,shadowColor:'#8D1AFF',shadowOpacity:.7,shadowRadius:22,elevation:16},
 panel:{backgroundColor:'rgba(5,6,15,0.97)',borderRadius:21,paddingHorizontal:15,paddingTop:15,paddingBottom:14,alignItems:'center',borderWidth:1,borderColor:'#493064'},
 shield:{width:46,height:46,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#25143D',borderWidth:1,borderColor:'#8C36FF',marginBottom:6},
 loginTitle:{color:'#F6F3FF',fontSize:28,fontWeight:'900',fontStyle:'italic',letterSpacing:1},
 subtitle:{color:'#D0CCE0',fontSize:15,textAlign:'center',lineHeight:21},
 inputWrap:{width:'100%',height:56,marginTop:15,marginBottom:12,borderWidth:1,borderColor:'#6A2D91',borderRadius:13,backgroundColor:'#0C0C19',paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:10},
 input:{flex:1,color:'#FFFFFF',fontSize:16,paddingVertical:10},
 errorBox:{width:'100%',flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#35101D',borderRadius:10,padding:10,marginBottom:10},
 errorText:{color:'#FF9BAA',fontSize:12,flex:1},
 button:{width:'100%',borderRadius:13,overflow:'hidden',marginBottom:12,borderWidth:1,borderColor:'#B28CFF'},
 buttonGradient:{height:56,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12},
 buttonText:{color:'#FFFFFF',fontSize:22,fontWeight:'800',letterSpacing:.5},
 orRow:{width:'100%',flexDirection:'row',alignItems:'center',gap:12,marginBottom:12},
 orText:{color:'#D0CCE0',fontSize:16,fontWeight:'700'},
 warning:{width:'100%',flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:'#9C2547',borderRadius:12,padding:12,backgroundColor:'#160910'},
 warningText:{color:'#D4C5CC',fontSize:16,lineHeight:22},
 warningRed:{color:'#FF344F',fontSize:16,fontWeight:'700',lineHeight:22},
 features:{width:'100%',flexDirection:'row',borderWidth:1,borderColor:'#5B2DB0',borderRadius:16,paddingVertical:12,backgroundColor:'rgba(8,6,20,0.9)'},
 feature:{flex:1,alignItems:'center',gap:6,paddingHorizontal:4,borderRightWidth:1,borderColor:'#30233E'},
 featureText:{color:'#E4E0F5',fontSize:12,fontWeight:'600',textAlign:'center'},
 footerLine:{flexDirection:'row',alignItems:'center',gap:8,width:'100%',marginTop:6},
 version:{color:'#D946EF',fontSize:18,fontWeight:'800'},
 footer:{color:'#B7ADD0',fontSize:15,fontStyle:'italic',textAlign:'center'},
});
