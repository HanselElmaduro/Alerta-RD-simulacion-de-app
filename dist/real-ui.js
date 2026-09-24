import {icon} from './icons.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label={pending:'Pendiente · cuenta regresiva',dispatching:'Procesando envíos',processed:'Procesamiento finalizado',canceled:'Cancelado',expired:'Vencido · no se envió',queued:'En cola',sending:'Solicitando envío',accepted:'Aceptado por WhatsApp · entrega sin confirmar',sent:'Enviado · confirmado por WhatsApp',delivered:'Entregado · confirmado por WhatsApp',read:'Leído · confirmado por WhatsApp',failed:'Error · no enviado',unknown:'Resultado incierto · no se reintentará'};
const btn=(text,action,cls='secondary',attrs='')=>`<button type="button" class="btn ${cls}" data-real-action="${action}" ${attrs}>${text}</button>`;
const note=text=>`<div class="notice">${icon('info')}<p>${text}</p></div>`;
const heading=(title,sub)=>`<header class="page-heading"><div><p class="eyebrow">CUENTA PRIVADA · SUPABASE</p><h1 tabindex="-1">${title}</h1><p class="subtitle">${sub}</p></div></header>`;
const when=t=>new Intl.DateTimeFormat('es-DO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Santo_Domingo'}).format(new Date(t));
const phone=v=>v.replace(/[\s()\-.]/g,'');
function human(error){
 const message=String(error?.message||'');
 if(error?.code==='23505')return 'Ya guardaste este número de teléfono.';
 if(message==='Invalid login credentials')return 'Correo o contraseña incorrectos.';
 if(message==='Email not confirmed')return 'Confirma tu correo antes de iniciar sesión.';
 if(/rate limit|too many requests/i.test(message))return 'Se alcanzó el límite de solicitudes. Espera unos minutos antes de volver a intentar.';
 if(/invalid.*email|email.*invalid/i.test(message))return 'Revisa la dirección de correo electrónico.';
 if(/password/i.test(message))return 'La contraseña no cumple los requisitos de la cuenta.';
 if(/^(No se|Hay |Incluye|Completa|Escribe|Ya |Límite|Agrega|El |Esta |Necesitas|Inicia|Campos|Solicitud|SOS |Identificador|Ubicación|Máximo)/.test(message))return message;
 return 'No se pudo completar la operación. Revisa la conexión y vuelve a intentarlo.';
}
export function createRealUI({onChange,onDemo,notify,loadCloud=()=>import('./cloud.js').then(m=>m.connectCloud())}){
 let cloud,initialized=false,loading=false,session=null,health=null,model={profile:null,contacts:[],events:[],deliveries:[]};
 let error='',busy=false,currentPage='sos',editor=null,profileEdit=false,detail=null,recovery=null,epoch=0,clockOffset=0,polling=false;
 let dialog=document.querySelector('#real-modal');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='real-modal';dialog.setAttribute('aria-labelledby','real-modal-title');document.body.append(dialog);}
 const changed=()=>onChange();
 const recoveryKey=()=>`alerta-rd-request-${session?.user.id}`;
 const remember=id=>{recovery=id;try{id?localStorage.setItem(recoveryKey(),id):localStorage.removeItem(recoveryKey());}catch{}};
 function reset(){epoch++;session=null;health=null;model={profile:null,contacts:[],events:[],deliveries:[]};editor=null;detail=null;profileEdit=false;recovery=null;dialog.close();}
 async function refresh(all=true){
   if(!session||!cloud)return;const version=epoch;
   const data=await cloud.data();if(version!==epoch)return;
   const before=JSON.stringify(model);model=data;
   if(all){health=await cloud.api({action:'health'});if(version!==epoch)return;}
   if(all||((currentPage==='sos'||currentPage==='history')&&before!==JSON.stringify(model)))changed();
 }
 async function init(){
   if(initialized)return;initialized=true;loading=true;changed();
   try{cloud=await loadCloud();if(cloud){session=await cloud.session();if(session){try{recovery=localStorage.getItem(recoveryKey());}catch{}await refresh();}
     cloud.client.auth.onAuthStateChange((event,next)=>{if(event==='SIGNED_OUT'){reset();changed();}else if(next&&next.user.id!==session?.user?.id){reset();session=next;setTimeout(()=>refresh().catch(e=>{error=human(e);changed();}),0);}});
   }}catch(e){error=human(e);}finally{loading=false;changed();}
 }
 const errorBox=()=>error?`<p class="form-error" role="alert">${esc(error)}</p>`:'';
 const account=()=>`<div class="cloud-account"><span>${icon('lock')} ${esc(session.user.email)}</span>${btn('Cerrar sesión','logout','ghost')}</div>`;
 function view(page){
   currentPage=page;
   if(!initialized||loading)return heading('Conectando tu cuenta…','Consultando Supabase de forma segura.');
   if(!cloud)return `${heading('Configura Supabase','El modo demostración sigue disponible.')}<section class="card">${note('Falta la URL y clave pública del proyecto. Consulta README.md para conectar esta instalación. Nunca se necesita el token de WhatsApp en el navegador.')}${btn('Volver a la demostración','demo')}</section>`;
   if(!session)return `${heading('Tu cuenta, tu círculo.','Inicia sesión para guardar contactos privados y preparar el SOS real.')}<div class="two-columns"><section class="card"><h2>Acceder a Alerta RD</h2><form id="real-auth-form"><label for="real-email">Correo electrónico</label><input id="real-email" name="email" type="email" required autocomplete="email"><label for="real-password">Contraseña</label><input id="real-password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="current-password">${errorBox()}<div class="stack"><button class="btn primary" type="submit" ${busy?'disabled':''}>Iniciar sesión</button><button class="btn secondary" type="submit" name="register" value="yes" ${busy?'disabled':''}>Crear cuenta</button></div><p class="form-hint">¿Ya confirmaste el correo pero la página de regreso no abrió? Prueba iniciar sesión con tu misma cuenta.</p>${btn('Reenviar confirmación','resend-confirmation','ghost full',busy?'disabled':'')}<p class="form-hint">Para reenviarla, escribe arriba tu correo. Revisa también la carpeta de spam.</p></form></section><section class="card"><span class="large-icon red">${icon('shield')}</span><h2>Dos modos, siempre claros.</h2><p>La demostración solo guarda pruebas en tu navegador. En este espacio, tus contactos se guardan en tu cuenta.</p>${note('El SOS real necesita la configuración de WhatsApp Business. Cuando esté habilitado, podrá enviar mensajes automáticamente después de 10 segundos.')}${btn('Explorar demostración','demo','ghost')}</section></div>`;
   const renderers={sos:sos,contacts:contacts,profile:profile,history:history,more:more};
   return account()+errorBox()+(renderers[page]?renderers[page]():`${heading('Esta función sigue en demostración','Solo SOS, Contactos, Perfil y Central usan tu cuenta en esta versión.')}<section class="card">${note('Drive, Red de Ayuda, Ruta y Seguridad continúan como simulaciones independientes. No activan el envío real.')}${btn('Abrir esta función en demostración','demo','primary')}</section>`);
 }
 function sos(){
   const active=model.events.find(e=>['pending','dispatching'].includes(e.status));
   const pending=active?.status==='pending';
   const hasContacts=model.contacts.some(c=>c.whatsapp_opt_in);
   return `${heading('SOS real','Tu alerta se procesa en el servidor y tiene 10 segundos para cancelarse.')}<div class="sos-layout"><section class="card sos-card"><div class="card-top"><span class="section-label">ENVÍO POR WHATSAPP BUSINESS</span><span class="badge ${health?.ready?'red':'amber'}">${health?.authorizedTest?'PRUEBA AUTORIZADA':'MODO REAL'}</span></div>${active?`<div class="real-countdown"><span class="large-timer" data-real-countdown="${esc(active.send_after)}">${seconds(active.send_after)}</span><h2 data-real-pending-label>${pending&&seconds(active.send_after)===0?'Plazo finalizado · esperando al servidor':label[active.status]}</h2><p>El servidor enviará a los contactos registrados al finalizar el plazo. Cerrar la página no cancela el SOS.</p>${pending?btn('Estoy bien · Cancelar SOS','cancel-sos','success full',`data-id="${active.id}" ${busy||seconds(active.send_after)===0?'disabled':''}`):''}</div>`:`<div class="sos-orbit"><button class="sos-button" data-real-action="start-sos" ${busy||recovery||!health?.ready||!model.profile||!hasContacts?'disabled':''} aria-label="Iniciar SOS real con 10 segundos para cancelar"><span>SOS</span><small>ENVIAR ALERTA REAL</small></button></div><h2>${health?.ready?'Listo para responder.':'Envío todavía desactivado.'}</h2><p class="sos-description">${health?.ready?'Al pulsar, tendrás 10 segundos para cancelar. Se enviará un mensaje a cada contacto con consentimiento.':'Puedes crear tu cuenta, completar tu perfil y guardar contactos. Hace falta habilitar WhatsApp para enviar.'}</p>`}<div class="sos-card-footer">${icon('lock')} ${health?.authorizedTest?'Solo cuentas y números autorizados para pruebas.':'Contactos de tu cuenta. No avisa al 9-1-1.'}</div></section><div class="sos-right"><section class="card"><h2>Antes de activar</h2><dl class="facts"><div><dt>Nombre para la alerta</dt><dd>${esc(model.profile?.name||'Completa tu perfil')}</dd></div><div><dt>Contactos con consentimiento</dt><dd>${model.contacts.filter(c=>c.whatsapp_opt_in).length} de 5</dd></div><div><dt>Procesador del servidor</dt><dd>${health?.worker?'Disponible':'Sin confirmar'}</dd></div><div><dt>WhatsApp</dt><dd>${health?.ready?'Habilitado':'No habilitado'}</dd></div></dl><div class="button-row"><button class="btn secondary" data-page="profile">Mi perfil</button><button class="btn secondary" data-page="contacts">Mis contactos</button></div>${btn('Actualizar estado','refresh','ghost full',busy?'disabled':'')}</section><section class="card"><h3>Ubicación opcional</h3><p>Al iniciar SOS, el navegador solicitará tu ubicación. Si no llega a tiempo o deniegas el permiso, el mensaje indicará «Ubicación no disponible» y se enviará igualmente.</p><p class="form-hint">Cron procesa el envío al vencer los 10 segundos; puede añadir unos segundos de demora.</p></section></div></div>${recovery?`<section class="card recovery-card"><h2>Solicitud por confirmar</h2><p>La respuesta del servidor no está confirmada. Recupera la misma solicitud antes de iniciar otra; no se generará un segundo SOS.</p>${btn('Recuperar la misma solicitud','recover','primary',busy?'disabled':'')}</section>`:''}${!health?.ready?note('Configuración pendiente: '+esc(!health?.enabled?'el administrador debe habilitar los envíos.':!health?.authorizedUser?'tu cuenta debe autorizarse para la prueba.':health?.missing?.length?'faltan credenciales o ajustes de Meta en el servidor.':'el procesador no ha confirmado disponibilidad.')):''}${model.events[0]&&!active?`<section class="card recent-cloud"><h3>Último SOS</h3>${eventRow(model.events[0])}</section>`:''}`;
 }
 function contacts(){return `${heading('Contactos de emergencia','Privados para tu cuenta. Hasta 5 contactos con teléfono internacional.')}<div class="section-toolbar"><h2>Tu círculo de confianza</h2>${btn('Agregar contacto','add-contact','primary',model.contacts.length>=5?'disabled':'')}</div>${note('Registra únicamente a personas que aceptaron recibir tus alertas por WhatsApp. Los contactos de la demostración no se importan automáticamente.')}<div class="contacts-grid">${model.contacts.map(c=>`<section class="card contact-card"><span class="avatar">${icon('user')}</span><div class="contact-info"><h3>${esc(c.name)}</h3><p>${esc(c.phone)}</p><span>${esc(c.relation)} · ${c.whatsapp_opt_in?'Consentimiento registrado':'Sin consentimiento'}</span></div><div class="contact-tools">${btn(icon('edit'),'edit-contact','icon-button',`data-id="${c.id}" aria-label="Editar a ${esc(c.name)}"`)}${btn(icon('trash'),'delete-contact','icon-button',`data-id="${c.id}" aria-label="Eliminar a ${esc(c.name)}"`)}</div></section>`).join('')||`<section class="card empty"><span class="empty-icon">${icon('users')}</span><h3>Aún no tienes contactos</h3><p>Agrega tu primera persona de confianza para preparar una alerta.</p></section>`}</div>`;}
 function profile(){const p=model.profile||{};return `${heading('Tu perfil de envío','Este nombre aparecerá en tus alertas de WhatsApp.')}<section class="card profile-form">${profileEdit||!p.name?`<form id="real-profile-form"><label for="real-name">Nombre completo</label><input id="real-name" name="name" required minlength="2" maxlength="100" value="${esc(p.name)}" autocomplete="name"><label for="real-phone">Tu teléfono (opcional, con prefijo internacional)</label><input id="real-phone" name="phone" type="tel" value="${esc(p.phone)}" placeholder="+18095550100" autocomplete="tel"><p class="form-error" role="alert"></p><div class="button-row"><button class="btn primary" type="submit" ${busy?'disabled':''}>Guardar perfil</button>${p.name?btn('Cancelar','profile-cancel','ghost'):''}</div></form>`:`<h2>${esc(p.name)}</h2><p>${esc(p.phone||'Teléfono no especificado')}</p>${btn('Editar perfil','profile-edit')}`}</section>${note('La información médica de la demostración permanece local. Este perfil guarda únicamente nombre y teléfono para la integración real.')}`;}
 function eventRow(e){return `<button class="event-row real-event" data-real-action="event" data-id="${e.id}"><span class="icon-tile red">${icon('shield')}</span><span class="event-copy"><strong>${e.authorized_test?'Prueba autorizada · envío real':'SOS real'}</strong><small>${when(e.created_at)} · ${label[e.status]}</small></span>${icon('chevron')}</button>`;}
 function history(){return `${heading('Central / Historial','SOS de tu cuenta. Fechas y horas de República Dominicana.')}<div class="section-toolbar"><h2>Últimos 50 eventos</h2>${btn('Actualizar','refresh','secondary',busy?'disabled':'')}</div>${note('«Aceptado» significa que WhatsApp recibió la solicitud. «Entregado» y «Leído» aparecen solo después de un webhook firmado de Meta.')}<section class="card">${model.events.map(eventRow).join('')||'<div class="empty"><h3>Todavía no hay SOS</h3><p>Los eventos reales, cancelaciones y resultados por contacto aparecerán aquí.</p></div>'}</section>`;}
 function more(){return `${heading('Tu espacio personal','Gestiona tu cuenta y revisa los envíos.')}<div class="more-grid">${[['history','history','Central / Historial','Eventos y resultados de WhatsApp'],['contacts','users','Contactos','Tu círculo de confianza'],['profile','user','Perfil','Tu nombre para las alertas'],['security','lock','Seguridad','PINs y Tutor · solo demostración']].map(([p,i,t,d])=>`<button class="card more-card" data-page="${p}"><span class="icon-tile">${icon(i)}</span><span><strong>${t}</strong><small>${d}</small></span>${icon('chevron')}</button>`).join('')}</div>`;}
 function open(title,body){detail=document.activeElement;dialog.innerHTML=`<div class="modal-head"><h2 id="real-modal-title">${title}</h2>${btn(icon('x'),'close','icon-button','aria-label="Cerrar"')}</div><div class="modal-body">${body}</div>`;if(!dialog.open)dialog.showModal();}
 function close(){dialog.close();editor=null;detail?.isConnected&&detail.focus();}
 function contactForm(c={}){editor=c.id||'';open(c.id?'Editar contacto':'Nuevo contacto',`<form id="real-contact-form"><label for="rc-name">Nombre</label><input id="rc-name" name="name" required minlength="2" maxlength="80" value="${esc(c.name)}"><label for="rc-phone">Teléfono con código de país</label><input id="rc-phone" name="phone" type="tel" required value="${esc(c.phone)}" placeholder="+18095550100"><label for="rc-relation">Parentesco o relación</label><input id="rc-relation" name="relation" required maxlength="50" value="${esc(c.relation)}"><label class="checkbox-line"><input name="consent" type="checkbox" ${c.whatsapp_opt_in?'checked':''}><span>Esta persona aceptó recibir mis alertas de emergencia por WhatsApp.</span></label><p class="form-hint">Sin este consentimiento, el contacto se guarda pero no recibe alertas.</p><p class="form-error" role="alert"></p><div class="button-row"><button class="btn primary" type="submit">Guardar contacto</button>${btn('Cancelar','close','ghost')}</div></form>`);}
 function showEvent(id){const e=model.events.find(x=>x.id===id);if(!e)return;open('Detalle del SOS',`<span class="badge red">${e.authorized_test?'PRUEBA AUTORIZADA · ENVÍO REAL':'SOS REAL'}</span><p>${when(e.created_at)} · ${label[e.status]}</p><p>Nombre: ${esc(e.name)}</p><p>${e.latitude!==null?`<a class="text-link" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q=${e.latitude},${e.longitude}">Ver ubicación compartida</a>`:'Ubicación no disponible'}</p><div class="delivery-list">${model.deliveries.filter(d=>d.event_id===id).map(d=>`<div class="delivery-result"><strong>${esc(d.contact_name)}</strong><span>${esc(d.phone)}</span><p>${label[d.status]}</p>${d.error_code?`<small>Código: ${esc(d.error_code)}</small>`:''}</div>`).join('')}</div>${note('Si el resultado es incierto, verifica el historial del proveedor antes de intentar otra alerta. No hay reintentos automáticos.')}${btn('Cerrar','close','secondary full')}`);}
 const seconds=deadline=>Math.max(0,Math.ceil((new Date(deadline).getTime()-Date.now()-clockOffset)/1000));
 async function create(requestId){
   const result=await cloud.api({action:'create',requestId});
   clockOffset=result.serverTime-Date.now();remember(null);
   model.events=[result.event,...model.events.filter(x=>x.id!==result.event.id)];changed();
   if(result.event.status==='pending'){
     if(!navigator.geolocation)notify('Ubicación no disponible en este navegador. El SOS continúa.');
     navigator.geolocation?.getCurrentPosition(async pos=>{
       try{const r=await cloud.api({action:'location',eventId:result.event.id,latitude:pos.coords.latitude,longitude:pos.coords.longitude});notify(r.saved?'Ubicación añadida al SOS.':'El SOS continuará sin esta ubicación; el plazo de captura terminó.');}catch{notify('No se pudo añadir la ubicación. El SOS continúa.');}
     },()=>notify('Ubicación no disponible. El SOS continúa igualmente.'),{timeout:6000,maximumAge:0,enableHighAccuracy:true});
   }
   await refresh(false);
 }
 async function action(action,el){
   if(action==='demo'){onDemo();return;}if(action==='close'){close();return;}
   if(busy)return;
   const confirmationEmail=action==='resend-confirmation'?document.querySelector('#real-email'):null;
   if(confirmationEmail&&!confirmationEmail.reportValidity())return;
   error='';
   if(action==='add-contact'){contactForm();return;}
   if(action==='edit-contact'){contactForm(model.contacts.find(c=>c.id===el.dataset.id));return;}
   if(action==='delete-contact'){const c=model.contacts.find(c=>c.id===el.dataset.id);open('¿Eliminar este contacto?',`<p>${esc(c.name)} dejará de estar disponible para nuevos envíos. El historial conservará los resultados anteriores.</p>${btn('Eliminar contacto','confirm-delete','danger',`data-id="${c.id}"`)}${btn('Volver','close','ghost')}`);return;}
   if(action==='event'){showEvent(el.dataset.id);return;}
   if(action==='profile-edit'||action==='profile-cancel'){profileEdit=action==='profile-edit';changed();return;}
   busy=true;el.disabled=true;
   try{
     if(action==='logout'){if(model.events.some(e=>['pending','dispatching'].includes(e.status)))throw Error('Hay un SOS pendiente. Cancélalo en SOS o espera su resultado antes de cerrar sesión.');await cloud.signOut();reset();}
     if(action==='refresh')await refresh();
     if(action==='resend-confirmation'){await cloud.resendConfirmation(confirmationEmail.value.trim());notify('Si tu cuenta está pendiente, recibirás un nuevo enlace de confirmación. Si ya la confirmaste, inicia sesión.');}
     if(action==='confirm-delete'){await cloud.deleteContact(el.dataset.id);close();await refresh();notify('Contacto eliminado de tu cuenta.');}
     if(action==='start-sos'){
       if(recovery||model.events.some(x=>['pending','dispatching'].includes(x.status)))return;
       const request=crypto.randomUUID();remember(request);changed();await create(request);
     }
     if(action==='recover'&&recovery)await create(recovery);
     if(action==='cancel-sos'){const r=await cloud.api({action:'cancel',eventId:el.dataset.id});model.events=model.events.map(e=>e.id===r.event.id?r.event:e);await refresh(false);notify('Cancelación confirmada por el servidor. No se enviará este SOS.');}
   }catch(e){error=human(e);if(dialog.open){let p=dialog.querySelector('.form-error');if(!p){p=document.createElement('p');p.className='form-error';p.setAttribute('role','alert');dialog.querySelector('.modal-body').append(p);}p.textContent=error;}notify(error,true);}
   finally{busy=false;changed();if(el.isConnected)el.disabled=false;}
 }
 async function submit(event){const f=event.target;if(!f.id.startsWith('real-'))return;event.preventDefault();if(busy)return;const data=Object.fromEntries(new FormData(f));const register=event.submitter?.name==='register';busy=true;error='';f.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{
     if(f.id==='real-auth-form'){
       const result=register?await cloud.signUp(data.email.trim(),data.password):await cloud.signIn(data.email.trim(),data.password);
       if(result.session){session=result.session;await refresh();}else{notify('Revisa tu correo para confirmar la cuenta. Si ya tenías una cuenta confirmada, inicia sesión.');f.reset();}
     }
     if(f.id==='real-profile-form'){
       const name=data.name.trim(),number=phone(data.phone);if(name.length<2||name.length>100)throw Error('Escribe un nombre de 2 a 100 caracteres.');if(number&&!/^\+[1-9]\d{7,14}$/.test(number))throw Error('Incluye el prefijo internacional, por ejemplo +18095550100.');
       await cloud.saveProfile(session.user.id,{name,phone:number});profileEdit=false;await refresh();notify('Perfil guardado en tu cuenta.');
     }
     if(f.id==='real-contact-form'){
       const fields={name:data.name.trim(),phone:phone(data.phone),relation:data.relation.trim(),whatsapp_opt_in:!!data.consent};
       if(fields.name.length<2||!fields.relation)throw Error('Completa el nombre y la relación.');
       if(!/^\+[1-9]\d{7,14}$/.test(fields.phone))throw Error('Incluye + y el código de país; usa entre 8 y 15 dígitos.');
       await cloud.saveContact(editor,fields);close();await refresh();notify('Contacto guardado en tu cuenta.');
     }
   }catch(e){error=human(e);const target=f.querySelector('.form-error');if(target){target.textContent=error;target.focus();}else notify(error,true);}
   finally{busy=false;f.querySelectorAll('button').forEach(b=>b.disabled=false);if(!error)changed();}
 }
 document.addEventListener('click',e=>{const el=e.target.closest('[data-real-action]');if(el&&!el.disabled){e.preventDefault();action(el.dataset.realAction,el);}});
 document.addEventListener('submit',submit);
 dialog.addEventListener('cancel',()=>{editor=null;});
 setInterval(()=>{
   document.querySelectorAll('[data-real-countdown]').forEach(el=>{const n=seconds(el.dataset.realCountdown);el.textContent=n;const cancel=document.querySelector('[data-real-action="cancel-sos"]');if(n===0&&cancel){cancel.disabled=true;const label=document.querySelector('[data-real-pending-label]');if(label)label.textContent='Plazo finalizado · esperando al servidor';}});
   if(!session||busy||polling||document.hidden||!model.events.some(e=>['pending','dispatching'].includes(e.status)))return;
   polling=true;refresh(false).catch(()=>{}).finally(()=>polling=false);
 },2000);
 return {view,init,hasActive:()=>model.events.some(e=>['pending','dispatching'].includes(e.status)),accountName:()=>model.profile?.name||'Tu cuenta'};
}
