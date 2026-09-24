import {dispatchHandler} from '../_shared/core.js';
import {db,env} from '../_shared/runtime.ts';
Deno.serve(async req=>{try{return await dispatchHandler(req,{db,env});}catch{return new Response('Dispatch incomplete',{status:503});}});
