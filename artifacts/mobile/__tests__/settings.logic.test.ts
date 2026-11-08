import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const pressables: Array<{label:string;onPress:()=>void}>=[];
const switches: Array<{label:string;onValueChange:(value:boolean)=>void}>=[];
const inputs: Array<{placeholder:string;onChangeText:(value:string)=>void}>=[];
const alerts: Array<{title:string;buttons:any[]}>=[];
const updates: Array<Record<string,unknown>>=[];
const calls: Record<string,any[]>={speak:[],stop:[],agent:[],expert:[],share:[],links:[],analysis:[]};
const stateSlots:unknown[]=[];
let stateCursor=0;
const settings:any={personality:'Helpful and concise',onlineAI:true,developerEngine:'auto',theme:'badboy',autoImprove:false,developerMode:true,voiceProcessingConsent:false,voiceInputEnabled:true,voiceOutputEnabled:true,autoSpeakReplies:false,autoSubmitVoice:false,wakeWordEnabled:false,voiceLanguage:'bn-BD',voiceIdentifier:null,roadmap:{webDevelopment:false,appDevelopment:false,selfDevelopment:false,autonomousAgent:false,projectBrain:false,autoQA:false,pluginMarketplace:false,providerManager:false,automationHub:false,releaseRecovery:false,integrations:false,localMemoryControls:false}};
mock.method(React,'useState',(initial:unknown)=>{
 const i=stateCursor++;
 if(!(i in stateSlots)) stateSlots[i]=typeof initial==='function'?(initial as ()=>unknown)():initial;
 return [stateSlots[i],(next:unknown)=>{stateSlots[i]=typeof next==='function'?(next as (v:unknown)=>unknown)(stateSlots[i]):next;}];
});
const childText=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(childText).join(' '):React.isValidElement(node)?childText((node.props as any).children):'';
const host=(tag:string)=>function Host({children,accessibilityLabel,placeholder,disabled,onPress,onValueChange,onChangeText}:any){
 const label=accessibilityLabel??childText(children);
 if(tag==='button'&&typeof onPress==='function')pressables.push({label,onPress});
 if(typeof onValueChange==='function')switches.push({label,onValueChange});
 if(typeof onChangeText==='function')inputs.push({placeholder:placeholder??'',onChangeText});
 return React.createElement(tag,{...(accessibilityLabel?{'aria-label':accessibilityLabel}:{}),...(placeholder?{placeholder}:{}),...(typeof disabled==='boolean'?{disabled}:{})},children);
};
const colors={card:'#111',border:'#333',background:'#000',primary:'#00d9ff',primaryForeground:'#000',foreground:'#fff',mutedForeground:'#aaa',input:'#444',secondary:'#222',destructive:'#f44',secondaryForeground:'#fff',accent:'#333',accentForeground:'#fff'};
let voices:any[]=[{identifier:'bn-v',name:'Bangla Voice',language:'bn-BD'},{identifier:'en-v',name:'English Voice',language:'en-US'}];
let agentResults:any[]=[
 {state:'permission_pending',prompt:'open YouTube',summary:'Needs confirmation',detectedLanguage:'en',requiresInternet:true,confirmationMessage:'Confirm action',logs:['Awaiting approval']},
 {state:'completed',prompt:'open YouTube',summary:'Opened search',detectedLanguage:'en',requiresInternet:true,outputData:{action:'open_youtube_search',query:'Badboy AI'},logs:['Done'],latencyMs:12},
];
let expertFailure:unknown=null,shareFailure=false;
mock.module('react-native',{namedExports:{
 ActivityIndicator:()=>React.createElement('span',null,'loading'),
 Alert:{alert:(title:string,_message:string,buttons:any[]=[])=>(alerts.push({title,buttons}))},
 Linking:{openURL:async(url:string)=>{calls.links.push(url);}},Platform:{OS:'android'},
 Pressable:host('button'),ScrollView:host('main'),
 Share:{share:async(value:any)=>{calls.share.push(value);if(shareFailure)throw new Error('share failed');return{};}},
 StyleSheet:{create:(value:unknown)=>value},Switch:host('input'),Text:host('span'),TextInput:host('input'),View:host('section'),
}});
mock.module('@expo/vector-icons',{namedExports:{Feather:()=>null}});
mock.module('react-native-safe-area-context',{namedExports:{useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}});
mock.module('../context/AssistantContext.tsx',{namedExports:{useAssistant:()=>({settings,updateSettings:(value:Record<string,unknown>)=>{updates.push(value);Object.assign(settings,value);},clearChat:async()=>{},expertReviewDraft:'',clearExpertReviewDraft:()=>{}})}});
mock.module('../context/OwnerAuthContext.tsx',{namedExports:{useOwnerAuth:()=>({signOut:async()=>{}})}});
mock.module('../hooks/useColors.ts',{namedExports:{useColors:()=>colors}});
mock.module('../lib/assistant/voice.ts',{namedExports:{
 VOICE_LANGUAGES:[{code:'bn-BD',label:'বাংলা (বাংলাদেশ)'},{code:'en-US',label:'English (US)'},{code:'hi-IN',label:'Hindi'}],
 getAvailableSpeechVoices:async()=>voices,speak:async(...args:any[])=>{calls.speak.push(args);},stopSpeaking:async()=>{calls.stop.push(true);},
}});
mock.module('../lib/assistant/api.ts',{namedExports:{
 streamDeveloperAnalysis:async(_p:string,_c:string,_e:string,chunk:(v:string)=>void)=>{calls.analysis.push([_p,_c,_e]);chunk('Analysis result');return{taskId:'task-42'};},
 streamReply:async(_p:string,_s:any,chunk:(v:string)=>void)=>{calls.expert.push(_p);chunk('Expert report');if(expertFailure)throw expertFailure;},
}});
mock.module('../lib/assistant/developerData.ts',{namedExports:{
 addDeveloperProjectMemory:async()=>{},deleteDeveloperProjectMemory:async()=>{},getAnalysisProjectNotes:(items:any[])=>items.filter(x=>x.privacy_level!=='sensitive').map(x=>x.content),
 listDeveloperProjectMemory:async()=>[{memory_id:'m1',content:'Private note',privacy_level:'private',updated_at:'2026-01-01'}],
 listDeveloperProjects:async()=>[{project_id:'p1',name:'Badboy'}],listDeveloperTasks:async()=>[],saveDeveloperProject:async()=>({projectId:'p1'}),
}});
mock.module('../lib/assistant/expertReview.ts',{namedExports:{buildExpertReviewPrompt:(v:string)=>'Review: '+v,inspectBadboyRepository:async()=>({status:'verified',filePaths:['settings.tsx'],note:'Repository checked'})}});
mock.module('../lib/assistant/telegram.ts',{namedExports:{checkTelegramMessages:async()=>[],connectTelegramBot:async()=>({username:'badboy_bot'}),disconnectTelegramBot:async()=>{},hasTelegramBot:async()=>false,sendTelegramMessage:async()=>{}}});
mock.module('../lib/assistant/developer.ts',{namedExports:{
 createGitHubPullRequest:async()=>({success:true,prUrl:'https://github.com/example/repo/pull/1',prNumber:1,summary:'Created',logs:['PR ready']}),
 executeAgentTask:async(...args:any[])=>{calls.agent.push(args);return agentResults.shift();},
 generateDevelopmentPlan:(p:string)=>({title:'Test plan',category:'web',featureDescription:p,filesToModify:['settings.tsx'],tasks:[{id:'t1',title:'Regression test'}],securityNotes:'No deploy without approval',branchName:'test/settings'}),
 getGitHubToken:async()=>null,getPluginRegistryStatus:()=>[],getProjectBrainSummary:()=>({name:'Badboy',architecture:'Worker + Expo',frameworks:['Expo'],apiEndpoints:[],knownLimitations:[]}),
 removeGitHubToken:async()=>{},runAutoQASuite:()=>({details:['Smoke test passed']}),saveGitHubToken:async()=>{},
}});
mock.module('../lib/assistant/developerEngine.ts',{namedExports:{resolveDeveloperEngine:(engine:string)=>engine==='copilot'?{status:'unavailable',reason:'Copilot runtime is not configured'}:{status:'available',activeEngine:'native'}}});

const screenPromise=import('../app/(tabs)/settings');
const tick=async()=>{await new Promise(resolve=>setTimeout(resolve,0));};
const reset=()=>{
 stateSlots.length=0;stateCursor=0;pressables.length=0;switches.length=0;inputs.length=0;alerts.length=0;updates.length=0;
 for(const value of Object.values(calls))value.length=0;
 settings.personality='Helpful and concise';settings.onlineAI=true;settings.developerEngine='auto';settings.theme='badboy';settings.developerMode=true;settings.voiceLanguage='bn-BD';settings.voiceIdentifier=null;
 voices=[{identifier:'bn-v',name:'Bangla Voice',language:'bn-BD'},{identifier:'en-v',name:'English Voice',language:'en-US'}];
 agentResults=[
  {state:'permission_pending',prompt:'open YouTube',summary:'Needs confirmation',detectedLanguage:'en',requiresInternet:true,confirmationMessage:'Confirm action',logs:['Awaiting approval']},
  {state:'completed',prompt:'open YouTube',summary:'Opened search',detectedLanguage:'en',requiresInternet:true,outputData:{action:'open_youtube_search',query:'Badboy AI'},logs:['Done'],latencyMs:12},
 ];
 expertFailure=null;shareFailure=false;
};
const render=async()=>{const{default:Screen}=await screenPromise;hookCursor=0;return renderToStaticMarkup(React.createElement(Screen));};
const getInput=(placeholder:string)=>{const found=inputs.find(x=>x.placeholder===placeholder);assert.ok(found,'missing input '+placeholder);return found;};
const press=(label:string)=>{const found=pressables.find(x=>x.label.includes(label));assert.ok(found,'missing button '+label);return found.onPress;};

test('Settings personality save trims text and uses fallback for an empty draft',async()=>{
 reset();await render();getInput('কেমনভাবে উত্তর দেবে?').onChangeText('  Speak naturally in Bangla  ');await render();press('ব্যক্তিত্ব সংরক্ষণ')();
 assert.deepEqual(updates.at(-1),{personality:'Speak naturally in Bangla'});
 reset();await render();getInput('কেমনভাবে উত্তর দেবে?').onChangeText('   ');await render();press('ব্যক্তিত্ব সংরক্ষণ')();
 assert.deepEqual(updates.at(-1),{personality:'Warm, clear, and practical.'});
});

test('Settings language search is case-insensitive and voice preview uses the selected voice',async()=>{
 reset();await render();getInput('ভাষা খুঁজুন / Search language...').onChangeText('ENGLISH');
 const html=await render();assert.match(html,/English \(US\)/);assert.doesNotMatch(html,/বাংলা \(বাংলাদেশ\)/);
 press('English (US)')();assert.deepEqual(updates.at(-1),{voiceLanguage:'en-US',voiceIdentifier:null});
 await render();press('Bangla Voice')();assert.deepEqual(updates.at(-1),{voiceIdentifier:'bn-v'});
 press('নমুনা শুনুন: Bangla Voice')();assert.equal(calls.speak.length,1);assert.equal(calls.speak[0][3],'bn-v');
 press('নমুনা বন্ধ করুন')();assert.equal(calls.stop.length,1);
});

test('Settings agent requires approval before opening a YouTube search',async()=>{
 reset();await render();press('টাস্ক রান করুন')();assert.equal(calls.agent.length,0);
 getInput('যেমন: Search Cloudflare Pages docs / Play a song on YouTube').onChangeText('open YouTube');await render();press('টাস্ক রান করুন')();await tick();
 let html=await render();assert.match(html,/Confirm action/);assert.equal(calls.agent.length,1);assert.equal(calls.agent[0][2],false);
 press('অনুমতি দিন ও সম্পাদন করুন')();await tick();html=await render();assert.match(html,/COMPLETED/);
 assert.equal(calls.agent.length,2);assert.equal(calls.agent[1][2],true);
 assert.deepEqual(calls.links,['https://www.youtube.com/results?search_query=Badboy%20AI']);
});

test('Settings Expert Review displays provider errors and catches report sharing failures',async()=>{
 reset();await render();getInput('Badboy-এর উত্তর, কোড বা Error এখানে paste করো…').onChangeText('Review this code');await render();press('Expert Review চালাও')();await tick();
 let html=await render();assert.match(html,/Expert report/);assert.match(html,/Repository: VERIFIED/);
 press('রিপোর্ট শেয়ার করুন')();await tick();assert.equal(calls.share.length,1);
 reset();expertFailure=new Error('provider unavailable');await render();getInput('Badboy-এর উত্তর, কোড বা Error এখানে paste করো…').onChangeText('Review this');await render();press('Expert Review চালাও')();await tick();
 html=await render();assert.match(html,/provider unavailable/);
 reset();shareFailure=true;await render();getInput('Badboy-এর উত্তর, কোড বা Error এখানে paste করো…').onChangeText('Review this');await render();press('Expert Review চালাও')();await tick();await render();press('রিপোর্ট শেয়ার করুন')();await tick();
 html=await render();assert.match(html,/রিপোর্ট শেয়ার করা যায়নি/);
});

test('Settings rejects unavailable Copilot and completes Native analysis retry',async()=>{
 reset();await render();press('Copilot SDK')();getInput('যেমন: Developer Mode-এর পরবর্তী কাজগুলো বিশ্লেষণ করে নিরাপদ implementation plan তৈরি করো…').onChangeText('Review Settings coverage');await render();
 press('Analyze with selected engine')();let html=await render();assert.match(html,/Copilot runtime is not configured/);assert.equal(calls.analysis.length,0);
 press('একই Task Native দিয়ে Retry করুন')();await tick();html=await render();assert.match(html,/Analysis result/);assert.match(html,/Task ID: task-42/);
 assert.equal(calls.analysis.length,1);assert.equal(calls.analysis[0][2],'native');
});
