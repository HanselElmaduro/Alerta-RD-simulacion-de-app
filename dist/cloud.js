import {createClient} from './vendor/supabase.js';
import {cloudConfig} from './config.js';
export const confirmationRedirect = () => new URL('/auth-callback.html', window.location.origin).href;
export function connectCloud(){
 if(!cloudConfig.url||!cloudConfig.key)return null;
 const client=createClient(cloudConfig.url,cloudConfig.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'alerta-rd-auth-v2'}});
 const take=async query=>{const {data,error}=await query;if(error)throw error;return data;};
 return {
   client,
   session:async()=>{const r=await take(client.auth.getSession());return r.session;},
   signIn:(email,password)=>take(client.auth.signInWithPassword({email,password})),
   signUp:(email,password)=>take(client.auth.signUp({email,password,options:{emailRedirectTo:confirmationRedirect()}})),
   resendConfirmation:email=>take(client.auth.resend({type:'signup',email,options:{emailRedirectTo:confirmationRedirect()}})),
   signOut:()=>take(client.auth.signOut()),
   data:async()=>{const [profile,contacts,events,deliveries]=await Promise.all([
     take(client.from('alerta_profiles').select('*').maybeSingle()),
     take(client.from('alerta_contacts').select('*').order('created_at')),
     take(client.from('alerta_sos_events').select('*').order('created_at',{ascending:false}).limit(50)),
     take(client.from('alerta_sos_deliveries').select('*').order('attempted_at',{ascending:false,nullsFirst:false}).limit(250))
   ]);return {profile,contacts,events,deliveries};},
   saveProfile:(user,fields)=>take(client.from('alerta_profiles').upsert({user_id:user,...fields}).select().single()),
   saveContact:(id,fields)=>take(id?client.from('alerta_contacts').update(fields).eq('id',id).select().single():client.from('alerta_contacts').insert(fields).select().single()),
   deleteContact:id=>take(client.from('alerta_contacts').delete().eq('id',id).select().single()),
   api:async body=>{
     const {data,error}=await client.functions.invoke('sos-api',{body});
     if(error){let msg;try{msg=(await error.context?.json())?.error;}catch{}throw Error(msg||'No se pudo contactar al servidor. Consulta el historial antes de volver a intentar.');}
     if(data?.error)throw Error(data.error);return data;
   },
   internalData:async()=>{const [links,events,inbox]=await Promise.all([
     take(client.from('alerta_app_links').select('*').order('created_at',{ascending:false}).limit(100)),
     take(client.from('alerta_app_events').select('*').order('created_at',{ascending:false}).limit(50)),
     take(client.from('alerta_app_inbox').select('*').order('available_at',{ascending:false}).limit(100))
   ]);const outbox=events.length?await take(client.from('alerta_app_outbox').select('*').in('event_id',events.map(e=>e.id)).limit(250)):[];return {links,events,outbox,inbox};},
   internal:async body=>{
     const {data,error}=await client.functions.invoke('internal-sos',{body});
     if(error){let message;try{message=(await error.context?.json())?.error;}catch{}
       const failure=Error(message||'No se pudo contactar al servidor. Usa Actualizar; no supongas que el SOS se canceló.');
       failure.definitive=!!message&&[400,401,403,409].includes(error.context?.status);throw failure;
     }
     if(data?.error){const failure=Error(data.error);failure.definitive=true;throw failure;}return data;
   },
   recovery:request=>take(client.from('alerta_sos_events').select('*').eq('request_id',request).maybeSingle())
 };
}
