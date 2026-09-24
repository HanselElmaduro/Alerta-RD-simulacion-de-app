import {webhookHandler} from '../_shared/core.js';
import {db,env} from '../_shared/runtime.ts';
Deno.serve(req=>webhookHandler(req,{db,env}));
