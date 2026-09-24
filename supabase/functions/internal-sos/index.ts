import {createClient} from 'npm:@supabase/supabase-js@2.117.1';
import {internalHandler} from '../_shared/internal.js';
const env=(name:string)=>Deno.env.get(name)||'';
const keys=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}');
const admin=createClient(env('SUPABASE_URL'),keys.default||env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const auth=async(token:string)=>{const {data,error}=await admin.auth.getUser(token);return error?null:data.user;};
const command=async(user:string,body:object)=>{const {data,error}=await admin.rpc('alerta_app_command',{p_user:user,p_body:body});if(error)throw error;return data;};
Deno.serve(req=>internalHandler(req,{auth,command,env}));
