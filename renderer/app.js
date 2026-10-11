window.addEventListener("error",e=>{document.body.insertAdjacentHTML("afterbegin","<pre style=\"position:fixed;z-index:9;top:0;left:200px;right:0;background:#7f1d1d;color:#fff;padding:10px;white-space:pre-wrap\">Error: "+e.message+"</pre>")});window.addEventListener("unhandledrejection",e=>{document.body.insertAdjacentHTML("afterbegin","<pre style=\"position:fixed;z-index:9;top:0;left:200px;right:0;background:#7f1d1d;color:#fff;padding:10px;white-space:pre-wrap\">Error: "+(e.reason&&e.reason.message||e.reason)+"</pre>")});
const A=window.api,$=s=>document.querySelector(s),q=(s,p)=>A.all(s,p),run=(s,p)=>A.run(s,p);
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const opts=(a,sel)=>a.map(x=>`<option ${x==sel?'selected':''}>${esc(x)}</option>`).join('');
const DEF={font:'Georgia, serif',size:6,color:'#ffffff',bold:false,align:'center',v:'center',h:0,line:1.3,shadow:true,outline:false,box:0};
const S={items:[],idx:0,bg:'#111',cur:null,live:false,mode:'content',style:{...DEF},join:false,view:'inicio',ver:'RVR',air:null};
const CATS=['biblia','canciones','reflexiones','anuncios','presentaciones'];
let FV=[];
const getS=async(k,d)=>{const r=await q('select value from settings where key=?',[k]);return r[0]?JSON.parse(r[0].value):d};
const setS=(k,v)=>run('insert or replace into settings(key,value) values(?,?)',[k,JSON.stringify(v)]);
const bgCss=async id=>id?(await q('select value from backgrounds where id=?',[id]))[0]?.value:null;
const bgFor=async(k,id)=>(await bgCss(id))||(await bgCss(await getS('bg_'+k)))||'linear-gradient(135deg,#1e3a8a,#0f172a)';
const msg=t=>{$('#msg').textContent=t;setTimeout(()=>$('#msg').textContent='',2500)};

/* ---------- proyección y vista previa ---------- */
const pstate=()=>{const it=S.items[S.idx]||{};return{mode:S.mode,text:it.text||'',reference:it.ref||'',background:S.bg,style:S.style}};
const refresh=()=>$('#pv').contentWindow.postMessage(pstate(),'*');
function status(){$('#live').textContent=!S.live?'Proyección apagada':S.mode==='black'?'■ PANTALLA NEGRA':S.mode==='hidden'?'◌ CONTENIDO OCULTO':'● EN PANTALLA: '+(S.air?.c?.label||'')+(S.test?' (modo prueba)':'')}
async function projectNow(){
  if(!S.items.length)return;
  if(!S.live){const r=await A.openProjection();S.live=true;S.test=r.testMode}
  S.mode='content';S.air={c:S.cur,i:S.idx};A.project(pstate());
  const k=S.cur.type+S.cur.ref;if(S.logged!==k){S.logged=k;run('insert into history(type,ref,label) values(?,?,?)',[S.cur.type,S.cur.ref,S.cur.label])}
  drawSlides();refresh();status();
}
function go(d){const n=S.idx+d;if(n<0||n>=S.items.length)return;S.idx=n;if(S.live&&S.mode==='content')projectNow();else{drawSlides();refresh()}}
const pick=i=>{S.idx=i;if(S.live&&S.mode==='content')projectNow();else{drawSlides();refresh()}};
function mode(m){S.mode=S.mode===m?'content':m;if(S.live)A.project(pstate());refresh();drawSlides();status()}
async function stop(){await A.closeProjection();S.live=false;S.air=null;drawSlides();status()}
function drawSlides(){
  $('#slides').innerHTML=(S.cur?`<h3 style="margin:0 0 8px">${esc(S.cur.label)}</h3>`:'<p class=mut>Elige una canción, pasaje o reflexión para prepararlo aquí.</p>')+
  '<div class=grid>'+S.items.map((x,i)=>`<div class="card sl ${i==S.idx?'sel':''}" onclick="pick(${i})"><b>${i+1}</b>${S.live&&S.mode=='content'&&S.air&&S.air.c===S.cur&&S.air.i==i?'<span class=air>EN PANTALLA</span>':''}<p>${esc(x.text)}</p><small>${esc(x.ref)}</small></div>`).join('')+'</div>';
}

/* ---------- carga de contenido ---------- */
async function bible(code,ref){
  const m=ref.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);if(!m)return null;
  const books=await q('select * from bible_books'),n=norm(m[1]);
  const b=books.find(x=>norm(x.name)===n)||books.find(x=>norm(x.name).startsWith(n))||books.find(x=>norm(x.name).includes(n));if(!b)return null;
  const v=await q('select v.verse,v.text from bible_verses v join bible_versions s on s.id=v.version_id where s.code=? and v.book_id=? and v.chapter=? order by v.verse',[code,b.id,+m[2]]);
  const a=m[3]?+m[3]:1,z=m[4]?+m[4]:(m[3]?+m[3]:9999),sel=v.filter(x=>x.verse>=a&&x.verse<=z);if(!sel.length)return null;
  if(S.join&&sel.length>1)return[{text:sel.map(x=>x.text).join(' '),ref:`${b.name} ${m[2]}:${sel[0].verse}-${sel.at(-1).verse} (${code})`}];
  return sel.map(x=>({text:x.text,ref:`${b.name} ${m[2]}:${x.verse} (${code})`}));
}
async function load(type,ref){
  if(type==='bible'){const[c,r]=ref.split('|');return{items:(await bible(c,r))||[],bg:await bgFor('bible'),label:r+' · '+c}}
  if(type==='song'){const s=(await q('select * from songs where id=?',[ref]))[0];if(!s)return{items:[],bg:'#111',label:'(eliminada)'};
    const sl=await q('select text from song_slides where song_id=? order by position',[ref]);return{items:sl.map(x=>({text:x.text,ref:s.title})),bg:await bgFor('song',s.background_id),label:s.title}}
  if(type==='reflection'){const r=(await q('select * from reflections where id=?',[ref]))[0];if(!r)return{items:[],bg:'#111',label:'(eliminada)'};
    const p=(r.body||'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);return{items:p.map(t=>({text:t,ref:r.title+(r.author?' — '+r.author:'')})),bg:await bgFor('song',r.background_id),label:r.title}}
  return{items:[{text:ref,ref:''}],bg:await bgFor('song'),label:ref.slice(0,30)};
}
async function setCur(type,ref){const l=await load(type,ref);Object.assign(S,{items:l.items,idx:0,bg:l.bg,cur:{type,ref,label:l.label}});drawSlides();refresh();if(!l.items.length)msg('No se encontró contenido')}
async function lp(i){await setCur(FV[i].type,FV[i].ref);projectNow()}
async function favCur(){if(!S.cur)return;const{type,ref,label}=S.cur;
  if((await q('select 1 from favorites where type=? and ref=?',[type,ref])).length){await run('delete from favorites where type=? and ref=?',[type,ref]);msg('Quitado de favoritos')}
  else{await run('insert into favorites(type,ref,label) values(?,?,?)',[type,ref,label]);msg('Guardado en favoritos ⭐')}}

/* ---------- páginas ---------- */
const P={};
P.inicio=async()=>`<h2>Inicio</h2><p class=mut>Proyecta un texto libre (bienvenida, anuncio) o usa el menú.</p>
<textarea id=free rows=4 placeholder="Escribe el texto a proyectar…"></textarea><div class=row><button onclick="if($('#free').value.trim())setCur('text',$('#free').value.trim())">Preparar texto</button></div>`;

P.biblia=async()=>{const v=await q('select code from bible_versions'),b=await q('select name from bible_books order by number');
  if(!v.length)return'<h2>Biblia</h2><p>Aún no hay Biblias cargadas. Ve a <b>Configuración → Importar Biblia</b> y elige tu archivo JSON con licencia (RVR o NVI).</p>';
  if(!v.find(x=>x.code==S.ver))S.ver=v[0].code;
  return`<h2>Biblia</h2><div class=row><select onchange="S.ver=this.value;bgo()">${opts(v.map(x=>x.code),S.ver)}</select>
<select id=bb>${opts(b.map(x=>x.name))}</select><input id=bc type=number min=1 placeholder=Cap style="max-width:80px;flex:none"><input id=bvs placeholder="Vers. 16 o 16-18" style="max-width:150px;flex:none"><button onclick="bgo(1)">Buscar</button></div>
<div class=row><input id=br placeholder="O escribe: Juan 3:16" value="${esc(S.lastRef||'')}" onkeydown="if(event.key=='Enter')bgo()"><label><input type=checkbox ${S.join?'checked':''} onchange="S.join=this.checked;bgo()"> Unir rango en una diapositiva</label></div>
<p class=mut>Capítulo completo: escribe solo libro y capítulo (ej. “Salmos 23”). Usa ◀ ▶ para cambiar de versículo.</p>`};
function bgo(f){const r=f?`${$('#bb').value} ${$('#bc').value||1}${$('#bvs').value?':'+$('#bvs').value:''}`:($('#br')?.value||S.lastRef);if(!r)return;
  S.lastRef=r;if($('#br'))$('#br').value=r;setCur('bible',S.ver+'|'+r)}

P.canciones=async()=>{const o=S.so||'title',r=await q(`select * from songs order by ${o=='artist'?'artist':'title'} collate nocase`),bgs=await q('select id,name from backgrounds order by name'),e=S.es;
  const form=e?`<div class=card><h3>${e.id?'Editar':'Nueva'} canción</h3><div class=row><input id=se_title placeholder=Título value="${esc(e.title)}"><input id=se_artist placeholder="Artista o grupo" value="${esc(e.artist)}"><input id=se_category placeholder=Categoría value="${esc(e.category)}"></div>
<div class=row><label>Fondo: <select id=se_bg><option value="">(predeterminado)</option>${bgs.map(b=>`<option value=${b.id} ${b.id==e.background_id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label></div>
<textarea id=se_lyrics rows=10 placeholder="Pega la letra. Separa cada diapositiva con una línea en blanco.">${esc(e.lyrics)}</textarea>
<div class=row><button onclick="autoSplit()">✂ Dividir letra automáticamente</button><button onclick="saveSong()" style="background:#16a34a">Guardar</button><button onclick="S.es=null;show('canciones')">Cancelar</button></div></div>`:'';
  return`<h2>Canciones</h2><div class=row><input placeholder="Buscar por nombre…" oninput="filt(this.value)"><select onchange="S.so=this.value;show('canciones')">${['title','artist'].map(x=>`<option value=${x} ${x==o?'selected':''}>Ordenar por ${x=='title'?'título':'artista'}</option>`)}</select><button onclick="S.es={};show('canciones')">+ Nueva canción</button></div>${form}
${r.map(s=>`<div class="card row sg" data-t="${esc(norm(s.title+' '+(s.artist||'')))}"><div style="flex:1"><b>${esc(s.title)}</b><br><small>${esc(s.artist||'')} ${s.category?'· '+esc(s.category):''}</small></div><button onclick="setCur('song',${s.id})">Preparar</button><button onclick="editSong(${s.id})">✎</button><button onclick="dupSong(${s.id})">⧉</button><button onclick="delSong(${s.id})">🗑</button></div>`).join('')||'<p class=mut>Todavía no hay canciones.</p>'}`};
const filt=v=>document.querySelectorAll('.sg').forEach(r=>r.style.display=r.dataset.t.includes(norm(v))?'':'none');
async function editSong(id){S.es=(await q('select * from songs where id=?',[id]))[0];show('canciones')}
function autoSplit(){const t=$('#se_lyrics');if(/\n\s*\n/.test(t.value.trim()))return msg('Ya tiene diapositivas');
  const l=t.value.split('\n').map(x=>x.trim()).filter(Boolean),c=[];for(let i=0;i<l.length;i+=2)c.push(l.slice(i,i+2).join('\n'));t.value=c.join('\n\n')}
async function saveSong(){const f=k=>$('#se_'+k).value.trim();if(!f('title'))return alert('Falta el título');
  const a=[f('title'),f('artist'),f('category'),f('lyrics'),f('bg')||null];let id=S.es.id;
  if(id)await run('update songs set title=?,artist=?,category=?,lyrics=?,background_id=? where id=?',[...a,id]);
  else id=await run('insert into songs(title,artist,category,lyrics,background_id) values(?,?,?,?,?)',a);
  await run('delete from song_slides where song_id=?',[id]);
  const sl=f('lyrics').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<sl.length;i++)await run('insert into song_slides(song_id,position,text) values(?,?,?)',[id,i+1,sl[i]]);
  S.es=null;show('canciones')}
async function dupSong(id){const s=(await q('select * from songs where id=?',[id]))[0];
  const n=await run('insert into songs(title,artist,category,lyrics,background_id) values(?,?,?,?,?)',[s.title+' (copia)',s.artist,s.category,s.lyrics,s.background_id]);
  await run('insert into song_slides(song_id,position,text) select ?,position,text from song_slides where song_id=?',[n,id]);show('canciones')}
async function delSong(id){if(confirm('¿Eliminar esta canción?')){await run('delete from songs where id=?',[id]);show('canciones')}}

P.fondos=async()=>{const c=S.fc||'',r=await q('select * from backgrounds '+(c?'where category=? ':'')+'order by is_favorite desc,id',c?[c]:[]);
  return`<h2>Fondos</h2><div class=row><select onchange="S.fc=this.value;show('fondos')"><option value="">Todas las categorías</option>${CATS.map(x=>`<option ${x==c?'selected':''}>${x}</option>`)}</select><button onclick="addBg()" style="background:#16a34a">+ Agregar fondo</button></div>
<p class=mut>Clic en la miniatura para usarlo ahora. “Biblia” / “Canciones” lo dejan como fondo predeterminado de ese módulo.</p>
<div class=grid>${r.map(b=>`<div class=card><div class=th style="background:${esc(b.value)};background-size:cover" onclick="useBg(${b.id})"></div><small>${esc(b.name)} · ${b.category}</small><div class=row><button onclick="setBg('bible',${b.id})">Biblia</button><button onclick="setBg('song',${b.id})">Canciones</button><button onclick="favBg(${b.id},${b.is_favorite?0:1})">${b.is_favorite?'★':'☆'}</button>${b.is_custom?`<button onclick="delBg(${b.id})">🗑</button>`:''}</div></div>`).join('')}</div>`};
async function addBg(){await A.pickImage(S.fc||'general');show('fondos')}
async function useBg(id){S.bg=await bgCss(id);refresh();if(S.live&&S.mode==='content')A.project(pstate())}
async function setBg(k,id){await setS('bg_'+k,id);msg('Fondo predeterminado guardado')}
async function favBg(id,v){await run('update backgrounds set is_favorite=? where id=?',[v,id]);show('fondos')}
async function delBg(id){if(confirm('¿Eliminar fondo?')){await run('delete from backgrounds where id=?',[id]);show('fondos')}}

P.reflexiones=async()=>{const r=await q('select * from reflections order by id desc'),e=S.er;
  const form=e?`<div class=card><div class=row><input id=rf_title placeholder=Título value="${esc(e.title)}"><input id=rf_author placeholder=Autor value="${esc(e.author)}"><input id=rf_category placeholder=Categoría value="${esc(e.category)}"><input id=rf_date type=date value="${esc(e.date)}"></div>
<textarea id=rf_body rows=8 placeholder="Texto (separa diapositivas con una línea en blanco)">${esc(e.body)}</textarea><div class=row><button onclick="saveRef()" style="background:#16a34a">Guardar</button><button onclick="S.er=null;show('reflexiones')">Cancelar</button></div></div>`:'';
  return`<h2>Reflexiones</h2><div class=row><button onclick="S.er={};show('reflexiones')">+ Nueva reflexión</button></div>${form}
${r.map(x=>`<div class="card row"><div style="flex:1"><b>${esc(x.title)}</b><br><small>${esc(x.author||'')} ${esc(x.date||'')} ${esc(x.category||'')}</small></div><button onclick="setCur('reflection',${x.id})">Preparar</button><button onclick="editRef(${x.id})">✎</button><button onclick="delRef(${x.id})">🗑</button></div>`).join('')}`};
async function editRef(id){S.er=(await q('select * from reflections where id=?',[id]))[0];show('reflexiones')}
async function saveRef(){const f=k=>$('#rf_'+k).value.trim();if(!f('title'))return alert('Falta el título');const a=[f('title'),f('body'),f('author'),f('date'),f('category')];
  if(S.er.id)await run('update reflections set title=?,body=?,author=?,date=?,category=? where id=?',[...a,S.er.id]);
  else await run('insert into reflections(title,body,author,date,category) values(?,?,?,?,?)',a);S.er=null;show('reflexiones')}
async function delRef(id){if(confirm('¿Eliminar?')){await run('delete from reflections where id=?',[id]);show('reflexiones')}}

P.servicio=async()=>{const sv=await q('select * from services order by id desc');if(!S.svc&&sv[0])S.svc=sv[0].id;
  const it=S.svc?await q('select * from service_items where service_id=? order by position',[S.svc]):[];S.svcItems=it;
  S.songs=await q('select id,title from songs order by title');S.refl=await q('select id,title from reflections order by title');
  return`<h2>Servicio</h2><div class=row><select onchange="S.svc=+this.value;show('servicio')">${sv.map(x=>`<option value=${x.id} ${x.id==S.svc?'selected':''}>${esc(x.name)}</option>`)}</select><input id=svn placeholder="Nombre del nuevo servicio (ej. Domingo)"><button onclick="newSvc()">+ Crear</button>${S.svc?'<button onclick="delSvc()">🗑 Eliminar servicio</button>':''}</div>
${S.svc?`<div class=row><select id=it_t onchange="svcType()"><option value=text>Texto libre</option><option value=song>Canción</option><option value=bible>Biblia</option><option value=reflection>Reflexión</option></select><span id=it_v style="flex:1;display:flex"></span><button onclick="svcAdd()">Agregar</button></div>`:'<p class=mut>Crea un servicio para empezar.</p>'}
${it.map((x,i)=>`<div class="card row"><b>${i+1}.</b><div style="flex:1">${esc(x.label)} <small>${x.type}</small></div><button onclick="svcGo(${i})" style="background:#2563eb">▶ Proyectar</button><button onclick="svcMove(${i},-1)">↑</button><button onclick="svcMove(${i},1)">↓</button><button onclick="svcDel(${i})">✕</button></div>`).join('')}`};
function svcType(){const t=$('#it_t').value,v=$('#it_v');
  v.innerHTML=t=='song'?`<select id=iv style="flex:1">${S.songs.map(s=>`<option value=${s.id}>${esc(s.title)}</option>`)}</select>`:t=='reflection'?`<select id=iv style="flex:1">${S.refl.map(s=>`<option value=${s.id}>${esc(s.title)}</option>`)}</select>`:`<input id=iv style="flex:1" placeholder="${t=='bible'?'Salmos 23':'Bienvenida…'}">`}
async function newSvc(){const n=$('#svn').value.trim();if(!n)return;S.svc=await run('insert into services(name,date) values(?,date("now"))',[n]);show('servicio')}
async function delSvc(){if(confirm('¿Eliminar servicio?')){await run('delete from services where id=?',[S.svc]);S.svc=null;show('servicio')}}
async function svcAdd(){const t=$('#it_t').value,e=$('#iv');if(!e||!e.value.trim())return;
  const label=t=='song'||t=='reflection'?e.selectedOptions[0].text:t=='bible'?'Biblia - '+e.value:e.value,ref=t=='bible'?S.ver+'|'+e.value:e.value;
  await run('insert into service_items(service_id,position,type,ref_id,label) values(?,?,?,?,?)',[S.svc,S.svcItems.length+1,t,ref,label]);show('servicio')}
async function svcGo(i){const x=S.svcItems[i];await setCur(x.type,x.ref_id);S.cur.label=x.label;projectNow()}
async function svcMove(i,d){const a=S.svcItems[i],b=S.svcItems[i+d];if(!b)return;
  await run('update service_items set position=? where id=?',[b.position,a.id]);await run('update service_items set position=? where id=?',[a.position,b.id]);show('servicio')}
async function svcDel(i){await run('delete from service_items where id=?',[S.svcItems[i].id]);show('servicio')}

const list=(rows,title)=>{FV=rows;return`<h2>${title}</h2>`+(rows.map((x,i)=>`<div class="card row"><div style="flex:1">${esc(x.label)} <small>${x.type}</small></div><button onclick="setCur(FV[${i}].type,FV[${i}].ref)">Preparar</button><button onclick="lp(${i})" style="background:#2563eb">▶ Proyectar</button></div>`).join('')||'<p class=mut>Nada por ahora.</p>')};
P.favoritos=async()=>list(await q('select * from favorites order by id desc'),'Favoritos');
P.recientes=async()=>list(await q('select type,ref,label,max(id) m from history group by type,ref order by m desc limit 30'),'Recientes');

const FIELDS=[['font','Tipo de letra','sel',['Georgia, serif','Arial, sans-serif','Verdana, sans-serif','Impact, sans-serif','Courier New, monospace']],['size','Tamaño','rng',[2,12,.5]],['color','Color','color'],['bold','Negritas','chk'],['align','Alineación','sel',['left','center','right']],['v','Posición vertical','sel',['flex-start','center','flex-end']],['h','Posición horizontal','rng',[-30,30,1]],['line','Interlineado','rng',[1,2,.1]],['shadow','Sombra','chk'],['outline','Contorno','chk'],['box','Transparencia del fondo del texto','rng',[0,90,5]]];
P.config=async()=>{const d=await A.getDisplays();
  return`<h2>Configuración</h2><p class=mut>Pantallas detectadas: ${d.count}. ${d.hasExternal?'Se proyectará en la segunda pantalla.':'Sin segunda pantalla: se usa el modo de prueba (ventana).'}</p>
<div class=card><h3>Texto de proyección</h3>${FIELDS.map(([k,l,t,o])=>`<label class=f>${l}${t=='sel'?`<select id=st_${k} oninput="stU()">${opts(o,S.style[k])}</select>`:t=='rng'?`<input id=st_${k} type=range min=${o[0]} max=${o[1]} step=${o[2]} value=${S.style[k]} oninput="stU()">`:t=='color'?`<input id=st_${k} type=color value=${S.style[k]} oninput="stU()">`:`<input id=st_${k} type=checkbox ${S.style[k]?'checked':''} oninput="stU()">`}</label>`).join('')}
<div class=row><button onclick="far()">👓 Modo lectura a distancia</button><button onclick="Object.assign(S.style,DEF);stU(1)">Restablecer</button></div></div>
<div class=card style="margin-top:10px"><h3>Datos</h3><div class=row><button onclick="A.importBible().then(c=>msg(c?'Biblia '+c+' importada':'Cancelado'))">Importar Biblia (JSON)</button><button onclick="A.backup().then(ok=>msg(ok?'Respaldo creado':'Cancelado'))">Crear respaldo</button><button onclick="if(confirm('Se reemplazarán todos los datos y la app se reiniciará.'))A.restore()">Restaurar respaldo</button><button onclick="A.exportData().then(ok=>msg(ok?'Exportado':'Cancelado'))">Exportar datos</button><button onclick="A.importData().then(ok=>msg(ok?'Importado':'Cancelado'))">Importar datos</button></div></div>`};
function stU(x){FIELDS.forEach(([k,,t])=>{const e=$('#st_'+k);if(e)S.style[k]=t=='chk'?e.checked:t=='rng'?+e.value:e.value});
  setS('style',S.style);refresh();if(S.live&&S.mode==='content')A.project(pstate());if(x)show('config')}
function far(){Object.assign(S.style,{size:7,bold:true,outline:true,shadow:true,box:40,line:1.25,color:'#ffffff'});stU(1)}

/* ---------- navegación y arranque ---------- */
const NAV=[['inicio','Inicio'],['biblia','Biblia'],['canciones','Canciones'],['fondos','Fondos'],['reflexiones','Reflexiones'],['servicio','Servicio'],['favoritos','Favoritos'],['recientes','Recientes'],['config','Configuración']];
async function show(v){S.view=v;$('#nv').innerHTML=NAV.map(([k,l])=>`<div class="${k==v?'on':''}" onclick="show('${k}')">${l}</div>`).join('');
  $('#page').innerHTML=await P[v]();if(v=='servicio'&&S.svc)svcType()}
addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(e.key=='ArrowRight'||e.key==' '){e.preventDefault();go(1)}else if(e.key=='ArrowLeft')go(-1);
  else if(e.key=='b'||e.key=='B')mode('black');else if(e.key=='h'||e.key=='H')mode('hidden');else if(e.key=='Escape')stop()});
(async()=>{S.style={...DEF,...await getS('style',{})};await show('inicio');drawSlides();status();$('#pv').onload=refresh})();
