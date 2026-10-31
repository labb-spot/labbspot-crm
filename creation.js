// Shared by index.html (full Data LAB) and creation.html (Creation-only page).
// ===== Marketing → 🛠 Creation (court records: foreclosure / probate / eviction) =====
// Tables: court_cases (one row per case number) + court_counties (Tracker list).
// Works in place: saving a case never reloads the page or the list.
window._CR = window._CR || { loaded:false, loading:false, counties:[], cases:[], tab:'tracker', showInactive:false };
const _CR_TYPES = { fc:'Foreclosure', pb:'Probate', ev:'Eviction' };
function _crTypeKey(t){ t=String(t||'').toLowerCase(); if(/mortgage|foreclos/.test(t)) return 'fc'; if(/estate|guardian|probate/.test(t)) return 'pb'; if(/evict/.test(t)) return 'ev'; return ''; }
// Sort code — same rules as the sheet's Task List.
function _crSort(c){
  const k=_crTypeKey(c.case_type); const sfx={fc:'.1',pb:'.2',ev:'.3'}[k]; if(!sfx) return '';
  const v=x=>String(x==null?'':x).trim(); const unk=x=>/^unknown$/i.test(v(x));
  if(k==='pb' && /guardian/i.test(c.case_type||'') && /minor/i.test((c.style||'')+' '+(c.case_type||''))) return '4.2';
  if(k==='ev' && /\b(l\.?l\.?c|inc|corp|corporation|apartments?|apts?|properties|property management|management|holdings|l\.?p|ltd|company|housing|homes|realty|partners)\b/i.test(c.plaintiff||'')) return '4.3';
  const req = k==='pb' ? [c.address,c.defendant,c.attorney,_crPetName(c),_crPetAddr(c),_crPetCount(c)] : [c.address,c.defendant,c.plaintiff,c.attorney];
  if(req.some(x=>!v(x))) return '0'+sfx;
  if(unk(c.address)) return '3'+sfx;
  if(req.slice(1).some(unk)) return '1'+sfx;
  return '2'+sfx;
}
function _crPets(c){ const a=Array.isArray(c.petitioners)?c.petitioners.filter(p=>p&&(p.name||p.address)):[]; if(a.length) return a; return (c.petitioner||c.petitioner_address)?[{name:c.petitioner||'',address:c.petitioner_address||''}]:[]; }
function _crPetName(c){ return _crPets(c).map(p=>p.name).filter(Boolean).join('; '); }
function _crPetAddr(c){ return _crPets(c).map(p=>p.address).filter(Boolean).join('; '); }
function _crPetCount(c){ const p=_crPets(c); return p.length?String(p.length):String(c.petitioner_count||''); }
const _crDone=s=>/^[123]\./.test(String(s||''));
const _crScrap=s=>/^4\./.test(String(s||''));

async function _crLoad(force){
  if(_CR.loading) return; if(_CR.loaded&&!force) return;
  _CR.loading=true;
  try{
    const cq=await sb.from('court_counties').select('*').order('sort');
    if(cq.error) throw cq.error; _CR.counties=cq.data||[];
    const all=[]; const step=1000;
    for(let from=0;;from+=step){
      const q=await sb.from('court_cases').select('id,case_number,county_code,case_type,sort_code,filed,completed_at,uploaded_at,claimed_by,claimed_at').order('case_number').range(from,from+step-1);
      if(q.error) throw q.error; all.push.apply(all,q.data||[]); if(!q.data||q.data.length<step) break;
    }
    _CR.cases=all; _CR.loaded=true; _CR.err='';
  }catch(e){ console.warn('creation load:',e); _CR.err=(e&&e.message)||String(e); }
  _CR.loading=false;
}
function _crCountyName(code){ const c=_CR.counties.find(x=>x.code===code); return c?(c.city+' · '+c.county):code; }
function _crRender(){
  if(!document.getElementById('cr-scroll-css')){ const st=document.createElement('style'); st.id='cr-scroll-css';
    st.textContent='#cr-root ::-webkit-scrollbar{width:12px;height:12px}#cr-root ::-webkit-scrollbar-track{background:transparent}'
      +'#cr-root ::-webkit-scrollbar-thumb{background:#334155;border:2px solid #94a3b8;border-radius:8px}#cr-root ::-webkit-scrollbar-thumb:hover{background:#475569;border-color:#cbd5e1}';
    document.head.appendChild(st); }
  const root=document.getElementById('cr-root'); if(!root) return;
  if(!_CR.loaded){ root.innerHTML='<div style="padding:30px;text-align:center;color:var(--text-dim)">'+(_CR.err?('⚠ '+_reqEsc(_CR.err)+(/court_c/.test(_CR.err)?' — run creation-tables.sql once in Supabase.':'')):'Loading cases…')+'</div>'; if(!_CR.err) _crLoad().then(_crRender); return; }
  const tabs=[['tracker','📊 Tracker'],['queue','🧾 Work Queue'],['paste','📋 Paste from MyCase'],['scrap','🗑 Scrap'],['unknown','❓ Unknown']].concat(window.CR_LIMITED?[]:[['export','📤 Export']]);
  const soon={};
  root.innerHTML='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px">'
      +'<div class="panel p-1" style="display:inline-flex;align-items:center"><div class="subtab'+(_CR.tab==='all'?' active':'')+'" onclick="_crTab(\'all\')" style="display:inline-flex;align-items:center;white-space:nowrap">🔎 All Cases</div></div>'
      +'<div class="panel p-1" style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap">'+tabs.map(t=>'<div class="subtab'+(_CR.tab===t[0]?' active':'')+'" onclick="_crTab(\''+t[0]+'\')" style="display:inline-flex;align-items:center;white-space:nowrap;'+(soon[t[0]]?'opacity:.55':'')+'">'+t[1]+'</div>').join('')+'</div>'
      +'<div class="panel p-1" style="display:inline-flex;align-items:center"><div class="subtab'+(_CR.tab==='hours'?' active':'')+'" onclick="_crTab(\'hours\')" style="display:inline-flex;align-items:center;white-space:nowrap">⏱ Hours</div></div>'
      +'<div style="margin-left:auto;display:flex;gap:8px">'
        +(window.CR_LIMITED?'':'<button class="btn btn-ghost text-sm" onclick="_crAccessOpen()" title="Who gets the Creation-only page">👥 Access</button>'
          +'<label class="btn btn-ghost text-sm" style="cursor:pointer" title="One-time: bring cases in from your Combined sheet (CSV). Skips case numbers already here.">📥 Import sheet<input type="file" accept=".csv,text/csv" style="display:none" onchange="_crImportCsv(this)"></label>')
        +'<button class="btn btn-ghost text-sm" onclick="_crLoad(true).then(_crRender)" title="Re-pull from the database">↻</button>'
      +'</div></div>'
    +'<div id="cr-body"></div>';
  const body=document.getElementById('cr-body');
  if(_CR.tab==='tracker') body.innerHTML=_crTrackerHtml();
  else if(_CR.tab==='scrap') _crScrapRender(body);
  else if(_CR.tab==='queue') _crQueueRender(body);
  else if(_CR.tab==='all') _crAllRender(body);
  else if(_CR.tab==='paste') _crPasteRender(body);
  else if(_CR.tab==='export'&&!window.CR_LIMITED) _crExportRender(body);
  else if(_CR.tab==='unknown') _crUnknownRender(body);
  else if(_CR.tab==='hours') _crHrRender(body);
  else body.innerHTML='<div style="padding:30px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">Coming next — '+(_CR.tab==='queue'?'one case at a time with only the fields that case type needs, plus MyCase / assessor / TruePeopleSearch buttons.':'paste a MyCase results page and it files every case automatically.')+'</div>';
}
window._crRender=_crRender;
function _crTab(t){ _CR.tab=t; _crRender(); }
window._crTab=_crTab;
function _crStats(){
  const by={};
  _CR.cases.forEach(c=>{ const k=_crTypeKey(c.case_type); if(!k) return; const cc=c.county_code||'?';
    const b=by[cc]||(by[cc]={fc:{d:0,t:0},pb:{d:0,t:0,u:0},ev:{d:0,t:0,c:0},scrap:0,all:0});
    if(_crScrap(c.sort_code)){ b.scrap++; if(c.sort_code==='4.3') b.ev.c++; return; }
    b.all++; b[k].t++; if(_crDone(c.sort_code)) b[k].d++; if(k==='pb'&&/^3\./.test(c.sort_code||'')) b.pb.u++; });
  return by;
}
function _crPct(d,t){ return t?Math.round(d/t*1000)/10:0; }
// Only 100% is green; below that: yellow (90%+), orange (60%+), red.
function _crPctColor(p,t){ return !t?'var(--text-dim)':p>=100?'#22c55e':p>=90?'#facc15':p>=60?'#f97316':'#ef4444'; }
// Fixed column widths for the tracker (same on every screen, inactive table lines up too).
const _CR_COLW=[250,50, 150,110,80, 150,110,80, 150,110,80];
const _CR_COLS='<colgroup>'+_CR_COLW.map(w=>'<col style="width:'+w+'px">').join('')+'</colgroup>';
const _CR_TBL='table-layout:fixed;width:'+_CR_COLW.reduce((a,b)=>a+b,0)+'px;border-collapse:collapse;font-size:13px';
function _crTrackerHtml(){
  const E=_reqEsc; const by=_crStats(); const fmt=d=>d?_reqFmtDate(d):'—';
  const cell=(b,k,pulled,code)=>{ const x=b[k]; const p=_crPct(x.d,x.t);
    return '<td style="text-align:center;padding:4px 4px"><input type="date" value="'+(pulled||'')+'" title="Pulled to — change it when you pull" onchange="_crSetPulled(\''+code+'\',\''+k+'\',this)" style="height:28px;width:128px;font-size:12px;padding:0 5px;border-radius:6px;color:var(--text-dim)"></td>'
      +'<td style="text-align:center;padding:7px 6px"><b>'+x.d.toLocaleString()+'</b><span style="color:var(--text-dim)"> / '+x.t.toLocaleString()+'</span></td>'
      +'<td style="text-align:center;padding:7px 6px;font-weight:700;color:'+_crPctColor(p,x.t)+'">'+(x.t?p.toFixed(1)+'%':'—')+'</td>'; };
  const empty={fc:{d:0,t:0},pb:{d:0,t:0,u:0},ev:{d:0,t:0},scrap:0,all:0};
  const act=_CR.counties.filter(c=>c.active), ina=_CR.counties.filter(c=>!c.active);
  const tot={fc:{d:0,t:0},pb:{d:0,t:0,u:0},ev:{d:0,t:0,c:0},all:0,scrap:0};
  act.forEach(c=>{ const b=by[c.code]||empty; ['fc','pb','ev'].forEach(k=>{ tot[k].d+=b[k].d; tot[k].t+=b[k].t; }); tot.pb.u+=b.pb.u; tot.ev.c+=(b.ev.c||0); tot.all+=b.all; tot.scrap+=b.scrap; });
  const row=c=>{ const b=by[c.code]||empty; const p=c.pulled||{};
    return '<tr style="border-top:1px solid var(--border)">'
      +'<td style="padding:7px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><button type="button" onclick="_crCountyEdit(\''+E(c.code)+'\')" title="Edit county — active, GIS link" style="background:none;border:none;cursor:pointer;font-size:13px;padding:0 4px 0 0;opacity:.7">⚙️</button><b>'+E(c.city)+'</b> <span style="color:var(--text-dim);font-size:12px">'+E(c.county)+' · '+E(c.code)+'</span></td>'
      +'<td style="text-align:center;white-space:nowrap">'+(c.assessor_url?'<a href="'+E(c.assessor_url)+'" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:none" title="'+E(c.assessor_url)+'">🗺️</a>':'<button type="button" onclick="_crCountyEdit(\''+E(c.code)+'\')" style="background:none;border:1px dashed var(--border);border-radius:6px;color:var(--text-dim);font-size:11px;cursor:pointer;padding:1px 6px">+ Add</button>')+'</td>'
      +cell(b,'fc',p.fc,c.code)+cell(b,'pb',p.pb,c.code)
      +cell(b,'ev',p.ev,c.code)+'</tr>'; };
  const th='padding:6px;font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--text-dim);text-align:center';
  const grp=(t,col)=>'<th colspan="3" style="'+th+';color:'+col+';border-bottom:2px solid '+col+'">'+t+'</th>';
  const card=(t,k,col)=>{ const p=_crPct(tot[k].d,tot[k].t); return '<div style="flex:1;min-width:150px;background:var(--panel-2);border:1px solid var(--border);border-top:3px solid '+col+';border-radius:10px;padding:10px 12px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-dim)">'+t+'</div><div style="font-size:20px;font-weight:800">'+tot[k].d.toLocaleString()+' <span style="font-size:13px;color:var(--text-dim);font-weight:600">/ '+tot[k].t.toLocaleString()+'</span></div><div style="font-size:12px;font-weight:700;color:'+_crPctColor(p,tot[k].t)+'">'+p.toFixed(1)+'% complete'+(k==='pb'&&tot[k].t?'<span style="color:var(--text-dim);font-weight:600"> · </span><span style="color:#a78bfa" title="Probates where no property address could be found (the ❓ Unknown tab)">'+_crPct(tot.pb.u,tot[k].t).toFixed(1)+'% unknown</span>':'')+(k==='ev'?'<span style="color:var(--text-dim);font-weight:600"> · </span><span style="color:#94a3b8" title="Evictions filed by an LLC / apartment / management company — in 🗑 Scrap">'+(tot.ev.c||0).toLocaleString()+' corporate filing'+(tot.ev.c===1?'':'s')+'</span>':'')+'</div></div>'; };
  return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
      +card('Foreclosure','fc','#06b6d4')+card('Probate','pb','#a855f7')+card('Eviction','ev','#eab308')
      +'<div style="flex:1;min-width:150px;background:var(--panel-2);border:1px solid var(--border);border-top:3px solid #64748b;border-radius:10px;padding:10px 12px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-dim)">All cases · Scrap</div><div style="font-size:20px;font-weight:800">'+tot.all.toLocaleString()+'</div><div style="font-size:12px;color:var(--text-dim)">'+tot.scrap.toLocaleString()+' in Scrap</div></div>'
    +'</div>'
    +'<div style="overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="'+_CR_TBL+'">'+_CR_COLS
      +'<thead><tr><th></th><th></th>'+grp('Foreclosure','#06b6d4')+grp('Probate','#a855f7')+grp('Eviction','#eab308')+'</tr>'
      +'<tr><th style="'+th+';text-align:left">County</th><th style="'+th+'">GIS</th>'+['fc','pb'].map(k=>'<th style="'+th+'">'+_crSetAllBtn(k)+'</th><th style="'+th+'">Done</th><th style="'+th+'">%</th>').join('')+'<th style="'+th+'">'+_crSetAllBtn('ev')+'</th><th style="'+th+'">Done</th><th style="'+th+'">%</th></tr></thead>'
      +'<tbody>'+act.map(row).join('')+'</tbody></table></div>'
    +(ina.length?'<div style="margin-top:10px"><button class="btn btn-ghost text-sm" onclick="_CR.showInactive=!_CR.showInactive;_crRender()">'+(_CR.showInactive?'▾':'▸')+' Inactive counties ('+ina.length+')</button>'
      +(_CR.showInactive?'<div style="overflow:auto;border:1px solid var(--border);border-radius:10px;margin-top:8px;opacity:.75"><table style="'+_CR_TBL+'">'+_CR_COLS+'<tbody>'+ina.map(row).join('')+'</tbody></table></div>':'')+'</div>':'')
    +'<div id="cr-chart" style="margin-top:14px">'+_crChartHtml()+'</div>';
}
// "Set all" — one date for every ACTIVE county's Pulled-to, per list type.
function _crSetAllBtn(k){ return 'Pulled to <button type="button" onclick="_crSetAllOpen(\''+k+'\',this)" title="Set every active county\'s '+({fc:'Foreclosure',pb:'Probate',ev:'Eviction'}[k])+' Pulled-to date at once" style="margin-left:4px;height:20px;padding:0 6px;font-size:10px;font-weight:800;border:1px solid var(--border);background:var(--panel);color:#60a5fa;border-radius:5px;cursor:pointer;text-transform:none;letter-spacing:0">Set all</button>'; }
function _crIsoDay(off){ const d=new Date(); d.setDate(d.getDate()+(off||0)); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _crSetAllOpen(k,anchor){
  const old=document.getElementById('cr-setall'); if(old){ old.remove(); if(old.getAttribute('data-k')===k) return; }
  const name={fc:'Foreclosure',pb:'Probate',ev:'Eviction'}[k]; const n=_CR.counties.filter(c=>c.active).length;
  const pop=document.createElement('div'); pop.id='cr-setall'; pop.setAttribute('data-k',k);
  const r=anchor.getBoundingClientRect();
  pop.style.cssText='position:fixed;top:'+(r.bottom+6)+'px;left:'+Math.max(10,Math.min(window.innerWidth-290,r.left-110))+'px;z-index:100004;width:270px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;text-align:left';
  pop.innerHTML='<div style="font-weight:800;margin-bottom:8px">📅 '+name+' — pulled to</div>'
    +'<div style="display:flex;gap:6px;margin-bottom:8px"><button type="button" class="btn btn-ghost text-sm" data-d="'+_crIsoDay(-1)+'">Yesterday</button><button type="button" class="btn btn-ghost text-sm" data-d="'+_crIsoDay(0)+'">Today</button></div>'
    +'<input type="date" id="cr-setall-d" value="'+_crIsoDay(-1)+'" style="height:34px;width:100%;box-sizing:border-box;font-size:13px;padding:0 8px;border-radius:7px;margin-bottom:8px">'
    +'<button type="button" class="btn btn-primary text-sm" id="cr-setall-go" style="width:100%">Set all '+n+' active counties</button>';
  document.body.appendChild(pop);
  pop.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{ pop.querySelector('#cr-setall-d').value=b.getAttribute('data-d'); });
  setTimeout(()=>{ const off=e=>{ if(!pop.contains(e.target)&&e.target!==anchor){ pop.remove(); document.removeEventListener('mousedown',off); } }; document.addEventListener('mousedown',off); },0);
  pop.querySelector('#cr-setall-go').onclick=async function(){
    const d=pop.querySelector('#cr-setall-d').value; if(!d) return; this.disabled=true; this.textContent='Saving…';
    const act=_CR.counties.filter(c=>c.active); let ok=0;
    await Promise.all(act.map(async c=>{ const pulled=Object.assign({},c.pulled||{}); pulled[k]=d; if(await _crSaveCounty(c.code,{pulled:pulled})) ok++; }));
    pop.remove(); if(_CR.tab==='tracker') _crRender();
    if(typeof toast==='function') toast(name+' pulled to '+_reqFmtDate(d)+' for '+ok+' counties','ok');
  };
}
window._crSetAllOpen=_crSetAllOpen;
// Save county changes (active, GIS link, pulled-to dates) — updates in place.
async function _crSaveCounty(code,patch){
  const c=_CR.counties.find(x=>x.code===code); if(!c) return false;
  try{ const up=await sb.from('court_counties').update(patch).eq('code',code); if(up.error) throw up.error; Object.assign(c,patch); return true; }
  catch(e){ if(typeof toast==='function') toast('Save failed: '+(e.message||e),'err'); return false; }
}
async function _crSetPulled(code,k,inp){
  const c=_CR.counties.find(x=>x.code===code); if(!c) return;
  const pulled=Object.assign({},c.pulled||{}); if(inp.value) pulled[k]=inp.value; else delete pulled[k];
  if(await _crSaveCounty(code,{pulled:pulled})){ if(typeof toast==='function') toast(c.city+' · '+({fc:'Foreclosure',pb:'Probate',ev:'Eviction'}[k])+' pulled to '+(inp.value?_reqFmtDate(inp.value):'—'),'ok'); }
}
window._crSetPulled=_crSetPulled;
function _crCountyEdit(code){
  const c=_CR.counties.find(x=>x.code===code); if(!c) return; const E=_reqEsc;
  const old=document.getElementById('cr-cty-pop'); if(old) old.remove();
  const ov=document.createElement('div'); ov.id='cr-cty-pop';
  ov.style.cssText='position:fixed;inset:0;z-index:100003;background:rgba(0,0,0,0.55);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px';
  const inp='height:36px;font-size:14px;padding:0 10px;width:100%;box-sizing:border-box;border-radius:8px';
  ov.innerHTML='<div style="width:min(520px,96vw);background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px;box-shadow:0 16px 50px rgba(0,0,0,.5)">'
    +'<div style="display:flex;align-items:center;margin-bottom:12px"><div style="font-weight:800;font-size:16px;flex:1">⚙️ '+E(c.city)+' · '+E(c.county)+' <span style="color:var(--text-dim);font-weight:600">('+E(c.code)+')</span></div><button type="button" data-x="1" style="background:none;border:none;color:var(--text-dim);font-size:18px;cursor:pointer">✕</button></div>'
    +'<label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;margin-bottom:14px;cursor:pointer"><input type="checkbox" id="cr-cty-active" '+(c.active?'checked':'')+' style="width:18px;height:18px;accent-color:#22c55e"> Active — show in the tracker &amp; work queue</label>'
    +'<div style="font-size:13px;font-weight:700;margin-bottom:4px">🗺️ Assessor / GIS link</div>'
    +'<div style="display:flex;gap:6px;margin-bottom:6px"><input id="cr-cty-gis" value="'+E(c.assessor_url||'')+'" placeholder="https://…" style="'+inp+'"><button type="button" class="btn btn-ghost text-sm" id="cr-cty-open" title="Open link">🌐</button></div>'
    +'<div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">Used by the 🗺️ Assessor button in the work queue. Leave blank to remove it.</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'
      +'<label style="font-size:12.5px;color:var(--text-dim)">City name<input id="cr-cty-city" value="'+E(c.city||'')+'" style="'+inp+';margin-top:3px"></label>'
      +'<label style="font-size:12.5px;color:var(--text-dim)">County<input id="cr-cty-county" value="'+E(c.county||'')+'" style="'+inp+';margin-top:3px"></label></div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-primary text-sm" id="cr-cty-save">💾 Save</button><button type="button" class="btn btn-ghost text-sm" data-x="1" style="border:1px solid #ef4444;color:#f87171">Cancel</button></div></div>';
  document.body.appendChild(ov);
  ov.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>ov.remove());
  ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); });
  ov.querySelector('#cr-cty-open').onclick=()=>{ const u=ov.querySelector('#cr-cty-gis').value.trim(); if(u) window.open(/^https?:/i.test(u)?u:'https://'+u,'_blank','noopener'); };
  ov.querySelector('#cr-cty-save').onclick=async function(){
    let u=ov.querySelector('#cr-cty-gis').value.trim(); if(u&&!/^https?:\/\//i.test(u)) u='https://'+u;
    const patch={active:ov.querySelector('#cr-cty-active').checked, assessor_url:u||null, city:ov.querySelector('#cr-cty-city').value.trim()||c.city, county:ov.querySelector('#cr-cty-county').value.trim()||c.county};
    this.disabled=true; this.textContent='Saving…';
    if(await _crSaveCounty(code,patch)){ ov.remove(); if(_CR.tab==='tracker') _crRender(); if(typeof toast==='function') toast(patch.city+' saved'+(patch.active!==undefined?(patch.active?' · active':' · inactive'):''),'ok'); }
    else { this.disabled=false; this.textContent='💾 Save'; }
  };
}
window._crCountyEdit=_crCountyEdit;
// Scrap list: everything coded 4.x — kept for reference, never sent to Imports or geocoded.
// Counts come from every scrap case; the table pages in 500 at a time (Supabase sends max 1,000 per request).
_CR.scrap={ rows:[], done:false, busy:false };
async function _crScrapFetch(){
  const S=_CR.scrap; if(S.busy||S.done) return; S.busy=true;
  try{ const from=S.rows.length;
    const q=await sb.from('court_cases').select('case_number,county_code,style,case_type,filed,sort_code').like('sort_code','4.%').order('filed',{ascending:false,nullsFirst:false}).order('case_number').range(from,from+499);
    if(q.error) throw q.error; const d=q.data||[]; S.rows=S.rows.concat(d); if(d.length<500) S.done=true;
  } finally { S.busy=false; }
}
window._crScrapMore=async function(){ await _crScrapFetch(); const b=document.getElementById('cr-body'); if(b) _crScrapRender(b,true); else _crRender(); };
async function _crScrapRender(body,keep){
  const S=_CR.scrap;
  if(!keep){ S.rows=[]; S.done=false; body.innerHTML='<div style="padding:20px;color:var(--text-dim)">Loading scrap…</div>'; }
  try{
    if(!S.rows.length&&!S.done) await _crScrapFetch();
    const E=_reqEsc; const rows=S.rows;
    const sc=_CR.cases.filter(c=>_crScrap(c.sort_code)); const total=sc.length;
    const n42=sc.filter(c=>c.sort_code==='4.2').length, n43=sc.filter(c=>c.sort_code==='4.3').length, nOth=total-n42-n43;
    const pill=(t,n)=>'<span style="display:inline-block;background:var(--panel-2);border:1px solid var(--border);border-radius:999px;padding:3px 10px;margin-right:6px;font-size:12px"><b>'+n.toLocaleString()+'</b> '+t+'</span>';
    body.innerHTML='<div style="margin-bottom:10px;display:flex;align-items:center;flex-wrap:wrap;gap:4px"><span style="font-size:13px;font-weight:700;margin-right:8px">'+total.toLocaleString()+' scrap case'+(total===1?'':'s')+'</span>'+pill('minor guardianship',n42)+pill('LLC / apartment',n43)+(nOth?pill('other',nOth):'')
        +'<span style="font-size:12px;color:var(--text-dim);margin-left:4px">Kept for reference; never uploaded or geocoded. Use 🔎 All Cases to search for one.</span></div>'
      +(rows.length?'<div style="overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'+['Why','Case #','County','Type','Filed','Style'].map(h=>'<th style="padding:6px 8px;text-align:left;font-size:11px;color:var(--text-dim);text-transform:uppercase">'+h+'</th>').join('')+'</tr></thead><tbody>'
        +rows.map(r=>'<tr style="border-top:1px solid var(--border)"><td style="padding:6px 8px;white-space:nowrap">'+(r.sort_code==='4.2'?'Minor guardianship':r.sort_code==='4.3'?'LLC / apartment':'Scrap')+'</td><td style="padding:6px 8px;white-space:nowrap"><a href="https://public.courts.in.gov/mycase/#/vw/Search" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:none">'+E(r.case_number)+'</a></td><td style="padding:6px 8px">'+E(_crCountyName(r.county_code))+'</td><td style="padding:6px 8px">'+E(r.case_type||'')+'</td><td style="padding:6px 8px;white-space:nowrap">'+E(r.filed?_reqFmtDate(r.filed):'')+'</td><td style="padding:6px 8px">'+E(r.style||'')+'</td></tr>').join('')
        +'</tbody></table></div>'
        +'<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:10px;font-size:12.5px;color:var(--text-dim)">Showing '+rows.length.toLocaleString()+' of '+total.toLocaleString()+(S.done?'':' <button type="button" class="btn btn-ghost text-sm" onclick="this.disabled=true;this.textContent=\'Loading…\';_crScrapMore()">Show 500 more</button>')+'</div>'
        :'<div style="padding:30px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">Nothing in Scrap yet.</div>');
  }catch(e){ body.innerHTML='<div style="padding:20px;color:#f87171">'+_reqEsc(e.message||e)+'</div>'; }
}
// 🔎 All Cases: search every case (case #, names, address, attorney, petitioner) and open any one.
_CR.all=_CR.all||{ q:'', county:'', type:'' };
function _crAllRender(body){
  const E=_reqEsc; const a=_CR.all; const sel='height:36px;font-size:13px;padding:0 9px;border-radius:8px;width:auto;flex:0 0 auto;max-width:240px';
  body.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">'
      +'<input id="cr-all-q" value="'+E(a.q)+'" placeholder="Search case #, name, address, attorney, petitioner…" style="height:36px;font-size:14px;padding:0 12px;border-radius:8px;flex:1 1 320px;min-width:240px" oninput="_crAllSearchSoon()">'
      +'<select style="'+sel+'" onchange="_CR.all.county=this.value;_crAllSearch()"><option value="">All counties</option>'+_CR.counties.map(c=>'<option value="'+E(c.code)+'" '+(a.county===c.code?'selected':'')+'>'+E(c.city)+(c.active?'':' (inactive)')+'</option>').join('')+'</select>'
      +'<select style="'+sel+'" onchange="_CR.all.type=this.value;_crAllSearch()"><option value="">All types</option>'+Object.keys(_CR_TYPES).map(k=>'<option value="'+k+'" '+(a.type===k?'selected':'')+'>'+_CR_TYPES[k]+'</option>').join('')+'</select>'
    +'</div><div id="cr-all-res"></div>';
  const qi=document.getElementById('cr-all-q'); if(qi){ qi.focus(); qi.setSelectionRange(qi.value.length,qi.value.length); }
  _crAllSearch();
}
let _crAllT=null;
function _crAllSearchSoon(){ if(_crAllT) clearTimeout(_crAllT); _crAllT=setTimeout(_crAllSearch,300); }
window._crAllSearchSoon=_crAllSearchSoon;
async function _crAllSearch(){
  const out=document.getElementById('cr-all-res'); if(!out) return; const E=_reqEsc; const a=_CR.all;
  const qi=document.getElementById('cr-all-q'); a.q=qi?qi.value.trim():a.q;
  out.style.opacity='.6';
  try{
    let q=sb.from('court_cases').select('id,case_number,county_code,style,case_type,filed,defendant,address,sort_code');
    if(a.county) q=q.eq('county_code',a.county);
    if(a.type){ const pat={fc:'*mortgage*',pb:'*estate*',ev:'*evict*'}[a.type]; if(pat) q=q.ilike('case_type',pat.replace(/\*/g,'%')); }
    if(a.q){ const t=a.q.replace(/[%,()*]/g,' ').trim(); if(t){ const w='%'+t+'%'; q=q.or(['case_number','style','defendant','plaintiff','address','attorney','petitioner','petitioner_address','plaintiff_address'].map(c=>c+'.ilike.'+w).join(',')); } }
    const r=await q.order('filed',{ascending:false}).limit(300);
    if(r.error) throw r.error; const rows=r.data||[];
    const th='padding:8px 10px;text-align:left;font-size:11px;color:var(--text-dim);text-transform:uppercase';
    out.style.opacity='';
    out.innerHTML='<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:8px">'+(rows.length>=300?'Showing the newest 300 — search to narrow it down.':rows.length.toLocaleString()+' case'+(rows.length===1?'':'s')+(a.q?' matching “'+E(a.q)+'”':''))+'</div>'
      +(rows.length?'<div style="overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'+['Status','Type','Name','Address','County','Filed','Case #'].map(h=>'<th style="'+th+'">'+h+'</th>').join('')+'</tr></thead><tbody>'
        +rows.map(x=>{ const k=_crTypeKey(x.case_type); return '<tr onclick="_crOpenAny(\''+E(x.id)+'\')" style="border-top:1px solid var(--border);cursor:pointer" onmouseover="this.style.background=\'rgba(99,102,241,0.08)\'" onmouseout="this.style.background=\'\'">'
          +'<td style="padding:8px 10px">'+_crStatusPill(x.sort_code,true)+'</td>'
          +'<td style="padding:8px 10px;white-space:nowrap;font-weight:700;color:'+({fc:'#06b6d4',pb:'#a855f7',ev:'#eab308'}[k]||'var(--text)')+'">'+E({fc:'Foreclosure',pb:'Probate',ev:'Eviction'}[k]||'')+'</td>'
          +'<td style="padding:8px 10px">'+E(x.defendant||x.style||'')+'</td>'
          +'<td style="padding:8px 10px;color:var(--text-dim)">'+E(x.address||'')+'</td>'
          +'<td style="padding:8px 10px;white-space:nowrap">'+E(_crCountyName(x.county_code).split(' · ')[0])+'</td>'
          +'<td style="padding:8px 10px;white-space:nowrap">'+E(x.filed?_reqFmtDate(x.filed):'')+'</td>'
          +'<td style="padding:8px 10px;white-space:nowrap;color:var(--text-dim)">'+E(x.case_number)+'</td></tr>'; }).join('')
        +'</tbody></table></div>':'<div style="padding:30px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">No cases found.</div>');
  }catch(e){ out.style.opacity=''; out.innerHTML='<div style="padding:20px;color:#f87171">'+E(e.message||e)+'</div>'; }
}
window._crAllSearch=_crAllSearch;
function _crOpenAny(id){ _CR.q={county:'',type:'',status:'all',sel:id,more:0}; _CR.tab='queue'; _crRender(); }
window._crOpenAny=_crOpenAny;

// ----- 📋 Paste from MyCase: paste copied search results → new cases (skips ones already here) -----
const _CR_CASE_RE=/\b(\d{2}[A-Z]\d{2}-\d{4}-[A-Z]{2}-\d{3,7})\b/;
function _crKeepType(t){ return /mortgage|foreclos|estate|guardian|evict/i.test(String(t||'')); }
function _crParseMyCase(text){
  const toks=String(text||'').replace(/\r/g,'').split(/\t|\n/).map(x=>x.trim()).filter(Boolean);
  const out=[]; let cur=null;
  const isDate=x=>/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(x);
  toks.forEach(tk=>{
    const m=tk.match(_CR_CASE_RE);
    if(m&&tk.replace(m[1],'').trim().length<3){ cur={case_number:m[1],style:'',court:'',case_type:'',filed:null,status:''}; out.push(cur); return; }
    if(!cur) return;
    if(/^[A-Z]{2}\s-\s/.test(tk)&&!cur.case_type){ cur.case_type=tk.replace(/\s+/g,' '); return; }
    if(/^guardian\s*:/i.test(tk)&&cur.case_type){ cur.case_type+=' · '+tk; return; }   // e.g. "Guardian: Minor" on the next line
    if(/\bcourt\b/i.test(tk)&&!cur.court){ cur.court=tk; return; }
    if(isDate(tk)&&!cur.filed){ cur.filed=_crDate(tk); return; }
    if(/\b(pending|decided|closed|disposed|open)\b/i.test(tk)){ cur.status=cur.status?cur.status+', '+tk:tk; return; }
    if(isDate(tk)&&cur.filed){ cur.status=cur.status?cur.status+', '+tk:tk; return; }
    if(!cur.style) cur.style=tk; else if(!cur.case_type&&!cur.court) cur.style+=' '+tk;
  });
  // status like "07/28/2026, Pending" — keep the sheet's format
  out.forEach(c=>{ c.status=c.status.replace(/^,\s*/,''); });
  return out;
}
_CR.paste=_CR.paste||{ rows:null, text:'' };
function _crPasteRender(body){
  const E=_reqEsc; const P=_CR.paste;
  body.innerHTML='<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:14px;align-items:stretch">'
    +'<div style="display:flex;flex-direction:column;min-height:420px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><div style="font-size:14px;font-weight:700;flex:1">1. Paste MyCase results</div><button type="button" class="btn btn-ghost text-sm" onclick="_CR.paste={rows:null,text:\'\'};_crRender()">Clear</button></div>'
      +'<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:8px">In MyCase, drag from the end of the last row (after Pending / Decided) up to the first case number, copy, and paste here. You can paste several pages at once.</div>'
      +'<textarea id="cr-paste-box" placeholder="Paste here (Ctrl+V)…" style="width:100%;flex:1 1 auto;min-height:340px;box-sizing:border-box;font-size:12.5px;padding:10px;border-radius:10px;font-family:inherit;resize:none" oninput="_crPasteRead()">'+E(P.text||'')+'</textarea></div>'
    +'<div id="cr-paste-prev"><div style="padding:40px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">2. The preview shows up here after you paste.</div></div>'
  +'</div>';
  if(P.text) _crPasteRead();
}
async function _crPasteRead(){
  const box=document.getElementById('cr-paste-box'); const prev=document.getElementById('cr-paste-prev'); if(!box||!prev) return;
  const P=_CR.paste; P.text=box.value; const E=_reqEsc;
  const parsed=_crParseMyCase(P.text); const seen={}; const rows=[];
  parsed.forEach(c=>{ if(seen[c.case_number]) return; seen[c.case_number]=1; rows.push(c); });
  if(!rows.length){ prev.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">'+(P.text.trim()?'No case numbers found in what was pasted.':'2. The preview shows up here after you paste.')+'</div>'; P.rows=null; return; }
  // which are already in Data LAB?
  const have=new Set(_CR.cases.map(c=>c.case_number));
  try{ const miss=rows.filter(r=>!have.has(r.case_number)).map(r=>r.case_number);
    for(let i=0;i<miss.length;i+=150){ const q=await sb.from('court_cases').select('case_number').in('case_number',miss.slice(i,i+150)); (q.data||[]).forEach(x=>have.add(x.case_number)); } }catch(_){}
  rows.forEach(c=>{ c.county_code=c.case_number.slice(0,2);
    if(have.has(c.case_number)) c._st='have'; else if(!_crKeepType(c.case_type)) c._st='skip';
    else { c.sort_code=_crSort(c)||'0'+({fc:'.1',pb:'.2',ev:'.3'}[_crTypeKey(c.case_type)]||''); c._st=_crScrap(c.sort_code)?'scrap':'new'; } });
  P.rows=rows;
  const n=k=>rows.filter(r=>r._st===k).length;
  const counties=[...new Set(rows.filter(r=>r._st==='new'||r._st==='have'||r._st==='scrap').map(r=>r.county_code))];
  const types=[...new Set(rows.filter(r=>r._st!=='skip').map(r=>_crTypeKey(r.case_type)).filter(Boolean))];
  const tag={new:['New','#22c55e'],have:['Already here','#94a3b8'],skip:['Not a type we work','#94a3b8'],scrap:['Scrap','#ef4444']};
  const yest=_crIsoDay(-1);
  prev.innerHTML='<button type="button" class="btn btn-primary" id="cr-paste-go" '+((n('new')+n('scrap'))?'':'disabled ')+'onclick="_crPasteSave(this)" style="width:100%;font-size:15px;margin-bottom:10px">Add '+(n('new')+n('scrap'))+' case'+((n('new')+n('scrap'))===1?'':'s')+(n('scrap')?' ('+n('scrap')+' to Scrap)':'')+'</button>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
      +[['new','✅ New'],['have','↩ Already here'],['skip','⏭ Not a type we work'],['scrap','🗑 Scrap']].map(x=>'<div style="flex:1;min-width:110px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:8px 10px"><div style="font-size:11.5px;color:var(--text-dim)">'+x[1]+'</div><div style="font-size:20px;font-weight:800">'+n(x[0])+'</div></div>').join('')
    +'</div>'
    +'<div style="max-height:330px;overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><tbody>'
      +rows.map(r=>'<tr style="border-top:1px solid var(--border)"><td style="padding:6px 8px;white-space:nowrap;font-weight:700;color:'+tag[r._st][1]+'">'+tag[r._st][0]+'</td><td style="padding:6px 8px;white-space:nowrap">'+E(r.case_number)+'</td><td style="padding:6px 8px">'+E(r.case_type)+'</td><td style="padding:6px 8px;color:var(--text-dim)">'+E(r.style)+'</td><td style="padding:6px 8px;white-space:nowrap">'+E(r.filed?_reqFmtDate(r.filed):'')+'</td></tr>').join('')
    +'</tbody></table></div>';
}
window._crPasteRead=_crPasteRead;
async function _crPasteSave(btn){
  const P=_CR.paste; if(!P.rows) return; const add=P.rows.filter(r=>r._st==='new'||r._st==='scrap');
  if(!add.length) return; btn.disabled=true; btn.textContent='Adding…';
  try{
    const now=new Date().toISOString();
    const recs=add.map(r=>({case_number:r.case_number,county_code:r.county_code,style:r.style,court:r.court,case_type:r.case_type,filed:r.filed,status:r.status,sort_code:r.sort_code,petitioners:[],completed_at:_crScrap(r.sort_code)?now:null}));
    for(let i=0;i<recs.length;i+=500){ const up=await sb.from('court_cases').upsert(recs.slice(i,i+500),{onConflict:'case_number',ignoreDuplicates:true}); if(up.error) throw up.error; }
    // set pulled-to
    if(document.getElementById('cr-paste-pull')&&document.getElementById('cr-paste-pull').checked){
      const d=(document.getElementById('cr-paste-date')||{}).value;
      if(d){ const byC={}; P.rows.filter(r=>r._st!=='skip').forEach(r=>{ const k=_crTypeKey(r.case_type); if(k){ (byC[r.county_code]=byC[r.county_code]||{})[k]=1; } });
        await Promise.all(Object.keys(byC).map(code=>{ const c=_CR.counties.find(x=>x.code===code); if(!c) return null; const pulled=Object.assign({},c.pulled||{}); Object.keys(byC[code]).forEach(k=>{ pulled[k]=d; }); return _crSaveCounty(code,{pulled:pulled}); })); }
    }
    await _crLoad(true);
    if(typeof toast==='function') toast('📋 Added '+add.length+' case'+(add.length===1?'':'s')+' — they’re in the Work Queue','ok');
    _CR.paste={rows:null,text:''}; _crRender();
  }catch(e){ console.warn('paste save',e); btn.disabled=false; btn.textContent='Try again'; if(typeof toast==='function') toast('Add failed: '+(e.message||e),'err'); }
}
window._crPasteSave=_crPasteSave;

// ----- 📤 Export: geocode first (stored on the case), then export a CSV for Imports. Every export is recorded. -----
_CR.ex=_CR.ex||{ which:'done', fresh:true, county:'', type:'' };
const _crHasAddr=a=>{ a=String(a||'').trim(); return a.length>5&&!/^(unknown|land)$/i.test(a); };
function _crSplitAddr(a){
  // "123 W Main St, Evansville, IN 47710"  →  street / city / state / zip
  const parts=String(a||'').replace(/\n/g,', ').split(',').map(x=>x.trim()).filter(Boolean);
  const out={street:parts[0]||'',city:'',state:'',zip:''};
  const last=parts.length>1?parts[parts.length-1]:''; const m=last.match(/^([A-Za-z]{2})\.?\s*(\d{5})?(?:-\d{4})?$/);
  if(m){ out.state=m[1].toUpperCase(); out.zip=m[2]||''; out.city=parts.length>2?parts[parts.length-2]:''; }
  else { const z=String(a).match(/\b(\d{5})(?:-\d{4})?\b\s*$/); if(z) out.zip=z[1]; out.city=parts[1]||''; out.state=/\bIN\b/i.test(a)?'IN':''; }
  if(!out.state) out.state='IN';
  return out;
}
async function _crExFetch(){
  const ex=_CR.ex; const all=[]; const step=1000;
  for(let from=0;;from+=step){
    let q=sb.from('court_cases').select('*').not('address','is',null).order('filed',{ascending:false});
    if(ex.county) q=q.eq('county_code',ex.county);
    if(ex.fresh) q=q.is('exported_at',null);
    if(ex.which==='done') q=q.like('sort_code','2.%');
    const r=await q.range(from,from+step-1); if(r.error) throw r.error; all.push.apply(all,r.data||[]); if(!r.data||r.data.length<step) break;
  }
  return all.filter(c=>!_crScrap(c.sort_code)&&_crHasAddr(c.address)&&(!ex.type||_crTypeKey(c.case_type)===ex.type)&&(ex.which!=='done'||/^2\./.test(c.sort_code||'')));
}
async function _crExportRender(body){
  const E=_reqEsc; const ex=_CR.ex; const sel='height:36px;font-size:13px;padding:0 9px;border-radius:8px;width:auto;flex:0 0 auto;max-width:240px';
  body.innerHTML='<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:13.5px">'
      +'<div class="panel p-1" style="display:inline-flex;gap:4px">'
        +[['done','✅ Fully completed'],['addr','🏠 Has an address']].map(o=>'<div class="subtab'+(ex.which===o[0]?' active':'')+'" onclick="_CR.ex.which=\''+o[0]+'\';_crRender()" style="display:inline-flex;white-space:nowrap">'+o[1]+'</div>').join('')+'</div>'
      +'<select style="'+sel+'" onchange="_CR.ex.county=this.value;_crRender()"><option value="">All counties</option>'+_CR.counties.map(c=>'<option value="'+E(c.code)+'" '+(ex.county===c.code?'selected':'')+'>'+E(c.city)+'</option>').join('')+'</select>'
      +'<select style="'+sel+'" onchange="_CR.ex.type=this.value;_crRender()"><option value="">All types</option>'+Object.keys(_CR_TYPES).map(k=>'<option value="'+k+'" '+(ex.type===k?'selected':'')+'>'+_CR_TYPES[k]+'</option>').join('')+'</select>'
      +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" '+(ex.fresh?'checked':'')+' onchange="_CR.ex.fresh=this.checked;_crRender()" style="width:16px;height:16px"> Only ones not exported yet</label>'
    +'</div><div id="cr-ex-body"><div style="padding:20px;color:var(--text-dim)">Counting…</div></div>';
  try{
    const rows=await _crExFetch(); _CR.exRows=rows;
    const geo=rows.filter(c=>c.geo_status==='ok').length, fail=rows.filter(c=>c.geo_status==='failed').length, need=rows.length-geo-fail;
    const byT={fc:0,pb:0,ev:0}; rows.forEach(c=>{ const k=_crTypeKey(c.case_type); if(k) byT[k]++; });
    const card=(t,v,col,sub)=>'<div style="flex:1;min-width:150px;background:var(--panel-2);border:1px solid var(--border);border-top:3px solid '+col+';border-radius:10px;padding:10px 12px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-dim)">'+t+'</div><div style="font-size:22px;font-weight:800">'+v.toLocaleString()+'</div>'+(sub?'<div style="font-size:12px;color:var(--text-dim)">'+sub+'</div>':'')+'</div>';
    const hist=await _crExHistory();
    document.getElementById('cr-ex-body').innerHTML='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
        +card('Ready to export',rows.length,'#60a5fa',byT.fc+' foreclosure · '+byT.pb+' probate · '+byT.ev+' eviction')
        +card('Geocoded',geo,'#22c55e','in your system')
        +card('Not geocoded yet',need,'#f59e0b',fail?fail+' failed — fix the address in the Work Queue':'')
      +'</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
        +'<button type="button" class="btn btn-ghost" '+(need?'':'disabled ')+'onclick="_crExGeocode(this)" style="font-size:14.5px">🌍 Step 1 · Geocode '+need.toLocaleString()+'</button>'
        +'<button type="button" class="btn btn-primary" '+(rows.length?'':'disabled ')+'onclick="_crExExport(this)" style="font-size:14.5px">⬇ Step 2 · Export '+rows.length.toLocaleString()+' to CSV</button>'
      +'</div>'
      +'<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:14px">Then upload the CSV in <b>📥 Imports</b> like any list — it reuses these geocodes, so Google isn’t charged twice. Each case is stamped with when it was exported.</div>'
      +'<div style="font-size:12px;font-weight:800;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px">Past exports</div>'+hist;
  }catch(e){ document.getElementById('cr-ex-body').innerHTML='<div style="padding:20px;color:#f87171">'+E(e.message||e)+(/geo|export/i.test(String(e.message||e))?' — run creation-export.sql once in Supabase.':'')+'</div>'; }
}
async function _crExHistory(){
  const E=_reqEsc;
  try{
    const r=await sb.from('court_cases').select('export_batch,exported_at').not('export_batch','is',null).order('exported_at',{ascending:false}).limit(5000);
    if(r.error) throw r.error; const m=new Map(); (r.data||[]).forEach(x=>{ const b=m.get(x.export_batch)||{n:0,at:x.exported_at}; b.n++; m.set(x.export_batch,b); });
    if(!m.size) return '<div style="font-size:13px;color:var(--text-dim)">No exports yet.</div>';
    return '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">'+[...m.entries()].slice(0,15).map(([k,v])=>'<div style="display:flex;gap:10px;padding:8px 12px;border-top:1px solid var(--border);font-size:13px"><span style="flex:1">'+E(k)+'</span><b>'+v.n.toLocaleString()+' cases</b><button type="button" class="btn btn-ghost text-sm" style="height:26px" onclick="_crExReDownload(\''+E(k).replace(/'/g,"\\'")+'\')" title="Download this export again">⬇</button></div>').join('')+'</div>';
  }catch(_){ return ''; }
}
async function _crExGeocode(btn){
  const todo=(_CR.exRows||[]).filter(c=>c.geo_status!=='ok'&&c.geo_status!=='failed'); if(!todo.length) return;
  if(typeof geocodeAddress!=='function'){ if(typeof toast==='function') toast('Geocoder not available','err'); return; }
  if(typeof geoSettings!=='undefined'&&geoSettings.requestApproval&&!geoSettings.requestApproval(todo.length)) return;
  btn.disabled=true; let done=0, ok=0, bad=0; const t0=btn.textContent;
  let idx=0; const now=new Date().toISOString();
  async function worker(){ while(idx<todo.length){ const c=todo[idx++];
      const a=_crSplitAddr(c.address); let g=null;
      try{ g=await geocodeAddress(a.street,a.city,a.state,a.zip); }catch(e){ g={geocode_status:'failed',error_reason:String(e&&e.message||e)}; }
      const okk=g&&g.geocode_status==='ok';
      const key=okk&&typeof dedupeKey==='function'?dedupeKey(g.street||a.street,g.zip||a.zip,g.city||a.city,g.state||a.state):null;
      const patch={geo:g,geo_status:okk?'ok':'failed',geo_key:key,geocoded_at:now};
      try{ await sb.from('court_cases').update(patch).eq('id',c.id); Object.assign(c,patch); }catch(_){}
      okk?ok++:bad++; done++; if(done%5===0||done===todo.length) btn.textContent='🌍 Geocoding '+done+' / '+todo.length+'…'; } }
  await Promise.all([worker(),worker(),worker(),worker(),worker()]);
  btn.textContent=t0; if(typeof toast==='function') toast('🌍 Geocoded '+ok+(bad?' · '+bad+' couldn’t be found — fix those addresses in the Work Queue':''),bad?'warn':'ok');
  _crRender();
}
window._crExGeocode=_crExGeocode;
function _crCsvCell(v){ v=v==null?'':String(v); return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
function _crExRow(c){
  const k=_crTypeKey(c.case_type); const g=(c.geo_status==='ok'&&c.geo)||null; const a=_crSplitAddr(c.address);
  const pets=_crPets(c);
  const contact = k==='pb' ? {name:pets.map(p=>p.name).filter(Boolean).join('; '), addr:pets.map(p=>p.address).filter(Boolean).join('; ')}
               : k==='ev' ? {name:c.plaintiff||'', addr:c.plaintiff_address||''} : {name:c.defendant||'', addr:''};
  return {
    'Property Address': g?(g.street||a.street):a.street, 'City': g?(g.city||a.city):a.city, 'State': g?(g.state||a.state):a.state, 'Zip': g?(g.zip||a.zip):a.zip,
    'County': (g&&g.county)||((_CR.counties.find(x=>x.code===c.county_code)||{}).county||'').replace(/\s+county$/i,''),
    'Tag': {fc:'Foreclosure',pb:'Probate',ev:'Eviction'}[k]||'',
    'Owner': k==='ev'?(c.plaintiff||''):(c.defendant||''),
    'Contact Name': contact.name, 'Contact Address': contact.addr,
    'Case Number': c.case_number, 'Case Type': c.case_type||'', 'Filed': c.filed||'', 'Court': c.court||'', 'Style': c.style||'',
    'Defendant / Decedent': c.defendant||'', 'Plaintiff': c.plaintiff||'', 'Plaintiff Address': c.plaintiff_address||'', 'Attorney': c.attorney||'',
    'Petitioner Count': c.petitioner_count||'', 'Status': /^2\./.test(c.sort_code||'')?'Complete':/^1\./.test(c.sort_code||'')?'Complete (unknowns)':'Incomplete',
    'Latitude': g?g.lat:'', 'Longitude': g?g.lng:'', 'Place ID': g?g.place_id:'', 'Notes': c.notes||''
  };
}
function _crDownloadCsv(rows,name){
  const objs=rows.map(_crExRow); const cols=Object.keys(objs[0]||{});
  const csv=[cols.map(_crCsvCell).join(',')].concat(objs.map(o=>cols.map(c=>_crCsvCell(o[c])).join(','))).join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },4000);
}
async function _crExExport(btn){
  const rows=_CR.exRows||[]; if(!rows.length) return;
  const ng=rows.filter(c=>c.geo_status!=='ok').length;
  if(ng&&!confirm(ng+' of these aren’t geocoded yet. Export them anyway? (Imports will geocode those when you upload.)')) return;
  btn.disabled=true; btn.textContent='Exporting…';
  const now=new Date(); const pad=n=>String(n).padStart(2,'0');
  const label=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' '+pad(now.getHours())+':'+pad(now.getMinutes())+' · '+(_CR.ex.which==='done'?'Fully completed':'Has address')+(_CR.ex.county?' · '+_crCountyName(_CR.ex.county).split(' · ')[0]:'')+(_CR.ex.type?' · '+_CR_TYPES[_CR.ex.type]:'');
  try{
    _crDownloadCsv(rows,'Creation export '+label.replace(/[:·]/g,'-').replace(/\s+/g,' ')+'.csv');
    const ids=rows.map(c=>c.id); const iso=now.toISOString();
    for(let i=0;i<ids.length;i+=300){ const up=await sb.from('court_cases').update({exported_at:iso,export_batch:label}).in('id',ids.slice(i,i+300)); if(up.error) throw up.error; }
    if(typeof toast==='function') toast('⬇ Exported '+rows.length+' cases — upload the CSV in 📥 Imports','ok');
  }catch(e){ if(typeof toast==='function') toast('Export failed: '+(e.message||e),'err'); }
  _crRender();
}
window._crExExport=_crExExport;
async function _crExReDownload(label){
  try{ const all=[]; for(let f=0;;f+=1000){ const r=await sb.from('court_cases').select('*').eq('export_batch',label).order('case_number').range(f,f+999); if(r.error) throw r.error; all.push.apply(all,r.data||[]); if(!r.data||r.data.length<1000) break; } const r={data:all}; if(r.data.length) _crDownloadCsv(r.data,'Creation export '+label.replace(/[:·]/g,'-')+'.csv'); }
  catch(e){ if(typeof toast==='function') toast('Download failed: '+(e.message||e),'err'); }
}
window._crExReDownload=_crExReDownload;
// Imports hook: before Imports pays Google, look up addresses that Creation already geocoded.
async function _crReuseGeocodes(buckets){
  try{
    if(typeof sb==='undefined'||!sb||!buckets||!buckets.size) return 0;
    const keys=[...buckets.keys()].filter(Boolean); let hit=0;
    for(let i=0;i<keys.length;i+=200){
      const r=await sb.from('court_cases').select('geo,geo_key').in('geo_key',keys.slice(i,i+200)).eq('geo_status','ok');
      if(r.error) return hit;
      (r.data||[]).forEach(x=>{ const b=buckets.get(x.geo_key); if(b&&!b.geo&&x.geo){ b.geo=x.geo; (b.rows||[]).forEach(row=>row.geo=x.geo); b._fromCreation=true; hit++; } });
    }
    return hit;
  }catch(_){ return 0; }
}
window._crReuseGeocodes=_crReuseGeocodes;


// ❓ Unknown: cases where the property address was marked Unknown (couldn't find it).
async function _crUnknownRender(body){
  body.innerHTML='<div style="padding:20px;color:var(--text-dim)">Loading…</div>';
  try{
    const q=await sb.from('court_cases').select('id,case_number,county_code,style,case_type,filed,defendant,sort_code').like('sort_code','3.%').order('filed',{ascending:false}).limit(2000);
    if(q.error) throw q.error; const E=_reqEsc; const rows=q.data||[];
    const by={fc:0,pb:0,ev:0}; rows.forEach(r=>{ const k=_crTypeKey(r.case_type); if(k) by[k]++; });
    const th='padding:8px 10px;text-align:left;font-size:11px;color:var(--text-dim);text-transform:uppercase';
    body.innerHTML='<div style="font-size:13px;color:var(--text-dim);margin-bottom:10px">'+rows.length.toLocaleString()+' case'+(rows.length===1?'':'s')+' where the property address was marked <b>Unknown</b> — '+by.pb+' probate · '+by.fc+' foreclosure · '+by.ev+' eviction. Click one to open it in the Work Queue and try again.</div>'
      +(rows.length?'<div style="overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'+['Type','Name','County','Filed','Case #'].map(h=>'<th style="'+th+'">'+h+'</th>').join('')+'</tr></thead><tbody>'
        +rows.map(r=>{ const k=_crTypeKey(r.case_type); return '<tr onclick="_crOpenInQueue(\''+E(r.id)+'\',\''+E(r.county_code||'')+'\')" style="border-top:1px solid var(--border);cursor:pointer" onmouseover="this.style.background=\'rgba(99,102,241,0.08)\'" onmouseout="this.style.background=\'\'">'
          +'<td style="padding:8px 10px;white-space:nowrap;font-weight:700;color:'+({fc:'#06b6d4',pb:'#a855f7',ev:'#eab308'}[k]||'var(--text)')+'">'+E({fc:'Foreclosure',pb:'Probate',ev:'Eviction'}[k]||'')+'</td>'
          +'<td style="padding:8px 10px">'+E(r.defendant||r.style||'')+'</td>'
          +'<td style="padding:8px 10px;white-space:nowrap">'+E(_crCountyName(r.county_code).split(' · ')[0])+'</td>'
          +'<td style="padding:8px 10px;white-space:nowrap">'+E(r.filed?_reqFmtDate(r.filed):'')+'</td>'
          +'<td style="padding:8px 10px;white-space:nowrap;color:var(--text-dim)">'+E(r.case_number)+'</td></tr>'; }).join('')
        +'</tbody></table></div>':'<div style="padding:30px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">No unknown addresses 🎉</div>');
  }catch(e){ body.innerHTML='<div style="padding:20px;color:#f87171">'+_reqEsc(e.message||e)+'</div>'; }
}
function _crOpenInQueue(id,county){ _CR.q={county:'',type:'',status:'noaddr',sel:id,more:0}; _CR.tab='queue'; _crRender(); }
window._crOpenInQueue=_crOpenInQueue;
// CSV reader that handles quotes and line breaks inside cells.
function _crParseCsv(text){
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){ const ch=text[i];
    if(q){ if(ch==='"'){ if(text[i+1]==='"'){ cell+='"'; i++; } else q=false; } else cell+=ch; continue; }
    if(ch==='"') q=true; else if(ch===','){ row.push(cell); cell=''; } else if(ch==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; } else if(ch!=='\r') cell+=ch; }
  if(cell!==''||row.length){ row.push(cell); rows.push(row); }
  return rows;
}
function _crDate(s){ const m=String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m?(m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0')):null; }
async function _crImportCsv(inp){
  const f=inp.files&&inp.files[0]; inp.value=''; if(!f) return;
  try{
    const rows=_crParseCsv(await f.text()); const head=(rows.shift()||[]).map(h=>String(h).trim().toLowerCase());
    const col=(re)=>head.findIndex(h=>re.test(h));
    const ix={ sort:col(/^sort$/), cn:col(/^case number/), style:col(/^style/), court:col(/^court/), type:col(/^type/), filed:col(/^filed/), status:col(/^status/),
      addr:col(/subject full address/), def:col(/^defendant|decedant|decedent/), pl:col(/^plaintiff \(foreclosure & eviction\)$/), pla:col(/^plaintiff.*address/), att:col(/^attorney/),
      pet:col(/^petitioner \(/), peta:col(/^petitioner address/), petc:col(/^petitioner count/) };
    if(ix.cn<0) throw new Error('No "Case Number" column — is this the Combined sheet?');
    const g=(r,i)=>i<0?'':String(r[i]==null?'':r[i]).trim();
    const out=[]; const seen={};
    rows.forEach(r=>{ const cn=g(r,ix.cn).replace(/\s+/g,''); if(!cn||seen[cn]) return; seen[cn]=1;
      const pet=g(r,ix.pet), peta=g(r,ix.peta);
      const c={ case_number:cn, county_code:cn.slice(0,2), style:g(r,ix.style), court:g(r,ix.court), case_type:g(r,ix.type).replace(/\s+/g,' ').trim(), filed:_crDate(g(r,ix.filed)), status:g(r,ix.status),
        address:g(r,ix.addr), defendant:g(r,ix.def), plaintiff:g(r,ix.pl), plaintiff_address:g(r,ix.pla), attorney:g(r,ix.att),
        petitioner:pet, petitioner_address:peta, petitioner_count:g(r,ix.petc), petitioners:(pet||peta)?[{name:pet,address:peta}]:[] };
      c.sort_code=g(r,ix.sort)||_crSort(c);
      if(_crDone(c.sort_code)) c.completed_at=new Date().toISOString();
      out.push(c); });
    if(!out.length) throw new Error('No cases found in that file.');
    if(!confirm('Import '+out.length.toLocaleString()+' cases from '+f.name+'?\n\nCase numbers already in Data LAB are skipped (nothing gets overwritten).')) return;
    const root=document.getElementById('cr-body'); let done=0;
    for(let i=0;i<out.length;i+=500){
      const chunk=out.slice(i,i+500);
      const up=await sb.from('court_cases').upsert(chunk,{onConflict:'case_number',ignoreDuplicates:true});
      if(up.error) throw up.error; done+=chunk.length;
      if(root) root.innerHTML='<div style="padding:30px;text-align:center;color:var(--text-dim)">Importing… '+done.toLocaleString()+' / '+out.length.toLocaleString()+'</div>';
    }
    if(typeof toast==='function') toast('📥 Imported '+out.length.toLocaleString()+' cases (existing ones skipped)','ok');
    await _crLoad(true); _crRender();
  }catch(e){ console.warn('creation import',e); if(typeof toast==='function') toast('Import failed: '+(e.message||e),'err'); }
}
window._crImportCsv=_crImportCsv;

// ----- 🧾 Work queue: one case at a time, only the fields that case type needs -----
_CR.q = _CR.q || { county:'', type:'', status:'todo', sel:null, more:0 };
async function _crMe(){ if(_CR.me) return _CR.me; try{ const u=await sb.auth.getUser(); _CR.me=(u&&u.data&&u.data.user&&u.data.user.email)||'someone'; }catch(_){ _CR.me='someone'; } return _CR.me; }
function _crQueueList(){
  const q=_CR.q;
  return _CR.cases.filter(c=>{ const k=_crTypeKey(c.case_type); if(!k) return false;
    if(q.county&&c.county_code!==q.county) return false; if(q.type&&k!==q.type) return false;
    const s=String(c.sort_code||'');
    if(q.status==='todo') return /^0\./.test(s)||!s;
    if(q.status==='unk') return /^1\./.test(s);
    if(q.status==='noaddr') return /^3\./.test(s);
    if(q.status==='done') return /^[123]\./.test(s);
    return !_crScrap(s);
  }).sort((a,b)=>String(b.filed||'').localeCompare(String(a.filed||''))||String(a.case_number).localeCompare(String(b.case_number)));
}
function _crQueueRender(body){
  const E=_reqEsc; const q=_CR.q; const list=_crQueueList();
  const act=_CR.counties.filter(c=>c.active);
  const sel='height:32px;font-size:12.5px;padding:0 8px;border-radius:7px;width:auto;flex:0 0 auto;max-width:260px';
  const shown=list.slice(0,200+(q.more||0));
  const item=c=>{ const on=c.id===q.sel; const k=_crTypeKey(c.case_type); const col={fc:'#06b6d4',pb:'#a855f7',ev:'#eab308'}[k];
    const lock=c.claimed_by&&c.claimed_by!==_CR.me&&c.claimed_at&&(Date.now()-new Date(c.claimed_at).getTime()<15*60000);
    return '<div data-cid="'+E(c.id)+'" onclick="_crOpen(\''+E(c.id)+'\')" style="cursor:pointer;padding:10px 12px;border-radius:9px;margin-bottom:4px;border:1px solid '+(on?'#6366f1':'transparent')+';background:'+(on?'rgba(99,102,241,0.14)':'transparent')+';border-left:4px solid '+col+'">'
      +'<div style="display:flex;gap:6px;align-items:center"><span style="font-size:14px;font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+E({fc:'Foreclosure',pb:'Probate',ev:'Eviction'}[k])+'</span>'+_crStatusPill(c.sort_code,true)+(lock?'<span title="Being worked by '+E(c.claimed_by)+'">🔒</span>':'')+'</div>'
      +'<div style="font-size:12.5px;color:var(--text-dim);margin-top:2px">'+E(_crCountyName(c.county_code).split(' · ')[0])+(c.filed?' · filed '+E(_reqFmtDate(c.filed)):'')+'</div>'
      +'<div style="font-size:11.5px;color:var(--text-dim);opacity:.8">'+E(c.case_number)+'</div></div>'; };
  body.innerHTML='<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:13px;color:var(--text-dim)"><span>Show</span>'
      +'<select style="'+sel+'" onchange="_CR.q.county=this.value;_CR.q.more=0;_crRender()"><option value="">All counties</option>'+act.map(c=>'<option value="'+E(c.code)+'" '+(q.county===c.code?'selected':'')+'>'+E(c.city)+' ('+E(c.county)+')</option>').join('')+'</select>'
      +'<select style="'+sel+'" onchange="_CR.q.type=this.value;_CR.q.more=0;_crRender()"><option value="">All types</option>'+Object.keys(_CR_TYPES).map(k=>'<option value="'+k+'" '+(q.type===k?'selected':'')+'>'+_CR_TYPES[k]+'</option>').join('')+'</select>'
      +'<select style="'+sel+'" onchange="_CR.q.status=this.value;_CR.q.more=0;_crRender()">'+[['todo','To do'],['unk','Done — has unknowns'],['noaddr','Done — no address found'],['done','All done'],['all','Everything']].map(o=>'<option value="'+o[0]+'" '+(q.status===o[0]?'selected':'')+'>'+o[1]+'</option>').join('')+'</select>'
      +'<span style="font-size:12.5px;color:var(--text-dim)" id="cr-qcount">'+list.length.toLocaleString()+' case'+(list.length===1?'':'s')+'</span>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:12px;align-items:start">'
      +'<div id="cr-qlist" style="background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:6px;max-height:calc(100vh - 170px);min-height:420px;overflow-y:auto">'
        +(shown.length?shown.map(item).join(''):'<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:13px">Nothing here 🎉</div>')
        +(list.length>shown.length?'<button class="btn btn-ghost text-sm" style="width:100%;margin-top:4px" onclick="_CR.q.more=(_CR.q.more||0)+200;_crRender()">Show more ('+(list.length-shown.length).toLocaleString()+')</button>':'')
      +'</div>'
      +'<div id="cr-editor" style="min-width:0"><div style="padding:40px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">Pick a case on the left.</div></div>'
    +'</div>';
  if(q.sel&&list.some(c=>c.id===q.sel)) _crOpen(q.sel,true); else if(shown.length) _crOpen(shown[0].id,true);
}
// Open one case in the editor (loads the full row fresh; claims it so teammates see 🔒).
// Full rows are kept in memory and the next few cases are pre-loaded, so switching is instant.
_CR.full=_CR.full||{};
async function _crFetchFull(id){ const q=await sb.from('court_cases').select('*').eq('id',id).maybeSingle(); if(q.error) throw q.error; if(q.data) _CR.full[id]=q.data; return q.data; }
function _crPrefetch(id){
  const items=[...document.querySelectorAll('#cr-qlist [data-cid]')].map(el=>el.getAttribute('data-cid')); const i=items.indexOf(id);
  items.slice(i+1,i+4).concat(items.slice(Math.max(0,i-1),i)).forEach(n=>{ if(n&&!_CR.full[n]) _crFetchFull(n).catch(()=>{}); });
}
async function _crOpen(id,quiet){
  _CR.q.sel=id; const ed=document.getElementById('cr-editor'); if(!ed) return;
  document.querySelectorAll('#cr-qlist [data-cid]').forEach(el=>{ const on=el.getAttribute('data-cid')===id; el.style.borderColor=on?'#6366f1':'transparent'; el.style.background=on?'rgba(99,102,241,0.14)':'transparent'; });
  const me=await _crMe();
  const show=(c)=>{ _CR.cur=c; _crEditor(c); ed.style.opacity=''; };
  try{
    const cached=_CR.full[id];
    if(cached) show(cached); else ed.style.opacity='.55';   // keep the old case on screen (dimmed) instead of a blank "Loading…"
    const c=await _crFetchFull(id); if(_CR.q.sel!==id) return; if(!c) throw new Error('Case not found');
    // Only redraw if the fresh copy differs (a teammate changed it) — never wipe what you've started typing.
    if(!cached) show(c);
    else if(String(c.updated_at)!==String(cached.updated_at)){ const typed=_crEditorDirty(); if(!typed) show(c); else if(typeof toast==='function') toast('A teammate just changed this case — save to keep yours, or reopen it to see theirs','warn'); }
    if(c.claimed_by&&c.claimed_by!==me&&c.claimed_at&&(Date.now()-new Date(c.claimed_at).getTime()<15*60000)&&!quiet){ if(typeof toast==='function') toast('🔒 '+c.claimed_by+' opened this case in the last 15 min','warn'); }
    sb.from('court_cases').update({claimed_by:me,claimed_at:new Date().toISOString()}).eq('id',id).then(()=>{});
    _crPrefetch(id);
  }catch(e){ ed.style.opacity=''; ed.innerHTML='<div style="padding:20px;color:#f87171">'+_reqEsc(e.message||e)+'</div>'; }
}
function _crEditorDirty(){ let d=false; document.querySelectorAll('#cr-editor [data-f]').forEach(el=>{ if(el.value!==el.defaultValue) d=true; }); return d; }
window._crOpen=_crOpen;
function _crEditor(c){
  const E=_reqEsc; const ed=document.getElementById('cr-editor'); if(!ed) return;
  const k=_crTypeKey(c.case_type); const col={fc:'#06b6d4',pb:'#a855f7',ev:'#eab308'}[k]||'#94a3b8';
  const cty=_CR.counties.find(x=>x.code===c.county_code)||{};
  const inp='height:38px;font-size:14.5px;padding:0 11px;width:100%;box-sizing:border-box;border-radius:8px';
  const btn='height:34px;padding:0 12px;border:1px solid var(--border);background:var(--panel);border-radius:8px;cursor:pointer;font-size:13.5px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;color:var(--text)';
  const sbtn='height:38px;padding:0 10px;border:1px solid var(--border);background:transparent;border-radius:8px;cursor:pointer;font-size:12.5px;color:var(--text-dim);white-space:nowrap';
  const fld=(key,label,hint,ph,land)=>'<div style="display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:8px;align-items:center;margin-bottom:8px"'+(hint?' title="'+E(hint)+'"':'')+'>'
      +'<div style="font-size:13.5px;font-weight:700;line-height:1.2">'+label+'</div>'
      +'<div style="display:flex;gap:6px;grid-column:2 / 4"><input data-f="'+key+'" value="'+E(c[key]||'')+'" placeholder="'+E(hint||ph||'')+'" style="'+inp+'" oninput="_crLive()">'
      +(land?'<button type="button" style="'+sbtn+'" onclick="_crSetF(\''+key+'\',\'Land\')" title="Only land, no house">Land</button>':'')
      +'<button type="button" style="'+sbtn+'" onclick="_crSetF(\''+key+'\',\'Unknown\')" title="Couldn\'t find it">Unknown</button></div></div>';
  const box=(icon,title,inner)=>'<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:10px 12px 2px;margin-bottom:10px"><div style="font-size:11.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px">'+icon+' '+title+'</div>'+inner+'</div>';
  const nm=String(c.defendant||'').trim(); const cityName=(cty.city||'')+', IN';
  const tps='https://www.truepeoplesearch.com/results?name='+encodeURIComponent(nm.replace(/,\s*/,' '))+'&citystatezip='+encodeURIComponent(cityName);
  const addrQ=String(c.address||'').trim();
  const ADDR='123 W Main St, City, IN 47000';
  let fields='';
  if(k==='fc') fields=box('🏠','Property',fld('address','Property address','From the Complaint — “commonly known as”',ADDR,true))
      +box('👤','Owner',fld('defendant','Defendant','Current owner — Parties to Case'))
      +box('🏦','Lender & attorney',fld('plaintiff','Plaintiff (lender)','Who filed the foreclosure')+fld('plaintiff_address','Lender address','')+fld('attorney','Attorney','Plaintiff’s attorney'));
  else if(k==='ev') fields=box('🏠','Property',fld('address','Property address','Tenant’s address — that’s the rental',ADDR,true))
      +box('👤','Owner',fld('plaintiff','Owner (plaintiff)','Whoever filed the eviction')+fld('plaintiff_address','Owner address','Plaintiff address'))
      +box('📄','Tenant & attorney',fld('defendant','Tenant (defendant)','')+fld('attorney','Attorney',''));
  else fields=box('🏠','Property',fld('address','Property address','Search the decedent on the Assessor map → TruePeople → else Unknown',ADDR,true))
      +box('🕊️','Estate',fld('defendant','Decedent','Last known owner')+fld('attorney','Attorney',''))
      +box('👥','Petitioners <span id="cr-petc" style="text-transform:none;letter-spacing:0;color:var(--text)"></span>','<div style="font-size:12px;color:var(--text-dim);margin:-2px 0 6px">Petitioner / personal rep / executor — one row per person.</div><div id="cr-pets"></div>'
        +'<button type="button" onclick="_crPetAdd()" style="height:32px;padding:0 12px;font-size:12.5px;font-weight:700;color:var(--brand);background:transparent;border:1px dashed var(--brand);border-radius:8px;cursor:pointer;margin-bottom:10px">+ Add petitioner</button>');
  ed.innerHTML='<div style="background:var(--panel-2);border:1px solid var(--border);border-top:4px solid '+col+';border-radius:12px;padding:14px 16px">'
    +'<div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">'
      +'<div style="flex:1;min-width:240px"><div style="font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:'+col+'">'+E({fc:'Foreclosure',pb:'Probate',ev:'Eviction'}[k]||'')+' · '+E(cty.city||'')+'</div>'
        +'<div style="font-size:19px;font-weight:800;margin:2px 0 3px;line-height:1.25">'+E(c.style||c.case_number)+'</div>'
        +'<div style="font-size:13px;color:var(--text-dim);display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>'+E(c.case_number)+'</span>'
          +'<button type="button" onclick="_crCopy(\''+E(c.case_number)+'\',this)" title="Copy case number" style="height:24px;padding:0 8px;font-size:11.5px;font-weight:700;border:1px solid var(--border);background:var(--panel);color:#60a5fa;border-radius:6px;cursor:pointer">📋 Copy</button>'
          +(c.filed?'<span>· filed '+E(_reqFmtDate(c.filed))+'</span>':'')+'</div></div>'
      +'<div style="text-align:right">'
        +'<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">'
          +'<button type="button" class="btn btn-ghost" onclick="_crSave(false)">💾 Save</button>'
          +'<button type="button" class="btn btn-primary" onclick="_crSave(true)" title="Ctrl+Enter" style="font-size:15px;padding:0 18px">Save &amp; next case →</button></div>'
        +'<div id="cr-savemsg" style="font-size:12.5px;color:var(--text-dim);min-height:16px;margin-top:4px"></div></div>'
    +'</div>'
    +'<div id="cr-status" style="margin:10px 0 0"></div><div id="cr-dupe"></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">'
      +'<button type="button" style="'+btn+'" onclick="_crMyCase(\''+E(c.case_number)+'\')" title="Copies the case number, then opens MyCase search — just paste">⚖️ Open in MyCase</button>'
      +(cty.assessor_url?'<a href="'+E(cty.assessor_url)+'" target="_blank" rel="noopener" style="'+btn+'">🗺️ Assessor map</a>':'')
      +(nm?'<a href="'+E(tps)+'" target="_blank" rel="noopener" style="'+btn+'">🔎 TruePeopleSearch</a>':'')
      +(addrQ&&!/^(unknown|land)$/i.test(addrQ)?'<a href="https://www.zillow.com/homes/'+encodeURIComponent(addrQ)+'_rb/" target="_blank" rel="noopener" style="'+btn+'">🏠 Zillow</a><a href="https://www.google.com/maps/search/'+encodeURIComponent(addrQ)+'" target="_blank" rel="noopener" style="'+btn+'">📍 Maps</a>':'')
    +'</div>'
    +fields
    +box('📝','Notes','<textarea data-f="notes" rows="2" style="width:100%;box-sizing:border-box;font-size:14px;padding:8px 11px;border-radius:8px;margin-bottom:10px">'+E(c.notes||'')+'</textarea>')
  +'</div>';
  if(k==='pb'){ _CR.pets=_crPets(c).map(p=>({name:p.name||'',address:p.address||''})); if(!_CR.pets.length) _CR.pets=[{name:'',address:''}]; _crPetPaint(); }
  _crLive();
  ed.onkeydown=function(e){ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); _crSave(true); } };
}
// Plain-words status: "✅ Done" or "Still needed: Attorney, Petitioner".
function _crMissing(c){
  const k=_crTypeKey(c.case_type); const v=x=>String(x==null?'':x).trim();
  const req = k==='pb' ? [['address','Property address'],['defendant','Decedent'],['attorney','Attorney'],['__pn','Petitioner name'],['__pa','Petitioner address']]
    : k==='ev' ? [['address','Property address'],['plaintiff','Owner'],['defendant','Tenant'],['attorney','Attorney']]
    : [['address','Property address'],['defendant','Owner'],['plaintiff','Lender'],['attorney','Attorney']];
  const val=f=>f==='__pn'?_crPetName(c):f==='__pa'?_crPetAddr(c):c[f];
  return { missing:req.filter(r=>!v(val(r[0]))).map(r=>r[1]), unknown:req.filter(r=>/^unknown$/i.test(v(val(r[0])))).map(r=>r[1]) };
}
function _crStatusPill(s,small){
  s=String(s||''); const t=/^2\./.test(s)?['✅ Done','#22c55e']:/^1\./.test(s)?['✅ Done · unknowns','#f59e0b']:/^3\./.test(s)?['🚫 No address','#94a3b8']:/^4\./.test(s)?['🗑 Scrap','#ef4444']:['○ To do','#60a5fa'];
  return '<span class="cr-badge" style="font-size:'+(small?'11px':'12.5px')+';font-weight:700;color:'+t[1]+';white-space:nowrap">'+t[0]+'</span>';
}
function _crPetPaint(){
  const E=_reqEsc; const box=document.getElementById('cr-pets'); if(!box) return;
  const inp='height:40px;font-size:14.5px;padding:0 11px;width:100%;box-sizing:border-box;border-radius:8px';
  box.innerHTML=(_CR.pets.length?_CR.pets:[]).map((p,i)=>'<div style="display:grid;grid-template-columns:1fr 1.3fr 40px;gap:6px;margin-bottom:8px">'
      +'<input placeholder="Petitioner name" value="'+E(p.name)+'" oninput="_CR.pets['+i+'].name=this.value;_crLive()" style="'+inp+'">'
      +'<input placeholder="Petitioner address" value="'+E(p.address)+'" oninput="_CR.pets['+i+'].address=this.value;_crLive()" style="'+inp+'">'
      +'<button type="button" title="Remove" onclick="_CR.pets.splice('+i+',1);_crPetPaint();_crLive()" style="height:40px;border:1px solid var(--border);background:transparent;color:#f87171;border-radius:7px;cursor:pointer;font-weight:700">×</button></div>').join('')
    +(_CR.pets.length?'':'<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">None yet.</div>');
}
function _crPetAdd(){ _CR.pets=_CR.pets||[]; _CR.pets.push({name:'',address:''}); _crPetPaint(); const ins=document.querySelectorAll('#cr-pets input'); if(ins.length>=2) ins[ins.length-2].focus(); _crLive(); }
window._crPetAdd=_crPetAdd;
function _crSetF(k,v){ const el=document.querySelector('#cr-editor [data-f="'+k+'"]'); if(el){ el.value=v; _crLive(); } }
window._crSetF=_crSetF;
function _crCollect(){
  const c=Object.assign({},_CR.cur); document.querySelectorAll('#cr-editor [data-f]').forEach(el=>{ c[el.getAttribute('data-f')]=el.value.trim(); });
  if(_crTypeKey(c.case_type)==='pb'){ const pets=(_CR.pets||[]).map(p=>({name:String(p.name||'').trim(),address:String(p.address||'').trim()})).filter(p=>p.name||p.address);
    c.petitioners=pets; c.petitioner=pets.map(p=>p.name).filter(Boolean).join('; '); c.petitioner_address=pets.map(p=>p.address).filter(Boolean).join('; '); c.petitioner_count=pets.length?String(pets.length):''; }
  c.sort_code=_crSort(c); return c;
}
function _crLive(){
  const c=_crCollect(); const st=document.getElementById('cr-status');
  if(st){ const m=_crMissing(c); const s=c.sort_code||'';
    const done=/^[123]\./.test(s); const col=/^2\./.test(s)?'#22c55e':/^1\./.test(s)?'#f59e0b':/^3\./.test(s)?'#94a3b8':/^4\./.test(s)?'#ef4444':'#60a5fa';
    st.innerHTML='<div style="border:1px solid '+col+';background:'+col+'1a;border-radius:9px;padding:7px 12px;font-size:14px;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center">'
      +'<b style="color:'+col+';white-space:nowrap">'+(/^4\./.test(s)?'🗑 Scrap — not a lead':/^3\./.test(s)?'🚫 Done — no property found':/^1\./.test(s)?'✅ Done — has unknowns':/^2\./.test(s)?'✅ Done — ready':'Still needed:')+'</b>'
      +(!done&&!/^4\./.test(s)?m.missing.map(x=>'<span style="white-space:nowrap">• '+_reqEsc(x)+'</span>').join(''):'')
      +(/^1\./.test(s)&&m.unknown.length?'<span style="color:var(--text-dim)">Unknown: '+_reqEsc(m.unknown.join(', '))+'</span>':'')
    +'</div>'; }
  const pc=document.getElementById('cr-petc'); if(pc) pc.textContent=c.petitioner_count?('· '+c.petitioner_count):'';
  _crDupeCheck(c);
}
let _crDupeT=null;
function _crDupeCheck(c){
  if(_crDupeT) clearTimeout(_crDupeT);
  _crDupeT=setTimeout(async function(){
    const box=document.getElementById('cr-dupe'); if(!box) return;
    const a=String(c.address||'').trim(); const street=(a.split(',')[0]||'').trim();
    if(!street||/^(unknown|land)$/i.test(street)||street.length<6){ box.innerHTML=''; return; }
    try{
      const q=await sb.from('court_cases').select('case_number,case_type,sort_code,filed').ilike('address',street.replace(/[%_]/g,'')+'%').neq('id',c.id).limit(5);
      if(q.error||!q.data||!q.data.length){ box.innerHTML=''; return; }
      box.innerHTML='<div style="margin-top:8px;border:1px solid #f59e0b;background:rgba(245,158,11,0.1);border-radius:10px;padding:8px 12px;font-size:12.5px"><b style="color:#fbbf24">🔁 Same address is also on:</b>'
        +q.data.map(x=>'<div>'+_reqEsc(x.case_number)+' · '+_reqEsc({fc:'Foreclosure',pb:'Probate',ev:'Eviction'}[_crTypeKey(x.case_type)]||x.case_type||'')+(x.filed?' · '+_reqEsc(_reqFmtDate(x.filed)):'')+'</div>').join('')
        +'<div style="color:var(--text-dim);margin-top:3px">Both are kept — just a heads-up.</div></div>';
    }catch(_){ box.innerHTML=''; }
  },600);
}
window._crLive=_crLive;
function _crMyCase(cn){ try{ navigator.clipboard.writeText(cn); }catch(_){} window.open('https://public.courts.in.gov/mycase/#/vw/Search','_blank','noopener'); if(typeof toast==='function') toast('Case # '+cn+' copied — paste it into MyCase search','ok'); }
window._crMyCase=_crMyCase;
function _crCopy(t,btn){ const done=()=>{ if(btn){ const o=btn.innerHTML; btn.innerHTML='✓ Copied'; btn.style.color='#22c55e'; setTimeout(()=>{ btn.innerHTML=o; btn.style.color='#60a5fa'; },1200); } };
  try{ navigator.clipboard.writeText(t).then(done,()=>{ const x=document.createElement('textarea'); x.value=t; document.body.appendChild(x); x.select(); document.execCommand('copy'); x.remove(); done(); }); }
  catch(_){ const x=document.createElement('textarea'); x.value=t; document.body.appendChild(x); x.select(); document.execCommand('copy'); x.remove(); done(); } }
window._crCopy=_crCopy;
// Save just this case; update its list row + counts in place (no reload).
async function _crSave(next){
  const c=_crCollect(); const msg=document.getElementById('cr-savemsg'); if(msg) msg.textContent='Saving…';
  const me=await _crMe(); const wasDone=_crDone(_CR.cur.sort_code)||_crScrap(_CR.cur.sort_code);
  const patch={ address:c.address, defendant:c.defendant, plaintiff:c.plaintiff||null, plaintiff_address:c.plaintiff_address||null, attorney:c.attorney, notes:c.notes||null,
    sort_code:c.sort_code, updated_at:new Date().toISOString(), claimed_by:null, claimed_at:null };
  if(_crTypeKey(c.case_type)==='pb') Object.assign(patch,{petitioners:c.petitioners,petitioner:c.petitioner,petitioner_address:c.petitioner_address,petitioner_count:c.petitioner_count});
  if((_crDone(c.sort_code)||_crScrap(c.sort_code))&&!wasDone){ patch.completed_at=new Date().toISOString(); patch.completed_by=me; }
  try{
    const up=await sb.from('court_cases').update(patch).eq('id',c.id); if(up.error) throw up.error;
    _CR.cur=Object.assign(_CR.cur,patch); _CR.full[c.id]=_CR.cur;
    const lc=_CR.cases.find(x=>x.id===c.id); if(lc){ lc.sort_code=c.sort_code; if(patch.completed_at) lc.completed_at=patch.completed_at; lc.claimed_by=null; }
    const row=document.querySelector('#cr-qlist [data-cid="'+c.id+'"] .cr-badge'); if(row) row.outerHTML=_crStatusPill(c.sort_code,true);
    if(msg) msg.textContent='✓ Saved '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
    if(next){
      const items=[...document.querySelectorAll('#cr-qlist [data-cid]')]; const i=items.findIndex(el=>el.getAttribute('data-cid')===c.id);
      const stillIn=_crQueueList().some(x=>x.id===c.id);
      const nx=items[i+1]||null; if(!stillIn&&items[i]) items[i].remove();
      const cnt=document.getElementById('cr-qcount'); if(cnt){ const n=_crQueueList().length; cnt.textContent=n.toLocaleString()+' case'+(n===1?'':'s'); }
      if(nx){ nx.scrollIntoView({block:'nearest'}); _crOpen(nx.getAttribute('data-cid'),true); } else { const ed=document.getElementById('cr-editor'); if(ed) ed.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">That was the last one in this view 🎉</div>'; }
    }
  }catch(e){ console.warn('creation save',e); if(msg) msg.textContent=''; if(typeof toast==='function') toast('Save failed: '+(e.message||e),'err'); }
}
window._crSave=_crSave;

// ===== Creation-only logins =====
// Emails in app_config.column_mappings.creation_only_emails only get the light Creation page
// (no Export / geocoding / Import sheet). Everyone else gets the full Data LAB as before.
async function _crAccessList(){
  try{ const r=await sb.from('app_config').select('column_mappings').eq('id',1).maybeSingle();
    const l=(r.data&&r.data.column_mappings&&r.data.column_mappings.creation_only_emails)||[];
    return Array.isArray(l)?l.map(x=>String(x).toLowerCase().trim()).filter(Boolean):[]; }catch(_){ return []; }
}
async function _crIsCreationOnly(email){ if(!email) return false; const l=await _crAccessList(); return l.indexOf(String(email).toLowerCase().trim())>=0; }
window._crIsCreationOnly=_crIsCreationOnly;
async function _crAccessOpen(){
  const E=_reqEsc; const list=await _crAccessList();
  const old=document.getElementById('cr-access-pop'); if(old) old.remove();
  const ov=document.createElement('div'); ov.id='cr-access-pop';
  ov.style.cssText='position:fixed;inset:0;z-index:100003;background:rgba(0,0,0,0.55);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px';
  ov.innerHTML='<div style="width:min(520px,96vw);background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px;box-shadow:0 16px 50px rgba(0,0,0,.5)">'
    +'<div style="font-weight:800;font-size:16px;margin-bottom:6px">👥 Creation-only logins</div>'
    +'<div style="font-size:13px;color:var(--text-dim);margin-bottom:10px">People with these emails only get the Creation page (All Cases, Tracker, Work Queue, Paste, Scrap, Unknown) — no Export, geocoding or Import sheet, and none of the rest of Data LAB. One email per line. Your own login is never limited.</div>'
    +'<textarea id="cr-access-list" rows="6" placeholder="employee@labbllc.com" style="width:100%;box-sizing:border-box;font-size:14px;padding:8px 10px;border-radius:8px;margin-bottom:12px">'+E(list.join('\n'))+'</textarea>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-primary text-sm" id="cr-access-save">💾 Save</button><button type="button" class="btn btn-ghost text-sm" data-x="1" style="border:1px solid #ef4444;color:#f87171">Cancel</button></div></div>';
  document.body.appendChild(ov);
  ov.querySelector('[data-x]').onclick=()=>ov.remove(); ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); });
  ov.querySelector('#cr-access-save').onclick=async function(){
    const emails=ov.querySelector('#cr-access-list').value.split(/[\s,;]+/).map(x=>x.toLowerCase().trim()).filter(x=>/@/.test(x));
    this.disabled=true; this.textContent='Saving…';
    try{
      let me=''; try{ const u=await sb.auth.getUser(); me=((u&&u.data&&u.data.user&&u.data.user.email)||'').toLowerCase(); }catch(_){}
      if(me&&emails.indexOf(me)>=0){ alert('That list includes your own email ('+me+') — you’d lock yourself out of the full Data LAB. Remove it first.'); this.disabled=false; this.textContent='💾 Save'; return; }
      const r=await sb.from('app_config').select('column_mappings').eq('id',1).maybeSingle(); if(r.error) throw r.error;
      const cm=Object.assign({},(r.data&&r.data.column_mappings)||{}); cm.creation_only_emails=emails;
      const up=await sb.from('app_config').update({column_mappings:cm,updated_at:new Date().toISOString()}).eq('id',1); if(up.error) throw up.error;
      ov.remove(); if(typeof toast==='function') toast('Creation-only logins saved ('+emails.length+')','ok');
    }catch(e){ this.disabled=false; this.textContent='💾 Save'; if(typeof toast==='function') toast('Save failed: '+(e.message||e),'err'); }
  };
}
window._crAccessOpen=_crAccessOpen;

// ----- ⏱ Hours: employees log daily hours + notes; admin sees everyone, marks pay periods paid, imports the old sheet -----
const _CR_ADMIN='admin@labbllc.com';
_CR.hr=_CR.hr||{ who:'', rows:[], pay:[], done:{}, edit:null, workers:[] };
function _crHrNum(v){ const n=parseFloat(String(v==null?'':v).replace(/[^0-9.]/g,'')); return isFinite(n)?n:0; }
function _crHrFmt(n){ n=Math.round((+n||0)*100)/100; return String(n); }
function _crHrDay(iso){ return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(iso+'T12:00:00').getDay()]; }
function _crHrMD(iso){ const p=iso.split('-'); return (+p[1])+'/'+(+p[2])+'/'+p[0].slice(2); }
async function _crHrRender(body){
  const H=_CR.hr; const E=_reqEsc;
  const me=String(await _crMe()).toLowerCase(); const admin=me===_CR_ADMIN&&!window.CR_LIMITED; H.admin=admin;
  body.innerHTML='<div style="padding:20px;color:var(--text-dim)">Loading hours…</div>';
  try{
    if(admin){
      const w=new Set(); (await _crAccessList()).forEach(e=>w.add(String(e).toLowerCase()));
      for(let f=0;;f+=1000){ const q=await sb.from('work_hours').select('email').range(f,f+999); if(q.error) throw q.error; (q.data||[]).forEach(r=>w.add(r.email)); if(!q.data||q.data.length<1000) break; }
      H.workers=[...w].filter(Boolean).sort(); if(!H.who||!H.workers.includes(H.who)) H.who=H.workers[0]||'';
    } else H.who=me;
    H.rows=[]; H.pay=[]; H.done={};
    if(H.who){
      for(let f=0;;f+=1000){ const q=await sb.from('work_hours').select('*').eq('email',H.who).order('day',{ascending:false}).range(f,f+999); if(q.error) throw q.error; H.rows=H.rows.concat(q.data||[]); if(!q.data||q.data.length<1000) break; }
      const p=await sb.from('work_pay').select('*').eq('email',H.who).order('paid_through',{ascending:false}); if(p.error) throw p.error; H.pay=p.data||[];
      // cases this person finished per day (from Work Queue saves) — last 90 days
      const since=new Date(Date.now()-90*864e5).toISOString();
      for(let f=0;;f+=1000){ const q=await sb.from('court_cases').select('completed_at').eq('completed_by',H.who).gte('completed_at',since).range(f,f+999); if(q.error) break;
        (q.data||[]).forEach(r=>{ const d=new Date(r.completed_at); const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); H.done[k]=(H.done[k]||0)+1; }); if(!q.data||q.data.length<1000) break; }
    }
  }catch(e){ body.innerHTML='<div style="padding:20px;color:#f87171">'+E(e.message||e)+(/work_(hours|pay)/.test(e.message||'')?' — run creation-hours.sql once in Supabase.':'')+'</div>'; return; }
  _crHrDraw(body);
}
function _crHrDraw(body){
  body=body||document.getElementById('cr-body'); if(!body) return;
  const H=_CR.hr; const E=_reqEsc; const today=_crIsoDay(0);
  const lastPaid=H.pay[0]&&H.pay[0].paid_through||'';
  const unpaid=H.rows.filter(r=>!lastPaid||r.day>lastPaid);
  const unpaidHrs=unpaid.reduce((a,r)=>a+(+r.hours||0),0);
  // week = Saturday → Friday, like the old sheet
  const wkStart=iso=>{ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()-((d.getDay()+1)%7)); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const thisWk=wkStart(today); const wkHrs=H.rows.filter(r=>r.day>=thisWk).reduce((a,r)=>a+(+r.hours||0),0);
  const ed=H.edit||{day:today,hours:'',note:''}; const cur=H.rows.find(r=>r.day===ed.day);
  const box=(t,v,s)=>'<div style="flex:1;min-width:130px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:8px 12px"><div style="font-size:11.5px;color:var(--text-dim)">'+t+'</div><div style="font-size:20px;font-weight:800">'+v+'</div>'+(s?'<div style="font-size:11.5px;color:var(--text-dim)">'+s+'</div>':'')+'</div>';
  let html='<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">'
    +(H.admin?'<select onchange="_CR.hr.who=this.value;_CR.hr.edit=null;_crHrRender(document.getElementById(\'cr-body\'))" style="height:36px;font-size:13.5px;padding:0 10px;border-radius:8px;width:auto;min-width:240px">'+(H.workers.length?H.workers.map(w=>'<option '+(w===H.who?'selected':'')+'>'+E(w)+'</option>').join(''):'<option value="">No one yet</option>')+'</select>':'<div style="font-weight:700;font-size:14px">'+E(H.who)+'</div>')
    +'<div style="margin-left:auto;display:flex;gap:8px">'
      +(H.admin&&H.who&&unpaid.length?'<button class="btn btn-primary text-sm" onclick="_crHrPay()">✓ Mark paid through '+E(_crHrMD(unpaid[0].day))+' ('+_crHrFmt(unpaidHrs)+' hrs)</button>':'')
      +(H.admin&&H.who?'<button class="btn btn-ghost text-sm" onclick="_crHrRename()" title="Move all of this person\'s hours to the email they log in with">✏️ Change email</button>':'')+(H.admin?'<label class="btn btn-ghost text-sm" style="cursor:pointer" title="Bring in an employee\'s old hours sheet (CSV)">📥 Import hours<input type="file" accept=".csv,text/csv" style="display:none" onchange="_crHrImport(this)"></label>':'')
    +'</div></div>';
  if(!H.who){ body.innerHTML=html+'<div style="padding:30px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">No employees yet — add one in 👥 Access, or 📥 Import hours.</div>'; return; }
  html+='<div style="display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:14px;align-items:start">'
    +'<div>'
      +'<div style="background:var(--panel-2);border:1px solid var(--border);border-radius:12px;padding:14px">'
        +'<div style="font-weight:800;font-size:14px;margin-bottom:10px">'+(cur?'✏️ Edit '+E(_crHrDay(ed.day))+' '+E(_crHrMD(ed.day)):'⏱ Log hours')+'</div>'
        +'<div style="display:flex;gap:8px;margin-bottom:8px"><input type="date" id="cr-hr-day" value="'+E(ed.day)+'" max="'+today+'" onchange="_crHrPick(this.value)" style="height:38px;font-size:14px;padding:0 8px;border-radius:8px;flex:1">'
          +'<input id="cr-hr-hrs" type="number" step="0.25" min="0" max="24" value="'+E(ed.hours)+'" placeholder="Hours" style="height:38px;font-size:15px;font-weight:700;padding:0 10px;border-radius:8px;width:100px" onkeydown="if(event.key===\'Enter\')_crHrSave()"></div>'
        +'<textarea id="cr-hr-note" placeholder="What did you get done? (optional)" style="width:100%;box-sizing:border-box;height:90px;font-size:13px;padding:8px 10px;border-radius:8px;font-family:inherit" onkeydown="if(event.key===\'Enter\'&&(event.ctrlKey||event.metaKey))_crHrSave()">'+E(ed.note||'')+'</textarea>'
        +(H.done[ed.day]?'<div style="font-size:12px;color:var(--text-dim);margin-top:4px">'+H.done[ed.day]+' case'+(H.done[ed.day]===1?'':'s')+' finished in the Work Queue that day</div>':'')
        +'<div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-primary" style="flex:1" onclick="_crHrSave()">💾 Save</button>'
          +(cur?'<button class="btn btn-ghost text-sm" onclick="_CR.hr.edit=null;_crHrDraw()">Cancel</button>':'')+'</div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
        +box('This week (Sat–Fri)',_crHrFmt(wkHrs)+' hrs')
        +box('Not paid yet',_crHrFmt(unpaidHrs)+' hrs',lastPaid?'since '+_crHrMD(lastPaid):'')
      +'</div>'
      +(H.pay.length?'<div style="margin-top:12px;font-size:12.5px"><div style="font-weight:700;margin-bottom:4px">Paid</div>'+H.pay.slice(0,8).map(p=>'<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid var(--border)"><span>through '+E(_crHrMD(p.paid_through))+'</span><span><b>'+_crHrFmt(p.hours)+'</b> hrs'+(H.admin?' <a href="#" title="Undo this payment" onclick="event.preventDefault();_crHrUnpay('+p.id+')" style="color:var(--text-dim);text-decoration:none;margin-left:6px">✕</a>':'')+'</span></div>').join('')+'</div>':'')
    +'</div>';
  // log table, newest first, grouped by pay period, with week subtotals
  const rows=H.rows.slice(); const trs=[]; let wk=null, wkSum=0;
  const flushWk=()=>{ if(wk!==null) trs.push('<tr><td colspan="5" style="padding:4px 10px;text-align:right;font-size:11.5px;color:var(--text-dim);background:var(--panel-2)">Week of '+E(_crHrMD(wk))+' · <b style="color:var(--text)">'+_crHrFmt(wkSum)+' hrs</b></td></tr>'); };
  let paidIdx=0;
  rows.forEach(r=>{
    while(paidIdx<H.pay.length&&r.day<=H.pay[paidIdx].paid_through){ flushWk(); wk=null; wkSum=0; const p=H.pay[paidIdx]; trs.push('<tr><td colspan="5" style="padding:7px 10px;font-size:12px;font-weight:700;color:#22c55e;border-top:2px solid #22c55e55">✓ Paid through '+E(_crHrMD(p.paid_through))+' — '+_crHrFmt(p.hours)+' hrs</td></tr>'); paidIdx++; }
    const w=wkStart(r.day); if(w!==wk){ flushWk(); wk=w; wkSum=0; } wkSum+=(+r.hours||0);
    const un=!lastPaid||r.day>lastPaid;
    trs.push('<tr onclick="_crHrPick(\''+r.day+'\')" style="cursor:pointer;border-top:1px solid var(--border)'+(H.edit&&H.edit.day===r.day?';background:rgba(96,165,250,.12)':'')+'"><td style="padding:6px 10px;white-space:nowrap;width:44px;color:var(--text-dim)">'+_crHrDay(r.day)+'</td><td style="padding:6px 10px;white-space:nowrap;width:70px">'+E(_crHrMD(r.day))+'</td><td style="padding:6px 10px;white-space:nowrap;width:60px;font-weight:700;'+(un?'':'color:var(--text-dim)')+'">'+_crHrFmt(r.hours)+'</td><td style="padding:6px 10px;white-space:nowrap;width:70px;color:var(--text-dim)">'+(H.done[r.day]?H.done[r.day]+' cases':'')+'</td><td style="padding:6px 10px;color:var(--text-dim);font-size:12px">'+E(r.note||'')+'</td></tr>');
  });
  flushWk();
  html+='<div style="max-height:620px;overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'+['Day','Date','Hours','Done','Notes'].map(h=>'<th style="position:sticky;top:0;background:var(--panel);padding:7px 10px;text-align:left;font-size:11px;color:var(--text-dim);text-transform:uppercase">'+h+'</th>').join('')+'</tr></thead><tbody>'
    +(trs.length?trs.join(''):'<tr><td colspan="5" style="padding:30px;text-align:center;color:var(--text-dim)">No hours logged yet.</td></tr>')+'</tbody></table></div></div>';
  body.innerHTML=html;
}
function _crHrPick(day){ const H=_CR.hr; if(!day) return; const r=H.rows.find(x=>x.day===day); H.edit={day:day,hours:r?_crHrFmt(r.hours):'',note:r?r.note||'':''}; _crHrDraw(); const h=document.getElementById('cr-hr-hrs'); if(h) h.focus(); }
window._crHrPick=_crHrPick;
async function _crHrSave(){
  const H=_CR.hr; const day=(document.getElementById('cr-hr-day')||{}).value; const hv=(document.getElementById('cr-hr-hrs')||{}).value; const note=((document.getElementById('cr-hr-note')||{}).value||'').trim();
  if(!day){ toast('Pick a date','warn'); return; }
  const hrs=hv===''?null:_crHrNum(hv); if(hrs!==null&&(hrs<0||hrs>24)){ toast('Hours must be 0–24','warn'); return; }
  const lastPaid=H.pay[0]&&H.pay[0].paid_through; if(lastPaid&&day<=lastPaid&&!H.admin){ toast('That day is already paid — ask Logan to change it','warn'); return; }
  try{
    if(hrs===null&&!note){ const d=await sb.from('work_hours').delete().eq('email',H.who).eq('day',day); if(d.error) throw d.error; H.rows=H.rows.filter(r=>r.day!==day); toast('Removed '+_crHrMD(day),'ok'); }
    else{ const rec={email:H.who,day:day,hours:hrs,note:note||null,updated_at:new Date().toISOString()};
      const u=await sb.from('work_hours').upsert(rec,{onConflict:'email,day'}).select().single(); if(u.error) throw u.error;
      H.rows=H.rows.filter(r=>r.day!==day).concat([u.data]).sort((a,b)=>a.day<b.day?1:-1); toast('⏱ Saved '+_crHrFmt(hrs||0)+' hrs for '+_crHrDay(day)+' '+_crHrMD(day),'ok'); }
    H.edit=null; _crHrDraw();
  }catch(e){ toast('Save failed: '+(e.message||e),'err'); }
}
window._crHrSave=_crHrSave;
async function _crHrPay(){
  const H=_CR.hr; const lastPaid=H.pay[0]&&H.pay[0].paid_through||''; const un=H.rows.filter(r=>!lastPaid||r.day>lastPaid); if(!un.length) return;
  const thru=un[0].day; const hrs=un.reduce((a,r)=>a+(+r.hours||0),0);
  if(!confirm('Mark '+_crHrFmt(hrs)+' hrs paid for '+H.who+' (through '+_crHrMD(thru)+')?')) return;
  const r=await sb.from('work_pay').insert({email:H.who,paid_through:thru,hours:hrs,paid_at:new Date().toISOString()}).select().single();
  if(r.error){ toast('Failed: '+r.error.message,'err'); return; }
  H.pay.unshift(r.data); toast('✓ Marked paid','ok'); _crHrDraw();
}
window._crHrPay=_crHrPay;
async function _crHrUnpay(id){
  if(!confirm('Undo this payment? Those hours go back to "not paid yet".')) return;
  const r=await sb.from('work_pay').delete().eq('id',id); if(r.error){ toast('Failed: '+r.error.message,'err'); return; }
  _CR.hr.pay=_CR.hr.pay.filter(p=>p.id!==id); _crHrDraw();
}
window._crHrUnpay=_crHrUnpay;
// Old sheet: Day, Date, Sheets Time, Hours, (Added) Goal, Daily Notes. "PAID" + a total marks the end of each paid period.
async function _crHrImport(inp){
  const f=inp.files&&inp.files[0]; inp.value=''; if(!f) return; const H=_CR.hr;
  const email=(prompt('Whose hours are these? Type the email they log in with:',H.who||'')||'').trim().toLowerCase();
  if(!email||!/@/.test(email)) return;
  try{
    const rows=_crParseCsv(await f.text()); const head=(rows.shift()||[]).map(h=>String(h).trim().toLowerCase());
    const col=re=>head.findIndex(h=>re.test(h));
    const ix={date:col(/^date/),st:col(/sheets time/),hrs:col(/^hours/),goal:col(/goal|paid/),note:col(/note/)};
    if(ix.date<0||ix.hrs<0) throw new Error('Could not find Date and Hours columns');
    const recs=[]; const pays=[]; let blockPaid=false, blockHrs=0;
    rows.forEach(r=>{
      const m=String(r[ix.date]||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m) return;
      const y=m[3].length===2?'20'+m[3]:m[3]; const day=y+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
      const hrs=String(r[ix.hrs]||'').trim(); const st=ix.st>=0?String(r[ix.st]||'').trim():''; let note=ix.note>=0?String(r[ix.note]||'').trim():'';
      const g=ix.goal>=0?String(r[ix.goal]||'').trim():'';
      if(st) note=(note?note+' · ':'')+'Sheets time: '+st;
      if(hrs!==''||note) recs.push({email:email,day:day,hours:hrs===''?null:_crHrNum(hrs),note:note||null});
      blockHrs+=hrs===''?0:_crHrNum(hrs);
      if(/paid/i.test(g)) blockPaid=true;
      else if(/^\d+(\.\d+)?$/.test(g)){ if(blockPaid&&day<=_crIsoDay(0)) pays.push({email:email,paid_through:day,hours:blockHrs,paid_at:new Date(day+'T17:00:00').toISOString(),note:note&&/bonus/i.test(note)?note:null}); blockPaid=false; blockHrs=0; }
    });
    if(!recs.length) throw new Error('No hours found in that file');
    if(!confirm('Import '+recs.length+' days ('+_crHrFmt(recs.reduce((a,r)=>a+(r.hours||0),0))+' hrs) and '+pays.length+' paid periods for '+email+'?\nDays already logged in Data LAB are left as they are.')) return;
    for(let i=0;i<recs.length;i+=500){ const u=await sb.from('work_hours').upsert(recs.slice(i,i+500),{onConflict:'email,day',ignoreDuplicates:true}); if(u.error) throw u.error; }
    if(pays.length){ const u=await sb.from('work_pay').upsert(pays,{onConflict:'email,paid_through',ignoreDuplicates:true}); if(u.error) throw u.error; }
    toast('📥 Imported '+recs.length+' days for '+email,'ok'); H.who=email; _crHrRender(document.getElementById('cr-body'));
  }catch(e){ toast('Import failed: '+(e.message||e),'err'); }
}
window._crHrImport=_crHrImport;
async function _crHrRename(){
  const H=_CR.hr; const old=H.who; if(!old) return;
  const nu=(prompt('Move all hours and paid periods from "'+old+'" to which login email?',/@/.test(old)?old:'')||'').trim().toLowerCase();
  if(!nu||nu===old) return; if(!/@/.test(nu)){ toast('That doesn\'t look like an email','warn'); return; }
  try{
    const a=await sb.from('work_hours').update({email:nu}).eq('email',old); if(a.error) throw a.error;
    const b=await sb.from('work_pay').update({email:nu}).eq('email',old); if(b.error) throw b.error;
    toast('✏️ Moved '+old+' → '+nu,'ok'); H.who=nu; _crHrRender(document.getElementById('cr-body'));
  }catch(e){ toast('Change failed: '+(e.message||e)+(/duplicate|unique/i.test(e.message||'')?' — that email already has some of the same days logged':''),'err'); }
}
window._crHrRename=_crHrRename;

// 📈 Filings by month — line per list type, toggle each on/off (Tracker, under the county table)
_CR.ch=_CR.ch||{ fc:true, pb:true, ev:true, county:'', range:12, by:'m' };
function _crChartHtml(){
  const E=_reqEsc, C=_CR.ch, T=[['fc','Foreclosure','#06b6d4'],['pb','Probate','#a855f7'],['ev','Eviction','#eab308']];
  const act=_CR.counties.filter(c=>c.active), actSet=new Set(act.map(c=>c.code));
  const mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const by=C.by||'m', step=by==='w'?7:by==='bw'?14:0;   // weekly / bi-weekly / monthly / quarterly
  const now=new Date(); now.setHours(0,0,0,0);
  const rows=[]; let minM=null, noDay=0;
  _CR.cases.forEach(c=>{ const k=_crTypeKey(c.case_type); if(!k) return;
    if(C.county?c.county_code!==C.county:!actSet.has(c.county_code)) return;
    let day=c.filed&&/^\d{4}-\d{2}-\d{2}/.test(String(c.filed))?String(c.filed).slice(0,10):'', m=day.slice(0,7);
    if(!m){ const x=String(c.case_number||'').match(/^\d{2}[A-Z]\d{2}-(\d{2})(\d{2})-/); if(!x||+x[2]<1||+x[2]>12) return; m='20'+x[1]+'-'+x[2]; }  // month from the case number when Filed is blank
    rows.push({k:k,day:day,m:m}); if(!minM||m<minM) minM=m; });
  const buckets=[];
  if(step){
    const end=new Date(now); end.setDate(end.getDate()+1);
    const s0=C.range?new Date(now):(minM?new Date(+minM.slice(0,4),+minM.slice(5,7)-1,1):new Date(now)); if(C.range) s0.setMonth(s0.getMonth()-C.range); s0.setDate(s0.getDate()-((s0.getDay()+6)%7));   // start on a Monday
    for(let d=new Date(s0);d<end;d.setDate(d.getDate()+step)){ const t=new Date(d); t.setDate(t.getDate()+step); const last=new Date(t); last.setDate(last.getDate()-1);
      buckets.push({from:iso(d),to:iso(t),label:mn[d.getMonth()]+' '+d.getDate(),tip:(step===14?mn[d.getMonth()]+' '+d.getDate()+' – '+mn[last.getMonth()]+' '+last.getDate():'week of '+mn[d.getMonth()]+' '+d.getDate())}); }
  } else {
    const q=by==='q'?3:1;
    let start=C.range?new Date(now.getFullYear(),now.getMonth()-(C.range-1),1):(minM?new Date(+minM.slice(0,4),+minM.slice(5,7)-1,1):new Date(now.getFullYear(),now.getMonth()-11,1));
    if(q===3) start=new Date(start.getFullYear(),Math.floor(start.getMonth()/3)*3,1);
    for(let d=new Date(start);d<=now;d.setMonth(d.getMonth()+q)){ const n2=new Date(d.getFullYear(),d.getMonth()+q,1);
      const lbl=q===3?'Q'+(Math.floor(d.getMonth()/3)+1)+" '"+String(d.getFullYear()).slice(2):mn[d.getMonth()]+(d.getMonth()===0||(C.range&&C.range<=14)?" '"+String(d.getFullYear()).slice(2):'');
      buckets.push({from:iso(d).slice(0,7),to:iso(n2).slice(0,7),label:lbl,tip:q===3?'Q'+(Math.floor(d.getMonth()/3)+1)+' '+d.getFullYear():mn[d.getMonth()]+' '+d.getFullYear()}); }
  }
  const counts={fc:buckets.map(()=>0),pb:buckets.map(()=>0),ev:buckets.map(()=>0)};
  rows.forEach(r=>{ let key;
    if(step){ if(!r.day){ if(buckets.length&&r.m>=buckets[0].from.slice(0,7)) noDay++; return; } key=r.day; } else key=r.m;
    for(let i=buckets.length-1;i>=0;i--){ if(key>=buckets[i].from&&key<buckets[i].to){ counts[r.k][i]++; break; } } });
  const months=buckets.map(b=>b.label);
  const on=T.filter(t=>C[t[0]]);
  const series=on.map(t=>({k:t[0],name:t[1],col:t[2],v:counts[t[0]]}));
  const max=Math.max(1,...series.flatMap(s=>s.v)); const nice=(x=>{ const p=Math.pow(10,Math.floor(Math.log10(x))); const f=x/p; return (f<=1?1:f<=2?2:f<=5?5:10)*p; })(max);
  const W=1000,H=250,L=44,R=12,Tp=12,B=30, iw=W-L-R, ih=H-Tp-B, n=months.length;
  const X=i=>L+(n<=1?iw/2:i*iw/(n-1)), Y=v=>Tp+ih-(v/nice)*ih;
  const lab=m=>m;
  const every=Math.max(1,Math.ceil(n/14));
  let svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block" role="img" aria-label="Filings by month">';
  const steps=(nice%4===0||nice<4)?4:5; for(let g=0;g<=steps;g++){ const v=nice*g/steps, y=Y(v); svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" style="stroke:var(--border)" stroke-width="1"/><text x="'+(L-8)+'" y="'+(y+4)+'" text-anchor="end" style="fill:var(--text-dim);font-size:11px">'+(Math.round(v*10)/10).toLocaleString()+'</text>'; }
  months.forEach((m,i)=>{ if(i%every===0||i===n-1) svg+='<text x="'+X(i)+'" y="'+(H-10)+'" text-anchor="'+(i===n-1&&n>1?'end':i===0&&n>1?'start':'middle')+'" style="fill:var(--text-dim);font-size:11px">'+lab(m)+'</text>'; });
  series.forEach(s=>{ svg+='<polyline fill="none" stroke="'+s.col+'" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="'+s.v.map((v,i)=>X(i).toFixed(1)+','+Y(v).toFixed(1)).join(' ')+'"/>';
    s.v.forEach((v,i)=>{ svg+='<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(v).toFixed(1)+'" r="'+(n>36?2:3.5)+'" fill="'+s.col+'"><title>'+s.name+' · '+buckets[i].tip+': '+v.toLocaleString()+' filed</title></circle>'; }); });
  svg+='</svg>';
  const tot=k=>counts[k].reduce((a,v)=>a+v,0);
  const sel='height:32px;font-size:13px;padding:0 8px;border-radius:8px;width:auto';
  return '<div style="background:var(--panel-2);border:1px solid var(--border);border-radius:12px;padding:12px 14px">'
    +'<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px">'
      +'<div style="font-weight:800;font-size:14px">📈 Filings</div>'
      +T.map(t=>'<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:600"><input type="checkbox" '+(C[t[0]]?'checked':'')+' onchange="_CR.ch.'+t[0]+'=this.checked;_crChartDraw()" style="width:16px;height:16px;accent-color:'+t[2]+'"><span style="display:inline-block;width:14px;height:3px;border-radius:2px;background:'+t[2]+'"></span>'+t[1]+' <span style="color:var(--text-dim);font-weight:500">'+tot(t[0]).toLocaleString()+'</span></label>').join('')
      +'<div style="margin-left:auto;display:flex;gap:8px">'
        +'<select style="'+sel+'" onchange="_CR.ch.county=this.value;_crChartDraw()"><option value="">All active counties</option>'+_CR.counties.map(c=>'<option value="'+E(c.code)+'" '+(C.county===c.code?'selected':'')+'>'+E(c.city)+(c.active?'':' (inactive)')+'</option>').join('')+'</select>'
        +'<select style="'+sel+'" onchange="_CR.ch.by=this.value;_crChartDraw()">'+[['w','Weekly'],['bw','Bi-weekly'],['m','Monthly'],['q','Quarterly']].map(o=>'<option value="'+o[0]+'" '+(by===o[0]?'selected':'')+'>'+o[1]+'</option>').join('')+'</select>'+'<select style="'+sel+'" onchange="_CR.ch.range=+this.value;_crChartDraw()">'+[[3,'Last 3 months'],[6,'Last 6 months'],[12,'Last 12 months'],[24,'Last 24 months'],[36,'Last 36 months'],[0,'All time']].map(o=>'<option value="'+o[0]+'" '+(C.range===o[0]?'selected':'')+'>'+o[1]+'</option>').join('')+'</select>'
      +'</div></div>'
    +(on.length?svg+(noDay?'<div style="font-size:11.5px;color:var(--text-dim);margin-top:4px">'+noDay.toLocaleString()+' case'+(noDay===1?'':'s')+' in this range have no Filed date, so they can\'t be placed in a week — they still show on Monthly.</div>':''):'<div style="padding:40px;text-align:center;color:var(--text-dim)">Check a list type to show its line.</div>')
  +'</div>';
}
function _crChartDraw(){ const el=document.getElementById('cr-chart'); if(el) el.innerHTML=_crChartHtml(); }
window._crChartDraw=_crChartDraw;
