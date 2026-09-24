import test from 'node:test';
import assert from 'node:assert/strict';
import {internalHandler} from '../supabase/functions/_shared/internal.js';
const id='11111111-1111-4111-8111-111111111111';
const origin='https://alerta-rd-simulacion-de-app.vercel.app';
function call(body,overrides={},headers={}){
 const deps={auth:async()=>({id,email_confirmed_at:'2026-01-01',is_anonymous:false}),command:async(user,b)=>({user,body:b}),env:()=>'',...overrides};
 return internalHandler(new Request(origin,{method:'POST',headers:{origin,authorization:'Bearer test','content-type':'application/json',...headers},body:JSON.stringify(body)}),deps);
}
test('internal: identity comes from authenticated user; no browser recipient or sender override',async()=>{
 let called=0;
 const valid=await call({action:'create',requestId:id});assert.equal(valid.status,200);assert.equal((await valid.json()).user,id);
 for(const extra of [{userId:id},{recipientId:id},{phone:'+12025550100'},{sender_id:id},{test:true}]){
  const r=await call({action:'create',requestId:id,...extra},{command:async()=>called++});assert.equal(r.status,400);
 }assert.equal(called,0);
});
test('internal: signed out, anonymous and unconfirmed accounts are rejected',async()=>{
 for(const user of [null,{id,is_anonymous:true,email_confirmed_at:'yes'},{id,is_anonymous:false,email_confirmed_at:null}])assert.equal((await call({action:'health'},{auth:async()=>user})).status,401);
 assert.equal((await call({action:'health'},{},{authorization:''})).status,401);
});
test('internal: validates actions, codes, consent and optional location',async()=>{
 for(const body of [{action:'invite',code:'bad',relation:'Friend'},{action:'invite',code:id,relation:''},{action:'respond',id,accept:'true'},{action:'location',eventId:id,latitude:91,longitude:0},{action:'read',id:'bad'},{action:'other'},null])assert.equal((await call(body)).status,400);
 assert.equal((await call({action:'create',requestId:id})).status,200);
 assert.equal((await call({action:'location',eventId:id,latitude:18.5,longitude:-69.9})).status,200);
});
test('internal: CORS exact domain, authenticated failures and no provider calls',async()=>{
 assert.equal((await call({action:'health'},{},{origin:'https://other.vercel.app'})).status,403);
 const r=await call({action:'create',requestId:id},{command:async()=>({error:'Agrega un amigo'})});assert.equal(r.status,409);assert.equal(r.headers.get('access-control-allow-origin'),origin);
 const f=await call({action:'health'},{command:async()=>{throw Error('secret-provider-token');}});assert.equal(f.status,500);assert.doesNotMatch(await f.text(),/secret-provider/);
});
