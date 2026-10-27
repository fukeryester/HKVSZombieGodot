import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRuntime,CORE} from '../runtime/desktop.mjs';
const root=path.resolve(import.meta.dirname,'..');
for(const name of ['node_modules','dist','artifacts']){fs.mkdirSync(path.join(root,name),{recursive:true});fs.writeFileSync(path.join(root,name,'.gdignore'),'');}
const E=createRuntime({gameId:'',fetchImpl:async()=>{throw Error('offline')}});
fs.mkdirSync(path.join(root,'assets/data'),{recursive:true});
fs.writeFileSync(path.join(root,'assets/data/catalog.json'),JSON.stringify(E.GodotGame.catalog()));
const manifest=Object.fromEntries(CORE.map(name=>[name+'.js',crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'runtime/core',name+'.js'))).digest('hex')]));
const vendorFiles=Object.fromEntries(fs.readdirSync(path.join(root,'runtime/vendor')).filter(n=>n.endsWith('.js')).map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'runtime/vendor',name))).digest('hex')]));
const output=path.join(root,'docs/upstream-hashes.json');
if(!fs.existsSync(output))fs.writeFileSync(output,JSON.stringify({source:'fukeryester/HKVSZombie2',commit:'ff53022',files:manifest},null,2)+'\n');
else {const expected=JSON.parse(fs.readFileSync(output,'utf8'));if(JSON.stringify(expected.files)!==JSON.stringify(manifest))throw Error('Upstream rules changed');if(expected.vendorFiles&&JSON.stringify(expected.vendorFiles)!==JSON.stringify(vendorFiles))throw Error('Upstream SDK changed');if(!expected.vendorFiles)fs.writeFileSync(output,JSON.stringify({...expected,vendorFiles},null,2)+'\n');}
console.log(`Prepared ${Object.keys(E.CIVS).length} civilizations / ${Object.values(E.CIVS).reduce((n,c)=>n+Object.keys(c.units).length,0)} units; verified ${CORE.length} immutable rule modules.`);
