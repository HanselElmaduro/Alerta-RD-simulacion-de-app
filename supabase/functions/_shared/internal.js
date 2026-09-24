import {UUID,validLocation,strictBody} from './core.js';
const fields={health:['action'],code:['action'],invite:['action','code','relation'],respond:['action','id','accept'],remove:['action','id'],create:['action','requestId'],cancel:['action','eventId'],location:['action','eventId','latitude','longitude'],read:['action','id']};
export async function internalHandler(req,{auth,command,env}){
 const origin=req.headers.get('origin');
 const origins=(env('ALLOWED_ORIGINS')||'https://alerta-rd-simulacion-de-app.vercel.app,https://alerta-rd-demo-interactiva.hanselh151.chatgpt.site,http://localhost:3000').split(',').map(x=>x.trim());
 const json=(b,status=200)=>new Response(JSON.stringify(b),{status,headers:{'content-type':'application/json','cache-control':'no-store',...(origin&&origins.includes(origin)?{'access-control-allow-origin':origin,vary:'Origin','access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'POST,OPTIONS'}:{})}});
 if(origin&&!origins.includes(origin))return json({error:'Origen no autorizado'},403);
 if(req.method==='OPTIONS'){const r=json({});return new Response(null,{status:204,headers:r.headers});}
 if(req.method!=='POST')return json({error:'Método no permitido'},405);
 try{
   const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
   if(!token)return json({error:'Inicia sesión para continuar'},401);
   const user=await auth(token);
   if(!user||user.is_anonymous||!user.email_confirmed_at)return json({error:'Necesitas una cuenta con correo confirmado'},401);
   const raw=await req.text();if(raw.length>2048)return json({error:'Solicitud demasiado grande'},400);
   let body;try{body=JSON.parse(raw);strictBody(body,fields[body?.action]||[]);}catch{return json({error:'Campos de solicitud no permitidos'},400);}
   if(!fields[body.action])return json({error:'Acción desconocida'},400);
   for(const key of ['id','code','eventId','requestId'])if(fields[body.action].includes(key)&&!UUID.test(body[key]||''))return json({error:'Identificador o código inválido'},400);
   if(body.action==='invite'&&(typeof body.relation!=='string'||body.relation.trim().length<1||body.relation.trim().length>50))return json({error:'Completa la relación (máximo 50 caracteres)'},400);
   if(body.action==='respond'&&typeof body.accept!=='boolean')return json({error:'Respuesta inválida'},400);
   if(body.action==='location'&&!validLocation(body.latitude,body.longitude))return json({error:'Ubicación inválida'},400);
   const result=await command(user.id,body);return json(result,result?.error?409:200);
 }catch{return json({error:'No se pudo completar la solicitud. Actualiza la bandeja antes de reintentar.'},500);}
}
