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
   recovery:request=>take(client.from('alerta_sos_events').select('*').eq('request_id',request).maybeSingle())
 };
}
