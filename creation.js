// Shared by index.html (full Data LAB) and creation.html (Creation-only page).
// ===== Marketing → 🛠 Creation (court records: foreclosure / probate / eviction) =====
// Tables: court_cases (one row per case number) + court_counties (Tracker list).
// Works in place: saving a case never reloads the page or the list.
window._CR = window._CR || { loaded:false, loading:false, counties:[], cases:[], tab:'tracker', showInactive:false };
const _CR_TYPES = { fc:'Foreclosure', pb:'Probate', ev:'Eviction', cv:'Code Violation', ul:'Utility Lien', ts:'Tax Sale' };
const _CR_COL = { fc:'#06b6d4', pb:'#a855f7', ev:'#eab308', cv:'#f43f5e', ul:'#22c55e', ts:'#3b82f6' };
const _CR_SFX = { fc:'.1', pb:'.2', ev:'.3', cv:'.4', ul:'.5', ts:'.6' };
const _CR_LISTS = ['cv','ul','ts'];   // city / county lists (not court cases)
// Company-type owner names — scrapped (LLC landlords, management companies, etc.)
const _CR_CORP = /\b(l\.?l\.?c|l\.?l\.?p|inc|corp|corporation|apartments?|apts?|properties|property management|management|holdings|l\.?p|ltd|company|housing|homes|realty|partners|rentals?|investments?|group|enterprises|ventures|capital)\b|\bLL$/i;
function _crTypeKey(t){ t=String(t||''); if(/^CV\b/.test(t)) return 'cv'; if(/^UL\b/.test(t)) return 'ul'; if(/^TS\b/.test(t)) return 'ts'; t=t.toLowerCase(); if(/mortgage|foreclos/.test(t)) return 'fc'; if(/estate|guardian|probate|\btrust\b|^tr\b/.test(t)) return 'pb'; if(/evict/.test(t)) return 'ev'; return ''; }
// Scrap codes: 4.2 guardianship (any) · 4.3 company landlord eviction · 4.4 company owner (lists) · 4.7 tax sale no bid · 4.8 inactive tax parcel
const _CR_SCRAP_WHY = { '4.2':'Guardianship', '4.3':'LLC / apartment', '4.4':'Company owner', '4.5':'Trust', '4.6':'No bid (bid = minimum)', '4.7':'No bid at tax sale', '4.8':'Inactive tax parcel' };
// Sort code — same rules as the sheet's Task List.
function _crSort(c){
  const k=_crTypeKey(c.case_type); const sfx=_CR_SFX[k]; if(!sfx) return '';
  const v=x=>String(x==null?'':x).trim(); const unk=x=>/^unknown$/i.test(v(x));
  if(_CR_LISTS.indexOf(k)>=0){   // city / county lists: done as soon as there's an address + owner
    const ex=c.extra||{};
    // Tax sale: every parcel that went (or was about to go) to tax sale is a lead — sold, no bid or pulled pre-sale. Nothing is scrapped; the status is kept as a tag.
    if(k!=='ts'&&_CR_CORP.test(c.defendant||'')) return '4.4';   // tax sale keeps company owners
    if(!v(c.address)||!v(c.defendant)) return '0'+sfx;
    if(unk(c.address)) return '3'+sfx;
    if(!/^land$/i.test(v(c.address))&&!/^\d/.test(v(c.address))) return '0'+sfx;   // no house number ("LINCOLN AVE", "behind 3810…") — needs a real address
    if(unk(c.defendant)) return '1'+sfx;
    return '2'+sfx;
  }
  if(k==='pb' && /guardian/i.test((c.case_type||'')+' '+(c.style||''))) return '4.2';   // all guardianships (minor or adult) → Scrap
  if(k==='pb' && /^TR\b|\btrust\b/i.test(c.case_type||'')) return '4.5';               // trust cases (TR - Trust) → Scrap
  if(k==='ev' && _CR_CORP.test(String(c.plaintiff||'').trim()||String(c.style||'').split(/\s+vs?\.?\s+/i)[0])) return '4.3';   // plaintiff, or the part of the style before " v. " on a fresh paste
  if(unk(c.address)) return '3'+sfx;   // no property found → done, nothing else needed
  const req = k==='pb' ? [c.address,c.defendant,c.attorney,_crPetName(c),_crPetAddr(c),_crPetCount(c)] : [c.address,c.defendant,c.plaintiff,c.attorney];
  if(req.some(x=>!v(x))) return '0'+sfx;
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
    // Load in parallel: ask how many there are, then pull the 1,000-row pages several at a time (much faster from far away).
    const cols='id,case_number,county_code,case_type,sort_code,filed,completed_at,completed_by,uploaded_at,claimed_by,claimed_at'; const step=1000;
    const head=await sb.from('court_cases').select('id',{count:'exact',head:true}); const total=(head&&typeof head.count==='number')?head.count:null;
    let all=[];
    if(total!=null){ const pages=Math.ceil(total/step); const got=new Array(pages);
      for(let i=0;i<pages;i+=6){ await Promise.all(Array.from({length:Math.min(6,pages-i)},(_,j)=>i+j).map(async pg=>{ const q=await sb.from('court_cases').select(cols).order('case_number').range(pg*step,pg*step+step-1); if(q.error) throw q.error; got[pg]=q.data||[]; })); }
      got.forEach(g=>{ if(g) all=all.concat(g); });
      // anything added while loading
      for(let from=pages*step;;from+=step){ const q=await sb.from('court_cases').select(cols).order('case_number').range(from,from+step-1); if(q.error) throw q.error; all=all.concat(q.data||[]); if(!q.data||q.data.length<step) break; }
    } else {
      for(let from=0;;from+=step){ const q=await sb.from('court_cases').select(cols).order('case_number').range(from,from+step-1); if(q.error) throw q.error; all=all.concat(q.data||[]); if(!q.data||q.data.length<step) break; }
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
  const tabs=[['tracker','📊 Tracker'],['queue','🧾 Work Queue'],['paste','📋 Paste / Import'],['scrap','🗑 Scrap'],['unknown','❓ Unknown']].concat(window.CR_LIMITED?[]:[['export','📤 Export']]);
  const soon={};
  root.innerHTML='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px">'
      +'<div class="panel p-1" style="display:inline-flex;align-items:center"><div class="subtab'+(_CR.tab==='all'?' active':'')+'" onclick="_crTab(\'all\')" style="display:inline-flex;align-items:center;white-space:nowrap">🔎 All Cases</div></div>'
      +'<div class="panel p-1" style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap">'+tabs.map(t=>'<div class="subtab'+(_CR.tab===t[0]?' active':'')+'" onclick="_crTab(\''+t[0]+'\')" style="display:inline-flex;align-items:center;white-space:nowrap;'+(soon[t[0]]?'opacity:.55':'')+'">'+t[1]+'</div>').join('')+'</div>'
      +'<div class="panel p-1" style="display:inline-flex;align-items:center"><div class="subtab'+(_CR.tab==='hours'?' active':'')+'" onclick="_crTab(\'hours\')" style="display:inline-flex;align-items:center;white-space:nowrap">⏱ Hours</div></div>'
      +'<div style="margin-left:auto;display:flex;gap:8px">'
        +(window.CR_LIMITED?'':'<button class="btn btn-ghost text-sm" onclick="_crAccessOpen()" title="Who gets the Creation-only page">👥 Access</button>'
          +'<label class="btn btn-ghost text-sm" style="cursor:pointer" title="One-time: bring cases in from your Combined sheet (CSV). Skips case numbers already here.">📥 Import sheet<input type="file" accept=".csv,text/csv" style="display:none" onchange="_crImportCsv(this)"></label>')
        +(!window.CR_LIMITED&&typeof reqEmailTplOpen==='function'?'<button class="btn btn-ghost text-sm" onclick="reqEmailTplOpen()" title="Request-email templates (one per list type)">✉️ Emails</button>'
          +(typeof reqFormOpen==='function'?'<button class="btn btn-ghost text-sm" onclick="reqFormOpen()" title="Ready-to-paste text for website request forms">📝 Forms</button>':'')
          +(typeof requestAddType==='function'?'<button class="btn btn-ghost text-sm" onclick="_crReqAddType()" title="Add a list type to every Requests city">+ List Type</button>':'')
          +(typeof requestOpenModal==='function'?'<button class="btn btn-ghost text-sm" onclick="_crReqAddCity()" title="Add a city to request lists from">+ Add City</button>':''):'')
        +'<button class="btn btn-ghost text-sm" id="cr-refresh" onclick="_crRefresh(this)" title="Re-pull from the database" style="width:40px;justify-content:center"><span class="cr-spin-ico" style="display:inline-block">↻</span></button>'
      +'</div></div>'
    +'<div id="cr-body"></div>';
  const body=document.getElementById('cr-body');
  if(_CR.tab==='tracker'){ body.innerHTML=_crTrackerHtml(); _crTrkScrollSync(); _crReqFit(); }
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
function _crTab(t){ if(typeof _crFlush==='function') _crFlush(); _CR.tab=t; _crRender(); }
window._crTab=_crTab;
function _crStats(){
  const by={};
  _CR.cases.forEach(c=>{ const k=_crTypeKey(c.case_type); if(!k) return; const cc=c.county_code||'?';
    const b=by[cc]||(by[cc]={fc:{d:0,t:0},pb:{d:0,t:0,u:0},ev:{d:0,t:0,c:0},cv:{d:0,t:0,s:0},ul:{d:0,t:0,s:0},ts:{d:0,t:0,s:0},scrap:0,all:0});
    if(_crScrap(c.sort_code)){ b.scrap++; if(c.sort_code==='4.3') b.ev.c++; if(b[k].s!=null) b[k].s++; return; }
    b.all++; b[k].t++; if(_crDone(c.sort_code)) b[k].d++; if(k==='pb'&&/^3\./.test(c.sort_code||'')) b.pb.u++; });
  return by;
}
function _crPct(d,t){ return t?Math.round(d/t*1000)/10:0; }
// Only 100% is green; below that: yellow (90%+), orange (60%+), red.
function _crPctColor(p,t){ return !t?'var(--text-dim)':p>=100?'#22c55e':p>=90?'#facc15':p>=60?'#f97316':'#ef4444'; }
// Fixed column widths for the tracker (same on every screen, inactive table lines up too).
const _CR_COLW=[250,50, 150,110,80, 150,110,80, 150,110,80, 150,100,70, 150,100,70, 110,100,70];
const _CR_COLS='<colgroup>'+_CR_COLW.map(w=>'<col style="width:'+w+'px">').join('')+'</colgroup>';
const _CR_TBL='table-layout:fixed;width:'+_CR_COLW.reduce((a,b)=>a+b,0)+'px;border-collapse:separate;border-spacing:0;font-size:13px';
function _crTrackerHtml(){
  const E=_reqEsc; const by=_crStats(); const fmt=d=>d?_reqFmtDate(d):'—';
  const cell=(b,k,pulled,code)=>{ const x=b[k]; const p=_crPct(x.d,x.t);
    return '<td style="text-align:center;padding:4px 4px;border-left:2px solid var(--border);"><input type="date" value="'+(pulled||'')+'" title="Pulled to — change it when you pull" onchange="_crSetPulled(\''+code+'\',\''+k+'\',this)" style="height:28px;width:128px;font-size:12px;padding:0 5px;border-radius:6px;color:var(--text-dim)"></td>'
      +'<td style="text-align:center;padding:7px 6px"><b>'+x.d.toLocaleString()+'</b><span style="color:var(--text-dim)"> / '+x.t.toLocaleString()+'</span></td>'
      +'<td style="text-align:center;padding:7px 6px;font-weight:700;color:'+_crPctColor(p,x.t)+'">'+(x.t?p.toFixed(1)+'%':'—')+'</td>'; };
  const _zeusOn=code=>{ const c=_CR.counties.find(x=>x.code===code); return !!(c&&c.pulled&&c.pulled._zeus); };
  const lpull=(k,v,code)=>'<button type="button" title="'+(k==='ts'?'Tax sale year pulled'+(_zeusOn(code)?' — on Zeus':''):'Month you last pulled this list')+'" onclick="_crPickOpen(this,\''+k+'\',\''+code+'\')" style="height:28px;font-size:12px;padding:0 8px;border-radius:6px;border:'+(k==='ts'&&_zeusOn(code)?'1.5px solid #facc15':'1px solid var(--border)')+';background:var(--panel-2);color:'+(v?'var(--text)':'var(--text-dim)')+';cursor:pointer;width:'+(k==='ts'?80:104)+'px;display:inline-flex;align-items:center;justify-content:space-between;gap:4px"><span>'+_crPullLbl(v)+'</span><span style="opacity:.6;font-size:10px">▾</span></button>';
  const lcell=(x,k,pv,code)=>{ const p=_crPct(x.d,x.t); return '<td style="text-align:center;padding:4px 4px;border-left:2px solid var(--border);">'+lpull(k,pv,code)+'</td><td style="text-align:center;padding:7px 6px"><b>'+x.d.toLocaleString()+'</b><span style="color:var(--text-dim)"> / '+x.t.toLocaleString()+'</span></td><td style="text-align:center;padding:7px 6px;font-weight:700;color:'+_crPctColor(p,x.t)+'">'+(x.t?p.toFixed(1)+'%':'—')+'</td>'; };
  const empty={fc:{d:0,t:0},pb:{d:0,t:0,u:0},ev:{d:0,t:0},cv:{d:0,t:0,s:0},ul:{d:0,t:0,s:0},ts:{d:0,t:0,s:0},scrap:0,all:0};
  const act=_CR.counties.filter(c=>c.active), ina=_CR.counties.filter(c=>!c.active);
  const tot={fc:{d:0,t:0},pb:{d:0,t:0,u:0},ev:{d:0,t:0,c:0},cv:{d:0,t:0,s:0},ul:{d:0,t:0,s:0},ts:{d:0,t:0,s:0},all:0,scrap:0};
  act.forEach(c=>{ const b=by[c.code]||empty; ['fc','pb','ev','cv','ul','ts'].forEach(k=>{ tot[k].d+=b[k].d; tot[k].t+=b[k].t; if(tot[k].s!=null) tot[k].s+=(b[k].s||0); }); tot.pb.u+=b.pb.u; tot.ev.c+=(b.ev.c||0); tot.all+=b.all; tot.scrap+=b.scrap; });
  const row=c=>{ const b=by[c.code]||empty; const p=c.pulled||{};
    return '<tr class="cr-trk-row" data-code="'+E(c.code)+'" ondragover="_crDragOver(event,this)" ondragleave="this.style.boxShadow=\'\'" ondrop="_crDrop(event,this)">'
      +'<td style="padding:7px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:sticky;left:0;z-index:1;background:var(--panel);box-shadow:inset -1px 0 0 var(--border)">'
      +(window.CR_LIMITED?'':'<span draggable="true" ondragstart="_crDragStart(event,\''+E(c.code)+'\')" ondragend="_crDragEnd()" title="Drag to reorder" style="cursor:grab;color:var(--text-dim);font-size:13px;padding:0 4px 0 0;user-select:none;letter-spacing:-2px">⋮⋮</span>')+(_crHasReq()?'<button type="button" onclick="_crReqToggle(\''+E(c.code)+'\')" title="Show this city’s Requests (list types, connections)" style="background:none;border:none;cursor:pointer;font-size:11px;padding:0 5px 0 0;color:'+(_CR.reqOpen[c.code]?'#a5b4fc':'var(--text-dim)')+';display:inline-block;transform:rotate('+(_CR.reqOpen[c.code]?'90':'0')+'deg);transition:transform .15s">▶</button>':'')+'<button type="button" onclick="_crCountyEdit(\''+E(c.code)+'\')" title="Edit county — active, GIS link" style="background:none;border:none;cursor:pointer;font-size:13px;padding:0 4px 0 0;opacity:.7">⚙️</button>'+_crCodeBadge(c)+'<b>'+E(c.city)+'</b> <span style="color:var(--text-dim);font-size:12px">'+E(c.county)+'</span></td>'
      +'<td style="text-align:center;white-space:nowrap;overflow:hidden">'+(c.assessor_url?'<a href="'+E(c.assessor_url)+'" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:none" title="'+E(c.assessor_url)+'">🗺️</a>':'<button type="button" onclick="_crCountyEdit(\''+E(c.code)+'\')" title="Add this county’s GIS / Assessor link" style="background:none;border:1px dashed var(--border);border-radius:6px;color:var(--text-dim);font-size:13px;line-height:1;cursor:pointer;width:26px;height:22px;padding:0;display:inline-flex;align-items:center;justify-content:center">+</button>')+'</td>'
      +cell(b,'fc',p.fc,c.code)+cell(b,'pb',p.pb,c.code)
      +cell(b,'ev',p.ev,c.code)+_CR_LISTS.map(k=>lcell(b[k],k,p[k],c.code)).join('')+'</tr>'+(_crHasReq()&&_CR.reqOpen[c.code]?_crReqPanel(c):''); };
  const th='padding:6px;font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--text-dim);text-align:center';
  const grp=(t,col,n)=>'<th colspan="'+(n||3)+'" style="'+th+';color:'+col+';border-bottom:2px solid '+col+';border-left:2px solid var(--border);">'+t+'</th>';
  const lcard=k=>{ const x=tot[k], p=_crPct(x.d,x.t); return '<div style="flex:1;min-width:150px;background:var(--panel-2);border:1px solid var(--border);border-top:3px solid '+_CR_COL[k]+';border-radius:10px;padding:10px 12px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-dim)">'+_CR_TYPES[k]+'</div><div style="font-size:20px;font-weight:800">'+x.d.toLocaleString()+' <span style="font-size:13px;color:var(--text-dim);font-weight:600">/ '+x.t.toLocaleString()+'</span></div><div style="font-size:12px;font-weight:700"><span style="color:'+_crPctColor(p,x.t)+'">'+(x.t?p.toFixed(1)+'% complete':'—')+'</span>'+(x.s?'<span style="color:var(--text-dim);font-weight:600"> · </span><span style="color:#94a3b8">'+x.s.toLocaleString()+' scrapped</span>':'')+'</div></div>'; };
  const card=(t,k,col)=>{ const p=_crPct(tot[k].d,tot[k].t); return '<div style="flex:1;min-width:150px;background:var(--panel-2);border:1px solid var(--border);border-top:3px solid '+col+';border-radius:10px;padding:10px 12px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-dim)">'+t+'</div><div style="font-size:20px;font-weight:800">'+tot[k].d.toLocaleString()+' <span style="font-size:13px;color:var(--text-dim);font-weight:600">/ '+tot[k].t.toLocaleString()+'</span></div><div style="font-size:12px;font-weight:700;color:'+_crPctColor(p,tot[k].t)+'">'+p.toFixed(1)+'% complete'+(k==='pb'&&tot[k].t?'<span style="color:var(--text-dim);font-weight:600"> · </span><span style="color:#a78bfa" title="Probates where no property address could be found (the ❓ Unknown tab)">'+_crPct(tot.pb.u,tot[k].t).toFixed(1)+'% unknown</span>':'')+(k==='ev'?'<span style="color:var(--text-dim);font-weight:600"> · </span><span style="color:#94a3b8" title="Evictions filed by an LLC / apartment / management company — in 🗑 Scrap">'+(tot.ev.c||0).toLocaleString()+' corporate filing'+(tot.ev.c===1?'':'s')+'</span>':'')+'</div></div>'; };
  return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
      +card('Foreclosure','fc','#06b6d4')+card('Probate','pb','#a855f7')+card('Eviction','ev','#eab308')+_CR_LISTS.map(lcard).join('')
      +'<div style="flex:1;min-width:150px;background:var(--panel-2);border:1px solid var(--border);border-top:3px solid #64748b;border-radius:10px;padding:10px 12px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-dim)">All cases · Scrap</div><div style="font-size:20px;font-weight:800">'+tot.all.toLocaleString()+'</div><div style="font-size:12px;color:var(--text-dim)">'+tot.scrap.toLocaleString()+' in Scrap</div></div>'
    +'</div>'
    +'<div id="cr-trk-top" style="overflow-x:auto;overflow-y:hidden;height:14px;margin-bottom:4px"><div style="width:'+_CR_COLW.reduce((a,b)=>a+b,0)+'px;height:1px"></div></div>'
    +'<div id="cr-trk-wrap" style="overflow:auto;border:1px solid var(--border);border-radius:10px;scrollbar-width:none"><table style="'+_CR_TBL+'">'+_CR_COLS
      +'<thead><tr><th style="padding:6px 8px;text-align:left;position:sticky;left:0;z-index:2;background:var(--panel-2);box-shadow:inset -1px 0 0 var(--border)"><a href="https://public.courts.in.gov/mycase/#/vw/Search" target="_blank" rel="noopener" title="Open MyCase search in a new tab" style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#60a5fa;text-decoration:none;border:1px solid var(--border);border-radius:6px;padding:3px 9px;background:var(--panel);text-transform:none;letter-spacing:0">⚖️ MyCase ↗</a></th><th></th>'+grp('Foreclosure','#06b6d4')+grp('Probate','#a855f7')+grp('Eviction','#eab308')+''+_CR_LISTS.map(k=>grp(_CR_TYPES[k],_CR_COL[k],3)).join('')+'</tr>'
      +'<tr><th style="'+th+';text-align:left;position:sticky;left:0;z-index:2;background:var(--panel-2);box-shadow:inset -1px 0 0 var(--border)">County</th><th style="'+th+'">GIS</th>'+['fc','pb'].map(k=>'<th style="'+th+';border-left:2px solid var(--border);">'+_crSetAllBtn(k)+'</th><th style="'+th+'">Done</th><th style="'+th+'">%</th>').join('')+'<th style="'+th+';border-left:2px solid var(--border);">'+_crSetAllBtn('ev')+'</th><th style="'+th+'">Done</th><th style="'+th+'">%</th>'+_CR_LISTS.map(k=>'<th style="'+th+';border-left:2px solid var(--border);">'+_crSetAllBtn(k)+'</th><th style="'+th+'">Done</th><th style="'+th+'">%</th>').join('')+'</tr></thead>'
      +'<tbody>'+act.map(row).join('')+'</tbody></table></div>'
    +(ina.length?'<div style="margin-top:10px"><button class="btn btn-ghost text-sm" onclick="_CR.showInactive=!_CR.showInactive;_crRender()">'+(_CR.showInactive?'▾':'▸')+' Inactive counties ('+ina.length+')</button>'
      +(_CR.showInactive?'<div style="overflow:auto;border:1px solid var(--border);border-radius:10px;margin-top:8px;opacity:.75"><table style="'+_CR_TBL+'">'+_CR_COLS+'<tbody>'+ina.map(row).join('')+'</tbody></table></div>':'')+'</div>':'')
    +_crReqExtraHtml()+_crOldReqLink()
    +'<div id="cr-chart" style="margin-top:14px">'+_crChartHtml()+'</div>';
}
function _crReqExtraHtml(){
  if(!_crHasReq()) return '';
  if(!(typeof cache!=='undefined'&&cache.requests)){ if(!_CR._reqLoading){ _CR._reqLoading=true; loadRequests().then(()=>{ if(_CR.tab==='tracker') _crRender(); }).catch(()=>{}); } return ''; }
  const E=_reqEsc; const n=s=>String(s||'').toLowerCase().replace(/\bcounty\b/g,'').replace(/[^a-z]/g,'');
  const used=new Set(); _CR.counties.forEach(c=>{ const r=_crReqCity(c); if(r) used.add(r.id); });
  const extra=Object.values(cache.requests).filter(r=>r&&r.city&&!used.has(r.id)).sort((a,b)=>String(a.city).localeCompare(String(b.city)));
  _CR.reqExtra={}; extra.forEach(r=>{ _CR.reqExtra['r_'+r.id]={code:'r_'+r.id,city:r.city,county:r.county,_req:r}; });
  if(!extra.length) return '';
  return '<div style="margin-top:12px;border:1px solid var(--border);border-radius:10px;overflow:auto"><table style="width:100%;border-collapse:separate;border-spacing:0;font-size:13px"><tbody>'
    +'<tr><td colspan="'+_CR_COLW.length+'" style="padding:8px 10px;font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--text-dim);background:var(--panel-2)">📨 Requests cities not in the tracker ('+extra.length+')</td></tr>'
    +extra.map(r=>{ const k='r_'+r.id; const c=_CR.reqExtra[k]; const on=!!_CR.reqOpen[k];
      return '<tr style="border-top:1px solid var(--border)"><td colspan="'+_CR_COLW.length+'" style="padding:7px 8px;border-top:1px solid var(--border)"><button type="button" onclick="_crReqToggle(\''+E(k)+'\')" style="background:none;border:none;cursor:pointer;font-size:11px;padding:0 6px 0 0;color:'+(on?'#a5b4fc':'var(--text-dim)')+';display:inline-block;transform:rotate('+(on?'90':'0')+'deg)">▶</button><b>'+E(r.city)+'</b> <span style="color:var(--text-dim);font-size:12px">'+E(r.county||'')+'</span></td></tr>'
        +(on?_crReqPanel(c):''); }).join('')
    +'</tbody></table></div>';
}
function _crOldReqLink(){ return (_crHasReq()&&typeof goMarketingView==='function')?'<div style="margin-top:8px;text-align:right"><a href="#" onclick="event.preventDefault();goMarketingView(\'requests\')" style="font-size:11.5px;color:var(--text-dim);text-decoration:none" title="The old Requests page — everything there is now in the ▶ panels above">📨 Old Requests page</a></div>':''; }
// ----- 📨 Requests inside the Tracker: ▸ on a county row shows that city's Requests (read-only + the same action buttons). Never saves anything. -----
_CR.reqOpen=_CR.reqOpen||{};
function _crHasReq(){ return typeof loadRequests==='function'&&typeof _reqTypes==='function'&&typeof _reqTypeContacts==='function'; }
async function _crReqToggle(code){
  _CR.reqOpen[code]=!_CR.reqOpen[code];
  if(_CR.reqOpen[code]&&!(typeof cache!=='undefined'&&cache.requests)){ try{ await loadRequests(); }catch(_){} }
  _crRender();
}
window._crReqToggle=_crReqToggle;
function _crReqCity(c){
  const all=Object.values((typeof cache!=='undefined'&&cache.requests)||{}).filter(r=>r&&r.city);
  const n=s=>String(s||'').toLowerCase().replace(/\bcounty\b/g,'').replace(/,?\s*in(diana)?$/,'').replace(/[^a-z]/g,'');
  return all.find(r=>n(r.city)===n(c.city))||all.find(r=>n(r.county)&&n(r.county)===n(c.county))||null;
}
function _crReqPanel(c){
  const E=_reqEsc; const r=c._req||_crReqCity(c);
  const wrap=h=>'<tr class="cr-req-row" id="cr-req-'+E(c.code)+'"><td colspan="'+_CR_COLW.length+'" style="padding:0;background:var(--panel-2);border-top:1px solid var(--border);border-bottom:2px solid #6366f155"><div style="position:sticky;left:0;width:min(1500px,calc(100vw - 120px));box-sizing:border-box;padding:12px 14px">'+h+'</div></td></tr>';
  if(!(typeof cache!=='undefined'&&cache.requests)) return wrap('<div style="color:var(--text-dim);font-size:13px">Loading Requests…</div>');
  if(!r) return wrap('<div style="color:var(--text-dim);font-size:13px">No Requests city for <b>'+E(c.city)+'</b> / '+E(c.county)+' yet — click <b>+ Add City</b> at the top.</div>');
  if(typeof _reqDetailHtml==='function'){ _crReqHook(); try{ return wrap(_reqDetailHtml(r)); }catch(e){ console.warn('req detail',e); } }
  const id=E(r.id), btn='height:28px;padding:0 10px;border:1px solid var(--border);background:var(--panel);border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;color:var(--text)';
  let links=''; try{ links=_reqLinksNorm(r).filter(l=>l.show).map(l=>'<a href="'+E(_reqNormUrl2(l.url))+'" target="_blank" rel="noopener" style="font-size:12.5px;font-weight:600;text-decoration:none;color:'+(l.kind==='zeus'?'#facc15':'#60a5fa')+'">🌐 '+E(l.label||({page:'Request Page',form:'Form',taxsale:'Tax Sale Results',contact:'Contact Us',zeus:'Zeus'})[l.kind]||'Link')+'</a>').join('<span style="color:var(--border)"> · </span>'); }catch(_){}
  const rows=_reqTypes().map(t=>{
    const d=(r.lists&&r.lists[t])||{}; const tc=_reqTypeContacts(r,t); const tq=E(t).replace(/'/g,"\\'");
    const site=tc.site||''; const em=(tc.cs||[]).filter(x=>x&&x.email);
    const conn=site==='zeus'?'<span style="color:#facc15">🌐 Zeus</span>':site==='site'?'🌐 Own website':site==='portal'?'🌐 Request portal':tc.office?'🔗 '+E(tc.office):(tc.cs&&tc.cs.length?'🔗 Own contacts ('+tc.cs.length+')':'<span style="color:var(--text-dim)">— none —</span>');
    let acts='';
    if(site){ const u=_reqSiteUrl(r,t,site); acts+=u?'<a href="'+E(u)+'" target="_blank" rel="noopener" style="'+btn+';color:'+(site==='zeus'?'#facc15':'#60a5fa')+'">🌐 '+(site==='zeus'?'Zeus':site==='site'?'Site':'Portal')+'</a>':''; }
    if(typeof _reqFormFor==='function'&&_reqFormFor(r,t)) acts+='<button type="button" onclick="_reqDownloadForm(\''+id+'\',\''+tq+'\',this)" style="'+btn+';color:#fbbf24">📄 Form</button>';
    else if((site==='site'||site==='portal')&&typeof _reqCopyFormText==='function') acts+='<button type="button" onclick="_reqCopyFormText(\''+id+'\',\''+tq+'\',this)" style="'+btn+';color:#34d399">📋 Text</button>';
    if(!site&&em.length) acts+='<button type="button" onclick="_reqMailType(\''+id+'\',\''+tq+'\')" style="'+btn+';color:#a78bfa">📧 Email</button>';
    const cq=E(c.code);
    const dt=(key,v,col)=>'<input type="date" value="'+E(v||'')+'" onchange="_crReqDate(\''+cq+'\',\''+id+'\',\''+tq+'\',\''+key+'\',this)" style="height:28px;width:130px;font-size:12px;padding:0 6px;border-radius:7px;color:'+(v?(col||'var(--text)'):'var(--text-dim)')+'">';
    let sel=''; try{ sel=_reqConnSelectHtml(r,t).replace('_reqLinkOffice(','_crReqConn(\''+cq+'\',').replace('width:250px','width:210px'); }catch(_){ sel=conn; }
    return '<tr style="border-top:1px solid var(--border)"><td style="padding:5px 8px;font-weight:800;white-space:nowrap;color:'+_reqTypeColor(t)+'">'+E(t)+'</td>'
      +'<td style="padding:4px 6px;white-space:nowrap;font-size:12px"><span style="color:var(--text-dim)">Req</span> '+dt('requested',d.requested)+'</td>'
      +'<td style="padding:4px 6px;white-space:nowrap;font-size:12px"><span style="color:var(--text-dim)">Rcvd</span> '+dt('received',d.received,d.received?_reqRecencyColor(d.received):'')+'</td>'
      +'<td style="padding:4px 6px;white-space:nowrap;font-size:12.5px">'+sel+'</td>'
      +'<td style="padding:4px 8px;white-space:nowrap"><div style="display:flex;gap:6px;flex-wrap:nowrap">'+acts+'</div></td></tr>'; }).join('');
  let offs=''; try{ const by=_reqOfficeData(r); const order=(typeof _REQ_OFFICES!=='undefined'?_REQ_OFFICES.map(o=>o[0]):[]);
    offs=Object.keys(by).filter(o=>by[o].contacts.length).sort((a,b)=>{ const i=order.indexOf(a),j=order.indexOf(b); return (i<0?99:i)-(j<0?99:j); }).map(o=>
      '<div style="min-width:220px;flex:1 1 240px;max-width:360px;background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:8px 10px"><div style="font-weight:800;font-size:12.5px;margin-bottom:4px">🏛️ '+E(o)+(by[o].website?' <a href="'+E(_reqNormUrl2(by[o].website))+'" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:none;font-weight:600">🌐</a>':'')+'</div>'
      +by[o].contacts.map(p=>'<div style="font-size:12px;line-height:1.45;padding:2px 0;border-top:1px solid var(--border)">'+(p.primary?'⭐ ':'')+'<b>'+E(p.name||p.title||'')+'</b>'+(p.name&&p.title?' <span style="color:var(--text-dim)">'+E(p.title)+'</span>':'')
        +(p.email?'<div><a href="mailto:'+E(p.email)+'" style="color:#a78bfa;text-decoration:none">'+E(p.email)+'</a></div>':'')+(p.phone?'<div style="color:var(--text-dim)">'+E(p.phone)+'</div>':'')+'</div>').join('')+'</div>').join(''); }catch(_){}
  return wrap('<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px"><div style="font-weight:800;font-size:14px">📨 '+E(r.city)+(r.priority?' ⭐':'')+'</div><div>'+links+'</div>'
      +'<button type="button" onclick="_crReqGo(\''+id+'\')" style="'+btn+';margin-left:auto;color:#60a5fa">Open in Requests ↗</button></div>'
    +'<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1 1 640px;min-width:0;overflow:auto"><table style="border-collapse:collapse;width:100%">'+rows+'</table></div>'
    +(offs?'<div style="flex:1 1 300px;min-width:0"><div style="font-size:11px;font-weight:800;color:var(--text-dim);text-transform:uppercase;margin-bottom:6px">Connections</div><div style="display:flex;gap:8px;flex-wrap:wrap">'+offs+'</div></div>':'')+'</div>');
}
function _crReqRepaintAll(){ if(_CR.tab!=='tracker') return; Object.keys(_CR.reqOpen).forEach(k=>{ if(_CR.reqOpen[k]) _crReqRepaint(k); }); }
function _crReqHook(){
  if(window._crReqHooked||typeof window.renderRequestsList!=='function') return; window._crReqHooked=true;
  const orig=window.renderRequestsList;
  window.renderRequestsList=function(){ const out=orig.apply(this,arguments);
    try{ const mv=document.getElementById('mview-requests'); if(mv&&mv.style.display==='none'){ const g=document.getElementById('requests-grid'); if(g) g.innerHTML=''; } }catch(_){}
    try{ const n=Object.keys((typeof cache!=='undefined'&&cache.requests)||{}).length;
      if(_CR.tab==='tracker'&&_CR._reqN!=null&&n!==_CR._reqN){ _CR._reqN=n; _crRender(); } else { _CR._reqN=n; _crReqRepaintAll(); } }catch(_){}
    return out; };
}
// Saves go through the same Requests functions (they re-read the row first and change only that one field), then the panel refreshes in place.
function _crReqRepaint(code){ const c=_CR.counties.find(x=>x.code===code)||(_CR.reqExtra||{})[code]; const tr=document.getElementById('cr-req-'+code); if(c&&tr){ tr.outerHTML=_crReqPanel(c); _crReqFit(); } }
async function _crReqDate(code,id,t,key,inp){ if(typeof _reqSetDate!=='function') return; await _reqSetDate(id,t,key,inp); _crReqRepaint(code); }
async function _crReqConn(code,id,t,sel){ if(typeof _reqLinkOffice!=='function') return; await _reqLinkOffice(id,t,sel); _crReqRepaint(code); }
window._crReqDate=_crReqDate; window._crReqConn=_crReqConn;
async function _crReqAddType(){ _crReqHook(); try{ await requestAddType(); }catch(e){ console.warn(e); } if(_CR.tab==='tracker') _crRender(); }
function _crReqAddCity(){ _crReqHook(); if(typeof cache!=='undefined'&&!cache.requests&&typeof loadRequests==='function') loadRequests(); requestOpenModal(); }
window._crReqAddType=_crReqAddType; window._crReqAddCity=_crReqAddCity;
function _crReqGo(id){ try{ if(typeof goMarketingView==='function') goMarketingView('requests'); if(typeof _reqSelect==='function') _reqSelect(id); window.scrollTo(0,0); }catch(e){ console.warn(e); } }
window._crReqGo=_crReqGo;
// Drag ⋮⋮ to reorder counties — saves the new order (court_counties.sort) for everyone.
function _crDragStart(e,code){ _CR._drag=code; try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',code); }catch(_){} }
function _crDragEnd(){ _CR._drag=null; document.querySelectorAll('tr.cr-trk-row').forEach(r=>r.style.boxShadow=''); }
function _crDragOver(e,tr){ if(!_CR._drag) return; e.preventDefault(); const r=tr.getBoundingClientRect(); const below=e.clientY>r.top+r.height/2;
  document.querySelectorAll('tr.cr-trk-row').forEach(x=>{ if(x!==tr) x.style.boxShadow=''; }); tr.style.boxShadow=below?'inset 0 -3px 0 #f97316':'inset 0 3px 0 #f97316'; tr._below=below; }
async function _crDrop(e,tr){
  e.preventDefault(); const from=_CR._drag, to=tr.getAttribute('data-code'), below=!!tr._below; _crDragEnd(); if(!from||from===to) return;
  const list=_CR.counties.slice(); const mv=list.find(c=>c.code===from); if(!mv) return;
  list.splice(list.indexOf(mv),1); const ti=list.findIndex(c=>c.code===to); list.splice(ti+(below?1:0),0,mv);
  const changed=[]; list.forEach((c,i)=>{ if(c.sort!==i+1) changed.push([c.code,i+1]); });
  _CR.counties=list; list.forEach((c,i)=>{ c.sort=i+1; }); _crRender();
  try{ const res=await Promise.all(changed.map(([code,n])=>sb.from('court_counties').update({sort:n}).eq('code',code)));
    const bad=res.find(r=>r&&r.error); if(bad) throw bad.error; if(typeof toast==='function') toast('Order saved','ok'); }
  catch(err){ if(typeof toast==='function') toast('Couldn’t save the order: '+(err.message||err),'err'); }
}
window._crDragStart=_crDragStart; window._crDragEnd=_crDragEnd; window._crDragOver=_crDragOver; window._crDrop=_crDrop;
// "Set all" — one date for every ACTIVE county's Pulled-to, per list type.
function _crSetAllBtn(k){ return (k==='ts'?'Year':_CR_LISTS.indexOf(k)>=0?'Month':'Pulled to')+' <button type="button" onclick="_crSetAllOpen(\''+k+'\',this)" title="Set every active county\'s '+(_CR_TYPES[k])+' Pulled-to date at once" style="margin-left:4px;height:20px;padding:0 6px;font-size:10px;font-weight:800;border:1px solid var(--border);background:var(--panel);color:#60a5fa;border-radius:5px;cursor:pointer;text-transform:none;letter-spacing:0">Set all</button>'; }
function _crIsoDay(off){ const d=new Date(); d.setDate(d.getDate()+(off||0)); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
// Month / year choices for the list types (code violations + utility liens by month, tax sale by year).
function _crPullOpts(k,v){
  const now=new Date(); let o='<option value="">—</option>';
  if(k==='ts'){ for(let y=now.getFullYear()+1;y>=now.getFullYear()-6;y--) o+='<option value="'+y+'" '+(String(v||'')===String(y)?'selected':'')+'>'+y+'</option>'; return o; }
  let seen=false; for(let i=-1;i<=36;i++){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); const val=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); if(val===v) seen=true;
    o+='<option value="'+val+'" '+(val===v?'selected':'')+'>'+d.toLocaleDateString('en-US',{month:'short',year:'numeric'})+'</option>'; }
  if(v&&!seen) o+='<option value="'+v+'" selected>'+_crPullLbl(v)+'</option>';
  return o;
}
function _crPullLbl(v){ return !v?'—':/^\d{4}$/.test(v)?v:/^\d{4}-\d{2}$/.test(v)?new Date(+v.slice(0,4),+v.slice(5,7)-1,15).toLocaleDateString('en-US',{month:'short',year:'numeric'}):_reqFmtDate(v); }
function _crSetAllOpen(k,anchor){
  const old=document.getElementById('cr-setall'); if(old){ old.remove(); if(old.getAttribute('data-k')===k) return; }
  const name=_CR_TYPES[k]; const n=_CR.counties.filter(c=>c.active).length;
  const pop=document.createElement('div'); pop.id='cr-setall'; pop.setAttribute('data-k',k);
  const r=anchor.getBoundingClientRect();
  pop.style.cssText='position:fixed;top:'+(r.bottom+6)+'px;left:'+Math.max(10,Math.min(window.innerWidth-290,r.left-110))+'px;z-index:100004;width:270px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-size:13px;text-transform:none;letter-spacing:0;font-weight:400;text-align:left';
  const isList=_CR_LISTS.indexOf(k)>=0, now=new Date();
  const ym=off=>{ const d=new Date(now.getFullYear(),now.getMonth()+off,1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); };
  const quick=k==='ts'?[['Last year',String(now.getFullYear()-1)],['This year',String(now.getFullYear())]]:isList?[['Last month',ym(-1)],['This month',ym(0)]]:[['Yesterday',_crIsoDay(-1)],['Today',_crIsoDay(0)]];
  const fieldSt='height:34px;width:100%;box-sizing:border-box;font-size:13px;padding:0 8px;border-radius:7px;margin-bottom:8px';
  pop.innerHTML='<div style="font-weight:800;margin-bottom:8px">📅 '+name+' — pulled '+(k==='ts'?'year':isList?'month':'to')+'</div>'
    +'<div style="display:flex;gap:6px;margin-bottom:8px">'+quick.map(q=>'<button type="button" class="btn btn-ghost text-sm" data-d="'+q[1]+'">'+q[0]+'</button>').join('')+'</div>'
    +(isList?'<input type="hidden" id="cr-setall-d" value="'+quick[1][1]+'"><div id="cr-setall-grid" style="margin-bottom:8px"></div>':'<input type="date" id="cr-setall-d" value="'+_crIsoDay(-1)+'" style="'+fieldSt+'">')
    +'<button type="button" class="btn btn-primary text-sm" id="cr-setall-go" style="width:100%">Set all '+n+' active counties</button>';
  document.body.appendChild(pop);
  const grid=pop.querySelector('#cr-setall-grid'); const paint=()=>{ if(grid) _crPickGrid(grid,k,pop.querySelector('#cr-setall-d').value,v=>{ pop.querySelector('#cr-setall-d').value=v; paint(); }); }; paint();
  pop.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{ pop.querySelector('#cr-setall-d').value=b.getAttribute('data-d'); paint(); });
  setTimeout(()=>{ const off=e=>{ if(!pop.contains(e.target)&&e.target!==anchor){ pop.remove(); document.removeEventListener('mousedown',off); } }; document.addEventListener('mousedown',off); },0);
  pop.querySelector('#cr-setall-go').onclick=async function(){
    const d=pop.querySelector('#cr-setall-d').value; if(!d) return; this.disabled=true; this.textContent='Saving…';
    const act=_CR.counties.filter(c=>c.active); let ok=0;
    await Promise.all(act.map(async c=>{ const pulled=Object.assign({},c.pulled||{}); pulled[k]=d; if(await _crSaveCounty(c.code,{pulled:pulled})) ok++; }));
    pop.remove(); if(_CR.tab==='tracker') _crRender();
    if(typeof toast==='function') toast(name+' pulled to '+_crPullLbl(d)+' for '+ok+' counties','ok');
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
  if(await _crSaveCounty(code,{pulled:pulled})){ if(typeof toast==='function') toast(c.city+' · '+(_CR_TYPES[k])+' pulled to '+_crPullLbl(inp.value),'ok'); }
}
window._crSetPulled=_crSetPulled;
// County-code badge colours — only these 8 (stored on the county as pulled._color; blue is the default).
const _CR_BADGE={ red:'#f87171', green:'#4ade80', blue:'#60a5fa', purple:'#c084fc', yellow:'#facc15', orange:'#fb923c', pink:'#f472b6', cyan:'#22d3ee' };
function _crCodeBadge(c){ const k=(c&&c.pulled&&c.pulled._color)||'blue'; const hex=_CR_BADGE[k]||_CR_BADGE.blue;
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return '<span title="County code — the first 2 digits of the case number" style="display:inline-block;min-width:28px;text-align:center;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;font-weight:800;color:'+hex+';background:rgba('+r+','+g+','+b+',0.14);border:1px solid rgba('+r+','+g+','+b+',0.5);border-radius:6px;padding:1px 6px;margin-right:7px">'+_reqEsc(c.code)+'</span>'; }
function _crCountyEdit(code){
  const c=_CR.counties.find(x=>x.code===code); if(!c) return; const E=_reqEsc;
  const old=document.getElementById('cr-cty-pop'); if(old) old.remove();
  const ov=document.createElement('div'); ov.id='cr-cty-pop';
  ov.style.cssText='position:fixed;inset:0;z-index:100003;background:rgba(0,0,0,0.55);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px';
  const inp='height:36px;font-size:14px;padding:0 10px;width:100%;box-sizing:border-box;border-radius:8px';
  ov.innerHTML='<div style="width:min(520px,96vw);background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px;box-shadow:0 16px 50px rgba(0,0,0,.5)">'
    +'<div style="display:flex;align-items:center;margin-bottom:12px"><div style="font-weight:800;font-size:16px;flex:1">⚙️ '+E(c.city)+' · '+E(c.county)+' <span style="color:var(--text-dim);font-weight:600">('+E(c.code)+')</span></div><button type="button" data-x="1" style="background:none;border:none;color:var(--text-dim);font-size:18px;cursor:pointer">✕</button></div>'
    +'<label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;margin-bottom:14px;cursor:pointer"><input type="checkbox" id="cr-cty-active" '+(c.active?'checked':'')+' style="width:18px;height:18px;accent-color:#22c55e"> Active — show in the tracker &amp; work queue</label>'
    +'<label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;margin:-4px 0 14px;cursor:pointer"><input type="checkbox" id="cr-cty-zeus" '+((c.pulled||{})._zeus?'checked':'')+' style="width:18px;height:18px;accent-color:#facc15"> <span style="color:#facc15">🌐 On Zeus</span> <span style="font-weight:500;font-size:12.5px;color:var(--text-dim)">— tax sale can be pulled from Zeus</span></label>'
    +'<div style="font-size:13px;font-weight:700;margin-bottom:4px">🗺️ Assessor / GIS link</div>'
    +'<div style="display:flex;gap:6px;margin-bottom:6px"><input id="cr-cty-gis" value="'+E(c.assessor_url||'')+'" placeholder="https://…" style="'+inp+'"><button type="button" class="btn btn-ghost text-sm" id="cr-cty-open" title="Open link">🌐</button></div>'
    +'<div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">Used by the 🗺️ Assessor button in the work queue. Leave blank to remove it.</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'
      +'<label style="font-size:12.5px;color:var(--text-dim)">City name<input id="cr-cty-city" value="'+E(c.city||'')+'" style="'+inp+';margin-top:3px"></label>'
      +'<label style="font-size:12.5px;color:var(--text-dim)">County<input id="cr-cty-county" value="'+E(c.county||'')+'" style="'+inp+';margin-top:3px"></label></div>'
    +'<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:6px">Code color</div><div id="cr-cty-colors" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'
      +Object.keys(_CR_BADGE).map(k=>{ const on=(((c.pulled||{})._color)||'blue')===k; return '<button type="button" data-col="'+k+'" title="'+k+'" style="width:34px;height:30px;border-radius:7px;cursor:pointer;font-family:ui-monospace,Consolas,monospace;font-size:12px;font-weight:800;color:'+_CR_BADGE[k]+';background:transparent;border:'+(on?'2px solid '+_CR_BADGE[k]:'1px solid var(--border)')+';box-shadow:'+(on?'0 0 0 2px var(--panel),0 0 0 4px '+_CR_BADGE[k]+'55':'none')+'">'+E(c.code)+'</button>'; }).join('')
    +'</div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn btn-primary text-sm" id="cr-cty-save">💾 Save</button><button type="button" class="btn btn-ghost text-sm" data-x="1" style="border:1px solid #ef4444;color:#f87171">Cancel</button></div></div>';
  document.body.appendChild(ov);
  ov.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>ov.remove());
  ov.addEventListener('click',e=>{ if(e.target===ov) ov.remove(); });
  let pickCol=((c.pulled||{})._color)||'blue';
  ov.querySelectorAll('[data-col]').forEach(b=>b.onclick=()=>{ pickCol=b.getAttribute('data-col'); ov.querySelectorAll('[data-col]').forEach(x=>{ const k=x.getAttribute('data-col'), on=k===pickCol; x.style.border=on?'2px solid '+_CR_BADGE[k]:'1px solid var(--border)'; x.style.boxShadow=on?'0 0 0 2px var(--panel),0 0 0 4px '+_CR_BADGE[k]+'55':'none'; }); });
  ov.querySelector('#cr-cty-open').onclick=()=>{ const u=ov.querySelector('#cr-cty-gis').value.trim(); if(u) window.open(/^https?:/i.test(u)?u:'https://'+u,'_blank','noopener'); };
  ov.querySelector('#cr-cty-save').onclick=async function(){
    let u=ov.querySelector('#cr-cty-gis').value.trim(); if(u&&!/^https?:\/\//i.test(u)) u='https://'+u;
    const pulled=Object.assign({},c.pulled||{}); if(pickCol==='blue') delete pulled._color; else pulled._color=pickCol;
    if(ov.querySelector('#cr-cty-zeus').checked) pulled._zeus=true; else delete pulled._zeus;
    const patch={pulled:pulled, active:ov.querySelector('#cr-cty-active').checked, assessor_url:u||null, city:ov.querySelector('#cr-cty-city').value.trim()||c.city, county:ov.querySelector('#cr-cty-county').value.trim()||c.county};
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
    const byWhy={}; sc.forEach(c=>{ const w=_CR_SCRAP_WHY[c.sort_code]||'other'; byWhy[w]=(byWhy[w]||0)+1; });
    const pill=(t,n)=>'<span style="display:inline-block;background:var(--panel-2);border:1px solid var(--border);border-radius:999px;padding:3px 10px;margin-right:6px;font-size:12px"><b>'+n.toLocaleString()+'</b> '+t+'</span>';
    body.innerHTML='<div style="margin-bottom:10px;display:flex;align-items:center;flex-wrap:wrap;gap:4px"><span style="font-size:13px;font-weight:700;margin-right:8px">'+total.toLocaleString()+' scrap case'+(total===1?'':'s')+'</span>'+Object.keys(byWhy).sort((a,b)=>byWhy[b]-byWhy[a]).map(w=>pill(w.toLowerCase(),byWhy[w])).join('')
        +'<span style="font-size:12px;color:var(--text-dim);margin-left:4px">Kept for reference; never uploaded or geocoded. Use 🔎 All Cases to search for one.</span></div>'
      +(rows.length?'<div style="overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>'+['Why','Case #','County','Type','Filed','Style'].map(h=>'<th style="padding:6px 8px;text-align:left;font-size:11px;color:var(--text-dim);text-transform:uppercase">'+h+'</th>').join('')+'</tr></thead><tbody>'
        +rows.map(r=>'<tr style="border-top:1px solid var(--border)"><td style="padding:6px 8px;white-space:nowrap">'+(_CR_SCRAP_WHY[r.sort_code]||'Scrap')+'</td><td style="padding:6px 8px;white-space:nowrap">'+(_CR_LISTS.indexOf(_crTypeKey(r.case_type))>=0?E(r.case_number):'<a href="https://public.courts.in.gov/mycase/#/vw/Search" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:none">'+E(r.case_number)+'</a>')+'</td><td style="padding:6px 8px">'+E(_crCountyName(r.county_code))+'</td><td style="padding:6px 8px">'+E(r.case_type||'')+'</td><td style="padding:6px 8px;white-space:nowrap">'+E(r.filed?_reqFmtDate(r.filed):'')+'</td><td style="padding:6px 8px">'+E(r.style||'')+'</td></tr>').join('')
        +'</tbody></table></div>'
        +'<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:10px;font-size:12.5px;color:var(--text-dim)">Showing '+rows.length.toLocaleString()+' of '+total.toLocaleString()+(S.done?'':' <button type="button" class="btn btn-ghost text-sm" onclick="this.disabled=true;this.textContent=\'Loading…\';_crScrapMore()">Show 500 more</button>')+'</div>'
        :'<div style="padding:30px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">Nothing in Scrap yet.</div>');
  }catch(e){ body.innerHTML='<div style="padding:20px;color:#f87171">'+_reqEsc(e.message||e)+'</div>'; }
}
// 🔎 All Cases: search every case (case #, names, address, attorney, petitioner) and open any one.
_CR.all=_CR.all||{ q:'', county:'', type:'', age:'' };
function _crAllRender(body){
  const E=_reqEsc; const a=_CR.all; const sel='height:36px;font-size:13px;padding:0 9px;border-radius:8px;width:auto;flex:0 0 auto;max-width:240px';
  body.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">'
      +'<input id="cr-all-q" value="'+E(a.q)+'" placeholder="Search case #, name, address, attorney, petitioner…" style="height:36px;font-size:14px;padding:0 12px;border-radius:8px;flex:1 1 320px;min-width:240px" oninput="_crAllSearchSoon()">'
      +'<select style="'+sel+'" onchange="_CR.all.county=this.value;_crAllSearch()"><option value="">All counties</option>'+_CR.counties.map(c=>'<option value="'+E(c.code)+'" '+(a.county===c.code?'selected':'')+'>'+E(c.city)+(c.active?'':' (inactive)')+'</option>').join('')+'</select>'
      +'<select style="'+sel+'" onchange="_CR.all.type=this.value;_crAllSearch()"><option value="">All types</option>'+Object.keys(_CR_TYPES).map(k=>'<option value="'+k+'" '+(a.type===k?'selected':'')+'>'+_CR_TYPES[k]+'</option>').join('')+'</select>'
      +'<select style="'+sel+'" onchange="_CR.all.age=this.value;_crAllSearch()" title="How long ago the case was filed">'+[['','Filed: any time'],['3+','Filed 3+ months ago'],['6+','Filed 6+ months ago']].map(o=>'<option value="'+o[0]+'" '+((a.age||'')===o[0]?'selected':'')+'>'+o[1]+'</option>').join('')+'</select>'
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
    let q=sb.from('court_cases').select('id,case_number,county_code,style,case_type,filed,defendant,address,sort_code',{count:'exact'});
    if(a.age){ const ago=m=>{ const d=new Date(); d.setMonth(d.getMonth()-m); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
      if(a.age==='3+') q=q.lte('filed',ago(3)); else if(a.age==='6+') q=q.lte('filed',ago(6)); }
    if(a.county) q=q.eq('county_code',a.county);
    if(a.type){ const pat={fc:'*mortgage*',pb:'*estate*',ev:'*evict*',cv:'CV *',ul:'UL *',ts:'TS *'}[a.type]; if(pat) q=q.ilike('case_type',pat.replace(/\*/g,'%')); }
    if(a.q){ const t=a.q.replace(/[%,()*]/g,' ').trim(); if(t){ const w='%'+t+'%'; q=q.or(['case_number','style','defendant','plaintiff','address','attorney','petitioner','petitioner_address','plaintiff_address'].map(c=>c+'.ilike.'+w).join(',')); } }
    const r=await q.order('filed',{ascending:false,nullsFirst:false}).limit(300);
    if(r.error) throw r.error; const rows=r.data||[]; const total=(typeof r.count==='number')?r.count:rows.length;
    const th='padding:8px 10px;text-align:left;font-size:11px;color:var(--text-dim);text-transform:uppercase';
    out.style.opacity='';
    out.innerHTML='<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:8px">'+('<b style="color:var(--text)">'+total.toLocaleString()+'</b> case'+(total===1?'':'s')+(a.q?' matching “'+E(a.q)+'”':'')+(total>rows.length?' · showing the newest '+rows.length+' — search or filter to narrow it down':'')+(a.age?' · cases with no Filed date are left out of this filter':''))+'</div>'
      +(rows.length?'<div style="overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'+['Status','Type','Name','Address','County','Filed','Case #'].map(h=>'<th style="'+th+'">'+h+'</th>').join('')+'</tr></thead><tbody>'
        +rows.map(x=>{ const k=_crTypeKey(x.case_type); return '<tr onclick="_crOpenAny(\''+E(x.id)+'\')" style="border-top:1px solid var(--border);cursor:pointer" onmouseover="this.style.background=\'rgba(99,102,241,0.08)\'" onmouseout="this.style.background=\'\'">'
          +'<td style="padding:8px 10px">'+_crStatusPill(x.sort_code,true)+'</td>'
          +'<td style="padding:8px 10px;white-space:nowrap;font-weight:700;color:'+(_CR_COL[k]||'var(--text)')+'">'+E(_CR_TYPES[k]||'')+'</td>'
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
// Plaintiff from the case title: "ROCKET MORTGAGE, LLC v. Chase Shepherd…" → "ROCKET MORTGAGE, LLC"
function _crStylePlaintiff(st){ const p=String(st||'').split(/\s+vs?\.?\s+/i); return p.length>1?p[0].replace(/,?\s*et\.?\s*al\.?$/i,'').trim():''; }
// Defendant(s) from the case title: "Amy Jo Munich v. Dustin Ray Ransom, Irene Michelle Saylor" → "Dustin Ray Ransom, Irene Michelle Saylor"
function _crStyleDefendant(st){ const p=String(st||'').split(/\s+vs?\.?\s+/i); return p.length>1?p.slice(1).join(' v. ').replace(/,?\s*et\.?\s*al\.?$/i,'').trim():''; }
// "In Re: the Estate of Steven Louis Mascher" → "Mascher, Steven Louis"  ·  "…David E Hoover, SR" → "Hoover, David E, SR"
function _crStyleDecedent(st){
  let n=String(st||'').replace(/^\s*in\s+(re|the\s+matter\s+of)\s*:?\s*/i,'').replace(/^(the\s+)?((supervised|unsupervised)\s+)?estate\s+of\s*:?\s*/i,'')
    .replace(/[,\s]*\(?\s*deceased\s*\)?\.?\s*$/i,'').replace(/[,\s]*a\/k\/a.*$/i,'').trim();
  if(!n||/estate\s+of/i.test(n)===false&&n===String(st||'').trim()&&!/estate/i.test(String(st||''))) return '';
  const SUF=/^(jr|sr|ii|iii|iv|v)\.?$/i; let parts=n.replace(/,/g,' ').split(/\s+/).filter(Boolean); let suf='';
  if(parts.length>2&&SUF.test(parts[parts.length-1])) suf=parts.pop().replace(/\.$/,'');
  if(parts.length<2) return n;
  if(/,/.test(n.replace(/,\s*(jr|sr|ii|iii|iv|v)\.?\s*$/i,''))) return n;   // already "Last, First"
  const last=parts.pop(); return last+', '+parts.join(' ')+(suf?', '+suf:'');
}
function _crKeepType(t){ t=String(t||''); if(/^(CV|UL|TS)\b/.test(t)) return false; const m=t.match(/^([A-Z]{2})\s-\s/); if(m&&!/^(EV|MF|ES|EU|EM|GU|TR)$/.test(m[1])) return false; return /mortgage|foreclos|estate|guardian|evict|\btrust\b|^TR\b/i.test(t); }
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
  const E=_reqEsc; const P=_CR.paste; const mode=_CR.addMode||'mycase';
  const pill=(m,t)=>'<div class="subtab'+(mode===m?' active':'')+'" onclick="_CR.addMode=\''+m+'\';_crRender()" style="display:inline-flex;align-items:center;white-space:nowrap">'+t+'</div>';
  const head='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><div class="panel p-1" style="display:inline-flex;gap:4px">'+pill('mycase','⚖️ Paste from MyCase')+pill('list','📥 Import a list (Excel / CSV)')+'</div>'
    +'<div class="panel p-1" style="display:inline-flex;gap:4px">'+pill('history','🕘 History')+'</div></div>';
  if(mode==='history'){ _CR.hist.rows=null; body.innerHTML=head+'<div id="cr-hist"><div style="padding:20px;color:var(--text-dim)">Loading…</div></div>'; _crHistRender(document.getElementById('cr-hist')); return; }
  if(mode==='list'){ body.innerHTML=head+'<div id="cr-li"></div>'; _crLiRender(document.getElementById('cr-li')); return; }
  body.innerHTML=head+'<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:14px;align-items:stretch">'
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
  const parsed=_crParseMyCase(P.text); const seen={}; let rows=[];
  parsed.forEach(c=>{ if(seen[c.case_number]) return; seen[c.case_number]=1; rows.push(c); });
  if(!rows.length){ prev.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">'+(P.text.trim()?'No case numbers found in what was pasted.':'2. The preview shows up here after you paste.')+'</div>'; P.rows=null; return; }
  // which are already in Data LAB?
  const have=new Set(_CR.cases.map(c=>c.case_number));
  try{ const miss=rows.filter(r=>!have.has(r.case_number)).map(r=>r.case_number);
    for(let i=0;i<miss.length;i+=150){ const q=await sb.from('court_cases').select('case_number').in('case_number',miss.slice(i,i+150)); (q.data||[]).forEach(x=>have.add(x.case_number)); } }catch(_){}
  rows.forEach(c=>{ c.county_code=c.case_number.slice(0,2);
    if(have.has(c.case_number)) c._st='have'; else if(!_crKeepType(c.case_type)) c._st='skip';
    else { c.sort_code=_crSort(c)||'0'+(_CR_SFX[_crTypeKey(c.case_type)]||''); c._st=_crScrap(c.sort_code)?'scrap':'new'; } });
  const ignored=rows.filter(r=>r._st==='skip').length; rows=rows.filter(r=>r._st!=='skip');
  P.rows=rows; P.ignored=ignored;
  const n=k=>rows.filter(r=>r._st===k).length;
  const counties=[...new Set(rows.filter(r=>r._st==='new'||r._st==='have'||r._st==='scrap').map(r=>r.county_code))];
  const types=[...new Set(rows.filter(r=>r._st!=='skip').map(r=>_crTypeKey(r.case_type)).filter(Boolean))];
  const tag={new:['New','#22c55e'],have:['Already here','#94a3b8'],skip:['Not a type we work','#94a3b8'],scrap:['Scrap','#ef4444']};
  const yest=_crIsoDay(-1);
  prev.innerHTML='<button type="button" class="btn btn-primary" id="cr-paste-go" '+((n('new')+n('scrap'))?'':'disabled ')+'onclick="_crPasteSave(this)" style="width:100%;font-size:15px;margin-bottom:10px">Add '+(n('new')+n('scrap'))+' case'+((n('new')+n('scrap'))===1?'':'s')+(n('scrap')?' ('+n('scrap')+' to Scrap)':'')+'</button>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
      +[['new','✅ New'],['have','↩ Already here'],['scrap','🗑 Scrap']].map(x=>'<div style="flex:1;min-width:110px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:8px 10px"><div style="font-size:11.5px;color:var(--text-dim)">'+x[1]+'</div><div style="font-size:20px;font-weight:800">'+n(x[0])+'</div></div>').join('')
    +'</div>'
    +(ignored?'<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:8px">Ignored '+ignored+' other case'+(ignored===1?'':'s')+' (collections, small claims, civil, etc.) — not added anywhere.</div>':'')
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
    const recs=add.map(r=>({case_number:r.case_number,county_code:r.county_code,style:r.style,court:r.court,case_type:r.case_type,filed:r.filed,status:r.status,sort_code:r.sort_code,plaintiff:((_crTypeKey(r.case_type)==='fc'||_crTypeKey(r.case_type)==='ev')&&_crStylePlaintiff(r.style))||null,defendant:(_crTypeKey(r.case_type)==='ev'&&_crStyleDefendant(r.style))||(_crTypeKey(r.case_type)==='pb'&&_crStyleDecedent(r.style))||null,petitioners:[],completed_at:_crScrap(r.sort_code)?now:null}));
    for(let i=0;i<recs.length;i+=500){ const up=await sb.from('court_cases').upsert(recs.slice(i,i+500),{onConflict:'case_number',ignoreDuplicates:true}); if(up.error) throw up.error; }
    // set pulled-to
    if(document.getElementById('cr-paste-pull')&&document.getElementById('cr-paste-pull').checked){
      const d=(document.getElementById('cr-paste-date')||{}).value;
      if(d){ const byC={}; P.rows.filter(r=>r._st!=='skip').forEach(r=>{ const k=_crTypeKey(r.case_type); if(k){ (byC[r.county_code]=byC[r.county_code]||{})[k]=1; } });
        await Promise.all(Object.keys(byC).map(code=>{ const c=_CR.counties.find(x=>x.code===code); if(!c) return null; const pulled=Object.assign({},c.pulled||{}); Object.keys(byC[code]).forEach(k=>{ pulled[k]=d; }); return _crSaveCounty(code,{pulled:pulled}); })); }
    }
    _crLogImport({ kind:'paste', added:add.filter(r=>r._st==='new').length, scrap:add.filter(r=>r._st==='scrap').length, have:P.rows.filter(r=>r._st==='have').length, ignored:P.ignored||0,
      counties:[...new Set(add.map(r=>r.county_code))], cases:add.map(r=>r.case_number) });
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
    const byT={}; rows.forEach(c=>{ const k=_crTypeKey(c.case_type); if(k) byT[k]=(byT[k]||0)+1; });
    const card=(t,v,col,sub)=>'<div style="flex:1;min-width:150px;background:var(--panel-2);border:1px solid var(--border);border-top:3px solid '+col+';border-radius:10px;padding:10px 12px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-dim)">'+t+'</div><div style="font-size:22px;font-weight:800">'+v.toLocaleString()+'</div>'+(sub?'<div style="font-size:12px;color:var(--text-dim)">'+sub+'</div>':'')+'</div>';
    const hist=await _crExHistory();
    document.getElementById('cr-ex-body').innerHTML='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
        +card('Ready to export',rows.length,'#60a5fa',Object.keys(_CR_TYPES).filter(k=>byT[k]).map(k=>byT[k].toLocaleString()+' '+_CR_TYPES[k].toLowerCase()).join(' · ')||'—')
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
    'Tag': k==='ts'?'Tax Redemption':(_CR_TYPES[k]||''),
    'Owner': k==='ev'?(c.plaintiff||''):(c.defendant||''),
    'Contact Name': contact.name, 'Contact Address': contact.addr,
    'Case Number': c.case_number, 'Case Type': c.case_type||'', 'Filed': c.filed||'', 'Court': c.court||'', 'Style': c.style||'',
    'Defendant / Decedent': c.defendant||'', 'Plaintiff': c.plaintiff||'', 'Plaintiff Address': c.plaintiff_address||'', 'Attorney': c.attorney||'',
    'Petitioner Count': c.petitioner_count||'', 'Status': /^2\./.test(c.sort_code||'')?'Complete':/^1\./.test(c.sort_code||'')?'Complete (unknowns)':'Incomplete',
    'Parcel': c.parcel||'', 'Amount Owed': c.amount!=null?c.amount:'', 'Tax Sale Status': k==='ts'?_crTsStatus(c.extra):'', 'Violation / Lien': (c.extra&&(c.extra.violation||c.extra.lien))||'', 'Purchaser': (k==='ul'||k==='ts')?((c.extra&&c.extra.purchaser)||''):'',
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
    const by={}; rows.forEach(r=>{ const k=_crTypeKey(r.case_type); if(k) by[k]=(by[k]||0)+1; });
    const th='padding:8px 10px;text-align:left;font-size:11px;color:var(--text-dim);text-transform:uppercase';
    body.innerHTML='<div style="font-size:13px;color:var(--text-dim);margin-bottom:10px">'+rows.length.toLocaleString()+' case'+(rows.length===1?'':'s')+' where the property address was marked <b>Unknown</b> — '+(Object.keys(_CR_TYPES).filter(k=>by[k]).map(k=>by[k]+' '+_CR_TYPES[k].toLowerCase()).join(' · ')||'none')+'. Click one to open it in the Work Queue and try again.</div>'
      +(rows.length?'<div style="overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'+['Type','Name','County','Filed','Case #'].map(h=>'<th style="'+th+'">'+h+'</th>').join('')+'</tr></thead><tbody>'
        +rows.map(r=>{ const k=_crTypeKey(r.case_type); return '<tr onclick="_crOpenInQueue(\''+E(r.id)+'\',\''+E(r.county_code||'')+'\')" style="border-top:1px solid var(--border);cursor:pointer" onmouseover="this.style.background=\'rgba(99,102,241,0.08)\'" onmouseout="this.style.background=\'\'">'
          +'<td style="padding:8px 10px;white-space:nowrap;font-weight:700;color:'+(_CR_COL[k]||'var(--text)')+'">'+E(_CR_TYPES[k]||'')+'</td>'
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
    if(q.status==='recent') return !!c.completed_by&&!!c.completed_at&&(Date.now()-new Date(c.completed_at).getTime()<7*864e5);
    return !_crScrap(s);
  }).sort(q.status==='recent'?((a,b)=>String(b.completed_at||'').localeCompare(String(a.completed_at||''))):((a,b)=>String(b.filed||'').localeCompare(String(a.filed||''))||String(a.case_number).localeCompare(String(b.case_number))));
}
function _crQueueRender(body){
  const E=_reqEsc; const q=_CR.q; const list=_crQueueList();
  const act=_CR.counties.filter(c=>c.active);
  const sel='height:32px;font-size:12.5px;padding:0 8px;border-radius:7px;width:auto;flex:0 0 auto;max-width:260px';
  const shown=list.slice(0,200+(q.more||0));
  const item=c=>{ const on=c.id===q.sel; const k=_crTypeKey(c.case_type); const col=_CR_COL[k];
    const lock=c.claimed_by&&c.claimed_by!==_CR.me&&c.claimed_at&&(Date.now()-new Date(c.claimed_at).getTime()<15*60000);
    return '<div data-cid="'+E(c.id)+'" onclick="_crOpen(\''+E(c.id)+'\')" style="cursor:pointer;padding:10px 12px;border-radius:9px;margin-bottom:4px;border:1px solid '+(on?'#6366f1':'transparent')+';background:'+(on?'rgba(99,102,241,0.14)':'transparent')+';border-left:4px solid '+col+'">'
      +'<div style="display:flex;gap:6px;align-items:center"><span style="font-size:14px;font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+E(_CR_TYPES[k])+'</span>'+_crStatusPill(c.sort_code,true)+(lock?'<span title="Being worked by '+E(c.claimed_by)+'">🔒</span>':'')+'</div>'
      +'<div style="font-size:12.5px;color:var(--text-dim);margin-top:2px">'+E(_crCountyName(c.county_code).split(' · ')[0])+(c.filed?' · filed '+E(_reqFmtDate(c.filed)):'')+'</div>'
      +'<div style="font-size:11.5px;color:var(--text-dim);opacity:.8">'+E(c.case_number)+'</div></div>'; };
  body.innerHTML='<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;font-size:13px;color:var(--text-dim)"><span>Show</span>'
      +'<select style="'+sel+'" onchange="_CR.q.county=this.value;_CR.q.more=0;_crRender()"><option value="">All counties</option>'+act.map(c=>'<option value="'+E(c.code)+'" '+(q.county===c.code?'selected':'')+'>'+E(c.city)+' ('+E(c.county)+')</option>').join('')+'</select>'
      +'<select style="'+sel+'" onchange="_CR.q.type=this.value;_CR.q.more=0;_crRender()"><option value="">All types</option>'+Object.keys(_CR_TYPES).map(k=>'<option value="'+k+'" '+(q.type===k?'selected':'')+'>'+_CR_TYPES[k]+'</option>').join('')+'</select>'
      +'<select style="'+sel+'" onchange="_CR.q.status=this.value;_CR.q.more=0;_crRender()">'+[['todo','To do'],['recent','Recently completed (7 days)'],['unk','Done — has unknowns'],['noaddr','Done — no address found'],['done','All done'],['all','Everything']].map(o=>'<option value="'+o[0]+'" '+(q.status===o[0]?'selected':'')+'>'+o[1]+'</option>').join('')+'</select>'
      +'<span id="cr-qcount" style="display:inline-flex;align-items:center;height:30px;padding:0 12px;border:1.5px solid #60a5fa;border-radius:999px;background:rgba(96,165,250,.14);color:#93c5fd;font-size:13.5px;white-space:nowrap">'+_crQCountTxt(list.length)+'</span>'
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
  if(_CR.cur&&_CR.cur.id!==id) await _crFlush();
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
function _crQCountTxt(n){ const left=(_CR.q&&(_CR.q.status||'todo')==='todo'); return '<b style="color:var(--text);font-size:15px;margin-right:5px">'+n.toLocaleString()+'</b>'+(n===1?'case':'cases')+(left?' left':''); }
function _crEditorDirty(){ let d=false; document.querySelectorAll('#cr-editor [data-f]').forEach(el=>{ if(el.value!==el.defaultValue) d=true; }); return d; }
window._crOpen=_crOpen;
function _crEditor(c){
  const E=_reqEsc; const ed=document.getElementById('cr-editor'); if(!ed) return;
  const k=_crTypeKey(c.case_type); const col=_CR_COL[k]||'#94a3b8';
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
  const tps='https://www.truepeoplesearch.com/results?name='+encodeURIComponent(_crFirstLast(nm,_CR_LISTS.indexOf(k)>=0))+'&citystatezip='+encodeURIComponent(cityName);
  const addrQ=String(c.address||'').trim();
  const ADDR='123 W Main St, City, IN 47000';
  let fields='';
  const isList=_CR_LISTS.indexOf(k)>=0, ex=c.extra||{};
  const money=v=>v==null||v===''?'':'$'+Number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  if(isList){
    const facts=[]; const f=(l,v)=>{ if(v!=null&&String(v).trim()!=='') facts.push('<div><div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.4px;font-weight:700">'+l+'</div><div style="font-size:14px;font-weight:700">'+E(v)+'</div></div>'); };
    f('Parcel',c.parcel); f(k==='ts'?'Amount due':'Amount owed',money(c.amount));
    if(k==='cv'){ f('Violation',ex.violation); f('Opened',c.filed?_reqFmtDate(c.filed):''); f('Complied',ex.complied?_reqFmtDate(ex.complied):'Not yet'); }
    if(k==='ul'){ f('Lien',ex.lien); f('Filed',c.filed?_reqFmtDate(c.filed):''); }
    if(k==='ts'){ f('Tax sale',_crTsStatus(ex)); f('Sale ID',ex.sale_id); f('Winning bid',/^nb$/i.test(String(ex.bid||''))?'No bid':money(ex.bid)); f('Assessed value',money(ex.assessed)); f('Legal',ex.legal); }
    fields=(facts.length?'<div style="display:flex;gap:10px 22px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px">'+facts.join('')+'</div>':'')
      +box('🏠','Property',fld('address','Property address',c.parcel?'Look up parcel '+c.parcel+' on the GIS / Assessor map':'Street address',ADDR,true))
      +box('👤','Owner',fld('defendant','Owner','Deeded owner')
        +((k==='ul'||k==='ts')?'<div style="display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px;align-items:center;margin-bottom:8px" title="Someone who has bought the property since — leave blank if no one"><div style="font-size:13.5px;font-weight:700;line-height:1.2">Purchaser</div><input data-f="purchaser" value="'+E((c.purchaser=String((ex&&ex.purchaser)||'').trim()))+'" placeholder="Who bought it since — leave blank if no one" style="'+inp+'" oninput="_crLive()"></div>':''));
  }
  else if(k==='fc') fields=box('🏠','Property',fld('address','Property address','From the Complaint — “commonly known as”',ADDR,true))
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
      +'<div style="flex:1;min-width:240px"><div style="font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:'+col+'">'+E(_CR_TYPES[k]||'')+' · '+E(cty.city||'')+'</div>'
        +'<div style="font-size:19px;font-weight:800;margin:2px 0 3px;line-height:1.25">'+E(c.style||c.case_number)+'</div>'
        +'<div style="font-size:13px;color:var(--text-dim);display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>'+E(isList?(c.parcel?'Parcel '+c.parcel:(ex.source||'')):c.case_number)+'</span>'
          +(isList?'':'<button type="button" onclick="_crCopy(\''+E(c.case_number)+'\',this)" title="Copy case number" style="height:24px;padding:0 8px;font-size:11.5px;font-weight:700;border:1px solid var(--border);background:var(--panel);color:#60a5fa;border-radius:6px;cursor:pointer">📋 Copy</button>')
          +(c.filed?'<span>· filed '+E(_reqFmtDate(c.filed))+'</span>':'')+'</div></div>'
      +'<div style="text-align:right">'
        +'<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">'

          +'<button type="button" class="btn btn-primary" onclick="_crSave(true)" title="Ctrl+Enter" style="font-size:15px;padding:0 18px">Save &amp; next case →</button></div>'
        +'<div id="cr-savemsg" style="font-size:12.5px;color:var(--text-dim);min-height:16px;margin-top:4px"></div></div>'
    +'</div>'
    +'<div id="cr-status" style="margin:10px 0 0"></div><div id="cr-dupe"></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">'
      +(isList?(c.parcel?'<button type="button" style="'+btn+'" onclick="_crCopy(\''+E(c.parcel)+'\',this)" title="Copy the parcel number">📋 Copy parcel</button>':''):'<button type="button" style="'+btn+'" onclick="_crMyCase(\''+E(c.case_number)+'\')" title="Copies the case number, then opens MyCase search — just paste">⚖️ Open in MyCase</button>')
      +(cty.assessor_url?'<a href="'+E(cty.assessor_url)+'" target="_blank" rel="noopener" style="'+btn+'"'+(isList&&c.parcel?' onclick="try{navigator.clipboard.writeText(\''+E(c.parcel)+'\')}catch(_){}" title="Parcel copied — paste it into the GIS search"':'')+'>🗺️ '+(isList?'GIS / Assessor':'Assessor map')+'</a>':'')
      +(nm?'<a href="'+E(tps)+'" target="_blank" rel="noopener" style="'+btn+'">🔎 TruePeopleSearch</a>':'')+'<button type="button" style="'+btn+'" onclick="_crMapsFor()" title="Google Maps for the address typed in the box right now">📍 Maps</button>'
      +(addrQ&&!/^(unknown|land)$/i.test(addrQ)?'<a href="https://www.zillow.com/homes/'+encodeURIComponent(addrQ)+'_rb/" target="_blank" rel="noopener" style="'+btn+'">🏠 Zillow</a>':'')
    +'</div>'
    +fields
    +box('📝','Notes','<textarea data-f="notes" rows="2" oninput="_crLive()" style="width:100%;box-sizing:border-box;font-size:14px;padding:8px 11px;border-radius:8px;margin-bottom:10px">'+E(c.notes||'')+'</textarea>')
  +'</div>';
  if(k==='pb'){ _CR.pets=_crPets(c).map(p=>({name:p.name||'',address:p.address||''})); if(!_CR.pets.length) _CR.pets=[{name:'',address:''}]; _crPetPaint(); }
  if(k==='fc'||k==='ev'){ const pl=ed.querySelector('[data-f="plaintiff"]'); const g=_crStylePlaintiff(c.style); if(pl&&!pl.value.trim()&&g) pl.value=g; }
  if(k==='ev'){ const df=ed.querySelector('[data-f="defendant"]'); const g=_crStyleDefendant(c.style); if(df&&!df.value.trim()&&g) df.value=g; }
  if(k==='pb'){ const df=ed.querySelector('[data-f="defendant"]'); if(df){ const g=_crStyleDecedent(c.style); if(!df.value.trim()&&g) df.value=g;
    // 📋 Copy beside the decedent
    const cb=document.createElement('button'); cb.type='button'; cb.textContent='📋 Copy'; cb.title='Copy the decedent name';
    cb.style.cssText='height:38px;padding:0 10px;border:1px solid var(--border);background:transparent;border-radius:8px;cursor:pointer;font-size:12.5px;color:#60a5fa;white-space:nowrap';
    cb.onclick=async()=>{ const t=df.value.trim(); if(!t) return; try{ await navigator.clipboard.writeText(t); }catch(_){ df.select(); document.execCommand('copy'); } cb.textContent='✓ Copied'; setTimeout(()=>cb.textContent='📋 Copy',1200); };
    df.insertAdjacentElement('afterend',cb); } }
  _crLive();
  ed.onkeydown=function(e){ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); _crSave(true); } };
}
// Plain-words status: "✅ Done" or "Still needed: Attorney, Petitioner".
function _crMissing(c){
  const k=_crTypeKey(c.case_type); const v=x=>String(x==null?'':x).trim();
  const req = _CR_LISTS.indexOf(k)>=0 ? [['address','Property address'],['defendant','Owner']]
    : k==='pb' ? [['address','Property address'],['defendant','Decedent'],['attorney','Attorney'],['__pn','Petitioner name'],['__pa','Petitioner address']]
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
  if(_CR.cur&&c.id===_CR.cur.id&&_crSig(c)!==_crSig(_CR.cur)) _crAutoSoon();
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
        +q.data.map(x=>'<div>'+_reqEsc(x.case_number)+' · '+_reqEsc(_CR_TYPES[_crTypeKey(x.case_type)]||x.case_type||'')+(x.filed?' · '+_reqEsc(_reqFmtDate(x.filed)):'')+'</div>').join('')
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
// Autosave: every change saves itself ~1 second after you stop typing. "Save & next" still saves and moves on.
let _crAutoT=null, _crSaving=null;
function _crSig(c){ const t=x=>String(x==null?'':x).trim(); const pets=(Array.isArray(c.petitioners)?c.petitioners:[]).map(p=>[t(p&&p.name),t(p&&p.address)]).filter(p=>p[0]||p[1]);
  return JSON.stringify([t(c.purchaser),t(c.address),t(c.defendant),t(c.plaintiff),t(c.plaintiff_address),t(c.attorney),t(c.notes),pets]); }
function _crAutoSoon(){ if(_crAutoT) clearTimeout(_crAutoT); const m=document.getElementById('cr-savemsg'); if(m) m.textContent='Unsaved changes…'; _crAutoT=setTimeout(()=>{ _crAutoT=null; _crSave(false,true); },1000); }
async function _crFlush(){ if(_crAutoT){ clearTimeout(_crAutoT); _crAutoT=null; await _crSave(false,true); } else if(_crSaving){ try{ await _crSaving; }catch(_){} } }
window._crFlush=_crFlush;
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') _crFlush(); });
window.addEventListener('beforeunload',()=>{ if(_crAutoT){ clearTimeout(_crAutoT); _crAutoT=null; _crSave(false,true); } });
async function _crSave(next,auto){
  if(!auto&&_crAutoT){ clearTimeout(_crAutoT); _crAutoT=null; }
  if(_crSaving){ try{ await _crSaving; }catch(_){} }
  if(!document.querySelector('#cr-editor [data-f]')||!_CR.cur) return;
  const c=_crCollect(); if(auto&&_crSig(c)===_crSig(_CR.cur)){ const m=document.getElementById('cr-savemsg'); if(m&&/Unsaved/.test(m.textContent)) m.textContent=''; return; }
  let done; _crSaving=new Promise(r=>done=r);
  try{ await _crSaveNow(c,next,auto); } finally{ done(); _crSaving=null; }
}
async function _crSaveNow(c,next,auto){
  const msg=document.getElementById('cr-savemsg'); if(msg) msg.textContent='Saving…';
  const me=await _crMe(); const wasDone=_crDone(_CR.cur.sort_code)||_crScrap(_CR.cur.sort_code);
  const patch={ address:c.address, defendant:c.defendant, plaintiff:c.plaintiff||null, plaintiff_address:c.plaintiff_address||null, attorney:c.attorney, notes:c.notes||null,
    sort_code:c.sort_code, updated_at:new Date().toISOString(), claimed_by:auto?me:null, claimed_at:auto?new Date().toISOString():null };
  { const _k=_crTypeKey(c.case_type); if((_k==='ul'||_k==='ts')&&c.purchaser!==undefined){ const ex0=Object.assign({},_CR.cur.extra||{}); const pv=String(c.purchaser||'').trim(); if(pv) ex0.purchaser=pv; else delete ex0.purchaser; patch.extra=ex0; } }
  if(_crTypeKey(c.case_type)==='pb') Object.assign(patch,{petitioners:c.petitioners,petitioner:c.petitioner,petitioner_address:c.petitioner_address,petitioner_count:c.petitioner_count});
  if((_crDone(c.sort_code)||_crScrap(c.sort_code))&&!wasDone){ patch.completed_at=new Date().toISOString(); patch.completed_by=me; }
  try{
    const up=await sb.from('court_cases').update(patch).eq('id',c.id); if(up.error) throw up.error;
    if(!wasDone&&me&&me!=='someone'&&!(_CR._logged=_CR._logged||new Set()).has(_crIsoDay(0)+'|'+c.id)){ _CR._logged.add(_crIsoDay(0)+'|'+c.id); try{ sb.from('creation_activity').upsert({email:me,day:_crIsoDay(0),case_id:String(c.id)},{onConflict:'email,day,case_id',ignoreDuplicates:true}).then(()=>{},()=>{}); }catch(_){} }
    _CR.cur=Object.assign(_CR.cur,patch); _CR.full[c.id]=_CR.cur;
    const lc=_CR.cases.find(x=>x.id===c.id); if(lc){ lc.sort_code=c.sort_code; if(patch.completed_at){ lc.completed_at=patch.completed_at; lc.completed_by=patch.completed_by; } lc.claimed_by=patch.claimed_by; }
    const row=document.querySelector('#cr-qlist [data-cid="'+c.id+'"] .cr-badge'); if(row) row.outerHTML=_crStatusPill(c.sort_code,true);
    if(msg&&_CR.cur&&_CR.cur.id===c.id) msg.textContent='✓ '+(auto?'Saved automatically ':'Saved ')+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
    if(next){
      const items=[...document.querySelectorAll('#cr-qlist [data-cid]')]; const i=items.findIndex(el=>el.getAttribute('data-cid')===c.id);
      const stillIn=_crQueueList().some(x=>x.id===c.id);
      const nx=items[i+1]||null; if(!stillIn&&items[i]) items[i].remove();
      const cnt=document.getElementById('cr-qcount'); if(cnt){ const n=_crQueueList().length; cnt.innerHTML=_crQCountTxt(n); }
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
    H.rows=[]; H.pay=[]; H.done={}; H.worked={}; H.inDone={};
    if(H.who){
      for(let f=0;;f+=1000){ const q=await sb.from('work_hours').select('*').eq('email',H.who).order('day',{ascending:false}).range(f,f+999); if(q.error) throw q.error; H.rows=H.rows.concat(q.data||[]); if(!q.data||q.data.length<1000) break; }
      const p=await sb.from('work_pay').select('*').eq('email',H.who).order('paid_through',{ascending:false}); if(p.error) throw p.error; H.pay=p.data||[];
      // cases this person finished per day (from Work Queue saves) — last 90 days
      const since=new Date(Date.now()-90*864e5).toISOString();
      for(let f=0;;f+=1000){ const q=await sb.from('court_cases').select('completed_at').eq('completed_by',H.who).gte('completed_at',since).range(f,f+999); if(q.error) break;
        (q.data||[]).forEach(r=>{ const d=new Date(r.completed_at); const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); H.done[k]=(H.done[k]||0)+1; }); if(!q.data||q.data.length<1000) break; }
      // cases this person changed while they were still unfinished (per day)
      for(let f=0;;f+=1000){ const q=await sb.from('creation_activity').select('day').eq('email',H.who).gte('day',since.slice(0,10)).range(f,f+999); if(q.error) break;
        (q.data||[]).forEach(r=>{ H.worked[r.day]=(H.worked[r.day]||0)+1; }); if(!q.data||q.data.length<1000) break; }
      // cases that came in already complete from an import (nobody's credit) — separate total per day
      for(let f=0;;f+=1000){ const q=await sb.from('court_cases').select('completed_at').is('completed_by',null).not('completed_at','is',null).gte('completed_at',since).range(f,f+999); if(q.error) break;
        (q.data||[]).forEach(r=>{ const d=new Date(r.completed_at); const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); H.inDone[k]=(H.inDone[k]||0)+1; }); if(!q.data||q.data.length<1000) break; }
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
  // "Paid through" date you pick — defaults to the end of last month (monthly pay), or the latest day if nothing's unpaid before then
  const eom=(()=>{ const d=new Date(); d.setDate(0); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
  if(!H.payThru||H.payThru<=lastPaid||H.payFor!==H.who){ H.payFor=H.who; H.payThru=unpaid.some(r=>r.day<=eom)?eom:(unpaid[0]?unpaid[0].day:today); }
  const payRows=unpaid.filter(r=>r.day<=H.payThru); const payHrs=payRows.reduce((a,r)=>a+(+r.hours||0),0);
  // week = Sunday → Saturday
  const wkStart=iso=>{ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()-d.getDay()); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const thisWk=wkStart(today); const wkHrs=H.rows.filter(r=>r.day>=thisWk).reduce((a,r)=>a+(+r.hours||0),0);
  const ed=H.edit||{day:today,hours:'',note:''}; const cur=H.rows.find(r=>r.day===ed.day);
  const box=(t,v,s)=>'<div style="flex:1;min-width:130px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:8px 12px"><div style="font-size:11.5px;color:var(--text-dim)">'+t+'</div><div style="font-size:20px;font-weight:800">'+v+'</div>'+(s?'<div style="font-size:11.5px;color:var(--text-dim)">'+s+'</div>':'')+'</div>';
  let html='<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">'
    +(H.admin?'<select onchange="_CR.hr.who=this.value;_CR.hr.edit=null;_crHrRender(document.getElementById(\'cr-body\'))" style="height:36px;font-size:13.5px;padding:0 10px;border-radius:8px;width:auto;min-width:240px">'+(H.workers.length?H.workers.map(w=>'<option '+(w===H.who?'selected':'')+'>'+E(w)+'</option>').join(''):'<option value="">No one yet</option>')+'</select>':'<div style="font-weight:700;font-size:14px">'+E(H.who)+'</div>')
    +'<div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end">'
      +(H.admin&&H.who&&unpaid.length?'<div style="display:flex;flex-wrap:nowrap;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:4px 4px 4px 10px"><span style="font-size:12.5px;color:var(--text-dim);white-space:nowrap">Paid through</span>'
        +'<input type="date" value="'+E(H.payThru)+'"'+(lastPaid?' min="'+E(lastPaid)+'"':'')+' max="'+today+'" onchange="_CR.hr.payThru=this.value;_crHrDraw()" style="height:32px;font-size:13px;padding:0 6px;border-radius:7px;width:140px;flex:0 0 auto">'
        +'<button type="button" class="btn btn-ghost text-sm" style="height:32px;white-space:nowrap;flex:0 0 auto" title="Last day of last month" onclick="_CR.hr.payThru=\''+eom+'\';_crHrDraw()">End of last month</button>'
        +'<button class="btn btn-primary text-sm" style="height:32px;white-space:nowrap;flex:0 0 auto"'+(payRows.length?'':' disabled')+' onclick="_crHrPay()">✓ Mark paid ('+_crHrFmt(payHrs)+' hrs)</button></div>':'')
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
        +box('This week (Sun–Sat)',_crHrFmt(wkHrs)+' hrs')
        +box('Not paid yet',_crHrFmt(unpaidHrs)+' hrs',lastPaid?'since '+_crHrMD(lastPaid):'')
      +'</div>'
      +(H.pay.length?'<div style="margin-top:12px;font-size:12.5px"><div style="font-weight:700;margin-bottom:4px">Paid</div>'+H.pay.slice(0,8).map(p=>'<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid var(--border)"><span>through '+E(_crHrMD(p.paid_through))+'</span><span><b>'+_crHrFmt(p.hours)+'</b> hrs'+(H.admin?' <a href="#" title="Undo this payment" onclick="event.preventDefault();_crHrUnpay('+p.id+')" style="color:var(--text-dim);text-decoration:none;margin-left:6px">✕</a>':'')+'</span></div>').join('')+'</div>':'')
    +'</div>';
  // log table, newest first, grouped by pay period, with week subtotals
  const rows=H.rows.slice(); const trs=[]; let wk=null, wkSum=0;
  const wkEnd=w=>{ const d=new Date(w+'T12:00:00'); d.setDate(d.getDate()+6); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const flushWk=()=>{ if(wk===null) return; const end=wkEnd(wk);
    const owed=unpaid.filter(r=>r.day<=end).reduce((a,r)=>a+(+r.hours||0),0);   // everything unpaid up to the end of this week
    trs.push('<tr><td colspan="7" style="padding:4px 10px;text-align:right;font-size:11.5px;color:var(--text-dim);background:var(--panel-2)">Week of '+E(_crHrMD(wk))+'–'+E(_crHrMD(end))+' · <b style="color:var(--text)">'+_crHrFmt(wkSum)+' hrs</b>'
      +(owed>0?' <span style="margin-left:10px;padding:1px 8px;border-radius:999px;background:rgba(249,115,22,.15);color:#fb923c;font-weight:700">Unpaid total: '+_crHrFmt(owed)+' hrs</span>':'')+'</td></tr>'); };
  let paidIdx=0;
  rows.forEach(r=>{
    while(paidIdx<H.pay.length&&r.day<=H.pay[paidIdx].paid_through){ flushWk(); wk=null; wkSum=0; const p=H.pay[paidIdx]; trs.push('<tr><td colspan="7" style="padding:7px 10px;font-size:12px;font-weight:700;color:#22c55e;border-top:2px solid #22c55e55">✓ Paid through '+E(_crHrMD(p.paid_through))+' — '+_crHrFmt(p.hours)+' hrs</td></tr>'); paidIdx++; }
    const w=wkStart(r.day); if(w!==wk){ flushWk(); wk=w; wkSum=0; } wkSum+=(+r.hours||0);
    const un=!lastPaid||r.day>lastPaid;
    trs.push('<tr onclick="_crHrPick(\''+r.day+'\')" style="cursor:pointer;border-top:1px solid var(--border)'+(H.edit&&H.edit.day===r.day?';background:rgba(96,165,250,.12)':'')+'"><td style="padding:6px 10px;white-space:nowrap;width:44px;color:var(--text-dim)">'+_crHrDay(r.day)+'</td><td style="padding:6px 10px;white-space:nowrap;width:70px">'+E(_crHrMD(r.day))+'</td><td style="padding:6px 10px;white-space:nowrap;width:60px;font-weight:700;'+(un?'':'color:var(--text-dim)')+'">'+_crHrFmt(r.hours)+'</td><td style="padding:6px 10px;white-space:nowrap;width:95px;color:var(--text-dim)">'+(H.inDone[r.day]?H.inDone[r.day].toLocaleString():'')+'</td><td style="padding:6px 10px;white-space:nowrap;width:100px;color:#4ade80;font-weight:700">'+(H.done[r.day]||'')+'</td><td style="padding:6px 10px;white-space:nowrap;width:70px;color:#93c5fd;font-weight:700">'+(H.worked[r.day]||'')+'</td><td style="padding:6px 10px;color:var(--text-dim);font-size:12px">'+E(r.note||'')+'</td></tr>');
  });
  flushWk();
  html+='<div style="max-height:620px;overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'+[['Day',''],['Date',''],['Hours',''],['Pre-Finished','Cases that arrived already complete from an import — nobody\'s credit'],['Post-Finished','Cases this person finished (were unfinished, now done)'],['Worked','Unfinished cases this person changed that day — done or not'],['Notes','']].map(h=>'<th title="'+h[1]+'" style="position:sticky;top:0;background:var(--panel);padding:7px 10px;text-align:left;font-size:11px;color:var(--text-dim);text-transform:uppercase;white-space:nowrap'+(h[1]?';cursor:help':'')+'">'+h[0]+'</th>').join('')+'</tr></thead><tbody>'
    +(trs.length?trs.join(''):'<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--text-dim)">No hours logged yet.</td></tr>')+'</tbody></table></div></div>';
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
  const thru=H.payThru||un[0].day; const sel=un.filter(r=>r.day<=thru); if(!sel.length){ toast('No unpaid hours on or before '+_crHrMD(thru),'warn'); return; }
  const hrs=sel.reduce((a,r)=>a+(+r.hours||0),0);
  if(!confirm('Mark '+_crHrFmt(hrs)+' hrs paid for '+H.who+' (through '+_crHrMD(thru)+')?')) return;
  const r=await sb.from('work_pay').insert({email:H.who,paid_through:thru,hours:hrs,paid_at:new Date().toISOString()}).select().single();
  if(r.error){ toast('Failed: '+r.error.message,'err'); return; }
  H.pay.unshift(r.data); H.pay.sort((a,b)=>a.paid_through<b.paid_through?1:-1); H.payThru=null; toast('✓ Marked paid','ok'); _crHrDraw();
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
_CR.ch=_CR.ch||{ fc:true, pb:true, ev:true, cv:true, ul:true, ts:true, county:'', range:12, by:'m' };
function _crChartHtml(){
  const E=_reqEsc, C=_CR.ch, T=Object.keys(_CR_TYPES).map(k=>[k,_CR_TYPES[k],_CR_COL[k]]);
  const act=_CR.counties.filter(c=>c.active), actSet=new Set(act.map(c=>c.code));
  const mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const by=C.by||'m', step=by==='w'?7:by==='bw'?14:0;   // weekly / bi-weekly / monthly / quarterly / yearly
  const yearly=by==='y'; let tsHidden=0;
  const now=new Date(); now.setHours(0,0,0,0);
  const rows=[]; let minM=null, noDay=0;
  _CR.cases.forEach(c=>{ const k=_crTypeKey(c.case_type); if(!k) return;
    if(C.county?c.county_code!==C.county:!actSet.has(c.county_code)) return;
    if(k==='ts'){ // tax sale = sale year only (Zeus Sale ID: CC YY NNNNN → 032600016 = 2026); no month, so it's only charted on Yearly
      const x=String(c.case_number||'').match(/^TS-\d{2}(\d{2})\d{5}$/); const y=x?'20'+x[1]:(c.uploaded_at?String(c.uploaded_at).slice(0,4):'');
      if(!/^\d{4}$/.test(y)) return; if(!yearly){ tsHidden++; return; } rows.push({k:k,day:'',m:y+'-01'}); if(!minM||y+'-01'<minM) minM=y+'-01'; return; }
    let day=c.filed&&/^\d{4}-\d{2}-\d{2}/.test(String(c.filed))?String(c.filed).slice(0,10):'', m=day.slice(0,7);
    if(!m){ const x=String(c.case_number||'').match(/^\d{2}[A-Z]\d{2}-(\d{2})(\d{2})-/); if(!x||+x[2]<1||+x[2]>12) return; m='20'+x[1]+'-'+x[2]; }  // month from the case number when Filed is blank
    rows.push({k:k,day:day,m:m}); if(!minM||m<minM) minM=m; });
  const buckets=[];
  if(step){
    const end=new Date(now); end.setDate(end.getDate()+1);
    const s0=C.range?new Date(now):(minM?new Date(+minM.slice(0,4),+minM.slice(5,7)-1,1):new Date(now)); if(C.range) s0.setMonth(s0.getMonth()-C.range); s0.setDate(s0.getDate()-((s0.getDay()+6)%7));   // start on a Monday
    for(let d=new Date(s0);d<end;d.setDate(d.getDate()+step)){ const t=new Date(d); t.setDate(t.getDate()+step); const last=new Date(t); last.setDate(last.getDate()-1);
      buckets.push({from:iso(d),to:iso(t),label:mn[d.getMonth()]+' '+d.getDate(),tip:(step===14?mn[d.getMonth()]+' '+d.getDate()+' – '+mn[last.getMonth()]+' '+last.getDate():'week of '+mn[d.getMonth()]+' '+d.getDate())}); }
  } else if(yearly){
    const y0=minM?+minM.slice(0,4):now.getFullYear()-2;
    for(let y=Math.min(y0,now.getFullYear()-1);y<=now.getFullYear();y++) buckets.push({from:y+'-01',to:(y+1)+'-01',label:String(y),tip:String(y)});
  } else {
    const q=by==='q'?3:1;
    let start=C.range?new Date(now.getFullYear(),now.getMonth()-(C.range-1),1):(minM?new Date(+minM.slice(0,4),+minM.slice(5,7)-1,1):new Date(now.getFullYear(),now.getMonth()-11,1));
    if(q===3) start=new Date(start.getFullYear(),Math.floor(start.getMonth()/3)*3,1);
    for(let d=new Date(start);d<=now;d.setMonth(d.getMonth()+q)){ const n2=new Date(d.getFullYear(),d.getMonth()+q,1);
      const lbl=q===3?'Q'+(Math.floor(d.getMonth()/3)+1)+" '"+String(d.getFullYear()).slice(2):mn[d.getMonth()]+(d.getMonth()===0||(C.range&&C.range<=14)?" '"+String(d.getFullYear()).slice(2):'');
      buckets.push({from:iso(d).slice(0,7),to:iso(n2).slice(0,7),label:lbl,tip:q===3?'Q'+(Math.floor(d.getMonth()/3)+1)+' '+d.getFullYear():mn[d.getMonth()]+' '+d.getFullYear()}); }
  }
  const counts={}; Object.keys(_CR_TYPES).forEach(k=>counts[k]=buckets.map(()=>0));
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
      +T.map(t=>'<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:600"><input type="checkbox" '+(C[t[0]]?'checked':'')+' onchange="_CR.ch.'+t[0]+'=this.checked;_crChartDraw()" style="width:16px;height:16px;accent-color:'+t[2]+'"><span style="display:inline-block;width:14px;height:3px;border-radius:2px;background:'+t[2]+'"></span>'+t[1]+' <span style="color:var(--text-dim);font-weight:500">'+(t[0]==='ts'&&!yearly?(tsHidden?tsHidden.toLocaleString()+' · <a href="#" onclick="event.preventDefault();_CR.ch.by=\'y\';_crChartDraw()" style="color:#60a5fa;text-decoration:none" title="Tax sales only have a sale year">Yearly only</a>':'0'):tot(t[0]).toLocaleString())+'</span></label>').join('')
      +'<div style="margin-left:auto;display:flex;gap:8px">'
        +'<select style="'+sel+'" onchange="_CR.ch.county=this.value;_crChartDraw()"><option value="">All active counties</option>'+_CR.counties.map(c=>'<option value="'+E(c.code)+'" '+(C.county===c.code?'selected':'')+'>'+E(c.city)+(c.active?'':' (inactive)')+'</option>').join('')+'</select>'
        +'<select style="'+sel+'" onchange="_CR.ch.by=this.value;_crChartDraw()">'+[['w','Weekly'],['bw','Bi-weekly'],['m','Monthly'],['q','Quarterly'],['y','Yearly']].map(o=>'<option value="'+o[0]+'" '+(by===o[0]?'selected':'')+'>'+o[1]+'</option>').join('')+'</select>'+(yearly?'':'<select style="'+sel+'" onchange="_CR.ch.range=+this.value;_crChartDraw()">'+[[3,'Last 3 months'],[6,'Last 6 months'],[12,'Last 12 months'],[24,'Last 24 months'],[36,'Last 36 months'],[0,'All time']].map(o=>'<option value="'+o[0]+'" '+(C.range===o[0]?'selected':'')+'>'+o[1]+'</option>').join('')+'</select>')
      +'</div></div>'
    +(on.length?svg+(noDay?'<div style="font-size:11.5px;color:var(--text-dim);margin-top:4px">'+noDay.toLocaleString()+' case'+(noDay===1?'':'s')+' in this range have no Filed date, so they can\'t be placed in a week — they still show on Monthly.</div>':''):'<div style="padding:40px;text-align:center;color:var(--text-dim)">Check a list type to show its line.</div>')
  +'</div>';
}
function _crChartDraw(){ const el=document.getElementById('cr-chart'); if(el) el.innerHTML=_crChartHtml(); }
window._crChartDraw=_crChartDraw;

// 📋 City & county lists (code violations, utility liens, tax sale) — Tracker block under the court table
function _crListsHtml(by){
  const E=_reqEsc, K=_CR_LISTS;
  const tot={}; K.forEach(k=>tot[k]={d:0,t:0,s:0});
  const rows=_CR.counties.filter(c=>{ const b=by[c.code]; return b&&K.some(k=>b[k]&&(b[k].t||b[k].s)); });
  rows.forEach(c=>{ const b=by[c.code]; K.forEach(k=>{ tot[k].d+=b[k].d; tot[k].t+=b[k].t; tot[k].s+=b[k].s; }); });
  const card=k=>{ const x=tot[k], p=_crPct(x.d,x.t); return '<div style="flex:1;min-width:150px;background:var(--panel-2);border:1px solid var(--border);border-top:3px solid '+_CR_COL[k]+';border-radius:10px;padding:10px 12px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-dim)">'+_CR_TYPES[k]+'</div><div style="font-size:20px;font-weight:800">'+x.d.toLocaleString()+' <span style="font-size:13px;color:var(--text-dim);font-weight:600">/ '+x.t.toLocaleString()+'</span></div><div style="font-size:12px;font-weight:700"><span style="color:'+_crPctColor(p,x.t)+'">'+(x.t?p.toFixed(1)+'% complete':'—')+'</span>'+(x.s?'<span style="color:var(--text-dim);font-weight:600"> · </span><span style="color:#94a3b8">'+x.s.toLocaleString()+' scrapped</span>':'')+'</div></div>'; };
  const th='padding:6px;font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--text-dim);text-align:center';
  const cell=(x)=>{ const p=_crPct(x.d,x.t); return '<td style="text-align:center;padding:7px 6px"><b>'+x.d.toLocaleString()+'</b><span style="color:var(--text-dim)"> / '+x.t.toLocaleString()+'</span></td><td style="text-align:center;padding:7px 6px;font-weight:700;color:'+_crPctColor(p,x.t)+'">'+(x.t?p.toFixed(1)+'%':'—')+'</td>'; };
  return '<div style="margin-top:16px;border:1px solid var(--border);border-radius:12px;padding:12px 14px">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="font-weight:800;font-size:14px">📋 City &amp; county lists</div><div style="font-size:12px;color:var(--text-dim)">Code violations, utility liens and tax sale lists — add them in 📋 Paste / Import → Import a list.</div></div>'
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">'+K.map(card).join('')+'</div>'
    +(rows.length?'<div style="overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="border-collapse:collapse;font-size:13px;min-width:700px;width:100%"><thead><tr><th style="'+th+';text-align:left">County</th>'+K.map(k=>'<th colspan="2" style="'+th+';color:'+_CR_COL[k]+';border-bottom:2px solid '+_CR_COL[k]+'">'+_CR_TYPES[k]+'</th>').join('')+'</tr></thead><tbody>'
      +rows.map(c=>{ const b=by[c.code]; return '<tr style="border-top:1px solid var(--border)"><td style="padding:7px 8px;white-space:nowrap">'+_crCodeBadge(c)+'<b>'+E(c.city)+'</b> <span style="color:var(--text-dim);font-size:12px">'+E(c.county)+'</span></td>'+K.map(k=>cell(b[k])).join('')+'</tr>'; }).join('')
      +'</tbody></table></div>':'<div style="padding:18px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px;font-size:13px">No lists yet.</div>')
  +'</div>';
}

// ----- 📥 Import a list (Excel / CSV): code violations, utility liens, tax sale -----
// Recognised layouts: city code-violation report (LOCATION / OWNER / CREATED / COMPLIED / VIOLATION),
// county "Records by Other Assessment" lien report (State Number / Deeded Owner / Date Filed / Total),
// tax lien sale export or results (Sale ID / Parcel Number / Owner Name / Face Amount / Winning Bid).
_CR.li=_CR.li||{ recs:null, fmt:'', county:'', file:'', note:'' };
function _crLiIso(v){
  if(v==null||v==='') return null;
  if(v instanceof Date&&!isNaN(v)) return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');
  if(typeof v==='number'&&v>20000&&v<80000){ const d=new Date(Math.round((v-25569)*864e5)); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); }
  const m=String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(m){ const y=m[3].length===2?'20'+m[3]:m[3]; return y+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'); }
  const m2=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m2?m2[0]:null;
}
function _crLiMoney(v){ if(v==null||v==='') return null; if(typeof v==='number') return v; const n=parseFloat(String(v).replace(/[^0-9.\-]/g,'')); return isFinite(n)?n:null; }
function _crLiSlug(s){ return String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,''); }
function _crLiParse(grid,fileName){
  const cell=(r,i)=>{ const v=(grid[r]||[])[i]; return v==null?'':v; };
  const txt=(r,i)=>String(cell(r,i)).trim();
  // each need = one name or a list of alternatives (any one of them)
  const findHead=(need)=>{ for(let r=0;r<Math.min(grid.length,40);r++){ const row=(grid[r]||[]).map(x=>String(x==null?'':x).trim().toLowerCase()); if(need.every(n=>[].concat(n).some(a=>row.some(x=>x===a||x.indexOf(a)===0)))) return r; } return -1; };
  const colOf=(r,names)=>{ const row=(grid[r]||[]).map(x=>String(x==null?'':x).trim().toLowerCase()); for(const n of names){ const i=row.findIndex(x=>x===n); if(i>=0) return i; } for(const n of names){ const i=row.findIndex(x=>x.indexOf(n)===0); if(i>=0) return i; } return -1; };
  let h;
  // --- code violations
  if((h=findHead(['location',['owner','responsible party'],['violation','viol']]))>=0){
    const iL=colOf(h,['location']), iO=colOf(h,['owner','responsible party']), iC=colOf(h,['created','opened']), iD=colOf(h,['complied','closed']), iV=colOf(h,['violation','viol 1 description','viol']);
    const g={};
    // one property per address per month (several violations the same month = one lead; a new month = a new one)
    for(let r=h+1;r<grid.length;r++){ const loc=txt(r,iL); if(!loc) continue; const c=_crLiIso(cell(r,iC)); const k=loc.toUpperCase().replace(/\s+/g,' ')+'|'+String(c||'').slice(0,7);
      const x=g[k]||(g[k]={loc:loc,owner:txt(r,iO),viol:[],created:null,complied:[],open:false});
      const v=txt(r,iV); if(v&&x.viol.indexOf(v)<0) x.viol.push(v);
      if(c&&(!x.created||c<x.created)) x.created=c;
      const d=iD>=0?_crLiIso(cell(r,iD)):null; if(d) x.complied.push(d); else x.open=true;
      if(!x.owner) x.owner=txt(r,iO); }
    return { fmt:'cv', label:'Code violations', needCounty:true, items:Object.values(g).map(x=>({ loc:x.loc, owner:x.owner, viol:x.viol.join(', '), filed:x.created, complied:x.open?'':(x.complied.sort().pop()||'') })) };
  }
  // --- utility / sewer liens ("Records by Other Assessment")
  if((h=findHead(['state number','deeded owner']))>=0){
    let lien='Utility'; for(let r=0;r<h;r++) (grid[r]||[]).forEach(v=>{ const m=String(v||'').match(/charge:\s*(.+)/i); if(m) lien=m[1].replace(/\s*-\s*[^-]+$/,'').replace(/\s*lien\s*$/i,'').trim()||lien; });
    const iP=colOf(h,['state number']), iO=colOf(h,['deeded owner']), iF=colOf(h,['date filed']), iT=colOf(h,['total']);
    const items=[];
    for(let r=h+1;r<grid.length;r++){ const p=txt(r,iP); if(!/^\d{2}-\d{2}-\d{2}-\d{3}-\d{3}\.\d{3}-\d{3}$/.test(p)) continue;
      items.push({ parcel:p, owner:txt(r,iO), filed:_crLiIso(cell(r,iF)), amount:_crLiMoney(cell(r,iT)), lien:lien }); }
    return { fmt:'ul', label:lien+' liens', needCounty:false, items:items };
  }
  // --- tax lien sale (export or results)
  if((h=findHead(['sale id','parcel number']))>=0){
    let inactive=/inactive/i.test(fileName||''); for(let r=0;r<h;r++) (grid[r]||[]).forEach(v=>{ if(/inactive/i.test(String(v||''))) inactive=true; });
    let iS=colOf(h,['sale id']), iP=colOf(h,['parcel number']), iO=colOf(h,['owner name','owner']), iA=colOf(h,['address']), iF=colOf(h,['face amount','minbid','min bid']),
          iB=colOf(h,['current winning bid','winning bid','winner/bid']), iD=colOf(h,['district']), iV=colOf(h,['assessed value']), iG=colOf(h,['legal']), iY=colOf(h,['style','status']), iW=colOf(h,['bidder','winner','buyer']);
    // Some exports drop a header (e.g. "Proxy Bid") but keep its data column — everything after it sits one cell to the right.
    let sh=0; if(iD>=0){ let blank=0, next=0, n=0; for(let r=h+1;r<grid.length&&n<40;r++){ if(!/^\d{6,}$/.test(txt(r,iS))) continue; n++; if(!txt(r,iD)) blank++; if(txt(r,iD+1)) next++; } if(n&&blank/n>0.8&&next/n>0.8) sh=1; }
    const S=i=>(i>=0&&iD>=0&&i>=iD)?i+sh:i; iO=S(iO); iA=S(iA); iD=S(iD); iV=S(iV); iG=S(iG);
    const items=[];
    for(let r=h+1;r<grid.length;r++){ const sid=txt(r,iS); if(!/^\d{6,}$/.test(sid)) continue;
      const bidRaw=iB>=0?txt(r,iB):''; const sty=iY>=0?txt(r,iY):'';
      // Files built with a Style / Status column: "Paid pre-sale" = inactive, "Tax Sale (None)" = no bid, "Tax Sale (Sold)" = sold
      const rowInactive=inactive||/paid pre-?sale|inactive|withdrawn|redeemed before/i.test(sty);
      const rowNB=/\(none\)|no ?bid|\bnb\b/i.test(sty);
      items.push({ sale_id:sid, parcel:txt(r,iP), owner:txt(r,iO), street:iA>=0?txt(r,iA):'', district:iD>=0?txt(r,iD):'', amount:_crLiMoney(iF>=0?cell(r,iF):''),
        bid:(rowNB||/^nb$/i.test(bidRaw))?'NB':(_crLiMoney(bidRaw)!=null?_crLiMoney(bidRaw):bidRaw), assessed:iV>=0?_crLiMoney(cell(r,iV)):null, legal:iG>=0?txt(r,iG):'', inactive:rowInactive, style:sty, bidder:iW>=0?txt(r,iW):'' }); }
    // After the sale (some rows have a winning bid), a blank winning bid means it never went to auction = inactive / pulled pre-sale.
    // Before the sale (no bids anywhere yet) blanks are left alone.
    if(iB>=0&&items.some(x=>typeof x.bid==='number')) items.forEach(x=>{ if((x.bid===''||x.bid==null)&&!x.style) x.inactive=true; });
    // Auditor results: a $0 winning bid = no bid. Zeus: winning bid equal to the minimum (Face Amount) = most likely no bid (struck at the minimum).
    items.forEach(x=>{ if(x.style||x.inactive||typeof x.bid!=='number') return;
      if(x.bid===0) x.bid='NB';
      else if(!x.bidder&&x.amount!=null&&Math.abs(x.bid-x.amount)<0.005){ x.bidAtMin=true; } });   // a named / numbered bidder = a real sale
    return { fmt:'ts', label:'Tax sale'+(inactive?' (inactive parcels)':''), needCounty:false, items:items };
  }
  return null;
}
// Turn parsed items into court_cases rows for the chosen county.
function _crLiRecords(P,county){
  const cty=_CR.counties.find(c=>c.code===county)||{}; const cityName=cty.city||''; const cname=cty.county||'';
  const src=_CR.li.file||''; const out=[];
  P.items.forEach(x=>{
    let r;
    if(P.fmt==='cv'){ const code=county||'00';
      r={ case_number:'CV-'+code+'-'+String(x.filed||'').slice(2,7).replace('-','')+'-'+_crLiSlug(x.loc), county_code:code, case_type:'CV - Code Violation',
          style:'Code violation — '+(x.viol||'').toLowerCase(), address:/,/.test(x.loc)?x.loc:(x.loc+((x.city||cityName)?', '+(x.city||cityName):'')+', IN'), defendant:x.owner, filed:x.filed, status:x.complied?'Complied '+x.complied:'Open',
          parcel:null, amount:null, extra:{ violation:x.viol, complied:x.complied||'', source:src } }; }
    else if(P.fmt==='ul'){ const code=county||String(x.parcel||'').slice(0,2); const lien=x.lien||'Utility';
      const a=String(x.addr||'').trim(); const addr=!a?'':(/,/.test(a)?a:a+((x.city||cityName)?', '+(x.city||cityName):'')+', IN');
      r={ case_number:'UL-'+(x.parcel||_crLiSlug(a))+'-'+String(x.filed||'').replace(/-/g,'').slice(2), county_code:code, case_type:'UL - Utility Lien · '+lien,
          style:lien+' lien', address:addr, defendant:x.owner, filed:x.filed, status:'',
          parcel:x.parcel||null, amount:x.amount, extra:{ lien:lien, source:src } }; }
    else { const sid=String(x.sale_id||x.parcel||_crLiSlug(x.street)); const code=county||sid.slice(0,2);
      const city=x.city||(/city of/i.test(x.district||'')?x.district.replace(/city of/i,'').trim():(cname||cityName));
      r={ case_number:'TS-'+sid, county_code:code, case_type:'TS - Tax Sale',
          style:'Tax sale '+sid, address:x.street?(/,/.test(x.street)?x.street:x.street+(city?', '+city:'')+', IN'):'', defendant:x.owner, filed:null, status:x.bid==='NB'?'No bid':(x.bid!==''&&x.bid!=null?'Sold':''),
          parcel:x.parcel||null, amount:x.amount, extra:{ sale_id:x.sale_id, bid:x.bid, bid_at_min:!!x.bidAtMin, style:x.style||'', assessed:x.assessed, legal:x.legal, district:x.district, inactive:!!x.inactive, source:src } }; }
    r.petitioners=[]; r.sort_code=_crSort(r); r.completed_at=(_crDone(r.sort_code)||_crScrap(r.sort_code))?new Date().toISOString():null;
    out.push(r);
  });
  // one row per case number inside the file
  const seen={}; return out.filter(r=>seen[r.case_number]?false:(seen[r.case_number]=1));
}
async function _crLiFile(inp){
  const f=inp.files&&inp.files[0]; inp.value=''; if(!f) return; const L=_CR.li;
  try{
    if(typeof XLSX==='undefined') throw new Error('Spreadsheet reader not loaded — refresh the page');
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
    let P=null, peek='';
    for(const name of wb.SheetNames){ const grid=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:''}); if(!peek&&grid.length) peek=(grid.find(r=>r.some(x=>String(x).trim()))||[]).filter(x=>String(x).trim()).slice(0,6).join(' | '); if(grid.length<2) continue; P=_crLiParse(grid,f.name); if(P) break; }
    // keep the biggest sheet for "map columns myself"
    let raw=null; wb.SheetNames.forEach(n=>{ const g=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''}); if(!raw||g.length>raw.length) raw=g; });
    L.raw=raw; L.file=f.name; L.P=null; L.map=null;
    if(!raw||raw.length<2) throw new Error('“'+f.name+'” looks empty ('+(f.size/1024).toFixed(0)+' KB) — if it’s in OneDrive, make sure it’s downloaded, then try again.');
    if(!P||!P.items.length){ // a layout you mapped before?
      const saved=await _crLiLayouts(); const hr=_crLiHeadRow(raw); const sig=_crLiSig(raw[hr]);
      if(saved[sig]){ L.map=Object.assign({head:hr},saved[sig]); P=_crLiFromMap(raw,L.map,f.name); if(P&&P.items.length) toast('Using the columns you mapped last time for this layout','ok'); }
    }
    if(!P||!P.items.length){ _crLiMapStart(); return; }
    L.P=P;
    // county: tax sale / liens carry it in the numbers; code violations need you to pick
    const guess=P.fmt==='ul'?P.items[0].parcel.slice(0,2):P.fmt==='ts'?P.items[0].sale_id.slice(0,2):'';
    L.county=_CR.counties.some(c=>c.code===guess)?guess:(P.fmt==='cv'?(L.county||''):guess);
    await _crLiPreview();
  }catch(e){ toast('Import: '+(e.message||e),'err'); }
}
window._crLiFile=_crLiFile;
async function _crLiPreview(){
  const L=_CR.li; if(!L.P) return _crRender();
  const it=L.P.items[0]||{}; const dc=L.P.fmt==='ul'?(/^\d{2}-/.test(it.parcel||'')?it.parcel.slice(0,2):''):L.P.fmt==='ts'?(String(it.sale_id||it.parcel||'').match(/^\d{2}/)||[''])[0]:'';
  const derivable=!!dc&&_CR.counties.some(c=>c.code===dc);   // only trust it if that code is one of your counties
  L.needCounty=!L.county&&!derivable;
  L.recs=L.needCounty?[]:_crLiRecords(L.P,L.county);
  const have=new Map(); const cns=L.recs.map(r=>r.case_number);
  try{ for(let i=0;i<cns.length;i+=150){ const q=await sb.from('court_cases').select('id,case_number,sort_code').in('case_number',cns.slice(i,i+150)); (q.data||[]).forEach(x=>have.set(x.case_number,x)); } }catch(_){}
  // already here, but this file now says it's a no-bid / inactive parcel → offer to fix it (sent to Scrap)
  L.recs.forEach(r=>{ const h=have.get(r.case_number); r._st=h?(_crScrap(r.sort_code)!==_crScrap(h.sort_code)?'fix':'have'):_crScrap(r.sort_code)?'scrap':_crDone(r.sort_code)?'done':'todo'; if(h){ r._id=h.id; r._was=h.sort_code; } });
  _crRender();
}
window._crLiPreview=_crLiPreview;
function _crLiDrop(e,el){
  e.preventDefault(); if(el){ el.style.borderColor=''; el.style.background=''; }
  const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(!f) return;
  if(!/\.(xlsx|xls|csv)$/i.test(f.name)){ if(typeof toast==='function') toast('Drop an Excel or CSV file','warn'); return; }
  _crLiFile({ files:[f], value:'' });
}
window._crLiDrop=_crLiDrop;
function _crLiClear(){ _CR.li={ recs:null, fmt:'', county:'', file:'', note:'' }; _crRender(); }
window._crLiClear=_crLiClear;
function _crLiRender(box){
  const E=_reqEsc, L=_CR.li, P=L.P;
  const sel='height:36px;font-size:13.5px;padding:0 9px;border-radius:8px;width:auto;min-width:240px';
  let html='<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:14px;align-items:start">'
    +'<div><div style="font-size:14px;font-weight:700;margin-bottom:4px">1. Pick the file</div>'
      +'<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:10px">Excel or CSV exactly as the city / county sent it — code violation reports, sewer / utility lien reports, tax lien sale exports. For a PDF, send it to Claude first.</div>'
      +'<div id="cr-li-drop" ondragover="event.preventDefault();this.style.borderColor=\'#f97316\';this.style.background=\'rgba(249,115,22,.08)\'" ondragleave="this.style.borderColor=\'\';this.style.background=\'\'" ondrop="_crLiDrop(event,this)" style="border:2px dashed var(--border);border-radius:12px;padding:10px;transition:border-color .12s,background .12s">'
        +'<label class="btn btn-primary" style="cursor:pointer;justify-content:center;width:100%;font-size:15px">📥 Choose file<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="_crLiFile(this)"></label>'
        +'<div style="text-align:center;font-size:12px;color:var(--text-dim);margin-top:6px">…or drag &amp; drop the file here</div>'
        +(L.file?'<button type="button" class="btn btn-ghost text-sm" onclick="_crLiClear()" style="width:100%;justify-content:center;margin-top:8px;border:1px solid #ef444466;color:#f87171">✕ Clear file</button>':'')
      +'</div>'
      +(P?'<div style="margin-top:12px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:13px"><div><b>'+E(L.file)+'</b></div><div style="color:var(--text-dim);margin-top:2px">Recognised as <b style="color:'+_CR_COL[P.fmt]+'">'+E(P.label)+'</b> · '+P.items.length.toLocaleString()+' '+(P.fmt==='cv'?'properties':'rows')+'</div>'
        +'<div style="margin-top:10px;font-weight:700">County</div><div style="position:relative;margin-top:4px;max-width:340px"><input id="cr-li-cty" autocomplete="off" placeholder="'+(L.needCounty?'Type a city, county or code…':'From the file — or type to change')+'" value="'+E((()=>{ const c=_CR.counties.find(x=>x.code===L.county); return c?c.code+' · '+c.city+' ('+c.county+')':''; })())+'" onfocus="this.select();_crLiCtyList()" oninput="_crLiCtyList()" onkeydown="_crLiCtyKey(event)" onblur="setTimeout(()=>{const l=document.getElementById(\'cr-li-cty-list\');if(l)l.style.display=\'none\'},150)" style="height:36px;font-size:13.5px;padding:0 10px;border-radius:8px;width:100%;box-sizing:border-box"><div id="cr-li-cty-list" style="display:none;position:absolute;left:0;right:0;top:40px;z-index:50;background:var(--panel);border:1px solid var(--border);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.4);max-height:260px;overflow:auto"></div></div>'
        +'<div style="margin-top:10px"><a href="#" onclick="event.preventDefault();_crLiMapStart()" style="font-size:12.5px;color:#60a5fa;text-decoration:none">🧩 Wrong? Pick the columns myself</a></div></div>'
      :(L.map?'<div style="margin-top:12px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:13px"><div><b>'+E(L.file)+'</b></div><div style="color:var(--text-dim);margin-top:2px">Not a layout Data LAB knows yet — tell it which column is which on the right. It’ll remember this layout next time.</div></div>':''))
    +'</div><div>';
  if(!P&&L.map) html+='<div id="cr-li-map"></div>';
  else if(!P) html+='<div style="padding:40px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">2. The preview shows up here.</div>';
  else if(L.needCounty) html+='<div style="padding:40px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">Pick the county on the left — this list doesn’t say which county it’s from.</div>';
  else {
    const R=L.recs||[]; const n=k=>R.filter(r=>r._st===k).length; const add=R.filter(r=>r._st!=='have'&&r._st!=='fix').length, fix=n('fix');
    const tag={done:['✅ Done','#22c55e'],todo:['○ Needs address','#60a5fa'],scrap:['🗑 Scrap','#ef4444'],have:['↩ Already here','#94a3b8'],fix:['🔁 Fix','#f59e0b']};
    html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'+[['done','✅ Done right away'],['todo','○ Needs work (address)'],['scrap','🗑 Scrap'],['have','↩ Already here']].map(x=>'<div style="flex:1;min-width:110px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:8px 10px"><div style="font-size:11.5px;color:var(--text-dim)">'+x[1]+'</div><div style="font-size:20px;font-weight:800">'+n(x[0]).toLocaleString()+'</div></div>').join('')+'</div>'
      +(fix?'<div style="border:1px solid #f59e0b;background:rgba(245,158,11,0.1);border-radius:10px;padding:8px 12px;font-size:13px;margin-bottom:10px"><b style="color:#fbbf24">🔁 '+fix.toLocaleString()+' already in Data LAB</b> were sorted differently before (Scrap ↔ kept) — they’ll be updated to match the current rules.</div>':'')
      +'<button type="button" class="btn btn-primary" '+(add||fix?'':'disabled ')+'onclick="_crLiSave(this)" style="width:100%;font-size:15px;margin-bottom:10px">'+(add?'Add '+add.toLocaleString()+' '+E(P.label.toLowerCase()):'')+(add&&fix?' · ':'')+(fix?'Fix '+fix.toLocaleString():'')+'</button>'
      +'<div style="max-height:430px;overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><tbody>'
        +R.slice(0,300).map(r=>'<tr style="border-top:1px solid var(--border)"><td style="padding:6px 8px;white-space:nowrap;font-weight:700;color:'+tag[r._st][1]+'">'+(r._st==='scrap'?'🗑 '+E(_CR_SCRAP_WHY[r.sort_code]||'Scrap'):tag[r._st][0])+'</td><td style="padding:6px 8px">'+E(r.defendant||'')+'</td><td style="padding:6px 8px;color:var(--text-dim)">'+E(r.address||r.parcel||'')+'</td><td style="padding:6px 8px;white-space:nowrap;text-align:right">'+(r.amount!=null?'$'+Number(r.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):E((r.extra&&r.extra.violation)||''))+'</td></tr>').join('')
      +'</tbody></table></div>'+(R.length>300?'<div style="font-size:12px;color:var(--text-dim);margin-top:4px">Showing the first 300 of '+R.length.toLocaleString()+'.</div>':'');
  }
  box.innerHTML=html+'</div></div>';
  if(!P&&L.map) _crLiMapPaint();
}
async function _crLiSave(btn){
  const L=_CR.li; const add=(L.recs||[]).filter(r=>r._st!=='have'&&r._st!=='fix'), fixes=(L.recs||[]).filter(r=>r._st==='fix'); if(!add.length&&!fixes.length) return;
  btn.disabled=true; btn.textContent='Adding…';
  try{
    const recs=add.map(r=>{ const o=Object.assign({},r); delete o._st; delete o._id; return o; });
    let fixed=0; for(const r of fixes){ const up=await sb.from('court_cases').update({sort_code:r.sort_code,extra:r.extra,status:r.status,completed_at:(_crDone(r.sort_code)||_crScrap(r.sort_code))?(r.completed_at||new Date().toISOString()):null,updated_at:new Date().toISOString()}).eq('id',r._id); if(!up.error) fixed++; if(fixed%25===0) btn.textContent='Fixing… '+fixed+' / '+fixes.length; }
    for(let i=0;i<recs.length;i+=500){ const up=await sb.from('court_cases').upsert(recs.slice(i,i+500),{onConflict:'case_number',ignoreDuplicates:true}); if(up.error) throw up.error; btn.textContent='Adding… '+Math.min(i+500,recs.length)+' / '+recs.length; }
    _crLogImport({ kind:'list', file:L.file||'', label:(L.P&&L.P.label)||'', added:add.length, fixed:fixed, have:(L.recs||[]).filter(r=>r._st==='have').length,
      counties:[...new Set(add.concat(fixes).map(r=>r.county_code).filter(Boolean))], cases:add.map(r=>r.case_number).filter(Boolean) });
    await _crLoad(true);
    toast('📥 Added '+add.length.toLocaleString()+(fixed?' · updated '+fixed:'')+' — '+add.filter(r=>r._st==='todo').length.toLocaleString()+' need an address in the Work Queue','ok');
    _CR.li={ recs:null, fmt:'', county:L.county, file:'' }; _crRender();
  }catch(e){ btn.disabled=false; btn.textContent='Try again'; toast('Add failed: '+(e.message||e)+(/parcel|amount|extra/.test(e.message||'')?' — run creation-lists.sql in Supabase first':''),'err'); }
}
window._crLiSave=_crLiSave;

// ----- 🕘 History of pastes + list imports (kept in app_config.column_mappings.creation_import_history) -----
async function _crLogImport(e){
  try{
    e.at=new Date().toISOString(); e.by=await _crMe(); e.cases=(e.cases||[]).slice(0,600);
    const r=await sb.from('app_config').select('column_mappings').eq('id',1).maybeSingle(); if(r.error) throw r.error;
    const cm=Object.assign({},(r.data&&r.data.column_mappings)||{});
    const arr=Array.isArray(cm.creation_import_history)?cm.creation_import_history.slice():[];
    arr.unshift(e); cm.creation_import_history=arr.slice(0,100);
    await sb.from('app_config').update({column_mappings:cm,updated_at:new Date().toISOString()}).eq('id',1);
  }catch(err){ console.warn('import history log',err); }
}
_CR.hist=_CR.hist||{ open:-1 };
async function _crHistRender(el,useCache){
  if(!el) return; const E=_reqEsc; let arr=[];
  let all;
  if(useCache&&_CR.hist.rows){ all=_CR.hist.rows; } else {
  try{ const r=await sb.from('app_config').select('column_mappings').eq('id',1).maybeSingle(); arr=(r.data&&r.data.column_mappings&&r.data.column_mappings.creation_import_history)||[]; }catch(_){}
  // Older batches (before the log existed): cases grouped by when they were added.
  let older=[];
  try{
    const since=arr.length?arr[arr.length-1].at:null;
    let q=sb.from('court_cases').select('case_number,county_code,created_at').order('created_at',{ascending:false}).limit(5000);
    if(since) q=q.lt('created_at',since);
    const r=await q; if(!r.error){ const m=new Map(); (r.data||[]).forEach(c=>{ if(!c.created_at) return; const k=c.created_at.slice(0,16); const g=m.get(k)||{at:c.created_at,cases:[],counties:new Set()}; g.cases.push(c.case_number); g.counties.add(c.county_code); m.set(k,g); });
      older=[...m.values()].slice(0,40).map(g=>({kind:'older',at:g.at,added:g.cases.length,counties:[...g.counties].filter(Boolean),cases:g.cases})); }
  }catch(_){}
  all=arr.concat(older); _CR.hist.rows=all; }
  if(!all.length){ el.innerHTML='<div style="padding:30px;text-align:center;color:var(--text-dim);border:1px dashed var(--border);border-radius:10px">No pastes or imports yet.</div>'; return; }
  const city=c=>{ const x=(_CR.counties||[]).find(k=>k.code===c); return x?x.city:c; };
  const when=t=>{ const d=new Date(t); return isNaN(d)?'':d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})+' · '+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}); };
  const byCase={}; (_CR.cases||[]).forEach(c=>{ byCase[c.case_number]=c; });
  const pill=(t,col)=>'<span style="font-size:11.5px;font-weight:700;color:'+col+';background:'+col+'1f;border:1px solid '+col+'55;border-radius:999px;padding:2px 8px;white-space:nowrap">'+t+'</span>';
  el.innerHTML='<div style="font-size:12.5px;color:var(--text-dim);margin-bottom:10px">Every MyCase paste and list import, newest first. Click one to see the cases it added.</div>'
   +'<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">'+all.map((h,i)=>{
     const icon=h.kind==='paste'?'⚖️ MyCase paste':h.kind==='list'?'📥 '+(h.label||'List import'):'🗂 Added';
     const sub=h.kind==='list'&&h.file?'<span style="color:var(--text-dim);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px">'+E(h.file)+'</span>':'';
     const stats=[pill(String(h.added||0)+' added','#22c55e')];
     if(h.scrap) stats.push(pill(h.scrap+' scrap','#ef4444'));
     if(h.fixed) stats.push(pill(h.fixed+' updated','#60a5fa'));
     if(h.have) stats.push(pill(h.have+' already here','#94a3b8'));
     if(h.ignored) stats.push(pill(h.ignored+' ignored','#94a3b8'));
     const open=_CR.hist.open===i;
     const list=open?'<div style="padding:8px 12px 12px 12px;background:var(--panel-2);border-top:1px solid var(--border)">'+((h.cases&&h.cases.length)?'<div style="max-height:300px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><tbody>'+h.cases.map(cn=>{ const c=byCase[cn]; return '<tr style="border-top:1px solid var(--border);'+(c?'cursor:pointer':'')+'" '+(c?'onclick="_crOpenAny(\''+E(c.id)+'\')"':'')+'><td style="padding:5px 8px;white-space:nowrap;font-weight:600">'+E(cn)+'</td><td style="padding:5px 8px;color:var(--text-dim)">'+E(c?(c.style||c.address||''):'')+'</td><td style="padding:5px 8px;white-space:nowrap;color:var(--text-dim)">'+E(c?(c.address||''):'')+'</td></tr>'; }).join('')+'</tbody></table></div>':'<div style="font-size:12.5px;color:var(--text-dim)">No new cases were added.</div>')+'</div>':'';
     return '<div style="border-top:'+(i?'1px solid var(--border)':'none')+'"><div onclick="_CR.hist.open=(_CR.hist.open==='+i+'?-1:'+i+');_crHistRender(document.getElementById(\'cr-hist\'),true)" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:9px 12px;cursor:pointer;font-size:13px">'
       +'<span style="width:12px;color:var(--text-dim)">'+(open?'▾':'▸')+'</span>'
       +'<span style="font-weight:700;white-space:nowrap">'+E(icon)+'</span>'+sub
       +'<span style="color:var(--text-dim);font-size:12px">'+E((h.counties||[]).map(city).join(', '))+'</span>'
       +'<span style="flex:1"></span>'+stats.join('')
       +'<span style="color:var(--text-dim);font-size:12px;white-space:nowrap;min-width:150px;text-align:right">'+E(when(h.at))+(h.by?' · '+E(String(h.by).split('@')[0]):'')+'</span>'
     +'</div>'+list+'</div>';
   }).join('')+'</div>';
}
window._crHistRender=_crHistRender;

// ↻ Refresh: spin the icon + dim the current view while it re-pulls, so you can see it working (nothing changes size).
async function _crRefresh(btn){
  if(_CR._refreshing) return; _CR._refreshing=true;
  if(!document.getElementById('cr-spin-css')){ const st=document.createElement('style'); st.id='cr-spin-css'; st.textContent='@keyframes crspin{to{transform:rotate(360deg)}} .cr-spinning .cr-spin-ico{animation:crspin .8s linear infinite}'; document.head.appendChild(st); }
  const body=document.getElementById('cr-body'); const t0=Date.now();
  if(btn){ btn.classList.add('cr-spinning'); btn.disabled=true; }
  if(body){ body.style.transition='opacity .15s'; body.style.opacity='.45'; body.style.pointerEvents='none'; }
  try{ _CR.loading=false; const _rq=(_crHasReq()&&typeof cache!=='undefined')?(cache.requests=null, loadRequests().catch(()=>{})):null; await _crLoad(true); if(_rq) await _rq; if(Date.now()-t0<450) await new Promise(r=>setTimeout(r,450-(Date.now()-t0)));
    _CR._refreshing=false; _crRender(); toast('↻ Refreshed — '+_CR.cases.length.toLocaleString()+' cases','ok'); }
  catch(e){ toast('Refresh failed: '+(e.message||e),'err'); }
  finally{ _CR._refreshing=false; const b=document.getElementById('cr-refresh'); if(b){ b.classList.remove('cr-spinning'); b.disabled=false; } const bd=document.getElementById('cr-body'); if(bd){ bd.style.opacity=''; bd.style.pointerEvents=''; } }
}
window._crRefresh=_crRefresh;

// Tracker: horizontal scrollbar sits ABOVE the table (synced with the table itself; the bottom one is hidden).
// ▶ panels fill exactly the visible width of the tracker box (no empty strip on the right)
function _crReqFit(){ const w=document.getElementById('cr-trk-wrap'); const vis=w?w.clientWidth:0;
  document.querySelectorAll('tr.cr-req-row > td > div').forEach(d=>{ const box=d.closest('#cr-trk-wrap')||d.closest('table').parentElement; const cw=(box&&box.clientWidth)||vis; if(cw) d.style.width=cw+'px'; }); }
window.addEventListener('resize',()=>{ if(_CR.tab==='tracker') _crReqFit(); });
function _crTrkScrollSync(){
  const top=document.getElementById('cr-trk-top'), wrap=document.getElementById('cr-trk-wrap'); if(!top||!wrap) return;
  if(!document.getElementById('cr-trk-css')){ const st=document.createElement('style'); st.id='cr-trk-css';
    st.textContent='#cr-trk-wrap::-webkit-scrollbar{display:none} tr.cr-trk-row>td{border-top:1px solid var(--border)} tbody>tr.cr-trk-row:first-child>td{border-top:0} #cr-trk-wrap thead th{border-bottom:1px solid var(--border)}';
    document.head.appendChild(st); }
  top.style.display=wrap.scrollWidth>wrap.clientWidth+1?'':'none';
  // One-way-at-a-time sync: whichever bar you're moving drives the other; no ping-pong between the two.
  let driver=null, raf=0;
  const follow=(from,to)=>{ if(driver&&driver!==from) return; driver=from; if(to.scrollLeft!==from.scrollLeft) to.scrollLeft=from.scrollLeft; _CR._trkLeft=from.scrollLeft;
    cancelAnimationFrame(raf); raf=requestAnimationFrame(()=>{ raf=requestAnimationFrame(()=>{ driver=null; }); }); };
  top.onscroll=()=>follow(top,wrap); wrap.onscroll=()=>follow(wrap,top);
  if(_CR._trkLeft){ wrap.scrollLeft=_CR._trkLeft; top.scrollLeft=_CR._trkLeft; }
  if(!_CR._trkFitBound){ _CR._trkFitBound=true; window.addEventListener('resize',()=>{ const t=document.getElementById('cr-trk-top'), w=document.getElementById('cr-trk-wrap'); if(t&&w) t.style.display=w.scrollWidth>w.clientWidth+1?'':'none'; }); }
}

// Small month / year picker: ◀ 2026 ▶ with a 3×4 grid of months (or a grid of years for tax sale). No long dropdowns.
function _crPickGrid(box,k,val,onPick){
  const now=new Date(); const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  box._y=box._y||(val?+String(val).slice(0,4):now.getFullYear());
  const cellSt=(on,dim)=>'height:30px;border-radius:7px;border:1px solid '+(on?'#6366f1':'var(--border)')+';background:'+(on?'rgba(99,102,241,0.25)':'var(--panel-2)')+';color:'+(dim?'var(--text-dim)':'var(--text)')+';font-size:12.5px;font-weight:'+(on?'800':'600')+';cursor:pointer';
  const navSt='height:28px;width:30px;border-radius:7px;border:1px solid var(--border);background:var(--panel-2);color:var(--text);cursor:pointer;font-size:12px';
  let h;
  if(k==='ts'){ const start=box._y-4; h='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><button type="button" data-nav="-6" style="'+navSt+'">◀</button><b style="font-size:13px">'+start+' – '+(start+5)+'</b><button type="button" data-nav="6" style="'+navSt+'">▶</button></div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px">'; for(let y=start;y<start+6;y++) h+='<button type="button" data-v="'+y+'" style="'+cellSt(String(val)===String(y),y>now.getFullYear()+1)+'">'+y+'</button>'; h+='</div>'; }
  else { h='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><button type="button" data-nav="-1" style="'+navSt+'">◀</button><b style="font-size:13px">'+box._y+'</b><button type="button" data-nav="1" style="'+navSt+'">▶</button></div>'
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px">'; MN.forEach((m,i)=>{ const v=box._y+'-'+String(i+1).padStart(2,'0'); const future=new Date(box._y,i,1)>new Date(now.getFullYear(),now.getMonth()+1,1); h+='<button type="button" data-v="'+v+'" style="'+cellSt(val===v,future)+'">'+m+'</button>'; }); h+='</div>'; }
  box.innerHTML=h;
  box.querySelectorAll('[data-nav]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); box._y+=+b.getAttribute('data-nav'); _crPickGrid(box,k,val,onPick); });
  box.querySelectorAll('[data-v]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); onPick(b.getAttribute('data-v')); });
}
function _crPickOpen(anchor,k,code){
  const old=document.getElementById('cr-pick'); if(old){ old.remove(); if(old._a===anchor) return; }
  const c=_CR.counties.find(x=>x.code===code); if(!c) return; const cur=(c.pulled||{})[k]||'';
  const pop=document.createElement('div'); pop.id='cr-pick'; pop._a=anchor; const r=anchor.getBoundingClientRect();
  pop.style.cssText='position:fixed;top:'+(r.bottom+6)+'px;left:'+Math.max(10,Math.min(window.innerWidth-250,r.left-60))+'px;z-index:100004;width:230px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:10px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-size:13px';
  pop.innerHTML='<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">'+_reqEsc(c.city)+' · '+_reqEsc(_CR_TYPES[k])+'</div><div id="cr-pick-grid"></div>'
    +(cur?'<button type="button" id="cr-pick-clear" style="margin-top:8px;width:100%;height:28px;border-radius:7px;border:1px solid var(--border);background:transparent;color:var(--text-dim);cursor:pointer;font-size:12px">Clear</button>':'');
  document.body.appendChild(pop);
  const save=async v=>{ pop.remove(); await _crSetPulled(code,k,{value:v}); const lbl=anchor.querySelector('span'); if(lbl){ lbl.textContent=_crPullLbl(v); anchor.style.color=v?'var(--text)':'var(--text-dim)'; } };
  _crPickGrid(pop.querySelector('#cr-pick-grid'),k,cur,save);
  const cl=pop.querySelector('#cr-pick-clear'); if(cl) cl.onclick=()=>save('');
  setTimeout(()=>{ const off=e=>{ if(!pop.contains(e.target)&&!anchor.contains(e.target)){ pop.remove(); document.removeEventListener('mousedown',off); } }; document.addEventListener('mousedown',off); },0);
}
window._crPickOpen=_crPickOpen;

// ----- 🧩 Map columns myself: pick which column is which when a list isn't recognised (remembered per layout, shared with the team) -----
const _CR_LI_FIELDS={
  common:[['address','Property address'],['city','City (optional)'],['owner','Owner'],['parcel','Parcel #'],['amount','Amount owed'],['date','Date (filed / opened)']],
  cv:[['viol','Violation'],['complied','Complied / closed date']],
  ul:[['lien','Lien type (optional)']],
  ts:[['sale_id','Sale / certificate ID'],['bid','Winning bid (NB = no bid)'],['assessed','Assessed value']]
};
const _CR_LI_GUESS={ address:/^(property )?(address|location|street|site|situs|property)/, city:/^city|^municipal/, owner:/owner|responsible|taxpayer|name/, parcel:/parcel|state number|pin|tax ?id|key ?no/,
  amount:[/total|balance|owed|due/,/face|minbid|min bid|amount/], date:/date|created|opened|filed|issued/, viol:/viol|description|type|code/, complied:/complied|closed|resolved/, lien:/charge|lien|utility|service/, sale_id:/sale id|certificate|cert/, bid:/bid|winner/, assessed:/assessed|av$|value/ };
function _crLiHeadRow(g){ let best=0, bn=-1; for(let r=0;r<Math.min(g.length,15);r++){ const row=(g[r]||[]); const n=row.filter(x=>String(x).trim()&&!/^[\d$.,\/\-\s]+$/.test(String(x))).length; if(n>bn){ bn=n; best=r; } } return best; }
function _crLiSig(row){ return (row||[]).map(x=>String(x==null?'':x).trim().toLowerCase()).filter(Boolean).join('|'); }
async function _crLiLayouts(){ try{ const r=await sb.from('app_config').select('column_mappings').eq('id',1).maybeSingle(); return (r.data&&r.data.column_mappings&&r.data.column_mappings.creation_list_layouts)||{}; }catch(_){ return {}; } }
function _crLiMapStart(){
  const L=_CR.li; if(!L.raw) return; const hr=_crLiHeadRow(L.raw);
  const prevType=L.P?L.P.fmt:(L.map&&L.map.type)||'';
  L.P=null; L.recs=null; L.map={ head:hr, type:prevType, cols:{} }; _crLiGuess(); _crRender();
}
window._crLiMapStart=_crLiMapStart;
function _crLiGuess(){
  const L=_CR.li, M=L.map; const head=(L.raw[M.head]||[]).map(x=>String(x==null?'':x).trim().toLowerCase()); M.cols={};
  const used=new Set(); const fields=_CR_LI_FIELDS.common.concat(_CR_LI_FIELDS.cv,_CR_LI_FIELDS.ul,_CR_LI_FIELDS.ts).map(f=>f[0]);
  fields.forEach(f=>{ for(const re of [].concat(_CR_LI_GUESS[f])){ const i=head.findIndex((h,ix)=>h&&!used.has(ix)&&re.test(h)); if(i>=0){ M.cols[f]=i; used.add(i); break; } } });
}
function _crLiMapPaint(){
  const box=document.getElementById('cr-li-map'); if(!box) return; const E=_reqEsc, L=_CR.li, M=L.map, g=L.raw;
  const head=(g[M.head]||[]); const ncol=Math.max(...g.slice(M.head,M.head+30).map(r=>r.length),head.length);
  const colName=i=>{ const h=String(head[i]==null?'':head[i]).trim(); return 'Col '+(i+1)+(h?' · '+h:''); };
  const sel='height:32px;font-size:13px;padding:0 8px;border-radius:7px;width:100%';
  const fields=_CR_LI_FIELDS.common.concat(_CR_LI_FIELDS[M.type]||[]);
  const opt=(f)=>'<select style="'+sel+'" onchange="_CR.li.map.cols[\''+f+'\']=this.value===\'\'?undefined:+this.value;_crLiMapPaint()"><option value="">— not in this file —</option>'+Array.from({length:ncol},(_,i)=>'<option value="'+i+'" '+(M.cols[f]===i?'selected':'')+'>'+E(colName(i))+'</option>').join('')+'</select>';
  const sample=g.slice(M.head+1).filter(r=>r.some(x=>String(x).trim())).slice(0,5);
  const show=(r,f)=>{ const i=M.cols[f]; if(i==null) return ''; let v=r[i]; if(v instanceof Date) v=_crLiIso(v); return String(v==null?'':v); };
  const ok=M.type&&M.cols.owner!=null&&(M.cols.address!=null||M.cols.parcel!=null);
  box.innerHTML='<div style="background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px">'
    +'<div style="font-weight:800;font-size:14px;margin-bottom:8px">🧩 Which column is which?</div>'
    +'<div style="display:grid;grid-template-columns:170px 1fr;gap:8px 10px;align-items:center;font-size:13px">'
      +'<div style="font-weight:700">List type</div><select style="'+sel+'" onchange="_CR.li.map.type=this.value;_crLiMapPaint()"><option value="">— pick —</option>'+_CR_LISTS.map(k=>'<option value="'+k+'" '+(M.type===k?'selected':'')+'>'+_CR_TYPES[k]+'</option>').join('')+'</select>'
      +'<div style="font-weight:700">Headers are in row</div><select style="'+sel+'" onchange="_CR.li.map.head=+this.value;_crLiGuess();_crLiMapPaint()">'+Array.from({length:Math.min(15,g.length)},(_,i)=>'<option value="'+i+'" '+(M.head===i?'selected':'')+'>Row '+(i+1)+' — '+E((g[i]||[]).filter(x=>String(x).trim()).slice(0,4).join(' | ').slice(0,60))+'</option>').join('')+'</select>'
      +(M.type?fields.map(f=>'<div style="font-weight:700">'+f[1]+(f[0]==='owner'?' *':'')+(f[0]==='address'||f[0]==='parcel'?' †':'')+'</div>'+opt(f[0])).join(''):'')
    +'</div>'
    +(M.type?'<div style="font-size:11.5px;color:var(--text-dim);margin-top:6px">* needed · † need at least one of these (Ahmed fills the address from the parcel when it’s missing)</div>':'')
    +(M.type&&sample.length?'<div style="margin-top:10px;overflow:auto;border:1px solid var(--border);border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'+fields.filter(f=>M.cols[f[0]]!=null).map(f=>'<th style="padding:5px 8px;text-align:left;color:var(--text-dim);font-size:11px">'+E(f[1].replace(/ \(.*\)/,''))+'</th>').join('')+'</tr></thead><tbody>'
      +sample.map(r=>'<tr style="border-top:1px solid var(--border)">'+fields.filter(f=>M.cols[f[0]]!=null).map(f=>'<td style="padding:5px 8px">'+E(show(r,f[0]))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'')
    +'<button type="button" class="btn btn-primary" '+(ok?'':'disabled ')+'onclick="_crLiMapUse(this)" style="width:100%;margin-top:10px;font-size:14px">Use these columns →</button>'
  +'</div>';
}
function _crLiFromMap(g,M,fileName){
  const C=M.cols||{}; const val=(r,f)=>{ const i=C[f]; if(i==null) return ''; const v=r[i]; return v==null?'':v; };
  const txt=(r,f)=>{ const v=val(r,f); return v instanceof Date?_crLiIso(v):String(v).trim(); };
  const rows=g.slice((M.head||0)+1).filter(r=>r&&r.some(x=>String(x).trim()));
  if(M.type==='cv'){ const grp={};
    rows.forEach(r=>{ const loc=txt(r,'address'); const owner=txt(r,'owner'); if(!loc&&!owner) return; const c=_crLiIso(val(r,'date')); const k=(loc||txt(r,'parcel')).toUpperCase()+'|'+String(c||'').slice(0,7);
      const x=grp[k]||(grp[k]={loc:loc,owner:owner,city:txt(r,'city'),viol:[],filed:null,complied:'',open:false});
      const v=txt(r,'viol'); if(v&&x.viol.indexOf(v)<0) x.viol.push(v); if(c&&(!x.filed||c<x.filed)) x.filed=c;
      const d=_crLiIso(val(r,'complied')); if(d) x.complied=d; else x.open=true; });
    return { fmt:'cv', label:'Code violations', hasCity:C.city!=null, items:Object.values(grp).map(x=>({loc:x.loc,owner:x.owner,city:x.city,viol:x.viol.join(', '),filed:x.filed,complied:x.open?'':x.complied})) };
  }
  if(M.type==='ul') return { fmt:'ul', label:'Utility liens', items:rows.map(r=>({ parcel:txt(r,'parcel'), addr:txt(r,'address'), city:txt(r,'city'), owner:txt(r,'owner'), filed:_crLiIso(val(r,'date')), amount:_crLiMoney(val(r,'amount')), lien:txt(r,'lien') })).filter(x=>x.owner&&(x.parcel||x.addr)) };
  if(M.type==='ts') return { fmt:'ts', label:'Tax sale', items:rows.map(r=>{ const b=txt(r,'bid'); return { sale_id:txt(r,'sale_id'), parcel:txt(r,'parcel'), owner:txt(r,'owner'), street:txt(r,'address'), city:txt(r,'city'), district:'', amount:_crLiMoney(val(r,'amount')),
      bid:/^nb$/i.test(b)?'NB':(_crLiMoney(b)!=null?_crLiMoney(b):b), assessed:_crLiMoney(val(r,'assessed')), legal:'', inactive:/inactive/i.test(fileName||'') }; }).filter(x=>x.owner&&(x.parcel||x.street||x.sale_id)) };
  return null;
}
async function _crLiMapUse(btn){
  const L=_CR.li, M=L.map; const P=_crLiFromMap(L.raw,M,L.file);
  if(!P||!P.items.length){ toast('No rows came out with those columns — check Owner and Address / Parcel','warn'); return; }
  btn.disabled=true; btn.textContent='Saving layout…';
  // remember this layout for next time (shared with everyone)
  try{ const sig=_crLiSig(L.raw[M.head]); if(sig){ const r=await sb.from('app_config').select('column_mappings').eq('id',1).maybeSingle(); const cm=Object.assign({},(r.data&&r.data.column_mappings)||{});
      cm.creation_list_layouts=Object.assign({},cm.creation_list_layouts||{}); cm.creation_list_layouts[sig]={ type:M.type, cols:M.cols };
      await sb.from('app_config').update({column_mappings:cm,updated_at:new Date().toISOString()}).eq('id',1); } }catch(_){}
  L.P=P; L.map=null;
  const guess=P.fmt==='ul'&&P.items[0].parcel&&/^\d{2}-/.test(P.items[0].parcel)?P.items[0].parcel.slice(0,2):P.fmt==='ts'&&/^\d{2}/.test(P.items[0].sale_id||'')?P.items[0].sale_id.slice(0,2):'';
  if(!L.county) L.county=_CR.counties.some(c=>c.code===guess)?guess:'';
  await _crLiPreview();
}
window._crLiMapUse=_crLiMapUse;

// County search box on the list importer: type a city, county or code and pick from the matches.
function _crLiCtyList(){
  const inp=document.getElementById('cr-li-cty'), box=document.getElementById('cr-li-cty-list'); if(!inp||!box) return;
  const q=inp.value.trim().toLowerCase().replace(/^(\d{2}) · .*/,'$1');
  const hits=_CR.counties.filter(c=>!q||c.code===q||String(c.city).toLowerCase().includes(q)||String(c.county).toLowerCase().includes(q)||(q.length<=2&&c.code.startsWith(q))).slice(0,12);
  _CR.li._hits=hits; _CR.li._hi=0;
  box.innerHTML=(hits.length?hits.map((c,i)=>'<div data-i="'+i+'" onmousedown="event.preventDefault();_crLiCtyPick(\''+c.code+'\')" style="padding:8px 10px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;'+(i===0?'background:var(--panel-2)':'')+'" onmouseover="this.style.background=\'var(--panel-2)\'" onmouseout="this.style.background=\'\'">'+_crCodeBadge(c)+'<b>'+_reqEsc(c.city)+'</b><span style="color:var(--text-dim)">'+_reqEsc(c.county)+(c.active?'':' · inactive')+'</span></div>').join(''):'<div style="padding:10px;color:var(--text-dim);font-size:13px">No county matches “'+_reqEsc(inp.value)+'”</div>')
    +(!_CR.li.needCounty&&_CR.li.county?'<div onmousedown="event.preventDefault();_crLiCtyPick(\'\')" style="padding:8px 10px;cursor:pointer;font-size:12.5px;color:#60a5fa;border-top:1px solid var(--border)">↺ Use the county from the file</div>':'');
  box.style.display='';
}
function _crLiCtyKey(e){
  const box=document.getElementById('cr-li-cty-list'); const L=_CR.li; if(!box||!L._hits) return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); L._hi=Math.max(0,Math.min(L._hits.length-1,L._hi+(e.key==='ArrowDown'?1:-1))); box.querySelectorAll('[data-i]').forEach(d=>d.style.background=+d.getAttribute('data-i')===L._hi?'var(--panel-2)':''); }
  else if(e.key==='Enter'){ e.preventDefault(); const c=L._hits[L._hi]; if(c) _crLiCtyPick(c.code); }
  else if(e.key==='Escape'){ box.style.display='none'; }
}
function _crLiCtyPick(code){ _CR.li.county=code; const b=document.getElementById('cr-li-cty-list'); if(b) b.style.display='none'; _crLiPreview(); }
window._crLiCtyList=_crLiCtyList; window._crLiCtyKey=_crLiCtyKey; window._crLiCtyPick=_crLiCtyPick;

function _crTsStatus(ex){ ex=ex||{}; return ex.inactive?'Pulled pre-sale (inactive)':/^nb$/i.test(String(ex.bid||''))?'No bid':ex.bid_at_min?'No bid (bid = minimum)':(ex.bid!==''&&ex.bid!=null)?'Sold':''; }

// 📍 Maps next to the property address: searches Google Maps for exactly what's typed in the box right now.
function _crMapsFor(btn){
  const inp=document.querySelector('#cr-editor [data-f="address"]'); const a=String(inp&&inp.value||'').trim();
  if(!a||/^(unknown|land)$/i.test(a)){ toast('Type the address first','warn'); if(inp) inp.focus(); return; }
  window.open('https://www.google.com/maps/search/'+encodeURIComponent(a),'_blank','noopener');
}
window._crMapsFor=_crMapsFor;

// "Hoover, David E, SR" → "David Hoover";  "JONES, MILDRED ALICE & THACKER, JEREMIA" → "Mildred Jones";  "John Q Smith Jr" → "John Smith"
function _crFirstLast(raw,lastFirst){   // lastFirst: county records write "COWAN BRIAN" (last name first, no comma)
  let n=String(raw||'').split(/\s+&\s+|\s+and\s+|;|\//i)[0].replace(/\(.*?\)/g,' ').replace(/\b(estate of|et al|deceased|dec'?d|trustee|c\/o.*)\b/ig,' ').trim();
  const suf=/^(jr|sr|ii|iii|iv|v|md|esq)\.?$/i;
  let first='', last='';
  if(n.indexOf(',')>=0){ const parts=n.split(',').map(x=>x.trim()).filter(Boolean); last=(parts[0]||'').split(/\s+/).filter(w=>!suf.test(w)).pop()||parts[0]||'';
    const rest=(parts.slice(1).join(' ')).split(/\s+/).filter(w=>w&&!suf.test(w)&&!/^[a-z]\.?$/i.test(w)); first=rest[0]||''; }
  else { const w=n.split(/\s+/).filter(x=>x&&!suf.test(x)); if(lastFirst&&w.length>1){ last=w[0]; first=w[1]; } else { first=w[0]||''; last=w.length>1?w[w.length-1]:''; } }
  const cap=x=>x?x.charAt(0).toUpperCase()+x.slice(1).toLowerCase():'';
  return (cap(first)+' '+cap(last)).trim()||String(raw||'').trim();
}
