import test from 'node:test';
import assert from 'node:assert/strict';
import {completeConfirmation} from '../dist/auth-return.js';
const run=async({url='https://app.example/auth-callback.html',session=null,fail=false}={})=>{
 let mode,cleared=false,calls=0;
 const result=await completeConfirmation({url,storage:{setItem:(k,v)=>{mode=[k,v];}},clearUrl:()=>{cleared=true;},connect:()=>({session:async()=>{calls++;if(fail)throw Error('private-error');return session;}})});
 return {result,mode,cleared,calls};
};
test('confirmación válida abre el modo cuenta y limpia el enlace',async()=>{const r=await run({session:{user:{id:'test'}}});assert.equal(r.result.ok,true);assert.deepEqual(r.mode,['alerta-rd-mode','real']);assert.equal(r.cleared,true);});
test('enlace vencido no inicia sesión ni expone parámetros',async()=>{const r=await run({url:'https://app.example/auth-callback.html#error=access_denied&error_description=private'});assert.equal(r.result.ok,false);assert.match(r.result.message,/venció/);assert.doesNotMatch(r.result.message,/private/);assert.equal(r.calls,0);assert.equal(r.cleared,true);});
test('enlace sin sesión orienta al acceso y reenvío',async()=>{const r=await run();assert.equal(r.result.ok,false);assert.match(r.result.message,/inicia sesión/);assert.equal(r.cleared,true);});
test('fallo de red limpia credenciales y permite recuperar acceso',async()=>{const r=await run({fail:true});assert.equal(r.result.ok,false);assert.match(r.result.message,/conexión/);assert.doesNotMatch(r.result.message,/private/);assert.equal(r.cleared,true);});
