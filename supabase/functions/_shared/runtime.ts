import {createClient} from 'npm:@supabase/supabase-js@2.117.1';
export const env=(name:string)=>Deno.env.get(name)||'';
const keys=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}');
const admin=createClient(env('SUPABASE_URL'),keys.default||env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const take=async (query:any)=>{const {data,error}=await query;if(error)throw error;return data;};
const rpc=(name:string,args?:object)=>take(admin.rpc(name,args));
export const auth=async(token:string)=>{const {data,error}=await admin.auth.getUser(token);return error?null:data.user;};
export const db={
 health:()=>rpc('alerta_worker_health'),
 existing:(user:string,request:string)=>take(admin.from('alerta_sos_events').select('*').eq('user_id',user).eq('request_id',request).maybeSingle()),
 contacts:(user:string)=>take(admin.from('alerta_contacts').select('phone,whatsapp_opt_in').eq('user_id',user)),
 create:(user:string,request:string,test:boolean)=>rpc('alerta_create_sos',{p_user:user,p_request:request,p_test:test}),
 cancel:(user:string,event:string)=>rpc('alerta_cancel_sos',{p_user:user,p_event:event}),
 location:(user:string,event:string,lat:number,lng:number)=>rpc('alerta_set_location',{p_user:user,p_event:event,p_lat:lat,p_lng:lng}),
 authorizeWorker:(token:string)=>rpc('alerta_worker_auth',{p_token:token}),
 claim:()=>rpc('alerta_claim_sos'),
 deliveries:(event:string)=>take(admin.from('alerta_sos_deliveries').select('*').eq('event_id',event)),
 beginDelivery:async(id:string)=>(await take(admin.from('alerta_sos_deliveries').update({status:'sending',attempted_at:new Date().toISOString()}).eq('id',id).eq('status','queued').select('id'))).length===1,
 contactStillConsents:async(d:any)=>!!(d.contact_id&&await take(admin.from('alerta_contacts').select('id').eq('id',d.contact_id).eq('user_id',d.user_id).eq('phone',d.phone).eq('whatsapp_opt_in',true).maybeSingle())),
 result:(id:string,r:any)=>rpc('alerta_delivery_result',{p_id:id,p_status:r.status,p_message:r.message,p_error:r.error}),
 finish:(id:string)=>take(admin.from('alerta_sos_events').update({status:'processed',finished_at:new Date().toISOString()}).eq('id',id).eq('status','dispatching')),
 webhook:(s:any)=>rpc('alerta_webhook_status',{p_id:s.id,p_message:s.message,p_phone:s.phone,p_status:s.status,p_at:s.at,p_error:s.error})
};
