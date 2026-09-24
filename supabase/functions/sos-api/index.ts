import {apiHandler} from '../_shared/core.js';
import {db,env,auth} from '../_shared/runtime.ts';
Deno.serve(req=>apiHandler(req,{db,env,auth}));
