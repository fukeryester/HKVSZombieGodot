/* Local process adapter used by the native Godot executable. Loopback only. */
import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export const CORE=['civs','expansion','balance','factions','war','economy','sim','ai','replay-core','network','progression','replay-store'];
export function createRuntime({baseline=false,userDir=null,base='http://101.43.19.238',gameId='4405e915c069c808',fetchImpl=fetch,WebSocketImpl=WebSocket}={}){
  const memory=new Map();if(userDir){fs.mkdirSync(userDir,{recursive:true});try{for(const [k,v]of Object.entries(JSON.parse(fs.readFileSync(path.join(userDir,'profile.json'),'utf8'))))memory.set(k,v);}catch{}}
  const persist=()=>{if(userDir){const f=path.join(userDir,'profile.json');fs.writeFileSync(f+'.tmp',JSON.stringify(Object.fromEntries(memory)));fs.renameSync(f+'.tmp',f);}};
  const localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,String(v));persist();},removeItem:k=>{memory.delete(k);persist();}};
  const u=new URL(base),E=vm.createContext({console,performance,Math,structuredClone,TextEncoder,TextDecoder,URL,URLSearchParams,Headers,crypto:webcrypto,Uint8Array,Uint32Array,setTimeout,clearTimeout,fetch:fetchImpl,WebSocket:WebSocketImpl,localStorage,location:{origin:u.origin,host:u.host,protocol:u.protocol,pathname:'/',search:''},document:{addEventListener(){},visibilityState:'visible'},addEventListener(){},navigator:{},GAMEHUB_GAME_ID:gameId,HKVZ_BASE:base});
  E.window=E;
  const run=file=>vm.runInContext(fs.readFileSync(path.join(here,file),'utf8'),E,{filename:file});
  run('platform.js');for(const f of ['gamehub-room','gamehub-stats','gamehub-matches'])run('vendor/'+f+'.js');for(const f of CORE)run(!baseline&&fs.existsSync(path.join(here,'configured',f+'.js'))?'configured/'+f+'.js':'core/'+f+'.js');
  if(!baseline&&fs.existsSync(path.join(here,'tuning.js')))run('tuning.js');
  // Desktop uses the exact replay schema with a native file store, rather than IndexedDB.
  let records=[];if(userDir)try{records=JSON.parse(fs.readFileSync(path.join(userDir,'replays.json'),'utf8'));}catch{}
  const store=()=>{if(userDir){const f=path.join(userDir,'replays.json');fs.writeFileSync(f+'.tmp',JSON.stringify(records));fs.renameSync(f+'.tmp',f);}};
  const summary=E.ReplayStore.summarize;
  E.ReplayStore={init:async()=>({durable:!!userDir}),save:async file=>{E.Replay.validate(file);records=[structuredClone(file),...records.filter(r=>r.id!==file.id)].sort((a,b)=>Date.parse(b.endedAt)-Date.parse(a.endedAt)).slice(0,5);store();return {local:!!userDir};},archive:async()=>({durable:!!userDir,entries:records.map(r=>({id:r.id,record:r,summary:summary(r),source:userDir?'local':'temporary'}))}),load:async e=>e.record};
  run('host.js');return E;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const flags=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
  const port=Number(flags['--connect']);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Missing loopback port');
  const E=createRuntime({userDir:flags['--user-dir'],gameId:flags['--game-id']||'4405e915c069c808'});
  const socket=net.createConnection({host:'127.0.0.1',port});let buffer='';
  socket.on('connect',()=>socket.write(JSON.stringify({hello:flags['--secret']})+'\n'));
  socket.on('data',data=>{buffer+=data.toString('utf8');if(buffer.length>32*1024*1024){socket.destroy();return;}let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const req=JSON.parse(line);const result=JSON.parse(E.GodotGame.request(JSON.stringify(req)));socket.write(JSON.stringify({id:req.id,result})+'\n');}catch(e){socket.write(JSON.stringify({error:e.message})+'\n');}}});
  socket.on('close',()=>process.exit(0));socket.on('error',()=>process.exit(1));
}
