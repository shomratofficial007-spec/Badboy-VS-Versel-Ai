import { fetch as expoFetch } from 'expo/fetch';
import { getCloudflareAccountId, getDefaultModel, getProvider, getProviderBaseUrl, getProviderKey, type ProviderId } from './providerManager';

export interface ProviderModel { id:string; name?:string; free:boolean|null; }
function safeError(status:number,body:string){let message='';try{const parsed=JSON.parse(body);message=parsed?.error?.message||parsed?.message||parsed?.error||'';}catch{/* Provider error payload was not valid JSON. */}return (String(message||'').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').slice(0,220)||'Request failed')+' (HTTP '+status+')';}
async function request(url:string,init:RequestInit,timeout=18000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);try{return await expoFetch(url,{...init,signal:controller.signal});}catch(e){if(controller.signal.aborted)throw new Error('Connection timed out. Check server/network and try again.');throw e;}finally{clearTimeout(timer);}}
export async function testProviderConnection(id:ProviderId):Promise<{ok:boolean;message:string;models:ProviderModel[]}>{
 const provider=getProvider(id);const key=await getProviderKey(id);if(!provider||!key)throw new Error('Provider configuration বা API Key পাওয়া যায়নি।');
 const base=(await getProviderBaseUrl(id)).replace(/\/+$/,'');
 if(id==='cloudflare'){const account=await getCloudflareAccountId();if(!account)throw new Error('Cloudflare Account ID যোগ করতে হবে।');const r=await request(base+'/accounts/'+account+'/ai/models/search?per_page=20',{headers:{Authorization:'Bearer '+key}});const t=await r.text();if(!r.ok)throw new Error(safeError(r.status,t));const j=JSON.parse(t);return{ok:true,message:'Cloudflare authentication successful; model catalog loaded.',models:(j.result||[]).map((x:any)=>({id:x.name,name:x.name,free:null}))};}
 if(provider.compatible==='gemini'){const r=await request(base+'/models?key='+encodeURIComponent(key),{});const t=await r.text();if(!r.ok)throw new Error(safeError(r.status,t));const j=JSON.parse(t);return{ok:true,message:'Gemini API key verified.',models:(j.models||[]).filter((x:any)=>Array.isArray(x.supportedGenerationMethods)&&x.supportedGenerationMethods.includes('generateContent')).map((x:any)=>({id:x.name.replace(/^models\//,''),name:x.displayName,free:null}))};}
 if(provider.compatible==='cohere'){const r=await request(base+'/v1/models?limit=100',{headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'}});const t=await r.text();if(!r.ok)throw new Error(safeError(r.status,t));const j=JSON.parse(t);return{ok:true,message:'Cohere API key verified.',models:(j.models||[]).map((x:any)=>({id:x.name,name:x.name,free:null}))};}
 const r=await request(base+'/models',{headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'}});const t=await r.text();if(!r.ok)throw new Error(safeError(r.status,t));const j=JSON.parse(t);const items=Array.isArray(j.data)?j.data:(Array.isArray(j.models)?j.models:[]);return{ok:true,message:'API key verified; model catalog loaded.',models:items.map((x:any)=>({id:String(x.id||x.name||x.model),name:x.name||x.id,free:id==='openrouter'&&String(x.id||'').endsWith(':free')?true:null}))};
}
export async function streamProviderReply(message:string,onChunk:(chunk:string)=>void):Promise<boolean>{
 const selected=await getDefaultModel();if(!selected)return false;
 const provider=getProvider(selected.providerId);const key=await getProviderKey(selected.providerId);if(!provider||!key)return false;
 const base=(await getProviderBaseUrl(selected.providerId)).replace(/\/+$/,'');
 if(provider.compatible==='gemini'){
  const url=base+'/models/'+encodeURIComponent(selected.modelId)+':generateContent?key='+encodeURIComponent(key);
  const r=await request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:message}]}]})},45000);const t=await r.text();if(!r.ok)throw new Error(safeError(r.status,t));const j=JSON.parse(t);const answer=(j.candidates||[]).flatMap((c:any)=>c.content?.parts||[]).map((p:any)=>p.text||'').join('');if(!answer)throw new Error('Gemini returned an empty response.');onChunk(answer);return true;
 }
 if(provider.compatible==='cohere'){
  const r=await request(base+'/v2/chat',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:selected.modelId,messages:[{role:'user',content:message}]})},45000);const t=await r.text();if(!r.ok)throw new Error(safeError(r.status,t));const j=JSON.parse(t);const answer=(j.message?.content||[]).map((x:any)=>x.text||'').join('');if(!answer)throw new Error('Cohere returned an empty response.');onChunk(answer);return true;
 }
 if(provider.compatible==='cloudflare'){
  const account=await getCloudflareAccountId();if(!account)throw new Error('Cloudflare Account ID is required.');const r=await request(base+'/accounts/'+account+'/ai/run/'+encodeURIComponent(selected.modelId),{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:message}]})},45000);const t=await r.text();if(!r.ok)throw new Error(safeError(r.status,t));const j=JSON.parse(t);const answer=j.result?.response||j.result?.output||'';if(!answer)throw new Error('Cloudflare returned an empty response.');onChunk(answer);return true;
 }
 const r=await request(base+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:selected.modelId,messages:[{role:'user',content:message}],stream:true})},60000);
 if(!r.ok)throw new Error(safeError(r.status,await r.text()));
 const reader=r.body?.getReader();if(!reader)throw new Error('Provider stream is unavailable.');
 const decoder=new TextDecoder();let buffer='';let complete=false;
 while(!complete){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const payload=line.slice(5).trim();if(payload==='[DONE]'){complete=true;break;}try{const event=JSON.parse(payload);const chunk=event.choices?.[0]?.delta?.content;if(typeof chunk==='string'&&chunk)onChunk(chunk);}catch{/* Ignore non-JSON SSE keepalive/comment lines. */}}}
 return true;
}
