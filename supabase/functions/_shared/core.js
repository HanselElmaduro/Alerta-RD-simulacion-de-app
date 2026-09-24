// Framework-independent handlers. Tests inject the database and a fake transport.
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const list=v=>(v||'').split(',').map(x=>x.trim()).filter(Boolean);
export function settings(env){
 const test=env('SOS_TEST_ONLY')!=='false';
 const required=['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_API_VERSION',test?'WHATSAPP_TEST_TEMPLATE_NAME':'WHATSAPP_TEMPLATE_NAME','WHATSAPP_TEMPLATE_LANGUAGE'];
 if(test)required.push('SOS_ALLOWED_PHONES','SOS_AUTHORIZED_USER_IDS');
 const missing=required.filter(k=>!env(k));
 if(env('WHATSAPP_API_VERSION')&&!/^v\d+\.\d+$/.test(env('WHATSAPP_API_VERSION')))missing.push('WHATSAPP_API_VERSION_INVALID');
 if(env('WHATSAPP_PHONE_NUMBER_ID')&&!/^\d+$/.test(env('WHATSAPP_PHONE_NUMBER_ID')))missing.push('WHATSAPP_PHONE_NUMBER_ID_INVALID');
 return {enabled:env('SOS_ENABLED')==='true',test,missing,phones:list(env('SOS_ALLOWED_PHONES')),users:list(env('SOS_AUTHORIZED_USER_IDS'))};
}
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});
async function readBody(req,max=4096){const raw=await req.text();if(raw.length>max)throw Error('Solicitud demasiado grande');return JSON.parse(raw||'{}');}
export function strictBody(b,keys){if(!b||Array.isArray(b)||typeof b!=='object'||Object.keys(b).some(k=>!keys.includes(k)))throw Error('Campos de solicitud no permitidos');}
export function validLocation(lat,lng){return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180;}
export async function apiHandler(req,{db,env,auth}){
 const origin=req.headers.get('origin');
 const origins=list(env('ALLOWED_ORIGINS')||'https://alerta-rd-simulacion-de-app.vercel.app,https://alerta-rd-demo-interactiva.hanselh151.chatgpt.site,http://localhost:3000');
 if(origin&&!origins.includes(origin))return json({error:'Origen no autorizado'},403);
 const cors=origin?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'POST,OPTIONS'}:{};
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:'Método no permitido'},405,cors);
 try{
   const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
   if(!token)return json({error:'Inicia sesión para continuar'},401,cors);
   const user=await auth(token);
   if(!user||user.is_anonymous||!user.email_confirmed_at)return json({error:'Necesitas una cuenta con correo confirmado'},401,cors);
   const b=await readBody(req);const s=settings(env);
   if(b.action==='health'){
     strictBody(b,['action']);
     const worker=await db.health();
     return json({enabled:s.enabled,authorizedTest:s.test,ready:s.enabled&&!s.missing.length&&worker&&(!s.test||s.users.includes(user.id)),missing:s.missing,worker,authorizedUser:!s.test||s.users.includes(user.id)},200,cors);
   }
   if(b.action==='create'){
     strictBody(b,['action','requestId']);
     if(!UUID.test(b.requestId||''))throw Error('Identificador de solicitud inválido');
     // Resolve an ambiguous previous response before checking switches. Never create a second event.
     const existing=await db.existing(user.id,b.requestId);
     if(existing)return json({event:existing,serverTime:Date.now()},200,cors);
     if(!s.enabled||s.missing.length||!(await db.health()))return json({error:'El envío real todavía no está habilitado o el procesador no está disponible'},503,cors);
     if(s.test&&!s.users.includes(user.id))return json({error:'Esta cuenta no está autorizada para la prueba real'},403,cors);
     if(s.test){const contacts=await db.contacts(user.id);if(contacts.some(c=>c.whatsapp_opt_in&&!s.phones.includes(c.phone)))return json({error:'Hay contactos fuera de la lista de números autorizados. Actualiza los contactos antes de la prueba.'},403,cors);}
     const event=await db.create(user.id,b.requestId,s.test);
     return json({event,serverTime:Date.now()},200,cors);
   }
   if(b.action==='cancel'){
     strictBody(b,['action','eventId']);if(!UUID.test(b.eventId||''))throw Error('SOS inválido');
     return json({event:await db.cancel(user.id,b.eventId),serverTime:Date.now()},200,cors);
   }
   if(b.action==='location'){
     strictBody(b,['action','eventId','latitude','longitude']);
     if(!UUID.test(b.eventId||'')||!validLocation(b.latitude,b.longitude))throw Error('Ubicación inválida');
     return json({saved:await db.location(user.id,b.eventId,b.latitude,b.longitude)},200,cors);
   }
   return json({error:'Acción desconocida'},400,cors);
 }catch(error){
   // Only our database errors; no provider response bodies, credentials or tokens.
   const message=String(error?.message||'No se pudo procesar la solicitud');
   const safe=/^(Ya hay|Límite de|Completa tu|Agrega un|SOS no encontrado|El plazo terminó|Identificador|SOS inválido|Ubicación inválida|Campos de|Solicitud demasiado)/.test(message);
   return json({error:safe?message:'No se pudo completar la solicitud. Consulta el historial antes de volver a intentarlo.'},safe?409:500,cors);
 }
}
export function templatePayload(event,delivery,env){
 const timestamp=new Intl.DateTimeFormat('es-DO',{dateStyle:'medium',timeStyle:'long',timeZone:'America/Santo_Domingo'}).format(new Date(event.created_at));
 const place=validLocation(event.latitude,event.longitude)?`https://www.google.com/maps?q=${event.latitude},${event.longitude}`:'Ubicación no disponible';
 return {messaging_product:'whatsapp',recipient_type:'individual',to:delivery.phone.replace(/^\+/,''),type:'template',biz_opaque_callback_data:delivery.id,
   template:{name:env(event.authorized_test?'WHATSAPP_TEST_TEMPLATE_NAME':'WHATSAPP_TEMPLATE_NAME'),language:{code:env('WHATSAPP_TEMPLATE_LANGUAGE')},components:[{type:'body',parameters:[event.name,timestamp,place].map(text=>({type:'text',text}))}]}};
}
export async function sendWhatsApp(event,delivery,{env,fetcher=fetch}){
 try{
   const response=await fetcher(`https://graph.facebook.com/${env('WHATSAPP_API_VERSION')}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`,{
     method:'POST',headers:{'Authorization':`Bearer ${env('WHATSAPP_ACCESS_TOKEN')}`,'Content-Type':'application/json'},
     body:JSON.stringify(templatePayload(event,delivery,env)),signal:AbortSignal.timeout(10000)
   });
   const data=await response.json().catch(()=>({}));
   if(response.ok&&typeof data.messages?.[0]?.id==='string')return {status:'accepted',message:data.messages[0].id,error:null};
   // 5xx or malformed success can conceal acceptance. Never retry automatically.
   const uncertain=response.status>=500||response.ok;
   return {status:uncertain?'unknown':'failed',message:null,error:`META_${Number(data.error?.code)||response.status}`};
 }catch{return {status:'unknown',message:null,error:'NETWORK_OR_TIMEOUT'};}
}
export async function dispatchHandler(req,{db,env,fetcher}){
 if(req.method!=='POST')return json({error:'Método no permitido'},405);
 const token=req.headers.get('x-dispatch-token');
 if(!token||token.length>128||!(await db.authorizeWorker(token)))return json({error:'No autorizado'},401);
 const events=await db.claim();const s=settings(env);
 for(const event of events){
   const deliveries=await db.deliveries(event.id);
   await Promise.all(deliveries.map(async d=>{
     // Atomic queued -> sending. Two invocations cannot both POST this delivery.
     if(!(await db.beginDelivery(d.id)))return;
     let error;
     if(!s.enabled||s.missing.length)error='SENDING_DISABLED';
     else if(event.authorized_test!==s.test)error='MODE_CHANGED';
     else if(s.test&&(!s.users.includes(event.user_id)||!s.phones.includes(d.phone)))error='TEST_NOT_AUTHORIZED';
     else if(!(await db.contactStillConsents(d)))error='CONTACT_REMOVED_OR_CONSENT_REVOKED';
     const result=error?{status:'failed',message:null,error}:await sendWhatsApp(event,d,{env,fetcher});
     await db.result(d.id,result);
   }));
   await db.finish(event.id);
 }
 return json({processed:events.length});
}
export async function validSignature(raw,signature,secret){
 if(!secret||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=new Uint8Array(signature.slice(7).match(/../g).map(x=>parseInt(x,16)));
 return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(raw));
}
export async function webhookHandler(req,{env,db}){
 if(req.method==='GET'){
   const q=new URL(req.url).searchParams;
   if(env('WHATSAPP_WEBHOOK_VERIFY_TOKEN')&&q.get('hub.mode')==='subscribe'&&q.get('hub.verify_token')===env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'))return new Response(q.get('hub.challenge')||'');
   return new Response('Forbidden',{status:403});
 }
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!env('META_APP_SECRET')||!env('WHATSAPP_BUSINESS_ACCOUNT_ID'))return new Response('Not configured',{status:503});
 const raw=await req.text();
 if(raw.length>262144)return new Response('Too large',{status:413});
 if(!(await validSignature(raw,req.headers.get('x-hub-signature-256'),env('META_APP_SECRET'))))return new Response('Invalid signature',{status:401});
 try{
   const body=JSON.parse(raw);if(body.object!=='whatsapp_business_account')return new Response('Ignored');
   for(const entry of body.entry||[]){
     if(entry.id!==env('WHATSAPP_BUSINESS_ACCOUNT_ID'))continue;
     for(const change of entry.changes||[]){
       if(change.field!=='messages'||change.value?.metadata?.phone_number_id!==env('WHATSAPP_PHONE_NUMBER_ID'))continue;
       for(const s of change.value.statuses||[]){
         if(!['sent','delivered','read','failed'].includes(s.status)||!/^\d{7,15}$/.test(s.recipient_id)||typeof s.id!=='string'||!/^\d{1,12}$/.test(s.timestamp))continue;
         await db.webhook({id:UUID.test(s.biz_opaque_callback_data||'')?s.biz_opaque_callback_data:null,message:s.id,phone:'+'+s.recipient_id,status:s.status,at:new Date(Number(s.timestamp)*1000).toISOString(),error:s.errors?.[0]?.code?`META_${Number(s.errors[0].code)}`:null});
       }
     }
   }
   return new Response('OK');
 }catch{return new Response('Retry later',{status:503});}
}
