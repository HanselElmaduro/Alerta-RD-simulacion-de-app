import test from 'node:test';
import assert from 'node:assert/strict';
import {apiHandler,dispatchHandler,sendWhatsApp,templatePayload,validSignature,webhookHandler,settings} from '../supabase/functions/_shared/core.js';
const user='11111111-1111-4111-8111-111111111111', requestId='22222222-2222-4222-8222-222222222222',eventId='33333333-3333-4333-8333-333333333333',deliveryId='44444444-4444-4444-8444-444444444444';
const authorized={id:user,email_confirmed_at:'2026-09-01',is_anonymous:false};
const vars={SOS_ENABLED:'true',SOS_TEST_ONLY:'true',SOS_ALLOWED_PHONES:'+12025550100',SOS_AUTHORIZED_USER_IDS:user,WHATSAPP_ACCESS_TOKEN:'FAKE_TOKEN_FOR_UNIT_TEST',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_API_VERSION:'v99.0',WHATSAPP_TEMPLATE_NAME:'sos',WHATSAPP_TEST_TEMPLATE_NAME:'sos_prueba',WHATSAPP_TEMPLATE_LANGUAGE:'es',ALLOWED_ORIGINS:'https://demo.test',META_APP_SECRET:'fake-hmac-key',WHATSAPP_BUSINESS_ACCOUNT_ID:'456',WHATSAPP_WEBHOOK_VERIFY_TOKEN:'fake-verify'};
const env=k=>vars[k]||'';
const event={id:eventId,user_id:user,request_id:requestId,name:'Persona ficticia',created_at:'2026-09-24T12:00:00Z',send_after:'2026-09-24T12:00:10Z',authorized_test:true,status:'pending',latitude:null,longitude:null};
const delivery={id:deliveryId,event_id:eventId,user_id:user,phone:'+12025550100',contact_id:'fake',status:'queued'};
const request=(body,headers={authorization:'Bearer fake'})=>new Request('https://test/functions/v1/sos-api',{method:'POST',headers:{'content-type':'application/json',origin:'https://demo.test',...headers},body:JSON.stringify(body)});
function dbMock(){let existing=null;let begun=false;return {calls:[],health:async()=>true,existing:async()=>existing,contacts:async()=>[{phone:delivery.phone,whatsapp_opt_in:true}],create:async(u,r,t)=>{existing={...event};return existing;},cancel:async(u,e)=>({...event,status:'canceled'}),location:async()=>true,authorizeWorker:async t=>t==='internal-fake',claim:async()=>[event],deliveries:async()=>[delivery],beginDelivery:async()=>{if(begun)return false;begun=true;return true;},contactStillConsents:async()=>true,result:async(id,r)=>{},finish:async()=>{},webhook:async()=>{}};}
const invoke=async(b,db=dbMock(),overrides={})=>apiHandler(request(b),{db,env,auth:async()=>authorized,...overrides});
test('sin Auth, cuentas anónimas y correo no confirmado no pueden crear SOS',async()=>{
 const db=dbMock();db.create=()=>assert.fail('no debe crear');
 assert.equal((await apiHandler(request({action:'create',requestId},{}),{db,env,auth:async()=>authorized})).status,401);
 for(const who of [null,{...authorized,is_anonymous:true},{...authorized,email_confirmed_at:null}])assert.equal((await invoke({action:'create',requestId},db,{auth:async()=>who})).status,401);
});
test('rechaza teléfonos, usuario, nombre o modo inyectados desde el navegador',async()=>{
 for(const extra of [{user_id:'other'},{phones:['123']},{name:'Falso'},{mode:'demo'}]){
 const r=await invoke({action:'create',requestId,...extra});assert.equal(r.status,409);}
});
test('identidad procede exclusivamente del usuario validado y la idempotencia reutiliza evento',async()=>{
 const db=dbMock();let count=0;const original=db.create;db.create=async(u,r,t)=>{count++;assert.equal(u,user);assert.equal(r,requestId);assert.equal(t,true);return original(u,r,t);};
 const a=await (await invoke({action:'create',requestId},db)).json(),b=await (await invoke({action:'create',requestId},db)).json();assert.equal(a.event.id,b.event.id);assert.equal(count,1);
});
test('creación bloqueada sin activación, procesador o autorización de cuenta/número',async()=>{
 assert.equal((await invoke({action:'create',requestId},dbMock(),{env:k=>k==='SOS_ENABLED'?'false':env(k)})).status,503);
 const db=dbMock();db.health=async()=>false;assert.equal((await invoke({action:'create',requestId},db)).status,503);
 assert.equal((await invoke({action:'create',requestId},dbMock(),{env:k=>k==='SOS_AUTHORIZED_USER_IDS'?'someone':env(k)})).status,403);
 const other=dbMock();other.contacts=async()=>[{phone:'+12025550199',whatsapp_opt_in:true}];assert.equal((await invoke({action:'create',requestId},other)).status,403);
 assert.ok(settings(()=>null).missing.length);
});
test('cancelación usa usuario y evento y no hace llamadas al proveedor',async()=>{
 const db=dbMock();db.cancel=async(u,e)=>{assert.equal(u,user);assert.equal(e,eventId);return {...event,status:'canceled'};};assert.equal((await (await invoke({action:'cancel',eventId},db)).json()).event.status,'canceled');
});
test('ubicación ausente o denegada mantiene plantilla válida y nombre/fecha',()=>{
 const payload=templatePayload(event,delivery,env);assert.equal(payload.template.name,'sos_prueba');assert.equal(payload.template.components[0].parameters[0].text,'Persona ficticia');assert.match(payload.template.components[0].parameters[1].text,/2026/);assert.equal(payload.template.components[0].parameters[2].text,'Ubicación no disponible');
 assert.match(templatePayload({...event,latitude:18.5,longitude:-69.9},delivery,env).template.components[0].parameters[2].text,/maps\?q=18.5,-69.9/);
});
test('200 con ID significa aceptado, nunca entregado; 400 falla; 500/timeout inciertos',async()=>{
 for(const [status,body,expected] of [[200,{messages:[{id:'wamid.fake'}]},'accepted'],[400,{error:{code:131030}},'failed'],[500,{},'unknown'],[200,{},'unknown']]){
 let count=0;const r=await sendWhatsApp(event,delivery,{env,fetcher:async(url,init)=>{count++;assert.match(url,/graph.facebook.com/);assert.equal(JSON.parse(init.body).to,'12025550100');return new Response(JSON.stringify(body),{status});}});assert.equal(r.status,expected);assert.equal(count,1);}
 assert.equal((await sendWhatsApp(event,delivery,{env,fetcher:async()=>{throw Error('timeout');}})).status,'unknown');
});
test('worker valida secreto, reclama una vez y solo envía a números autorizados con consentimiento',async()=>{
 const req=t=>new Request('https://test',{method:'POST',headers:{'x-dispatch-token':t}});
 const db=dbMock();let calls=0;const deps={db,env,fetcher:async()=>{calls++;return new Response(JSON.stringify({messages:[{id:'fake'}]}));}};
 assert.equal((await dispatchHandler(req('wrong'),deps)).status,401);assert.equal(calls,0);
 await Promise.all([dispatchHandler(req('internal-fake'),deps),dispatchHandler(req('internal-fake'),deps)]);assert.equal(calls,1);
 for(const [customEnv,consents,expected] of [[k=>k==='SOS_ALLOWED_PHONES'?'+19995550111':env(k),true,'TEST_NOT_AUTHORIZED'],[env,false,'CONTACT_REMOVED_OR_CONSENT_REVOKED'],[k=>k==='SOS_ENABLED'?'false':env(k),true,'SENDING_DISABLED']]){
 const d=dbMock();let result;d.result=async(id,r)=>result=r;d.contactStillConsents=async()=>consents;await dispatchHandler(req('internal-fake'),{db:d,env:customEnv,fetcher:()=>assert.fail('envío prohibido')});assert.equal(result.error,expected);}
});
test('webhook exige HMAC y solo acepta WABA, número y estados correctos',async()=>{
 const payload={object:'whatsapp_business_account',entry:[{id:'456',changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},statuses:[{id:'wamid.fake',recipient_id:'12025550100',status:'delivered',timestamp:'1790251200',biz_opaque_callback_data:deliveryId}]}}]}]};
 const raw=JSON.stringify(payload);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(vars.META_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw));const sig='sha256='+Buffer.from(mac).toString('hex');
 assert.equal(await validSignature(raw,sig,vars.META_APP_SECRET),true);assert.equal(await validSignature(raw+' ',sig,vars.META_APP_SECRET),false);
 const db=dbMock();let calls=0;db.webhook=async s=>{calls++;assert.equal(s.status,'delivered');assert.equal(s.phone,delivery.phone);};
 const r=s=>new Request('https://test',{method:'POST',body:raw,headers:{'x-hub-signature-256':s}});
 assert.equal((await webhookHandler(r('wrong'),{env,db})).status,401);assert.equal(calls,0);
 assert.equal((await webhookHandler(r(sig),{env,db})).status,200);assert.equal(calls,1);
 assert.equal((await webhookHandler(r(sig),{env:k=>k==='WHATSAPP_BUSINESS_ACCOUNT_ID'?'other':env(k),db})).status,200);assert.equal(calls,1);
 db.webhook=async()=>{throw Error('db down');};assert.equal((await webhookHandler(r(sig),{env,db})).status,503);
});
test('challenge webhook requiere el token exacto',async()=>{
 assert.equal((await webhookHandler(new Request('https://test?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=hello'),{env,db:dbMock()})).status,403);
 assert.equal(await (await webhookHandler(new Request('https://test?hub.mode=subscribe&hub.verify_token=fake-verify&hub.challenge=hello'),{env,db:dbMock()})).text(),'hello');
});
