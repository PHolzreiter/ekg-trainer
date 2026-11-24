/* EKG-Trainer – Erregungsleitung als Schema (Vierkammerblick von vorne: rechts im Bild = linke Körperseite).
   Reizleitungssystem: Sinusknoten, internodale Bahnen, Bachmann-Bündel, AV-Knoten, His-Bündel,
   rechter Schenkel mit Moderatorband, linker Schenkel mit linksanteriorem und linksposteriorem Faszikel,
   septalen Fasern und Purkinje-Fasern.
   Je Schlag wird aus den Ereignissen der Engine berechnet, welche Bahnen leiten; im Muskel läuft die
   Erregung von Zelle zu Zelle (kürzester Weg), im Leitungssystem etwa viermal schneller. */
(function(root){'use strict';
const W=610,H=500,TX=100,TY=-26,GS=4,TAU=Math.PI*2,VP=4,PMJ=3;
const P={
 atr:[[90,212],[68,165],[92,105],[150,78],[200,90],[222,100],[262,80],[330,88],[374,135],[366,175],[352,186],[300,196],[224,203],[150,208]],
 ra:[[104,203],[86,165],[106,115],[152,95],[198,105],[211,127],[213,196],[150,199]],
 la:[[235,195],[233,125],[262,97],[326,103],[358,138],[351,172],[338,181],[290,189]],
 ven:[[90,226],[84,290],[128,380],[200,428],[252,444],[310,420],[360,360],[380,285],[366,216],[352,200],[300,209],[224,216],[150,221]],
 rv:[[104,238],[211,230],[214,290],[220,350],[232,398],[175,385],[125,330],[100,282]],
 lv:[[252,228],[330,218],[346,285],[322,360],[268,408],[246,360],[240,290]]};
const SA=[110,116],AVN=[223,199],HISA=[224,206],HISB=[228,236],LB=[240,256],APL=[356,192],APR=[88,219],RVAPEX=[214,392];
const TRACTS={ant:[SA,[150,90],[196,99],[219,135],AVN],mid:[SA,[162,142],[204,178],AVN],post:[SA,[82,165],[116,203],[188,204],AVN],bach:[[156,90],[224,97],[272,88],[334,98]]};
/* Kammer-Leitungssystem: [Name, Punkte, Elternteil, leitet in den Muskel?] */
const TREE=[
 ['his',[HISA,HISB],null,0],
 ['rbb',[HISB,[221,290],[222,342]],'his',0],
 ['mod',[[222,342],[180,360],[132,352]],'rbb',0],
 ['rvp1',[[132,352],[108,310],[100,262],[103,240]],'mod',1],
 ['rvp2',[[132,352],[160,386],[205,398],[232,394]],'mod',1],
 ['rapx',[[222,342],[228,372],[232,394]],'rbb',1],
 ['lbb',[HISB,LB],'his',0],
 ['sept',[[241,262],[243,292],[246,318]],'lbb',1],
 ['laf',[LB,[274,248],[312,238],[333,246]],'lbb',0],
 ['lafp1',[[333,246],[344,282],[343,310]],'laf',1],
 ['lafp2',[[333,246],[300,228],[262,228]],'laf',1],
 ['lpf',[LB,[254,312],[266,362],[292,392]],'lbb',0],
 ['lpfp1',[[292,392],[322,364],[340,322],[343,310]],'lpf',1],
 ['lpfp2',[[292,392],[266,406],[250,385]],'lpf',1]];
const NAME={rbb:'rechter Schenkel',lbb:'linker Schenkel',laf:'linksanteriorer Faszikel',lpf:'linksposteriorer Faszikel'};
const LABELS=[ /* [Text, Ankerpunkt, Seite, y der Beschriftung] */
 ['Sinusknoten',SA,'l',96],['Internodale Bahnen',[84,170],'l',150],['AV-Knoten',AVN,'l',196],['His-Bündel',[226,222],'l',228],
 ['Rechter Schenkel',[221,292],'l',282],['Moderatorband',[176,361],'l',336],['Purkinje-Fasern',[160,386],'l',392],
 ['Bachmann-Bündel',[300,93],'r',70],['Linker Schenkel',[236,250],'r',214],['Linksant. Faszikel',[300,240],'r',244],
 ['Septale Fasern',[244,300],'r',300],['Linkspost. Faszikel',[262,350],'r',356],['Purkinje-Fasern',[338,330],'r',398]];
function smooth(pts){const p=new Path2D(),n=pts.length;for(let i=0;i<n;i++){const a=pts[(i+n-1)%n],b=pts[i],c=pts[(i+1)%n],d=pts[(i+2)%n];if(i===0)p.moveTo(b[0],b[1]);
  p.bezierCurveTo(b[0]+(c[0]-a[0])/6,b[1]+(c[1]-a[1])/6,c[0]-(d[0]-b[0])/6,c[1]-(d[1]-b[1])/6,c[0],c[1]);}p.closePath();return p;}
function resample(poly,step){const out=[];let acc=0;for(let i=0;i<poly.length-1;i++){const a=poly[i],b=poly[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.round(L/step));for(let k=0;k<n;k++)out.push({x:a[0]+(b[0]-a[0])*k/n,y:a[1]+(b[1]-a[1])*k/n,s:acc+L*k/n});acc+=L;}const e=poly[poly.length-1];out.push({x:e[0],y:e[1],s:acc});out.len=acc;return out;}
const at=(ln,u)=>{const s=u*ln.len;let p=ln[0];for(const q of ln)if(q.s<=s)p=q;return p;};
const lerp=(a,b,k)=>a+(b-a)*k,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),fract=x=>x-Math.floor(x);
const REST=[236,190,182],FRONT=[255,226,60],EXC=[238,118,52],REF=[190,150,210];
function mixc(c1,c2,k){k=clamp(k,0,1);return [lerp(c1[0],c2[0],k),lerp(c1[1],c2[1],k),lerp(c1[2],c2[2],k)];}
/* Farbe einer Zelle: dt seit Erregung, apd = Dauer bis Ruhe */
function shade(dt,apd){if(dt<0||dt>apd)return null;if(dt<.012)return FRONT;if(dt<.035)return mixc(FRONT,EXC,(dt-.012)/.023);const k=dt/apd;if(k<.7)return EXC;if(k<.86)return mixc(EXC,REF,(k-.7)/.16);return mixc(REF,REST,(k-.86)/.14);}

class Heart2D{
  constructor(host){this.host=host;host.classList.add('h2d');
    host.innerHTML='<div class="h2d-title"></div><div class="h2d-cv"><canvas></canvas></div><div class="h2d-cap"></div><div class="h2d-leg"><span><i style="background:#ffe23c"></i>Erregungsfront</span><span><i style="background:#ee7634"></i>erregt</span><span><i style="background:#be96d2"></i>Rückbildung</span><span><i style="background:#ecbeb6"></i>Ruhe</span><span><i style="background:#2c6e73"></i>Leitungssystem</span></div>';
    this.cv=host.querySelector('canvas');this.ctx=this.cv.getContext('2d');this.elT=host.querySelector('.h2d-title');this.elC=host.querySelector('.h2d-cap');
    this.opt={vector:true,axis:true,labels:true};this.lead='II';this.t=0;this.ecg=null;this.ev=null;this.fc={};
    this.path={};for(const k in P)this.path[k]=smooth(P[k]);
    this.wallA=new Path2D();this.wallA.addPath(this.path.atr);this.wallA.addPath(this.path.ra);this.wallA.addPath(this.path.la);
    this.wallV=new Path2D();this.wallV.addPath(this.path.ven);this.wallV.addPath(this.path.rv);this.wallV.addPath(this.path.lv);
    this.gx0=60;this.gy0=60;this.gw=Math.ceil(340/GS);this.gh=Math.ceil(400/GS);
    this.A=this._cells(this.wallA);this.V=this._cells(this.wallV);
    this.off=document.createElement('canvas');this.off.width=this.gw;this.off.height=this.gh;this.octx=this.off.getContext('2d');this.img=this.octx.createImageData(this.gw,this.gh);
    this.tr={};for(const k in TRACTS)this.tr[k]=resample(TRACTS[k],4);
    this.tree={};for(const [n,pts,par,emit] of TREE){const ln=resample(pts,4);ln.name=n;ln.par=par;ln.emit=!!emit;this.tree[n]=ln;}
    this.zoneCache={};
    new ResizeObserver(()=>this._size()).observe(this.cv.parentNode);this._size();}
  _cells(path){const c=document.createElement('canvas').getContext('2d'),list=[],idx=new Map();
    for(let gy=0;gy<this.gh;gy++)for(let gx=0;gx<this.gw;gx++){const x=this.gx0+gx*GS+GS/2,y=this.gy0+gy*GS+GS/2;if(c.isPointInPath(path,x,y,'evenodd')){idx.set(gx+','+gy,list.length);list.push({x,y,gx,gy});}}
    const nb=list.map(p=>{const o=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const j=idx.get((p.gx+dx)+','+(p.gy+dy));if(j!=null)o.push([j,Math.hypot(dx,dy)*GS]);}return o;});
    return {list,nb,near:(x,y)=>{let b=0,bd=1e9;for(let i=0;i<list.length;i++){const d=(list[i].x-x)**2+(list[i].y-y)**2;if(d<bd){bd=d;b=i;}}return b;}};}
  /* kürzeste Laufzeit im Muskel ab Quellen [{i,t}] (Einheit: Pixel Muskelweg) */
  _dijkstra(C,src){const n=C.list.length,t=new Float32Array(n).fill(1e9),done=new Uint8Array(n);for(const s of src)if(s.t<t[s.i])t[s.i]=s.t;
    for(;;){let b=-1,bt=1e9;for(let i=0;i<n;i++)if(!done[i]&&t[i]<bt){bt=t[i];b=i;}if(b<0)break;done[b]=1;for(const [j,d] of C.nb[b]){const nt=bt+d;if(nt<t[j])t[j]=nt;}}return t;}
  _norm(t){let mn=1e9,mx=0;for(const v of t){if(v<mn)mn=v;if(v<1e8&&v>mx)mx=v;}const f=new Float32Array(t.length);for(let i=0;i<t.length;i++)f[i]=t[i]>1e8?1:(t[i]-mn)/((mx-mn)||1);return {f,mn,mx};}
  /* Ankunftszeiten im Leitungssystem; blk = blockierte Bahnen; delay verschiebt das ganze System (Präexzitation) */
  _treeTimes(blk,delay){const T={},end=ln=>ln[ln.length-1];
    const base=n=>{const ln=this.tree[n];if(!ln.par)return delay;const p=T[ln.par];return p==null?null:p+this.tree[ln.par].len/VP;};
    for(const [n] of TREE){const ln=this.tree[n];const parBlocked=ln.par&&T[ln.par]==null;if(parBlocked||blk[n]){T[n]=null;continue;}T[n]=base(n);}
    /* Purkinje-Netz: ist ein Faszikel blockiert, erreicht die Erregung sein Gebiet verspätet über das Netz des anderen Faszikels */
    const via=(dst,src,ends)=>{if(T[dst]!=null||T[src]==null||blk.lbb)return;const s=this.tree[src],a=end(s),d=this.tree[dst],b=d[0];const t=T[src]+s.len/VP+Math.hypot(a.x-b.x,a.y-b.y)/VP*1.25;
      for(const k of ends){T[k]=t;}T[dst]=t-this.tree[dst].len/VP;T['_via_'+dst]=1;};
    if(blk.laf&&!blk.lbb&&T.lpf!=null){const t=T.lpf+this.tree.lpf.len/VP+this.tree.lpfp1.len/VP;T.lafp1=t+2;T.lafp2=t+2+this.tree.lafp1.len/VP;this._rev={lafp1:1};}
    else if(blk.lpf&&!blk.lbb&&T.laf!=null){const t=T.laf+this.tree.laf.len/VP+this.tree.lafp1.len/VP;T.lpfp1=t+2;T.lpfp2=t+2+this.tree.lpfp1.len/VP;this._rev={lpfp1:1};}
    else this._rev={};
    void via;return T;}
  _vf(key,o){if(this.fc[key])return this.fc[key];const C=this.V,src=[];
    if(o.pt){src.push({i:C.near(o.pt.x,o.pt.y),t:0});const r=this._norm(this._dijkstra(C,src));r.T=null;return this.fc[key]=r;}
    const T=this._treeTimes(o.blk||{},o.delay||0),rev=Object.assign({},this._rev);
    for(const [n] of TREE){const ln=this.tree[n];if(!ln.emit||T[n]==null)continue;const r=rev[n];for(const p of ln){const s=r?ln.len-p.s:p.s;src.push({i:C.near(p.x,p.y),t:(T[n]+s/VP+PMJ)});}}
    if(o.ap){const a=o.ap==='R'?APR:APL;src.push({i:C.near(a[0]+(o.ap==='R'?6:-6),a[1]+14),t:0});}
    if(!src.length)src.push({i:C.near(232,320),t:0});
    const r=this._norm(this._dijkstra(C,src));r.T=T;r.rev=rev;return this.fc[key]=r;}
  _af(key){if(this.fc['a'+key])return this.fc['a'+key];const C=this.A,src=[];
    if(key==='sa'){src.push({i:C.near(SA[0],SA[1]),t:0});for(const k of ['ant','mid','post'])for(const p of this.tr[k])src.push({i:C.near(p.x,p.y),t:p.s/2.6});const b0=at(this.tr.ant,.2);for(const p of this.tr.bach)src.push({i:C.near(p.x,p.y),t:Math.hypot(b0.x-SA[0],b0.y-SA[1])/2.6+p.s/2.6});}
    else if(key==='avn')src.push({i:C.near(AVN[0],AVN[1]-6),t:0});else if(key==='apL')src.push({i:C.near(APL[0]-2,APL[1]-12),t:0});else if(key==='apR')src.push({i:C.near(APR[0]+4,APR[1]-12),t:0});
    else if(key==='fl'){const f=new Float32Array(C.list.length),cx=150,cy=150,d=this._norm(this._dijkstra(C,[{i:C.near(222,110),t:0}])).f;
      C.list.forEach((p,i)=>{f[i]=p.x<224?fract(-Math.atan2(p.y-cy,p.x-cx)/TAU+.02):fract(.07+d[i]*.45);});return this.fc['a'+key]={f};}
    return this.fc['a'+key]=this._norm(this._dijkstra(C,src));}
  _origin(v,rot){const C=this.V;let a=Math.atan2(-(v?v[1]:.5),-(v?v[0]:.5))+(rot||0),dx=Math.cos(a),dy=Math.sin(a),b=0,bs=-1e9;
    C.list.forEach((p,i)=>{const s=(p.x-232)*dx+(p.y-320)*dy;if(s>bs){bs=s;b=i;}});return C.list[b];}
  setLead(L){this.lead=L;this._draw();}
  setOptions(o){Object.assign(this.opt,o);this._draw();}
  setECG(e){this.ecg=e;const M=e.meta.model||{},m=e.meta,rh=M.rhythm,id=m.caseId,va=m.variant||'';const ev={A:[],N:[],V:[],sp:e.spikes||[],mode:{}};this.ev=ev;
    const QT=(m.qt||380)/1000,avrt=rh==='svt'&&(va==='avrt'||id==='wpw'),avnrt=rh==='svt'&&!avrt,fasc=M.fasc||{};
    ev.mode={af:rh==='af'||(M.under==='af'&&!e.atria.length),fl:rh==='flutter',vf:rh==='vf',avrt,avnrt,Tf:60/(M.aRate||300),
      ap:(M.delta||avrt)?((M.delta&&M.delta[0]>0)?'R':'L'):null,vt:id==='vt'&&rh==='vt',av:M.av,fasc};
    ev.mi=m.mi&&m.mi.walls?m.mi:null;
    for(const a of e.atria){ev.A.push({t0:a.t,f:'sa',dur:.095,sinus:true});const conducted=a.q!=null&&!a.blk;
      ev.N.push(conducted?{tIn:a.t+.05,tOut:a.q-.045,q:a.q}:{tIn:a.t+.05,blk:true,level:M.av==='high'?'his':'node',why:a.blk?(M.av?'block':'refr'):(rh==='av3'?'block':'refr')});}
    const isC=q=>e.atria.some(a=>a.q!=null&&!a.blk&&Math.abs(a.q-q.t)<.006);let nv=0;
    e.qrs.forEach((q,qi)=>{const k=q.kind;const c=isC(q);const o={t0:q.t,kind:k,cond:c,qt:QT};
      if(k==='normal'||k==='lbbb'||k==='rbbb'||k==='sine'){const blk={};if(k==='lbbb'||fasc.lbb)blk.lbb=1;if(k==='rbbb'||fasc.rbb)blk.rbb=1;if(fasc.laf)blk.laf=1;if(fasc.lpf)blk.lpf=1;
        o.blk=blk;o.dur=M.d||.09;o.pre=!!(M.delta&&c);o.key='n:'+Object.keys(blk).sort().join(',')+(o.pre?':ap'+ev.mode.ap:'');o.cfg={blk,ap:o.pre?ev.mode.ap:null,delay:o.pre?34:0};
        if(!c){o.junct=!ev.mode.af&&!ev.mode.fl;if(ev.mode.af||ev.mode.fl)ev.N.push({tIn:q.t-.15,tOut:q.t-.045,q:q.t});
          if(avnrt)ev.A.push({t0:q.t+.005,f:'avn',dur:.07,retro:true});else if(avrt)ev.A.push({t0:q.t+.075,f:'ap'+ev.mode.ap,dur:.08,retro:true});
          else if(rh==='junct'&&va==='retro')ev.A.push({t0:q.t+.07,f:'avn',dur:.08,retro:true});}}
      else{let pt;if(k==='paced')pt={x:RVAPEX[0],y:RVAPEX[1]};else if(k==='vt')pt=this._origin(M.vtV,id==='tdp'?nv++*.55:0);else if(k==='esc')pt=this._origin(M.escV);else pt=this._origin(M.pvcV,k==='pvc2'?2.2:k==='pvc4'?-1.9:0);
        o.key='pt:'+pt.x+','+pt.y;o.cfg={pt};o.pt=pt;o.dur=k==='vt'?(M.d||.16):k==='paced'?(M.d||.16):.14;o.qt=Math.max(QT,o.dur+.22);}
      const nx=e.qrs[qi+1];if(nx)o.qt=Math.min(o.qt,Math.max(o.dur+.06,nx.t-q.t-.01));ev.V.push(o);});
    ev.A.sort((a,b)=>a.t0-b.t0);
    const T={af:'Vorhofflimmern: viele kleine kreisende Erregungen in den Vorhöfen, der AV-Knoten leitet unregelmäßig über',fl:'Vorhofflattern: eine große Kreiserregung im rechten Vorhof, der AV-Knoten leitet nur jede 2.–4. Welle über',
      vf:'Kammerflimmern: chaotische kreisende Erregungen in den Kammern, kein geordneter Schlag',avnrt:'AVNRT: Kreiserregung im AV-Knoten (langsame Bahn abwärts, schnelle Bahn aufwärts) – Vorhöfe und Kammern fast gleichzeitig',
      avrt:'AVRT: Kreiserregung über AV-Knoten abwärts und zusätzliche Leitungsbahn zurück in die Vorhöfe',vt:'Kammertachykardie: Kreiserregung um eine Narbe in der Kammer, Ausbreitung langsam von Zelle zu Zelle'};
    let t='';for(const k of ['af','fl','vf','avnrt','avrt','vt'])if(ev.mode[k]){t=T[k];break;}
    if(M.delta&&!avrt)t='Präexzitation (WPW): zusätzliche Leitungsbahn erregt die Kammer vorzeitig (Delta-Welle)';
    const fb=Object.keys(fasc).filter(k=>fasc[k]);if(!t&&fb.length){t='Blockiert: '+fb.map(k=>NAME[k]).join(' + ')+(fb.length>=2&&!fasc.lbb?' (bifaszikulär)':'')+(M.pr>=.21&&fb.length>=2?' + AV-Block I°':'');}
    if(!t&&ev.mi)t='Infarktzone: '+ev.mi.walls.map(w=>WALLN[w]||w).join(', ');
    this.elT.textContent=t;this.elT.style.display=t?'':'none';this._draw();}
  setTime(t){this.t=t;this._draw();}
  _size(){const r=this.cv.parentNode.getBoundingClientRect();if(r.width<20||r.height<20)return;const d=Math.max(1,root.devicePixelRatio||1);this.s=Math.min(r.width/W,r.height/H);
    this.cv.width=Math.round(W*this.s*d);this.cv.height=Math.round(H*this.s*d);this.cv.style.width=W*this.s+'px';this.cv.style.height=H*this.s+'px';this.d=d;this._draw();}
  _cen(seed,i,t){const base=seed===1?[[110,150],[170,95],[150,200],[260,100],[330,120],[340,175],[250,170]]:[[110,280],[150,370],[228,300],[250,425],[330,400],[365,300],[300,215],[160,225]];const b=base[i%base.length];return [b[0]+Math.sin(t*1.7+i*2)*16,b[1]+Math.cos(t*1.3+i)*14];}
  _chaos(p,t,seed,n){let b=0,bd=1e9;for(let i=0;i<n;i++){const c=this._cen(seed,i,t),d=(p.x-c[0])**2+(p.y-c[1])**2;if(d<bd){bd=d;b=i;}}
    const c=this._cen(seed,b,t),f=5.5+((b*37+seed*13)%10)*.35;return fract((b%2?1:-1)*Math.atan2(p.y-c[1],p.x-c[0])/TAU+Math.sqrt(bd)/70-t*f+b*2.4+seed);}
  /* Wandabschnitte im Vierkammerblick (für die Infarktzone) */
  _inZone(w,p){const xs=225+(p.y-215)*.115,sep=Math.abs(p.x-xs)<15&&p.y<398,lvw=p.x>xs+10,rvw=p.x<xs-12;
    if(w==='septal')return sep&&p.y>232;if(w==='inferior')return p.y>366&&p.x<330;if(w==='apikal')return p.y>372&&p.x>196&&p.x<318;
    if(w==='lateral')return lvw&&p.x>328&&p.y>250&&p.y<372;if(w==='hochlateral')return lvw&&p.x>300&&p.y<285;if(w==='rv')return rvw&&p.y<372;
    if(w==='diffus')return !(p.y<226);if(w==='anterior')return (sep&&p.y>232)||(p.y>360&&p.x>200&&p.x<300);return false;}
  _zonePath(w){if(this.zoneCache[w])return this.zoneCache[w];const pth=new Path2D();for(const p of this.V.list)if(this._inZone(w,p))pth.rect(p.x-GS/2,p.y-GS/2,GS,GS);return this.zoneCache[w]=pth;}
  _draw(){const ctx=this.ctx;if(!this.s)return;const t=this.t,ev=this.ev,k=this.s*this.d;ctx.setTransform(k,0,0,k,0,0);ctx.clearRect(0,0,W,H);ctx.translate(TX,TY);ctx.lineJoin='round';ctx.lineCap='round';
    const pa=this.path,M=ev?ev.mode:{};
    /* Gefäße */
    const vessel=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.strokeStyle='#9aa8c2';ctx.lineWidth=1.2;ctx.fillRect(x,y,w,h);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+h);ctx.moveTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.stroke();};
    vessel(100,50,30,52,'#dde6f5');vessel(196,44,30,54,'#fadede');vessel(244,46,26,44,'#dde6f5');
    ctx.font='10px Inter,system-ui,sans-serif';ctx.fillStyle='#7a869a';ctx.textAlign='center';ctx.fillText('V. cava sup.',115,46);ctx.fillText('Aorta',211,40);ctx.textAlign='left';ctx.fillText('Truncus pulm.',274,58);
    ctx.fillStyle='#e3ebf8';ctx.fill(pa.ra);ctx.fill(pa.rv);ctx.fillStyle='#fbe6e4';ctx.fill(pa.la);ctx.fill(pa.lv);
    /* Muskel: Zellraster in ein kleines Bild, weich vergrößert und auf die Wand zugeschnitten */
    const img=this.img,D=img.data;D.fill(0);
    const put=(p,c)=>{const o=(p.gy*this.gw+p.gx)*4;D[o]=c[0];D[o+1]=c[1];D[o+2]=c[2];D[o+3]=255;};
    let capV=null,capA=null;
    const paintA=fn=>{for(let i=0;i<this.A.list.length;i++){const p=this.A.list[i];put(p,fn(i,p)||REST);}};
    const paintV=fn=>{for(let i=0;i<this.V.list.length;i++){const p=this.V.list[i];put(p,fn(i,p)||REST);}};
    if(ev){
      if(M.af)paintA((i,p)=>{const ph=this._chaos(p,t,1,7);return ph<.5?shade(ph*.16,.08):null;});
      else if(M.fl){const f=this._af('fl').f,Tf=M.Tf;paintA(i=>shade(fract(t/Tf-f[i])*Tf,Tf*.62));}
      else{const act=ev.A.filter(a=>a.t0<=t&&a.t0>t-.5);paintA(i=>{for(let j=act.length-1;j>=0;j--){const a=act[j],dt=t-(a.t0+this._af(a.f).f[i]*a.dur);if(dt>=0)return shade(dt,.2);}return null;});
        const a=act[act.length-1];if(a&&t<a.t0+a.dur+.01)capA=a;}
      if(M.vf)paintV((i,p)=>{const ph=this._chaos(p,t,2,8);return ph<.55?shade(ph*.2,.11):null;});
      else{const act=ev.V.filter(v=>v.t0-.01<=t&&v.t0>t-1.2);paintV(i=>{for(let j=act.length-1;j>=0;j--){const v=act[j],f=this._vf(v.key,v.cfg).f[i],ta=f*v.dur*.94,dt=t-(v.t0+ta);if(dt>=0)return shade(dt,Math.max(.08,(v.qt-ta)*(.86+.14*(1-f))));}return null;});
        capV=act[act.length-1]||null;}
    }else{paintA(()=>null);paintV(()=>null);}
    this.octx.putImageData(img,0,0);
    for(const wall of [this.wallA,this.wallV]){ctx.save();ctx.clip(wall,'evenodd');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(this.off,this.gx0,this.gy0,this.gw*GS,this.gh*GS);ctx.restore();}
    /* Infarktzone */
    if(ev&&ev.mi){ctx.save();ctx.clip(this.wallV,'evenodd');const z=new Path2D();for(const w of ev.mi.walls)z.addPath(this._zonePath(w));ctx.clip(z);
      ctx.strokeStyle=ev.mi.stage==='narbe'?'rgba(90,90,100,.75)':'rgba(170,0,20,.7)';ctx.lineWidth=1.6;for(let x=-200;x<700;x+=7){ctx.beginPath();ctx.moveTo(x,40);ctx.lineTo(x-420,460);ctx.stroke();}ctx.restore();}
    ctx.strokeStyle='#8a5a5a';ctx.lineWidth=1.3;for(const key of ['atr','ra','la','ven','rv','lv'])ctx.stroke(pa[key]);
    /* Herzskelett (Faserring): trennt Vorhöfe und Kammern elektrisch, Durchtritt nur über das His-Bündel */
    ctx.strokeStyle='#aab1bd';ctx.lineWidth=6;ctx.lineCap='butt';ctx.beginPath();ctx.moveTo(90,218);ctx.quadraticCurveTo(160,214,217,209);ctx.moveTo(232,209);ctx.quadraticCurveTo(300,203,356,193);ctx.stroke();ctx.lineCap='round';
    /* Leitungssystem */
    const CS='#2c6e73',CSd='rgba(44,110,115,.45)';
    const stroke=(ln,col,w,a,b,dash)=>{ctx.strokeStyle=col;ctx.lineWidth=w;if(dash)ctx.setLineDash(dash);ctx.beginPath();let on=false;for(const p of ln){const u=p.s/(ln.len||1);if(a!=null&&(u<a-1e-6||u>b+1e-6)){on=false;continue;}if(on)ctx.lineTo(p.x,p.y);else{ctx.moveTo(p.x,p.y);on=true;}}ctx.stroke();ctx.setLineDash([]);};
    const twigs=ln=>{ctx.strokeStyle='rgba(44,110,115,.55)';ctx.lineWidth=.9;for(let i=3;i<ln.length-1;i+=3){const a=ln[i-1],b=ln[i+1],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;for(const sg of [1,-1]){ctx.beginPath();ctx.moveTo(ln[i].x,ln[i].y);ctx.lineTo(ln[i].x+(nx*sg*.8+dx/L*.6)*6,ln[i].y+(ny*sg*.8+dy/L*.6)*6);ctx.stroke();}}};
    for(const k of ['ant','mid','post'])stroke(this.tr[k],CSd,1.6);stroke(this.tr.bach,CSd,2.2);
    const cur=ev?ev.V.filter(v=>v.t0<=t+.15).pop():null,blk=(cur&&cur.blk)||(ev&&!cur&&ev.V[0]&&ev.V[0].blk)||{};
    const blockU={rbb:.3,lbb:.5,laf:.32,lpf:.28};
    for(const [n] of TREE){const ln=this.tree[n],emit=ln.emit;const dead=(ln.par&&(blk[ln.par]||(this.tree[ln.par].par&&blk[this.tree[ln.par].par])))&&!(cur&&this._vf(cur.key,cur.cfg).T&&this._vf(cur.key,cur.cfg).T[n]!=null);
      if(blk[n]){stroke(ln,CS,emit?1.4:3,0,blockU[n]);stroke(ln,'#9aa3ad',emit?1.2:2.4,blockU[n],1,[4,4]);}
      else if(dead)stroke(ln,'#9aa3ad',emit?1.2:2.4,0,1,[4,4]);else{stroke(ln,CS,emit?1.4:(n==='his'?3.6:3));if(emit)twigs(ln);}}
    /* Glühen entlang der Bahnen */
    const glow=(ln,t0,dur,rev)=>{let u=(t-t0)/dur;if(u<0||u>1.3)return;if(rev){const a=Math.max(0,1-u),b=Math.min(1,1-u+.45);stroke(ln,'#fff3a0',5.5,a,b);stroke(ln,'#ffaf00',2.8,a,b);if(u<=1){const p=at(ln,1-u);dotG(p);}return;}
      stroke(ln,'#fff3a0',5.5,Math.max(0,u-.45),Math.min(1,u));stroke(ln,'#ffaf00',2.8,Math.max(0,u-.45),Math.min(1,u));if(u<=1)dotG(at(ln,u));};
    const dotG=p=>{ctx.fillStyle='#fff';ctx.strokeStyle='#e08a00';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(p.x,p.y,4,0,TAU);ctx.fill();ctx.stroke();};
    const node=(c,rx,ry,col,prog)=>{ctx.beginPath();ctx.ellipse(c[0],c[1],rx,ry,0,0,TAU);ctx.fillStyle=col;ctx.fill();ctx.strokeStyle='#1d4a4d';ctx.lineWidth=1.3;ctx.stroke();
      if(prog!=null){ctx.save();ctx.beginPath();ctx.ellipse(c[0],c[1],rx,ry,0,0,TAU);ctx.clip();ctx.fillStyle='#ffd21f';ctx.fillRect(c[0]-rx,c[1]-ry,rx*2,ry*2*clamp(prog,0,1));ctx.restore();}};
    const cross=(x,y)=>{ctx.strokeStyle='#fff';ctx.lineWidth=5.5;ctx.beginPath();ctx.moveTo(x-7,y-7);ctx.lineTo(x+7,y+7);ctx.moveTo(x+7,y-7);ctx.lineTo(x-7,y+7);ctx.stroke();ctx.strokeStyle='#d0101c';ctx.lineWidth=3.2;ctx.stroke();};
    const tag=(s,x,y,col,al)=>{ctx.font='bold 11px Inter,system-ui,sans-serif';ctx.textAlign=al||'left';const w=ctx.measureText(s).width,x0=al==='right'?x-w:al==='center'?x-w/2:x;ctx.fillStyle='rgba(255,255,255,.88)';ctx.fillRect(x0-3,y-11,w+6,15);ctx.fillStyle=col||'#27323f';ctx.fillText(s,x,y);ctx.textAlign='left';};
    let saOn=false,nodeProg=null,cap='',blockMark=null;
    if(ev){
      for(const a of ev.A){if(!a.sinus)continue;if(t>=a.t0-.03&&t<a.t0+.05)saOn=true;for(const key of ['ant','mid','post'])glow(this.tr[key],a.t0,.05);glow(this.tr.bach,a.t0+.012,.04);}
      for(const n of ev.N){if(t<n.tIn||t>n.tIn+.9)continue;if(n.blk){const u=(t-n.tIn)/.07;if(n.level==='his'){if(u<1)nodeProg=u;else if(t<n.tIn+.6)blockMark={x:226,y:224,n};}else{nodeProg=Math.min(.55,u*.55);if(t>n.tIn+.05&&t<n.tIn+.6)blockMark={x:AVN[0],y:AVN[1],n};else if(t>=n.tIn+.6)nodeProg=null;}}
        else if(t<=n.tOut){nodeProg=(t-n.tIn)/Math.max(.01,n.tOut-n.tIn);cap='AV-Knoten verzögert die Überleitung (PQ-Strecke)';}}
      for(const v of ev.V){if(!v.cfg||v.pt||t<v.t0-.08||t>v.t0+v.dur+.05)continue;const r=this._vf(v.key,v.cfg);if(!r.T)continue;const sc=v.dur/((r.mx-r.mn)||1),tt=u=>v.t0+(u-r.mn)*sc;
        if(v.junct&&t<tt(0)+.01)nodeProg=1;
        for(const [n] of TREE){const T0=r.T[n];if(T0==null)continue;const ln=this.tree[n];glow(ln,tt(T0),Math.max(.004,ln.len/VP*sc),r.rev&&r.rev[n]);}}
    }
    node(SA,10,7,saOn?'#ffd21f':'#3f8f93');node(AVN,8,9,'#3f8f93',nodeProg);
    /* Zusatzbahn, Kreise, Herd, Schrittmacher */
    const loop=(cx,cy,rx,ry,ph,dir)=>{ctx.strokeStyle='#7a2bd0';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,TAU);ctx.stroke();ctx.setLineDash([]);const a=dir*ph*TAU,x=cx+Math.cos(a)*rx,y=cy+Math.sin(a)*ry;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,4.5,0,TAU);ctx.fill();ctx.stroke();};
    if(ev){const cv=ev.V.filter(v=>v.t0<=t).pop(),nxt=ev.V.find(v=>v.t0>t),rr=cv&&nxt?nxt.t0-cv.t0:(ev.V.length>1?ev.V[1].t0-ev.V[0].t0:.4),ph=cv?clamp((t-cv.t0)/rr,0,1):0;
      if(M.ap){const a=M.ap==='R'?APR:APL;ctx.strokeStyle='#7a2bd0';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(a[0],a[1]-9);ctx.lineTo(a[0],a[1]+11);ctx.stroke();tag('Zusatzbahn',a[0]+(M.ap==='R'?-6:8),a[1]-14,'#5b1ea6',M.ap==='R'?'left':'right');}
      if(M.fl)loop(150,150,46,52,fract(t/M.Tf),-1);
      if(M.avnrt)loop(AVN[0],AVN[1],15,17,fract(ph+.1),1);
      if(M.avrt){const a=M.ap==='R'?APR:APL,pts=M.ap==='R'?[AVN,HISB,[221,290],[222,342],[180,360],[132,352],[104,290],[90,234],[a[0],a[1]+8],[a[0],a[1]-10],[78,165],[98,108],[150,86],[205,98],[221,150],AVN]:[AVN,HISB,LB,[254,312],[266,362],[292,392],[322,364],[346,300],[360,216],[a[0],a[1]+8],[a[0],a[1]-10],[367,150],[330,95],[262,88],[226,108],[223,150],AVN],ln=resample(pts,4);
        stroke(ln,'rgba(122,43,208,.55)',2);const p=at(ln,fract(ph+.04));ctx.fillStyle='#fff';ctx.strokeStyle='#7a2bd0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,5,0,TAU);ctx.fill();ctx.stroke();}
      if(M.vt&&cv&&cv.pt){const p=cv.pt;ctx.fillStyle='#8c8c96';ctx.beginPath();ctx.ellipse(p.x,p.y,9,7,0,0,TAU);ctx.fill();loop(p.x,p.y,16,14,fract(ph),1);tag('Narbe',p.x+20,p.y+4,'#555');}
      if(ev.sp.length||ev.V.some(v=>v.kind==='paced')){ctx.strokeStyle='#39424f';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(116,48);ctx.bezierCurveTo(112,140,150,210,170,250);ctx.bezierCurveTo(190,300,205,360,RVAPEX[0],RVAPEX[1]);ctx.stroke();ctx.fillStyle='#39424f';ctx.beginPath();ctx.arc(RVAPEX[0],RVAPEX[1],3.8,0,TAU);ctx.fill();
        tag('Schrittmachersonde',150,252,'#39424f','right');if(ev.sp.some(s=>t>=s-.005&&t<s+.05)){ctx.strokeStyle='#ff2a2a';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(RVAPEX[0],RVAPEX[1],9,0,TAU);ctx.stroke();}}
      for(const v of ev.V){if(!v.pt||v.kind==='paced'||M.vt)continue;if(t>=v.t0-.04&&t<v.t0+.25){ctx.strokeStyle='#d0101c';ctx.lineWidth=2;const r=6+((t-v.t0+.04)*40)%8;ctx.beginPath();ctx.arc(v.pt.x,v.pt.y,r,0,TAU);ctx.stroke();ctx.fillStyle='#d0101c';ctx.beginPath();ctx.arc(v.pt.x,v.pt.y,3.5,0,TAU);ctx.fill();}}
      if(blockMark)cross(blockMark.x,blockMark.y);
      for(const n of ['rbb','lbb','laf','lpf'])if(blk[n]){const p=at(this.tree[n],blockU[n]);cross(p.x,p.y);}
    }
    /* Beschriftung */
    ctx.font='bold 14px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.fillStyle='rgba(40,60,100,.5)';ctx.fillText('RA',150,165);ctx.fillText('RV',162,300);ctx.fillStyle='rgba(140,50,50,.5)';ctx.fillText('LA',296,152);ctx.fillText('LV',296,306);ctx.textAlign='left';
    if(this.opt.labels){ctx.font='11px Inter,system-ui,sans-serif';for(const [txt,a,side,y] of LABELS){const xl=side==='l'?-96:398,xe=side==='l'?-2:394;ctx.strokeStyle='rgba(60,70,90,.45)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(xe,y-4);ctx.lineTo(a[0],a[1]);ctx.stroke();
        ctx.fillStyle='#1d4a4d';ctx.beginPath();ctx.arc(a[0],a[1],1.8,0,TAU);ctx.fill();ctx.fillStyle='#243040';ctx.textAlign='left';ctx.fillText(txt,xl,y);ctx.textAlign='left';}}
    else{tag('Sinusknoten',SA[0]-12,SA[1]-14,'#1d4a4d','right');tag('AV-Knoten',AVN[0]+12,AVN[1]-2,'#1d4a4d');}
    if(ev&&ev.mi){tag((ev.mi.stage==='narbe'?'Narbe: ':'Infarktzone: ')+ev.mi.walls.map(w=>WALLN[w]||w).join(', '),232,462,ev.mi.stage==='narbe'?'#555':'#a00018','center');
      if(ev.mi.walls.includes('posterior'))tag('Hinterwand liegt hinter der Bildebene',232,478,'#a00018','center');}
    /* Summenvektor und Ableitung */
    if(this.ecg&&this.ecg.vec&&(this.opt.vector||this.opt.axis)){const e=this.ecg,i=clamp(Math.round(t*e.fs),0,e.vec.x.length-1),vx=e.vec.x[i],vy=e.vec.y[i],vz=e.vec.z[i],K=62;
      const FR={I:0,II:60,III:120,aVR:-150,aVL:-30,aVF:90},HZ={V1:115,V2:90,V3:72,V4:55,V5:28,V6:0};
      const arrow=(x0,y0,dx,dy,col,w)=>{const L=Math.hypot(dx,dy);if(L<3)return;ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x0+dx,y0+dy);ctx.stroke();const a=Math.atan2(dy,dx);ctx.beginPath();ctx.moveTo(x0+dx,y0+dy);ctx.lineTo(x0+dx-Math.cos(a-.4)*9,y0+dy-Math.sin(a-.4)*9);ctx.lineTo(x0+dx-Math.cos(a+.4)*9,y0+dy-Math.sin(a+.4)*9);ctx.closePath();ctx.fill();};
      const proj=(cx,cy,R,ux,uy,px,py,lbl)=>{if(this.opt.axis){ctx.strokeStyle='rgba(20,40,80,.5)';ctx.lineWidth=1.3;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(cx-ux*R,cy-uy*R);ctx.lineTo(cx+ux*R,cy+uy*R);ctx.stroke();ctx.setLineDash([]);
          ctx.fillStyle='#fff';ctx.strokeStyle='#14284f';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx+ux*R,cy+uy*R,10,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#14284f';ctx.font='bold 9px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.fillText(lbl,cx+ux*R,cy+uy*R+3);ctx.fillText('+',cx+ux*(R+17),cy+uy*(R+17)+3);ctx.textAlign='left';
          const s=px*ux+py*uy;if(Math.abs(s)>2){ctx.strokeStyle=s>0?'rgba(10,143,78,.9)':'rgba(216,30,44,.9)';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+ux*s,cy+uy*s);ctx.stroke();
            if(this.opt.vector){ctx.strokeStyle='rgba(20,40,80,.4)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx+px,cy+py);ctx.lineTo(cx+ux*s,cy+uy*s);ctx.stroke();}}}
        if(this.opt.vector)arrow(cx,cy,px,py,'#14284f',3);};
      if(FR[this.lead]!=null){const a=FR[this.lead]*Math.PI/180;proj(236,300,150,Math.cos(a),Math.sin(a),clamp(vx*K,-150,150),clamp(vy*K,-150,150),this.lead);}
      else{const cx=448,cy=462,R=40,a=HZ[this.lead]*Math.PI/180;ctx.fillStyle='rgba(255,255,255,.94)';ctx.strokeStyle='#9aa6b8';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(cx,cy,56,48,0,0,TAU);ctx.fill();ctx.stroke();
        ctx.font='10px Inter,system-ui,sans-serif';ctx.fillStyle='#6a7686';ctx.textAlign='center';ctx.fillText('vorne',cx,cy-51);ctx.fillText('Querschnitt',cx,cy+60);ctx.textAlign='left';
        proj(cx,cy,R,Math.cos(a),-Math.sin(a),clamp(vx*24,-40,40),clamp(-vz*24,-40,40),this.lead);if(this.opt.vector)arrow(236,300,clamp(vx*K,-150,150),clamp(vy*K,-150,150),'#14284f',3);}}
    ctx.font='11px Inter,system-ui,sans-serif';ctx.fillStyle='#6a7686';ctx.textAlign='left';ctx.fillText('rechts im Körper',-96,52);ctx.textAlign='right';ctx.fillText('links im Körper',504,52);ctx.textAlign='left';
    /* Text unten */
    if(ev){let c=cap;const refr=blockMark&&blockMark.n,fa=M.fasc||{};
      if(M.vf)c='Kein geordneter Schlag – die Kammern pumpen nicht';
      else if(capV&&t<capV.t0+capV.dur&&t>=capV.t0){const k=capV.kind,u=(t-capV.t0)/capV.dur,b=capV.blk||{};
        if(k==='paced')c='QRS: Schrittmacher reizt in der rechten Kammerspitze – Ausbreitung von Zelle zu Zelle (breiter QRS)';
        else if(capV.pt)c='QRS: Erregung entsteht in der Kammer – langsame Ausbreitung von Zelle zu Zelle (breiter QRS)';
        else if(capV.pre)c='QRS: Zusatzbahn erregt die Kammer früh (Delta-Welle), dann kommt die normale Leitung dazu';
        else if(b.lbb)c='QRS: linker Schenkel blockiert – zuerst rechte Kammer, dann Septum von rechts nach links, linke Kammer zuletzt (breiter QRS)';
        else if(b.rbb&&b.laf)c='QRS: rechter Schenkel und linksanteriorer Faszikel blockiert – Erregung nur über den linksposterioren Faszikel; rechte Kammer und linke Vorderwand-Basis zuletzt';
        else if(b.rbb&&b.lpf)c='QRS: rechter Schenkel und linksposteriorer Faszikel blockiert – Erregung nur über den linksanterioren Faszikel';
        else if(b.rbb)c=u<.6?'QRS: Septum und linke Kammer normal über den linken Schenkel':'QRS: rechter Schenkel blockiert – rechte Kammer wird zuletzt von Zelle zu Zelle erregt (spätes R′ in V1, breiter QRS)';
        else if(b.laf)c=u<.55?'QRS: Septum und untere linke Kammer zuerst über den linksposterioren Faszikel':'QRS: linksanteriorer Faszikel blockiert – vordere-obere linke Kammer zuletzt über das Purkinje-Netz → Vektor nach links oben (überdrehter Linkstyp)';
        else if(b.lpf)c=u<.55?'QRS: Septum und obere linke Kammer zuerst über den linksanterioren Faszikel':'QRS: linksposteriorer Faszikel blockiert – untere-hintere linke Kammer zuletzt → Vektor nach rechts unten (Rechtstyp)';
        else if(capV.junct)c='QRS: Erregung aus dem AV-Knoten-Bereich – Kammern normal über die Schenkel (schmaler QRS)';
        else c=u<.25?'QRS: Septum wird zuerst erregt – über die septalen Fasern von links nach rechts (kleines q in I, V6)':'QRS: beide Kammern gleichzeitig über Schenkel, Faszikel und Purkinje-Fasern (schmaler QRS)';}
      else if(refr)c=refr.level==='his'?'Blockiert unterhalb des AV-Knotens – auf diese P-Welle folgt kein QRS':refr.why==='refr'?'P-Welle wird nicht übergeleitet (AV-Knoten nicht bereit)':'Blockiert im AV-Knoten – auf diese P-Welle folgt kein QRS';
      else if(!c&&capA)c=capA.retro?'Vorhöfe werden rückwärts erregt (retrograde P-Welle)':'P-Welle: Sinusknoten erregt die Vorhöfe, über das Bachmann-Bündel auch den linken Vorhof';
      else if(!c&&capV&&t<capV.t0+capV.qt)c=ev.mi&&ev.mi.stage!=='narbe'&&t<capV.t0+capV.dur+.12?'ST-Strecke: die verletzte Zone bleibt teilweise erregt – der Summenvektor zeigt zu ihr → ST-Hebung in den Ableitungen, die auf diese Wand schauen':'T-Welle: Erregung der Kammern bildet sich zurück';
      else if(!c)c=M.af||M.fl?'Vorhöfe ständig erregt – keine isoelektrische Linie':'Ruhe (isoelektrische Linie)';
      void fa;if(this.elC.textContent!==c)this.elC.textContent=c;}
  }
}
const WALLN={inferior:'Hinterwand (inferior)',septal:'Septum',anterior:'Vorderwand',apikal:'Herzspitze',lateral:'Seitenwand',hochlateral:'hohe Seitenwand',posterior:'Hinterwand (posterior)',rv:'rechter Ventrikel',diffus:'diffus (subendokardial)'};
root.Heart2D=Heart2D;root.Heart2D.WALLN=WALLN;
})(typeof window!=='undefined'?window:globalThis);
