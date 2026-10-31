/* Data LAB light mode. Dark stays exactly as it was: nothing here runs or applies unless light mode is on.
   Light mode = light values for the shared color variables + an automatic pass that fixes hard-coded
   dark colors (dark panels → light, faint white overlays → faint grey, pale text → darker shade of the same color). */
(function(){
  var KEY='labb_theme', root=document.documentElement, on=false;
  try{ on=localStorage.getItem(KEY)==='light'; }catch(_){}
  if(on) root.setAttribute('data-theme','light');
  var base=document.createElement('style'); base.id='lt-base';
  base.textContent='html[data-theme="light"]{--bg:#f3f5f9;--panel:#ffffff;--panel-2:#eef1f6;--border:#d3d9e4;--text:#111827;--text-dim:#5b6475;color-scheme:light}'
    +'html[data-theme="light"] body{background:var(--bg);color:var(--text)}'
    +'html[data-theme="light"] input::placeholder,html[data-theme="light"] textarea::placeholder{color:#8a93a3}'
    +'html[data-theme="light"] input[type="date"]::-webkit-calendar-picker-indicator{filter:none!important}'
    +'#theme-toggle{padding:5px 10px;font-size:15px;line-height:1}';
  (document.head||root).appendChild(base);

  // ---------- color helpers ----------
  var cv=document.createElement('canvas').getContext('2d');
  function parse(v){
    if(!v) return null; v=String(v).trim(); var m=v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if(!m){ if(/^(transparent|inherit|initial|unset|currentcolor|none)$/i.test(v)||/var\(|gradient|url\(/i.test(v)) return null;
      cv.fillStyle='#010203'; cv.fillStyle=v; var f=cv.fillStyle; if(f==='#010203'&&!/^#010203$/i.test(v)) return null; return parse(f.charAt(0)==='#'?hexRgb(f):f); }
    var a=m[4]==null?1:(/%$/.test(m[4])?parseFloat(m[4])/100:parseFloat(m[4]));
    return {r:+m[1],g:+m[2],b:+m[3],a:a};
  }
  function hexRgb(h){ return 'rgb('+parseInt(h.substr(1,2),16)+','+parseInt(h.substr(3,2),16)+','+parseInt(h.substr(5,2),16)+')'; }
  function str(c){ return c.a>=1?'rgb('+Math.round(c.r)+','+Math.round(c.g)+','+Math.round(c.b)+')':'rgba('+Math.round(c.r)+','+Math.round(c.g)+','+Math.round(c.b)+','+(+c.a.toFixed(3))+')'; }
  function hsl(c){ var r=c.r/255,g=c.g/255,b=c.b/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,h=0,s=0,d=mx-mn;
    if(d){ s=l>.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); h/=6; } return {h:h,s:s,l:l,a:c.a}; }
  function rgb(x){ var h=x.h,s=x.s,l=x.l,r,g,b; if(!s){ r=g=b=l; } else { var q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
      var f=function(t){ if(t<0)t+=1; if(t>1)t-=1; return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p; }; r=f(h+1/3); g=f(h); b=f(h-1/3); }
    return {r:r*255,g:g*255,b:b*255,a:x.a}; }
  function lum(c){ var f=function(v){ v/=255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4); }; return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b); }
  function contrast(a,b){ var x=lum(a),y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
  function over(top,bot){ var a=top.a; return {r:top.r*a+bot.r*(1-a),g:top.g*a+bot.g*(1-a),b:top.b*a+bot.b*(1-a),a:1}; }
  var PAGE={r:243,g:245,b:249,a:1};
  // dark surfaces → light, faint white overlays → faint grey; colored/mid tones are left alone
  function mapBg(c,fixed){ if(!c||c.a===0) return null; var x=hsl(c);
    if(fixed&&x.a<.92&&x.l<.35) return null;   // modal backdrops stay dark
    if(x.l>.85&&x.a<.5) return {r:15,g:23,b:42,a:Math.min(.1,x.a*.9)};
    if(x.a<.6) return null;
    if(x.s<.25&&x.l<.32) return rgb({h:x.h,s:x.s*.6,l:1-x.l*.5,a:x.a});
    if(x.l<.3) return rgb({h:x.h,s:Math.min(x.s,.55),l:.94-x.l*.25,a:x.a});
    return null; }
  function mapBorder(c){ if(!c||c.a===0) return null; var x=hsl(c);
    if(x.l>.85&&x.a<.6) return {r:15,g:23,b:42,a:Math.min(.18,x.a*1.2)};
    if(x.a<.4) return null;
    if(x.s<.25&&x.l<.36) return rgb({h:x.h,s:x.s*.6,l:.85-x.l*.25,a:1});
    if(x.l<.3) return rgb({h:x.h,s:Math.min(x.s,.6),l:.75,a:1});
    return null; }
  function fixText(c,bg){ if(!c||c.a===0) return null; var solid=over(c,bg); if(contrast(solid,bg)>=3.2) return null;
    if(lum(bg)<.4) return null; var x=hsl(c); x.a=1; if(x.s<.12) x.s=Math.min(x.s,.1);
    for(var l=Math.min(x.l,.48);l>=.12;l-=.04){ var t=rgb({h:x.h,s:x.s,l:l,a:1}); if(contrast(t,bg)>=4.5) return t; }
    return rgb({h:x.h,s:x.s,l:.12,a:1}); }
  function mapGrad(v){ if(!/gradient/i.test(v)) return null; var ch=false;
    var out=v.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi,function(m){ var c=parse(m), n=c&&mapBg(c.a<.6?{r:c.r,g:c.g,b:c.b,a:1}:c); if(n){ ch=true; n.a=c.a; return str(n); } return m; });
    return ch?out:null; }

  // ---------- per-element pass ----------
  var SKIP={SCRIPT:1,STYLE:1,svg:1,SVG:1,IMG:1,CANVAS:1,IFRAME:1,VIDEO:1,LINK:1,META:1,NOSCRIPT:1,TEMPLATE:1,BR:1,path:1};
  var PROPS=['color','background-color','background-image','border-top-color','border-right-color','border-bottom-color','border-left-color','outline-color'];
  function skip(el){ return SKIP[el.tagName]||(el.closest&&el.closest('svg,.gm-style,.leaflet-container,[data-no-theme]')); }
  function setP(el,p,v){ if(!el.__lt){ el.__lt={}; el.setAttribute('data-lt',''); } if(!(p in el.__lt)) el.__lt[p]=[el.style.getPropertyValue(p),el.style.getPropertyPriority(p)];
    el.__ltSet=el.__ltSet||{}; el.__ltSet[p]=v; el.style.setProperty(p,v,'important'); }
  function restore(el){ var o=el.__lt; if(!o) return; for(var p in o){ if(o[p][0]) el.style.setProperty(p,o[p][0],o[p][1]); else el.style.removeProperty(p); }
    el.__lt=null; el.__ltSet=null; el.removeAttribute('data-lt'); }
  var memo=new Map();
  function bgOf(n){ if(!n||n===document.documentElement||n.nodeType!==1) return PAGE; if(memo.has(n)) return memo.get(n);
    var c=parse(getComputedStyle(n).backgroundColor), r=(c&&c.a>0)?(c.a>=.95?{r:c.r,g:c.g,b:c.b,a:1}:over(c,bgOf(n.parentElement))):bgOf(n.parentElement); memo.set(n,r); return r; }
  function hasText(el){ if(/^(INPUT|TEXTAREA|SELECT|BUTTON|OPTION)$/.test(el.tagName)) return true; for(var n=el.firstChild;n;n=n.nextSibling) if(n.nodeType===3&&/\S/.test(n.nodeValue)) return true; return false; }
  function doEl(el){
    if(el.nodeType!==1||skip(el)) return; var cs=getComputedStyle(el);
    var bc=parse(cs.backgroundColor), nb=mapBg(bc,cs.position==='fixed'); if(nb) setP(el,'background-color',str(nb));
    var bi=cs.backgroundImage; if(bi&&bi!=='none'){ var g=mapGrad(bi); if(g) setP(el,'background-image',g); }
    ['top','right','bottom','left'].forEach(function(s){ if(parseFloat(cs['border-'+s+'-width'])>0){ var n=mapBorder(parse(cs['border-'+s+'-color'])); if(n) setP(el,'border-'+s+'-color',str(n)); } });
    if(hasText(el)){ memo.delete(el); var bg=bgOf(el);
      var t=fixText(parse(cs.color),bg); if(t) setP(el,'color',str(t)); }
  }
  var q=[], qset=new Set(), sched=false, obs=null;
  function queue(el){ if(el&&el.nodeType===1&&!qset.has(el)){ qset.add(el); q.push(el); } if(!sched){ sched=true; requestAnimationFrame(run); } }
  var work=[];
  function run(){ sched=false; if(!on){ q=[]; qset.clear(); work=[]; return; } var t0=performance.now();
    while(performance.now()-t0<24){
      if(!work.length){ if(!q.length) break; var r=q.shift(); qset.delete(r); if(!r.isConnected) continue; work=[r].concat(Array.prototype.slice.call(r.getElementsByTagName('*'))); }
      var n=Math.min(work.length,150); for(var i=0;i<n;i++){ var e=work[i]; if(e.isConnected) doEl(e); } work=work.slice(n); }
    memo.clear(); if(obs) obs.takeRecords();
    if(q.length||work.length){ sched=true; requestAnimationFrame(run); } }
  function onMut(list){ if(!on) return;
    list.forEach(function(m){
      if(m.type==='childList'){ m.addedNodes.forEach(function(n){ if(n.nodeType===1) queue(n); else if(n.nodeType===3&&m.target.nodeType===1) queue(m.target); }); }
      else if(m.type==='attributes'){ var el=m.target;
        if(m.attributeName==='style'&&el.__ltSet){ for(var p in el.__ltSet){ var cur=el.style.getPropertyValue(p); if(cur!==el.__ltSet[p]){ el.__lt[p]=[cur,el.style.getPropertyPriority(p)]; } } }
        if(el.querySelectorAll){ restoreTree(el); } queue(el); } });
    if(obs) obs.takeRecords(); }
  function restoreTree(el){ restore(el); var l=el.querySelectorAll('[data-lt]'); for(var i=0;i<l.length;i++) restore(l[i]); }
  // hover/focus rules from style sheets (the per-element pass can't see those states)
  function sheetPass(){ var out=[];
    function walk(rules,wrap){ for(var i=0;i<rules.length;i++){ var r=rules[i];
      if(r.cssRules&&r.media){ walk(r.cssRules,'@media '+r.media.mediaText); continue; }
      if(!r.selectorText||!/:(hover|focus|active|focus-within)/.test(r.selectorText)||/data-theme/.test(r.selectorText)) continue;
      var dec=[], st=r.style;
      var bgv=st.getPropertyValue('background-color')||st.getPropertyValue('background'), c=parse(bgv), n=c&&mapBg(c); if(n) dec.push('background-color:'+str(n)+'!important');
      var bdv=st.getPropertyValue('border-color')||st.getPropertyValue('border-top-color'), b=parse(bdv), nb=b&&mapBorder(b); if(nb) dec.push('border-color:'+str(nb)+'!important');
      var tc=parse(st.getPropertyValue('color')); if(tc){ var bgc=n||c; var t=fixText(tc,bgc&&bgc.a>.5?over(bgc,{r:255,g:255,b:255,a:1}):{r:255,g:255,b:255,a:1}); if(t) dec.push('color:'+str(t)+'!important'); }
      if(dec.length){ var sel=r.selectorText.split(',').map(function(s){ s=s.trim(); return /^(html|:root)\b/.test(s)?s.replace(/^(html|:root)/,'html[data-theme="light"]'):'html[data-theme="light"] '+s; }).join(',');
        var rule=sel+'{'+dec.join(';')+'}'; out.push(wrap?wrap+'{'+rule+'}':rule); } } }
    for(var i=0;i<document.styleSheets.length;i++){ var sh=document.styleSheets[i]; if(sh.ownerNode&&sh.ownerNode.id==='lt-sheet') continue; try{ walk(sh.cssRules,''); }catch(_){ } }
    var el=document.getElementById('lt-sheet'); if(!el){ el=document.createElement('style'); el.id='lt-sheet'; document.head.appendChild(el); } el.textContent=out.join('\n'); }
  var sheetT=null;
  function start(){ if(!document.body) return; sheetPass();
    if(!obs) obs=new MutationObserver(onMut);
    obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
    if(!start.headObs){ start.headObs=new MutationObserver(function(){ if(!on) return; clearTimeout(sheetT); sheetT=setTimeout(sheetPass,200); }); start.headObs.observe(document.head,{childList:true,subtree:true,characterData:true}); }
    queue(document.body); }
  function stop(){ if(obs) obs.disconnect(); q=[]; qset.clear(); work=[]; var l=document.querySelectorAll('[data-lt]'); for(var i=0;i<l.length;i++) restore(l[i]);
    var s=document.getElementById('lt-sheet'); if(s) s.textContent=''; }
  function paintBtn(){ var b=document.getElementById('theme-toggle'); if(b){ b.textContent=on?'🌙':'☀️'; b.title=on?'Switch to dark mode':'Switch to light mode'; } }
  function set(mode){ on=mode==='light'; try{ localStorage.setItem(KEY,on?'light':'dark'); }catch(_){}
    if(on){ root.setAttribute('data-theme','light'); start(); } else { stop(); root.removeAttribute('data-theme'); } paintBtn(); }
  function addBtn(){ if(document.getElementById('theme-toggle')) return;
    var slot=document.querySelector('[data-theme-slot]')||(function(){ var tb=document.getElementById('top-bar'); return tb&&tb.lastElementChild; })(); if(!slot) return;
    var b=document.createElement('button'); b.type='button'; b.id='theme-toggle'; b.className='btn btn-ghost text-sm'; b.setAttribute('data-no-theme','');
    b.onclick=function(){ set(on?'dark':'light'); }; slot.appendChild(b); paintBtn(); }
  window.labbTheme={ set:set, get:function(){ return on?'light':'dark'; } };
  function ready(){ addBtn(); if(on) start(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ready); else ready();
})();
