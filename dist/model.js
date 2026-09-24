export const STORAGE_KEY = 'alerta-rd-demo-v1';
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function initialState() {
 return {version:1,contacts:[],profile:{name:'',phone:'',blood:'No especificado',allergies:'',meds:''},drive:{active:false,consent:false,transport:'',placement:'',seconds:15},network:{joined:false,alerts:[]},pins:null,pattern:['VOL+','VOL+','VOL+'],history:[],incident:null,trip:null,tutor:{status:'normal',deadline:null}};
}
export function loadState(storage) {
 try {const value=JSON.parse(storage.getItem(STORAGE_KEY)); if(!value) return {state:initialState()}; if(value.version!==1||!Array.isArray(value.contacts)||!Array.isArray(value.history)||!value.drive||!value.network||!value.profile||!value.tutor) throw new Error(); return {state:{...initialState(),...value}};} catch {return {state:initialState(),error:'No pudimos recuperar los datos guardados. Esta sesión empieza vacía.'};}
}
export function addEvent(s,type,title,status,detail,extra={}) {const event={id:uid(),at:Date.now(),type,title,status,detail,...extra}; s.history.unshift(event); return event;}
export function startIncident(s,type,seconds=10,details={}) {
 if(s.incident) return false;
 s.incident={id:uid(),type,deadline:Date.now()+seconds*1000,seconds,note:'',contactId:s.contacts[0]?.id||'',...details};
 addEvent(s,type,type==='Drive'?'Impacto simulado detectado':type==='Accidente'?'Accidente de demostración':'SOS de demostración','En cuenta regresiva',`Prueba iniciada. ${seconds} segundos para cancelar. No se ha enviado una alerta.`,{incidentId:s.incident.id}); return true;
}
export function endIncident(s,status='Simulación completada') {
 if(!s.incident) return null;
 const incident=s.incident; const contact=s.contacts.find(c=>c.id===incident.contactId);
 const detail=`${incident.note?incident.note+'. ':''}${contact?`Contacto elegido: ${contact.name} (${contact.phone}). `:'Sin contacto seleccionado. '}Ninguna persona ni servicio de emergencia recibió una alerta.`;
 const event=addEvent(s,incident.type,incident.type==='Drive'?'Resultado del impacto simulado':incident.type==='Accidente'?'Resultado del accidente simulado':'Resultado de SOS',status,detail,{incidentId:incident.id}); s.incident=null; return event;
}
export function startTrip(s,destination,contactId,minutes) {
 if(s.trip) return 'Ya hay un trayecto activo.';
 if(!destination.trim()||destination.trim().length<2) return 'Escribe un destino de al menos 2 caracteres.';
 const contact=s.contacts.find(c=>c.id===contactId); if(!contact) return 'Agrega y selecciona un contacto guardado.';
 if(!Number.isInteger(minutes)||minutes<1||minutes>1440) return 'El tiempo debe ser un número entero entre 1 y 1440 minutos.';
 s.trip={id:uid(),destination:destination.trim(),contact:{...contact},minutes,deadline:Date.now()+minutes*60000,status:'active'};
 addEvent(s,'Ruta','Trayecto iniciado','Activo',`Destino: ${s.trip.destination}. Contacto de prueba: ${contact.name}. Duración: ${minutes} min. No se notificó al contacto.`); return null;
}
export function finishTrip(s,status) {if(!s.trip)return; addEvent(s,'Ruta',s.trip.destination,status,`Trayecto de demostración con ${s.trip.contact.name}. No se enviaron notificaciones.`);s.trip=null;}
export function advanceTime(s,now=Date.now()) {
 const results=[];
 if(s.incident&&now>=s.incident.deadline) results.push({kind:'incident',event:endIncident(s)});
 if(s.trip?.status==='active'&&now>=s.trip.deadline) {s.trip.status='verifying';s.trip.verifyDeadline=now+15000;addEvent(s,'Verificación','Tiempo de trayecto vencido','Verificando',`¿Llegaste a ${s.trip.destination}? Tienes 15 segundos para confirmar. Verificación simulada.`);results.push({kind:'trip-check'});}
 if(s.trip?.status==='verifying'&&now>=s.trip.verifyDeadline) {s.trip.status='escalated';addEvent(s,'Verificación','Trayecto sin respuesta','Escalamiento simulado',`No hubo respuesta para ${s.trip.destination}. Se registró un escalamiento local; ${s.trip.contact.name} no recibió ningún mensaje.`);results.push({kind:'trip-escalated'});}
 if(s.tutor.status==='waiting'&&now>=s.tutor.deadline) {s.tutor.status='escalated';s.tutor.deadline=null;addEvent(s,'Tutor','Verificación sin respuesta','Escalamiento simulado','El plazo de Tutor venció. Seguimiento simulado; no se activó un SOS real ni se avisó a terceros.');results.push({kind:'tutor-escalated'});}
 return results;
}
export const validPhone=phone=>/^\+?[\d\s()-]+$/.test(phone)&&phone.replace(/\D/g,'').length>=10&&phone.replace(/\D/g,'').length<=15;
export function validateContact(s,data,id) {
 if(data.name.trim().length<2) return 'Escribe un nombre de al menos 2 caracteres.';
 if(!validPhone(data.phone)) return 'Escribe un teléfono válido de 10 a 15 dígitos.';
 if(!data.relation.trim()) return 'Indica el parentesco o la relación.';
 if(s.contacts.some(c=>c.id!==id&&c.phone.replace(/\D/g,'')===data.phone.replace(/\D/g,''))) return 'Este teléfono ya está en tus contactos.';
 return null;
}
export function validatePins(normal,duress) {if(!/^\d{4,6}$/.test(normal)||!/^\d{4,6}$/.test(duress))return 'Cada PIN debe tener entre 4 y 6 dígitos.';if(normal===duress)return 'Los dos PIN deben ser diferentes.';return null;}
export const remaining=(deadline,now=Date.now())=>Math.max(0,Math.ceil((deadline-now)/1000));
export function clock(seconds) {return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
