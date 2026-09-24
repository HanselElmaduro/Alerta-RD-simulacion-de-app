import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('dist/vendor',{recursive:true});
await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',minify:true,outfile:'dist/vendor/supabase.js',legalComments:'eof'});
if(process.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY){
 const url=process.env.PUBLIC_SUPABASE_URL,key=process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||'') || !key?.startsWith('sb_publishable_'))throw Error('Usa URL Supabase HTTPS y clave pública sb_publishable_.');
 await writeFile('dist/config.js',`export const cloudConfig = ${JSON.stringify({url,key})};\n`);
}
