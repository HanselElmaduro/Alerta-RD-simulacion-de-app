import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
const dom=new JSDOM('<main></main>',{url:'https://demo.test',pretendToBeVisual:true});
for(const k of ['window','document','localStorage','FormData','HTMLElement'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const intervals=[];globalThis.setInterval=(fn,ms)=>{intervals.push({fn,ms});return 1;};
const {createRealUI}=await import('../dist/real-ui.js');
const A={id:'11111111-1111-4111-8111-111111111111',email:'a@example.invalid'},B={id:'22222222-2222-4222-8222-222222222222',email:'b@example.invalid'};
const codes={[A.id]:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',[B.id]:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
let session=null,page='sos',links=[],events=[],inbox=[],outbox=[],requests=[],notifications=[],online=true;
const cloud={client:{auth:{onAuthStateChange(){}}},session:async()=>session,
 signIn:async email=>({session:session={user:email===A.email?A:B}}),signOut:async()=>{session=null;},
 data:async()=>({profile:{name:session.user.id===A.id?'Persona A':'Persona B'},contacts:[],events:[],deliveries:[]}),
 api:async()=>({ready:false,enabled:false,worker:true}),
 internalData:async()=>structuredClone({links:links.filter(l=>[l.sender_id,l.recipient_id].includes(session.user.id)),events:events.filter(e=>e.sender_id===session.user.id),inbox:inbox.filter(i=>i.recipient_id===session.user.id),outbox:outbox.filter(o=>o.sender_id===session.user.id)}),
 internal:async b=>{
  requests.push(b);const u=session.user;
  if(b.action==='health'){if(!online)throw Error('offline');return {ready:true,serverTime:Date.now()};}
  if(b.action==='code')return {code:codes[u.id]};
  if(b.action==='invite'){links.push({id:crypto.randomUUID(),sender_id:u.id,recipient_id:B.id,sender_name:'Persona A',recipient_name:'Persona B',relation:b.relation,status:'pending',created_at:new Date().toISOString()});return {ok:true};}
  if(b.action==='respond'){links.find(l=>l.id===b.id).status=b.accept?'accepted':'declined';return {ok:true};}
  if(b.action==='remove'){links.find(l=>l.id===b.id).status='removed';return {ok:true};}
  if(b.action==='create'){
   let e=events.find(e=>e.request_id===b.requestId&&e.sender_id===u.id);if(e)return {event:structuredClone(e),serverTime:Date.now()};
   e={id:crypto.randomUUID(),request_id:b.requestId,sender_id:u.id,sender_name:'Persona A',status:'pending',created_at:new Date().toISOString(),send_after:new Date(Date.now()+10000).toISOString(),latitude:null,longitude:null};events.unshift(e);
   outbox.push({id:crypto.randomUUID(),event_id:e.id,sender_id:u.id,recipient_id:B.id,recipient_name:'Persona B',status:'queued'});return {event:structuredClone(e),serverTime:Date.now()};
  }
  if(b.action==='cancel'){const e=events.find(e=>e.id===b.eventId);e.status='canceled';outbox.find(o=>o.event_id===e.id).status='canceled';return {event:structuredClone(e)};}
  if(b.action==='read'){const i=inbox.find(i=>i.id===b.id);i.read_at=new Date().toISOString();outbox.find(o=>o.event_id===i.event_id).status='read';return {ok:true};}
 }
};
let ui;const render=()=>document.querySelector('main').innerHTML=ui.view(page);
ui=createRealUI({onChange:render,onDemo:()=>{},notify:m=>notifications.push(m),loadCloud:async()=>cloud});
await ui.init();render();
const q=s=>{const el=document.querySelector(s);assert.ok(el,s);return el;},click=s=>q(s).click(),fill=(s,v)=>q(s).value=v;
const settle=()=>new Promise(r=>setTimeout(r,25));
const submit=async s=>{q(s).requestSubmit();await settle();};
async function login(u){page='sos';render();fill('#real-email',u.email);fill('#real-password','fictitious-test-password');await submit('#real-auth-form');}
async function logout(){click('[data-real-action="logout"]');await settle();assert.match(q('main').textContent,/Iniciar sesión/);}
await login(A);assert.match(q('h1').textContent,/SOS en Alerta RD/);assert.equal(q('[data-internal-action="start"]').disabled,true);assert.doesNotMatch(q('main').textContent,/Hace falta habilitar WhatsApp/);
page='contacts';render();assert.equal(q('#internal-code').value,codes[A.id]);click('[data-internal-action="invite"]');fill('#friend-code','invalid');fill('#friend-relation','Amigo');await submit('#internal-invite-form');assert.match(q('#internal-invite-form .form-error').textContent,/código completo/);fill('#friend-code',codes[B.id]);await submit('#internal-invite-form');assert.equal(links.length,1);assert.match(q('main').textContent,/Pendiente de aceptación/);
await logout();await login(B);assert.match(q('[data-internal-root]').textContent,/1 solicitud/);page='contacts';render();click('[data-internal-action="accept"]');await settle();assert.equal(links[0].status,'accepted');
await logout();await login(A);assert.equal(q('[data-internal-action="start"]').disabled,false);
Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1});}},configurable:true});
click('[data-internal-action="start"]');await settle();assert.equal(events.length,1);assert.equal(inbox.length,0);assert.ok(notifications.some(n=>n.includes('Ubicación no disponible')));assert.equal(requests.filter(b=>b.action==='location').length,0);
click('[data-real-action="logout"]');await settle();assert.equal(session.user.id,A.id);assert.match(q('main').textContent,/SOS pendiente/);
click('[data-internal-action="cancel"]');await settle();assert.equal(events[0].status,'canceled');assert.equal(inbox.length,0);
const start=q('[data-internal-action="start"]');start.click();start.click();await settle();assert.equal(events.length,2);
// Simulated server publishes after its deadline. The real SQL is tested separately in a rollback.
events[0].status='published';outbox.find(o=>o.event_id===events[0].id).status='available';inbox.push({...events[0],id:crypto.randomUUID(),event_id:events[0].id,recipient_id:B.id,read_at:null});
click('[data-internal-action="refresh"]');await settle();assert.match(q('main').textContent,/Publicada en la bandeja/);await logout();await login(B);assert.match(q('[data-internal-root]').textContent,/1 sin leer/);
page='history';render();click('[data-internal-action="inbox"]');assert.match(q('#internal-modal').textContent,/Persona A necesita/);assert.match(q('#internal-modal').textContent,/Ubicación no disponible/);assert.equal(inbox[0].read_at,null);click('[data-internal-action="read"]');await settle();assert.ok(inbox[0].read_at);assert.equal(outbox.find(o=>o.event_id===events[0].id).status,'read');assert.doesNotMatch(q('[data-internal-root]').textContent,/sin leer/);click('[data-internal-action="close"]');
await logout();await login(A);page='history';render();click('[data-internal-action="event"]');assert.match(q('#internal-modal').textContent,/Lectura confirmada/);click('[data-internal-action="close"]');
page='sos';render();online=false;click('[data-internal-action="refresh"]');await settle();assert.equal(q('[data-internal-action="start"]').disabled,true);assert.match(q('main').textContent,/No se pudo actualizar la bandeja/);online=true;click('[data-internal-action="refresh"]');await settle();assert.equal(q('[data-internal-action="start"]').disabled,false);
page='contacts';render();click('[data-internal-action="remove-prompt"]');click('[data-internal-action="close"]');assert.equal(links[0].status,'accepted');click('[data-internal-action="remove-prompt"]');click('[data-internal-action="remove"]');await settle();assert.equal(links[0].status,'removed');page='sos';render();assert.equal(q('[data-internal-action="start"]').disabled,true);
console.log('PASS: Two-account UI, share code, invite/accept, double click, cancel, denied location, unread inbox, explicit read receipt, disconnect recovery, removal. Mock transport only; zero alerts to real users.');dom.window.close();
