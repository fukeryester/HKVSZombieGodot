/* Platform-only adaptation: account transport and desktop persistence, no rules. */
window.HKVZPlatform=(()=>{
  let token='';const base=window.HKVZ_BASE||location.origin;
  const rawFetch=window.fetch.bind(window),RawSocket=window.WebSocket;
  window.fetch=(url,options={})=>{
    const target=new URL(url,base);const headers=new Headers(options.headers||{});
    if(token&&target.origin===new URL(base).origin)headers.set('Authorization','Bearer '+token);
    return rawFetch(target, {...options,headers});
  };
  window.WebSocket=class extends RawSocket{
    constructor(url,protocols){const u=new URL(url);if(token&&u.host===new URL(base).host)u.searchParams.set('token',token);super(u.toString(),protocols);}
  };
  return {configure(a){token=String(a.token||'');if(a.gameId)window.GAMEHUB_GAME_ID=String(a.gameId);},base};
})();
