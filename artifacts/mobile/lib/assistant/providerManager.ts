import * as SecureStore from 'expo-secure-store';

export type ProviderId = 'gemini'|'groq'|'cerebras'|'sambanova'|'mistral'|'openrouter'|'cloudflare'|'cohere'|'nvidia'|'omniroute'|'custom';
export type FreeTierKind = 'free-tier'|'trial'|'quota'|'account-dependent'|'self-hosted';
export interface ProviderDefinition { id: ProviderId; name: string; description: string; freeTier: FreeTierKind; baseUrl: string; docsUrl: string; compatible: 'openai'|'gemini'|'cohere'|'cloudflare'; modelsPath?: string; }
export const PROVIDERS: ProviderDefinition[] = [
{id:'gemini',name:'Google Gemini',description:'Free-tier eligible models; quota varies',freeTier:'free-tier',baseUrl:'https://generativelanguage.googleapis.com/v1beta',docsUrl:'https://ai.google.dev/gemini-api/docs',compatible:'gemini'},
{id:'groq',name:'Groq',description:'Developer free tier; rate limits apply',freeTier:'free-tier',baseUrl:'https://api.groq.com/openai/v1',docsUrl:'https://console.groq.com/docs',compatible:'openai'},
{id:'cerebras',name:'Cerebras',description:'Free/trial access varies by account',freeTier:'trial',baseUrl:'https://api.cerebras.ai/v1',docsUrl:'https://inference-docs.cerebras.ai/',compatible:'openai'},
{id:'sambanova',name:'SambaNova',description:'Developer access and limits vary',freeTier:'free-tier',baseUrl:'https://api.sambanova.ai/v1',docsUrl:'https://docs.sambanova.ai/',compatible:'openai'},
{id:'mistral',name:'Mistral',description:'Experimentation tier; limits apply',freeTier:'free-tier',baseUrl:'https://api.mistral.ai/v1',docsUrl:'https://docs.mistral.ai/',compatible:'openai'},
{id:'openrouter',name:'OpenRouter',description:'Free models explicitly marked :free',freeTier:'free-tier',baseUrl:'https://openrouter.ai/api/v1',docsUrl:'https://openrouter.ai/docs',compatible:'openai'},
{id:'cloudflare',name:'Cloudflare Workers AI',description:'Requires Account ID + API token; quota-based',freeTier:'quota',baseUrl:'https://api.cloudflare.com/client/v4',docsUrl:'https://developers.cloudflare.com/workers-ai/',compatible:'cloudflare'},
{id:'cohere',name:'Cohere',description:'Trial limits; uses native Chat API',freeTier:'trial',baseUrl:'https://api.cohere.com',docsUrl:'https://docs.cohere.com/',compatible:'cohere'},
{id:'nvidia',name:'NVIDIA NIM',description:'Availability and credits depend on account',freeTier:'account-dependent',baseUrl:'https://integrate.api.nvidia.com/v1',docsUrl:'https://docs.nvidia.com/nim/',compatible:'openai'},
{id:'omniroute',name:'OmniRoute (Termux)',description:'Local router; same-phone URL uses 127.0.0.1',freeTier:'self-hosted',baseUrl:'http://127.0.0.1:20128/v1',docsUrl:'https://github.com/Deep-orbit/OmniRoute',compatible:'openai'},
{id:'custom',name:'Custom Provider',description:'নিজের HTTPS OpenAI-compatible API endpoint',freeTier:'account-dependent',baseUrl:'',docsUrl:'',compatible:'openai'},
];
const KEY='badboy.ai.provider-key.', BASE='badboy.ai.provider-base.', ACCOUNT='badboy.ai.provider-account.', DEFAULT='badboy.ai.default-model.v2', CUSTOM='badboy.ai.custom-models.v2';
export interface ModelChoice {providerId:ProviderId;modelId:string;label:string;}
export async function saveProviderKey(id:ProviderId,key:string){if(!key.trim())throw new Error('API Key ফাঁকা রাখা যাবে না।');await SecureStore.setItemAsync(KEY+id,key.trim());}
export async function getProviderKey(id:ProviderId){return SecureStore.getItemAsync(KEY+id);}
export async function removeProviderKey(id:ProviderId){await SecureStore.deleteItemAsync(KEY+id);await SecureStore.deleteItemAsync(BASE+id);await SecureStore.deleteItemAsync(ACCOUNT+id);}
export async function getProviderBaseUrl(id:ProviderId){return (await SecureStore.getItemAsync(BASE+id))||(PROVIDERS.find(p=>p.id===id)?.baseUrl??'');}
export async function saveProviderBaseUrl(id:ProviderId,url:string){const value=url.trim().replace(/\/+$/,'');if(!/^https:\/\//i.test(value)&&!(id==='omniroute'&&/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(value)))throw new Error('Remote endpoint-এ HTTPS বাধ্যতামূলক। HTTP শুধু local loopback-এ অনুমোদিত।');await SecureStore.setItemAsync(BASE+id,value);}
export async function saveCloudflareAccountId(value:string){if(!/^[a-f0-9]{32}$/i.test(value.trim()))throw new Error('Cloudflare Account ID অবশ্যই 32-character hex হতে হবে।');await SecureStore.setItemAsync(ACCOUNT+'cloudflare',value.trim());}
export async function getCloudflareAccountId(){return SecureStore.getItemAsync(ACCOUNT+'cloudflare');}
export async function getConnectedProviderIds():Promise<ProviderId[]>{const values=await Promise.all(PROVIDERS.map(async p=>({id:p.id,key:await getProviderKey(p.id)})));return values.filter(x=>!!x.key).map(x=>x.id);}
export function getProvider(id:ProviderId){return PROVIDERS.find(p=>p.id===id);}
export async function saveDefaultModel(choice:ModelChoice){await SecureStore.setItemAsync(DEFAULT,JSON.stringify(choice));}
export async function getDefaultModel():Promise<ModelChoice|null>{const raw=await SecureStore.getItemAsync(DEFAULT);if(!raw)return null;try{return JSON.parse(raw) as ModelChoice;}catch{return null;}}
export async function saveCustomModels(items:ModelChoice[]){await SecureStore.setItemAsync(CUSTOM,JSON.stringify(items));}
export async function getCustomModels():Promise<ModelChoice[]>{const raw=await SecureStore.getItemAsync(CUSTOM);if(!raw)return[];try{return JSON.parse(raw) as ModelChoice[];}catch{return[];}}

const DISCOVERED='badboy.ai.discovered-models.v1';
export async function saveDiscoveredModels(providerId:ProviderId,models:ModelChoice[]){const all=await getAllDiscoveredModels();await SecureStore.setItemAsync(DISCOVERED,JSON.stringify({...all,[providerId]:models}));}
export async function getAllDiscoveredModels():Promise<Partial<Record<ProviderId,ModelChoice[]>>>{const raw=await SecureStore.getItemAsync(DISCOVERED);if(!raw)return{};try{return JSON.parse(raw) as Partial<Record<ProviderId,ModelChoice[]>>;}catch{return{};}}
