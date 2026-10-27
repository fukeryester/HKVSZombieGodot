// Host file dialogs are presentation only; imported files still pass Replay.validate.
window.HKVZPickReplay=()=>{
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.addEventListener('change',async()=>{
    try{const file=JSON.parse(await input.files[0].text());const r=JSON.parse(GodotGame.request(JSON.stringify({method:'import',args:{file}})));if(r.error)alert(r.error);}
    catch(e){alert('录像读取失败：'+e.message);}
  });input.click();
};
