import {readdir,readFile} from 'node:fs/promises';
const files=[];async function walk(dir){for(const f of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+f.name;if(f.isDirectory())await walk(p);else files.push(p);}}await walk('dist');
for(const file of files){const s=await readFile(file,'utf8');if(/sb_secret_[A-Za-z0-9_-]{10,}|EAA[A-Za-z0-9]{30,}|-----BEGIN [\w ]*PRIVATE KEY-----/.test(s))throw Error('Posible secreto en '+file);}
const {cloudConfig}=await import('../dist/config.js');if(cloudConfig.key&&!cloudConfig.key.startsWith('sb_publishable_'))throw Error('Solo se permite una clave publishable en el frontend.');
console.log('Frontend: clave pública; no se detectaron tokens de Meta, claves secretas ni claves privadas.');
