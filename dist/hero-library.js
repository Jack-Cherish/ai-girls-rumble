// Stable body slots preserve existing saves even when other heroes are removed.
(async () => {
  const cast = ArenaManifest.characters, builtinCount = cast.length;
  let edits={}, db, records = [], hidden = new Set();
  const urls = new Map(), images = new Map();
  
  const result = req => new Promise((yes,no) => { req.onsuccess=()=>yes(req.result); req.onerror=()=>no(req.error); });
  try {
    const open=indexedDB.open('neural-clash-heroes',1);open.onupgradeneeded=()=>open.result.createObjectStore('library');
    db=await result(open);
    const saved=await result(db.transaction('library').objectStore('library').get('heroes'));
    edits=saved?.edits||{}; records=saved?.records || []; hidden=new Set(saved?.hidden || []);
  } catch (error) { console.warn('角色库不可用', error); }
  function installAssets(id,blobs){
    const assets={};
    for(const [key,blob] of Object.entries(blobs||{})){
      assets[key]=URL.createObjectURL(blob);
      const img=new Image();img.src=assets[key];images.set(id+key,img);
    }
    if(assets.art)urls.set(id,assets);return assets;
  }
  for(const c of cast){
    const r=edits[c.id];if(!r)continue;
    if(c.id==='nailong' && r.name==='奶龙（隔离候选）')r.name=c.name;
    const assets=installAssets(c.id,r.blobs);
    c.name=r.name;c.note=r.story;
    const picker=SELECT_CAST.find(x=>x.id===c.id);picker.name=r.name;
    if(assets.art)Object.assign(picker,{art:assets.art,face:assets.face,facesRight:true});
  }
  for (const [i,r] of records.entries()) {
    const id='hero-'+i;
    cast.push({id,name:r?.name||'已删除',title:r?.name||'',note:r?.story||'',role:'自创斗士',color:'#eafa57',facing:1});
    if (!r) {hidden.add(id); continue;}
    const override=edits[id];
    if(override&&r)Object.assign(cast.at(-1),{name:override.name,note:override.story});
    const assets=installAssets(id,override?.blobs||r.blobs);
    SELECT_CAST.push({...cast.at(-1),art:assets.art,face:assets.face||assets.art,facesRight:true});
  }
  for(let i=SELECT_CAST.length-1;i>=0;i--)if(hidden.has(SELECT_CAST[i].id))SELECT_CAST.splice(i,1);
  async function update(edit,body) {
    if(!db)throw Error('当前浏览器无法保存角色，请允许本地存储。');
    const tx=db.transaction('library','readwrite'), store=tx.objectStore('library');
    const saved=await result(store.get('heroes'))||{records:[],hidden:[]};
    edit(saved);store.put(saved,'heroes');
    await new Promise((yes,no)=>{tx.oncomplete=yes;tx.onabort=()=>no(tx.error);tx.onerror=()=>no(tx.error);});
    sessionStorage.setItem('open-hero-workshop',JSON.stringify({body})); location.reload();
  }
  window.HeroLibrary={cast,builtinCount,hidden,urls,images,records,edits,update,
    active:()=>cast.filter(c=>!hidden.has(c.id)),
    record:body=>edits[cast[body]?.id]||records[body-builtinCount]};
  await Promise.all(Array.from(images.values(),img=>img.decode().catch(()=>{})));
  for(const src of ['arena-ui.js','app.js?v=8.16','shell.js?v=8.12','select-play.js?v=8.10','hero-editor.js']){
    await new Promise((yes,no)=>{const s=document.createElement('script');s.onload=yes;s.onerror=no;s.src=src;document.head.append(s);});
  }
  window.dispatchEvent(new Event('hero-app-ready'));
  if(sessionStorage.getItem('open-hero-workshop')){
    const target=JSON.parse(sessionStorage.getItem('open-hero-workshop'));sessionStorage.removeItem('open-hero-workshop');ArenaShell.show('page');ArenaApp.workshop(target?.body);
  }
})();
