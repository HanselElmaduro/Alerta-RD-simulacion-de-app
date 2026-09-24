import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
const dom=new JSDOM('<main></main><div id="toast"></div>',{url:'https://demo.test',pretendToBeVisual:true});
for(const k of ['window','document','localStorage','FormData','HTMLElement'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const intervals=[];globalThis.setInterval=f=>{intervals.push(f);return 1;};
const nativeTimeout=setTimeout;globalThis.setTimeout=(f,t)=>{const x=nativeTimeout(f,t);x.unref();return x;};
const {createRealUI}=await import('../dist/real-ui.js');
let page='sos',currentSession=null,stored={profile:null,contacts:[],events:[],deliveries:[]},created=0,requests=[],notices=[],healthReady=false,healthFails=true,resent=[];
const user={id:'11111111-1111-4111-8111-111111111111',email:'persona@example.invalid'};
const cloud={client:{auth:{onAuthStateChange(){}}},session:async()=>currentSession,
 resendConfirmation:async email=>{resent.push(email);},
 signIn:async()=>({session:currentSession={user}}),signOut:async()=>{currentSession=null;},signUp:async()=>({session:null}),
 data:async()=>structuredClone(stored),saveProfile:async(u,p)=>{stored.profile=p;},
 saveContact:async(id,c)=>{if(id)stored.contacts=stored.contacts.map(x=>x.id===id?{...c,id}:x);else stored.contacts.push({...c,id:crypto.randomUUID()});},
 deleteContact:async id=>{stored.contacts=stored.contacts.filter(c=>c.id!==id);},
 api:async b=>{requests.push(b);if(b.action==='health'&&healthFails)throw Error('Failed to fetch');if(b.action==='health')return {ready:healthReady,enabled:healthReady,authorizedTest:true,authorizedUser:true,missing:[],worker:true};
 if(b.action==='create'){created++;const e={id:crypto.randomUUID(),status:'pending',authorized_test:true,name:'Persona ficticia',created_at:new Date().toISOString(),send_after:new Date(Date.now()+10000).toISOString(),latitude:null,longitude:null};stored.events.unshift(e);return {event:e,serverTime:Date.now()};}
 if(b.action==='cancel'){stored.events[0].status='canceled';return {event:stored.events[0]};}
 if(b.action==='location')return {saved:true};
 }
};
let ui;const render=()=>document.querySelector('main').innerHTML=ui.view(page);
ui=createRealUI({onChange:render,onDemo:()=>notices.push('demo'),notify:m=>notices.push(m),loadCloud:async()=>cloud});
await ui.init();render();
const q=s=>{const e=document.querySelector(s);assert.ok(e,s);return e;},click=s=>q(s).click(),fill=(s,v)=>q(s).value=v;
const settle=()=>new Promise(r=>nativeTimeout(r,15));
const submit=async s=>{q(s).requestSubmit();await settle();};
assert.match(q('main').textContent,/Iniciar sesión/);fill('#real-email','persona@example.invalid');click('[data-real-action="resend-confirmation"]');await settle();assert.deepEqual(resent,['persona@example.invalid']);assert.ok(notices.some(m=>m.includes('nuevo enlace')));fill('#real-email','persona@example.invalid');fill('#real-password','password-test');await submit('#real-auth-form');assert.match(q('h1').textContent,/SOS real/);assert.equal(q('[data-real-action="start-sos"]').disabled,true);
assert.match(q('main').textContent,/Tu sesión está activa/);assert.equal(document.querySelector('.form-error'),null);
page='profile';render();fill('#real-name','Persona ficticia');fill('#real-phone','+12025550101');await submit('#real-profile-form');assert.equal(stored.profile.name,'Persona ficticia');assert.ok(notices.includes('Perfil guardado en tu cuenta.'));
page='contacts';render();click('[data-real-action="add-contact"]');fill('#rc-name','Contacto ficticio');fill('#rc-phone','123');fill('#rc-relation','Familiar');await submit('#real-contact-form');assert.match(q('#real-contact-form .form-error').textContent,/código de país/);fill('#rc-phone','+1 202 555 0100');q('[name=consent]').checked=true;await submit('#real-contact-form');assert.equal(stored.contacts.length,1);assert.ok(notices.includes('Contacto guardado en tu cuenta.'));assert.equal(stored.contacts[0].phone,'+12025550100');
click('[data-real-action="edit-contact"]');fill('#rc-name','Contacto editado');await submit('#real-contact-form');assert.equal(stored.contacts[0].name,'Contacto editado');
healthFails=false;healthReady=true;page='sos';render();click('[data-real-action="refresh"]');await settle();assert.equal(q('[data-real-action="start-sos"]').disabled,false);assert.doesNotMatch(q('main').textContent,/No se pudo consultar el servicio SOS/);
Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1});}},configurable:true});
click('[data-real-action="start-sos"]');click('[data-real-action="start-sos"]');await settle();assert.equal(created,1);assert.match(q('main').textContent,/Pendiente/);assert.ok(notices.some(m=>m.includes('Ubicación no disponible')));assert.equal(requests.filter(r=>r.action==='location').length,0);
click('[data-real-action="cancel-sos"]');await settle();assert.equal(stored.events[0].status,'canceled');assert.ok(notices.some(m=>m.includes('Cancelación confirmada')));
click('[data-real-action="start-sos"]');await settle();assert.equal(created,2);stored.events[0].status='processed';stored.deliveries=[{event_id:stored.events[0].id,contact_name:'Contacto editado',phone:'+12025550100',status:'accepted'}];await intervals.at(-1)();await settle();assert.match(q('main').textContent,/Procesamiento finalizado/);
page='history';render();click('[data-real-action="event"]');assert.match(q('#real-modal').textContent,/Aceptado por WhatsApp · entrega sin confirmar/);assert.doesNotMatch(q('.delivery-result').textContent,/Entregado/);click('[data-real-action="close"]');
page='contacts';render();click('[data-real-action="delete-contact"]');click('[data-real-action="close"]');assert.equal(stored.contacts.length,1);click('[data-real-action="delete-contact"]');click('[data-real-action="confirm-delete"]');await settle();assert.equal(stored.contacts.length,0);
page='sos';render();assert.equal(q('[data-real-action="start-sos"]').disabled,true);click('[data-real-action="logout"]');await settle();assert.match(q('main').textContent,/Iniciar sesión/);
console.log('✓ Cuenta, acceso, perfil, contactos CRUD, consentimiento, bloqueo de configuración, doble clic, ubicación denegada, cancelación, resultados y cierre de sesión (API simulada; cero mensajes reales).');
dom.window.close();
