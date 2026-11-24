/* EKG-Trainer – Erregungsleitung als 2D-Schema (Frontalschnitt, Blick von vorne: rechts im Bild = linke Körperseite).
   Die Ausbreitung wird je Schlag aus den Ereignissen der Engine berechnet (P-Beginn, Überleitung, QRS-Beginn, QRS-Art)
   und läuft im Muskel von Zelle zu Zelle (kürzester Weg), im Reizleitungssystem schnell. */
(function(root){'use strict';
const W=424,H=444,OX=-14,OY=-34,GS=4,TAU=Math.PI*2;
const P={
 atr:[[90,212],[68,165],[92,105],[150,78],[200,90],[222,100],[262,80],[330,88],[374,135],[366,175],[352,186],[300,196],[224,203],[150,208]],
 ra:[[104,203],[86,165],[106,115],[152,95],[198,105],[211,127],[213,196],[150,199]],
 la:[[235,195],[233,125],[262,97],[326,103],[358,138],[351,172],[338,181],[290,189]],
 ven:[[90,226],[84,290],[128,380],[200,428],[252,444],[310,420],[360,360],[380,285],[366,216],[352,200],[300,209],[224,216],[150,221]],
 rv:[[104,238],[211,230],[214,290],[220,350],[232,398],[175,385],[125,330],[100,282]],
 lv:[[252,228],[330,218],[346,285],[322,360],[268,408],[246,360],[240,290]]};
const SA=[110,116],AVN=[223,199],HISA=[224,206],HISB=[228,236],APL=[356,192],APR=[88,219],RVAPEX=[226,392];
const TR={ant:[SA,[150,86],[196,97],[220,132],AVN],mid:[SA,[160,140],[202,178],AVN],post:[SA,[80,165],[118,205],[190,204],AVN],bach:[[160,85],[222,97],[270,88],[330,96]]};
const RBB=[HISB,[219,290],[223,350],[233,398],[190,391],[140,352],[104,296],[103,250]],RBB_FROM=3;
const LBB=[HISB,[241,262]],LPF=[[241,262],[247,330],[263,402],[300,396],[334,340],[347,285],[340,238]];
function smooth(pts){const p=new Path2D(),n=pts.length;for(let i=0;i<n;i++){const a=pts[(i+n-1)%n],b=pts[i],c=pts[(i+1)%n],d=pts[(i+2)%n];if(i===0)p.moveTo(b[0],b[1]);
  p.bezierCurveTo(b[0]+(c[0]-a[0])/6,b[1]+(c[1]-a[1])/6,c[0]-(d[0]-b[0])/6,c[1]-(d[1]-b[1])/6,c[0],c[1]);}p.closePath();return p;}
function resample(poly,step){const out=[];let acc=0;for(let i=0;i<poly.length-1;i++){const a=poly[i],b=poly[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.round(L/step));for(let k=0;k<n;k++)out.push({x:a[0]+(b[0]-a[0])*k/n,y:a[1]+(b[1]-a[1])*k/n,s:acc+L*k/n,seg:i});acc+=L;}const e=poly[poly.length-1];out.push({x:e[0],y:e[1],s:acc,seg:poly.length-1});out.len=acc;return out;}
const lerp=(a,b,k)=>a+(b-a)*k,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),fract=x=>x-Math.floor(x);
function mix(c1,c2,k){k=clamp(k,0,1);return `rgb(${Math.round(lerp(c1[0],c2[0],k))},${Math.round(lerp(c1[1],c2[1],k))},${Math.round(lerp(c1[2],c2[2],k))})`;}
const REST=[240,196,190],FRONT=[255,236,70],EXC=[236,112,48],REF=[196,150,205];
/* dt seit Erregung der Zelle, apd = Dauer bis Ruhe */
function shade(dt,apd){if(dt<0||dt>apd)return null;if(dt<.01)return `rgb(${FRONT})`;if(dt<.03)return mix(FRONT,EXC,(dt-.01)/.02);const k=dt/apd;if(k<.72)return `rgb(${EXC})`;return mix(k<.86?EXC:REF,k<.86?REF:REST,k<.86?(k-.72)/.14:(k-.86)/.14);}

class Heart2D{
  constructor(host){this.host=host;host.classList.add('h2d');
    host.innerHTML='<div class="h2d-title"></div><div class="h2d-cv"><canvas></canvas></div><div class="h2d-cap"></div><div class="h2d-leg"><span><i style="background:#ffec46"></i>Erregungsfront</span><span><i style="background:#ec7030"></i>erregt</span><span><i style="background:#c496cd"></i>Rückbildung</span><span><i style="background:#f0c4be"></i>Ruhe</span></div>';
    this.cv=host.querySelector('canvas');this.ctx=this.cv.getContext('2d');this.elT=host.querySelector('.h2d-title');this.elC=host.querySelector('.h2d-cap');
    this.opt={vector:true,axis:true};this.lead='II';this.t=0;this.ecg=null;this.ev=null;
    this.path={atr:smooth(P.atr),ra:smooth(P.ra),la:smooth(P.la),ven:smooth(P.ven),rv:smooth(P.rv),lv:smooth(P.lv)};
    this.wallA=new Path2D();this.wallA.addPath(this.path.atr);this.wallA.addPath(this.path.ra);this.wallA.addPath(this.path.la);
    this.wallV=new Path2D();this.wallV.addPath(this.path.ven);this.wallV.addPath(this.path.rv);this.wallV.addPath(this.path.lv);
    this.A=this._cells(this.wallA);this.V=this._cells(this.wallV);this.fc={};
    this.line={};for(const k in TR)this.line[k]=resample(TR[k],4);this.line.his=resample([HISA,HISB],3);this.line.rbb=resample(RBB,4);this.line.lbb=resample(LBB,4);this.line.lpf=resample(LPF,4);
    new ResizeObserver(()=>this._size()).observe(this.cv.parentNode);this._size();}
  _cells(path){const c=document.createElement('canvas').getContext('2d'),list=[],idx=new Map();
    for(let y=60;y<470;y+=GS)for(let x=48;x<400;x+=GS)if(c.isPointInPath(path,x,y,'evenodd')){idx.set(x+','+y,list.length);list.push({x,y});}
    const nb=list.map(p=>{const o=[];for(let dy=-GS;dy<=GS;dy+=GS)for(let dx=-GS;dx<=GS;dx+=GS){if(!dx&&!dy)continue;const j=idx.get((p.x+dx)+','+(p.y+dy));if(j!=null)o.push([j,Math.hypot(dx,dy)]);}return o;});
    return {list,nb,near:(x,y)=>{let b=0,bd=1e9;for(let i=0;i<list.length;i++){const d=(list[i].x-x)**2+(list[i].y-y)**2;if(d<bd){bd=d;b=i;}}return b;}};}
  /* kürzeste Laufzeit im Muskel ab Quellen [{i,t}], v in px pro Einheit; Ergebnis 0..1 */
  _field(C,src,v){const n=C.list.length,t=new Float32Array(n).fill(1e9),done=new Uint8Array(n);for(const s of src)if(s.t<t[s.i])t[s.i]=s.t;
    for(;;){let b=-1,bt=1e9;for(let i=0;i<n;i++)if(!done[i]&&t[i]<bt){bt=t[i];b=i;}if(b<0)break;done[b]=1;for(const [j,d] of C.nb[b]){const nt=bt+d/v;if(nt<t[j])t[j]=nt;}}
    let mn=1e9,mx=0;for(let i=0;i<n;i++){if(t[i]<mn)mn=t[i];if(t[i]<1e8&&t[i]>mx)mx=t[i];}const f=new Float32Array(n);for(let i=0;i<n;i++)f[i]=t[i]>1e8?1:(t[i]-mn)/((mx-mn)||1);return f;}
  _vf(key){if(this.fc[key])return this.fc[key];const C=this.V,src=[],vP=4.2,vM=1;
    const add=(ln,t0,from)=>{for(const p of ln)if(from==null||p.seg>=from)src.push({i:C.near(p.x,p.y),t:t0+p.s/vP});};
    const purk=(l,r,delay)=>{if(l){add(this.line.lbb,6+delay,1);add(this.line.lpf,6+delay+this.line.lbb.len/vP);}
      if(r)add(this.line.rbb,delay,RBB_FROM);};
    if(key==='normal')purk(1,1,0);else if(key==='lbbb')purk(0,1,0);else if(key==='rbbb')purk(1,0,0);
    else if(key.startsWith('wpw')){purk(1,1,34);const a=key==='wpwR'?APR:APL;src.push({i:C.near(a[0],a[1]+10),t:0});}
    else{const [x,y]=key.slice(3).split(',').map(Number);src.push({i:C.near(x,y),t:0});}
    return this.fc[key]=this._field(C,src,vM);}
  _af(key){if(this.fc['a'+key])return this.fc['a'+key];const C=this.A,src=[];
    if(key==='sa'){src.push({i:C.near(SA[0],SA[1]),t:0});for(const p of this.line.bach)src.push({i:C.near(p.x,p.y),t:14+p.s/3.2});}
    else if(key==='avn')src.push({i:C.near(AVN[0],AVN[1]-6),t:0});else if(key==='apL')src.push({i:C.near(APL[0]-2,APL[1]-12),t:0});else if(key==='apR')src.push({i:C.near(APR[0]+4,APR[1]-12),t:0});
    else if(key==='fl'){/* typisches Flattern: Kreis im rechten Vorhof, Septum aufwärts, Seitenwand abwärts */
      const f=new Float32Array(C.list.length),cx=150,cy=150,sept=C.near(222,110),d=this._field(C,[{i:sept,t:0}],1);
      C.list.forEach((p,i)=>{if(p.x<224)f[i]=fract(-Math.atan2(p.y-cy,p.x-cx)/TAU+.02);else f[i]=fract(.07+d[i]*.45);});return this.fc['a'+key]=f;}
    return this.fc['a'+key]=this._field(C,src,1);}
  _origin(v,rot){const C=this.V;let a=Math.atan2(-(v?v[1]:.5),-(v?v[0]:.5))+(rot||0),dx=Math.cos(a),dy=Math.sin(a),b=0,bs=-1e9;
    C.list.forEach((p,i)=>{const s=(p.x-232)*dx+(p.y-320)*dy;if(s>bs){bs=s;b=i;}});return C.list[b];}
  setLead(L){this.lead=L;this._draw();}
  setOptions(o){Object.assign(this.opt,o);this._draw();}
  setECG(e){this.ecg=e;const M=e.meta.model||{},m=e.meta,rh=M.rhythm,id=m.caseId,va=m.variant||'';const ev={A:[],N:[],V:[],sp:e.spikes||[],mode:{}};this.ev=ev;
    const QT=(m.qt||380)/1000,avrt=rh==='svt'&&(va==='avrt'||id==='wpw'),avnrt=rh==='svt'&&!avrt;
    ev.mode={af:rh==='af'||(M.under==='af'&&!e.atria.length),fl:rh==='flutter',vf:rh==='vf',avrt,avnrt,Tf:60/(M.aRate||300),
      ap:(M.delta||avrt)?((M.delta&&M.delta[0]>0)?'R':'L'):null,vt:id==='vt'&&rh==='vt',av3:rh==='av3',av:M.av};
    for(const a of e.atria){ev.A.push({t0:a.t,f:'sa',dur:.095,sinus:true});const conducted=a.q!=null&&!a.blk;
      ev.N.push(conducted?{tIn:a.t+.05,tOut:a.q-.045,q:a.q}:{tIn:a.t+.05,blk:true,level:M.av==='high'?'his':'node',why:a.blk?(M.av?'block':'refr'):(rh==='av3'?'block':'refr')});}
    const isC=q=>e.atria.some(a=>a.q!=null&&!a.blk&&Math.abs(a.q-q.t)<.006);let nv=0;
    e.qrs.forEach((q,qi)=>{let k=q.kind;const c=isC(q);const o={t0:q.t,kind:k,cond:c,qt:QT};
      if(k==='normal'||k==='lbbb'||k==='rbbb'||k==='sine'){o.f=k==='sine'?'normal':k;o.dur=M.d||.09;if(M.delta&&c){o.f='wpw'+ev.mode.ap;o.pre=true;}
        o.his=q.t-.04;o.blockB=k==='lbbb'?'l':k==='rbbb'?'r':null;
        if(!c){o.junct=!ev.mode.af&&!ev.mode.fl;if(ev.mode.af||ev.mode.fl)ev.N.push({tIn:q.t-.15,tOut:q.t-.045,q:q.t});
          if(avnrt)ev.A.push({t0:q.t+.005,f:'avn',dur:.07,retro:true});else if(avrt)ev.A.push({t0:q.t+.075,f:'ap'+ev.mode.ap,dur:.08,retro:true});
          else if(rh==='junct'&&va==='retro')ev.A.push({t0:q.t+.07,f:'avn',dur:.08,retro:true});}}
      else{let pt;if(k==='paced')pt={x:RVAPEX[0],y:RVAPEX[1]};else if(k==='vt')pt=this._origin(M.vtV,id==='tdp'?nv++*.55:0);else if(k==='esc')pt=this._origin(M.escV);else pt=this._origin(M.pvcV,k==='pvc2'?2.2:k==='pvc4'?-1.9:0);
        o.f='pt:'+pt.x+','+pt.y;o.pt=pt;o.dur=k==='vt'?(M.d||.16):k==='paced'?(M.d||.16):.14;o.qt=Math.max(QT,o.dur+.22);}
      const nx=e.qrs[qi+1];if(nx)o.qt=Math.min(o.qt,Math.max(o.dur+.06,nx.t-q.t-.01));ev.V.push(o);});
    ev.A.sort((a,b)=>a.t0-b.t0);
    const T={af:'Vorhofflimmern: viele kleine kreisende Erregungen in den Vorhöfen, der AV-Knoten leitet unregelmäßig über',fl:'Vorhofflattern: eine große Kreiserregung im rechten Vorhof, der AV-Knoten leitet nur jede 2.–4. Welle über',
      vf:'Kammerflimmern: chaotische kreisende Erregungen in den Kammern, kein geordneter Schlag',avnrt:'AVNRT: Kreiserregung im AV-Knoten (langsame Bahn abwärts, schnelle Bahn aufwärts) – Vorhöfe und Kammern fast gleichzeitig',
      avrt:'AVRT: Kreiserregung über AV-Knoten abwärts und zusätzliche Leitungsbahn zurück in die Vorhöfe',vt:'Kammertachykardie: Kreiserregung um eine Narbe in der Kammer, Ausbreitung langsam von Zelle zu Zelle'};
    let t='';for(const k of ['af','fl','vf','avnrt','avrt','vt'])if(ev.mode[k]){t=T[k];break;}
    if(M.delta&&!avrt)t='Präexzitation (WPW): zusätzliche Leitungsbahn erregt die Kammer vorzeitig (Delta-Welle)';
    this.elT.textContent=t;this.elT.style.display=t?'':'none';this._draw();}
  setTime(t){this.t=t;this._draw();}
  _size(){const r=this.cv.parentNode.getBoundingClientRect();if(r.width<20||r.height<20)return;const d=Math.max(1,root.devicePixelRatio||1);this.s=Math.min(r.width/W,r.height/H);
    this.cv.width=Math.round(W*this.s*d);this.cv.height=Math.round(H*this.s*d);this.cv.style.width=W*this.s+'px';this.cv.style.height=H*this.s+'px';this.d=d;this._draw();}
  _chaos(p,t,seed,n){let b=0,bd=1e9,R=this._rot||(this._rot={});const key=seed+n;let rs=R[key];if(!rs){rs=[];for(let i=0;i<n;i++)rs.push({a:i*2.4+seed,f:5.5+((i*37+seed*13)%10)*.35,r:i});R[key]=rs;}
    for(let i=0;i<n;i++){const r=rs[i],c=this._cen(seed,i,n,t),d=(p.x-c[0])**2+(p.y-c[1])**2;if(d<bd){bd=d;b=i;}}
    const r=rs[b],c=this._cen(seed,b,n,t);return fract((b%2?1:-1)*Math.atan2(p.y-c[1],p.x-c[0])/TAU+Math.sqrt(bd)/70-t*r.f+r.a);}
  _cen(seed,i,n,t){const base=seed===1?[[110,150],[170,95],[150,200],[260,100],[330,120],[340,175],[250,170]]:[[110,280],[150,370],[228,300],[250,425],[330,400],[365,300],[300,215],[160,225]];const b=base[i%base.length];return [b[0]+Math.sin(t*1.7+i*2)*16,b[1]+Math.cos(t*1.3+i)*14];}
  _draw(){const ctx=this.ctx;if(!this.s)return;const t=this.t,ev=this.ev,k=this.s*this.d;ctx.setTransform(k,0,0,k,OX*k,OY*k);ctx.clearRect(0,0,W+80,H+80);ctx.lineJoin='round';ctx.lineCap='round';
    const pa=this.path,M=ev?ev.mode:{};
    /* Gefäßstümpfe */
    ctx.fillStyle='#dfe7f5';ctx.strokeStyle='#9fb0cc';ctx.lineWidth=1.2;const vessel=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.beginPath();ctx.rect(x,y,w,h);ctx.fill();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+h);ctx.moveTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.stroke();};
    vessel(100,46,30,54,'#dfe7f5');vessel(196,40,30,56,'#fbe1e1');vessel(240,40,26,48,'#dfe7f5');
    ctx.fillStyle='#e4ebf8';ctx.fill(pa.atr);ctx.fill(pa.ven);
    ctx.fillStyle='#e1eaf8';ctx.fill(pa.ra);ctx.fill(pa.rv);ctx.fillStyle='#fde6e4';ctx.fill(pa.la);ctx.fill(pa.lv);
    /* Muskelzellen */
    const paint=(C,wall,colOf)=>{ctx.save();ctx.clip(wall,'evenodd');ctx.fillStyle=`rgb(${REST})`;ctx.fillRect(40,60,380,400);const L=C.list;for(let i=0;i<L.length;i++){const c=colOf(i,L[i]);if(c){ctx.fillStyle=c;ctx.fillRect(L[i].x-GS/2-.4,L[i].y-GS/2-.4,GS+.8,GS+.8);}}ctx.restore();};
    let capV=null,capA=null;
    if(ev){
      if(M.af)paint(this.A,this.wallA,(i,p)=>{const ph=this._chaos(p,t,1,7);return ph<.5?shade(ph*.16,.08):null;});
      else if(M.fl){const f=this._af('fl'),Tf=M.Tf;paint(this.A,this.wallA,i=>shade(fract(t/Tf-f[i])*Tf,Tf*.62));}
      else{const act=ev.A.filter(a=>a.t0<=t&&a.t0>t-.5);paint(this.A,this.wallA,i=>{for(let j=act.length-1;j>=0;j--){const a=act[j],dt=t-(a.t0+this._af(a.f)[i]*a.dur);if(dt>=0)return shade(dt,.2);}return null;});
        const a=act[act.length-1];if(a&&t<a.t0+a.dur+.01)capA=a;}
      if(M.vf)paint(this.V,this.wallV,(i,p)=>{const ph=this._chaos(p,t,2,8);return ph<.55?shade(ph*.2,.11):null;});
      else{const act=ev.V.filter(v=>v.t0-.01<=t&&v.t0>t-1.2);paint(this.V,this.wallV,i=>{for(let j=act.length-1;j>=0;j--){const v=act[j],f=this._vf(v.f)[i],dt=t-(v.t0+f*v.dur*.94);if(dt>=0){const apd=v.qt-f*v.dur*.94-f*.05*0+(.0);return shade(dt,Math.max(.08,apd*(.86+.14*(1-f))));}}return null;});
        const v=act[act.length-1];if(v)capV=v;}
    }else{paint(this.A,this.wallA,()=>null);paint(this.V,this.wallV,()=>null);}
    ctx.strokeStyle='#8a5a5a';ctx.lineWidth=1.3;for(const key of ['atr','ra','la','ven','rv','lv'])ctx.stroke(pa[key]);
    /* Faserring (isoliert Vorhöfe von Kammern) */
    ctx.strokeStyle='#b9bec8';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(92,219);ctx.quadraticCurveTo(160,215,216,209);ctx.moveTo(234,209);ctx.quadraticCurveTo(300,203,353,193);ctx.stroke();
    /* Reizleitungssystem */
    const stroke=(ln,col,w,a,b)=>{ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();let on=false;for(const p of ln){const u=p.s/(ln.len||1);if(a!=null&&(u<a||u>b)){on=false;continue;}if(on)ctx.lineTo(p.x,p.y);else{ctx.moveTo(p.x,p.y);on=true;}}ctx.stroke();};
    const base='#2f6f73';for(const key of ['ant','mid','post','bach'])stroke(this.line[key],'rgba(47,111,115,.45)',1.4);for(const key of ['his','rbb','lbb','lpf'])stroke(this.line[key],base,2.4);
    const glow=(ln,t0,dur)=>{const u=(t-t0)/dur;if(u<0||u>1.25)return;stroke(ln,'#fff3a0',5,Math.max(0,u-.45),Math.min(1,u));stroke(ln,'#ffb300',2.6,Math.max(0,u-.45),Math.min(1,u));if(u<=1){const s=u*ln.len;let p=ln[0];for(const q of ln)if(q.s<=s)p=q;ctx.fillStyle='#fff';ctx.strokeStyle='#e08a00';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(p.x,p.y,4,0,TAU);ctx.fill();ctx.stroke();}};
    const node=(c,rx,ry,col,prog)=>{ctx.beginPath();ctx.ellipse(c[0],c[1],rx,ry,0,0,TAU);ctx.fillStyle=col;ctx.fill();ctx.strokeStyle='#1d4a4d';ctx.lineWidth=1.3;ctx.stroke();
      if(prog!=null){ctx.save();ctx.beginPath();ctx.ellipse(c[0],c[1],rx,ry,0,0,TAU);ctx.clip();ctx.fillStyle='#ffd21f';ctx.fillRect(c[0]-rx,c[1]-ry,rx*2,ry*2*clamp(prog,0,1));ctx.restore();}};
    const cross=(x,y,lbl)=>{ctx.strokeStyle='#d0101c';ctx.lineWidth=3.2;ctx.beginPath();ctx.moveTo(x-7,y-7);ctx.lineTo(x+7,y+7);ctx.moveTo(x+7,y-7);ctx.lineTo(x-7,y+7);ctx.stroke();if(lbl)tag(lbl,x+12,y+4,'#b00018');};
    const tag=(s,x,y,col,al)=>{ctx.font='bold 11px Inter,system-ui,sans-serif';ctx.textAlign=al||'left';const w=ctx.measureText(s).width,x0=al==='right'?x-w:al==='center'?x-w/2:x;ctx.fillStyle='rgba(255,255,255,.86)';ctx.fillRect(x0-3,y-11,w+6,15);ctx.fillStyle=col||'#27323f';ctx.fillText(s,x,y);ctx.textAlign='left';};
    let saOn=false,nodeProg=null,cap='',blockMark=null;
    if(ev){
      for(const a of ev.A){if(!a.sinus)continue;if(t>=a.t0-.03&&t<a.t0+.05)saOn=true;for(const key of ['ant','mid','post'])glow(this.line[key],a.t0,.05);glow(this.line.bach,a.t0+.012,.04);}
      for(const n of ev.N){if(t<n.tIn||t>n.tIn+.9)continue;if(n.blk){const u=(t-n.tIn)/.07;if(n.level==='his'){if(u<1)nodeProg=u;else if(t<n.tIn+.6)blockMark={x:226,y:222,n};}else{nodeProg=Math.min(.55,u*.55);if(t>n.tIn+.05&&t<n.tIn+.6)blockMark={x:AVN[0],y:AVN[1],n};else if(t>=n.tIn+.6)nodeProg=null;}}
        else if(t<=n.tOut){nodeProg=(t-n.tIn)/Math.max(.01,n.tOut-n.tIn);cap='AV-Knoten verzögert die Überleitung (PQ-Zeit)';}}
      for(const v of ev.V){if(v.his==null||t<v.his-.03||t>v.t0+.2)continue;if(v.junct&&t<v.his+.02){nodeProg=1;}
        glow(this.line.his,v.his,.014);if(v.blockB!=='r')glow(this.line.rbb,v.his+.014,.05);if(v.blockB!=='l'){glow(this.line.lbb,v.his+.014,.008);glow(this.line.lpf,v.his+.022,.045);}}
    }
    node(SA,9,6,saOn?'#ffd21f':'#3f8f93');node(AVN,7,8,'#3f8f93',nodeProg);
    /* Zusatzbahn, Narbe, Kreise, Schrittmacher */
    const loop=(cx,cy,rx,ry,ph,dir,col)=>{ctx.strokeStyle=col||'#7a2bd0';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,TAU);ctx.stroke();ctx.setLineDash([]);const a=dir*ph*TAU;const x=cx+Math.cos(a)*rx,y=cy+Math.sin(a)*ry;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,4.5,0,TAU);ctx.fill();ctx.strokeStyle=col||'#7a2bd0';ctx.lineWidth=2;ctx.stroke();
      const a2=a+dir*.5,tx=cx+Math.cos(a2)*rx,ty=cy+Math.sin(a2)*ry;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-Math.cos(a2-dir*1.2)*8,ty-Math.sin(a2-dir*1.2)*8);ctx.stroke();};
    if(ev){const cur=ev.V.filter(v=>v.t0<=t).pop(),nxt=ev.V.find(v=>v.t0>t),rr=cur&&nxt?nxt.t0-cur.t0:(cur&&ev.V.length>1?ev.V[1].t0-ev.V[0].t0:.4),ph=cur?clamp((t-cur.t0)/rr,0,1):0;
      if(M.ap){const a=M.ap==='R'?APR:APL;ctx.strokeStyle='#7a2bd0';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(a[0],a[1]-9);ctx.lineTo(a[0],a[1]+11);ctx.stroke();tag('Zusatzbahn',a[0]+(M.ap==='R'?-6:8),a[1]-14,'#5b1ea6',M.ap==='R'?'left':'right');}
      if(M.fl)loop(150,150,46,52,fract(t/M.Tf),-1);
      if(M.avnrt){loop(AVN[0],AVN[1],15,17,fract(ph+.1),1);}
      if(M.avrt){const a=M.ap==='R'?APR:APL,pts=M.ap==='R'?[AVN,HISB,[219,290],[223,350],[233,398],[170,402],[112,345],[92,275],[90,234],[a[0],a[1]+8],[a[0],a[1]-10],[78,165],[98,108],[150,86],[205,98],[221,150],AVN]:[AVN,HISB,[241,262],[247,330],[263,402],[300,412],[346,352],[365,285],[360,216],[a[0],a[1]+8],[a[0],a[1]-10],[367,150],[330,95],[262,88],[226,108],[223,150],AVN],ln=resample(pts,4);stroke(ln,'rgba(122,43,208,.55)',2);const s=fract(ph+.04)*ln.len;let p=ln[0];for(const q of ln)if(q.s<=s)p=q;ctx.fillStyle='#fff';ctx.strokeStyle='#7a2bd0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,5,0,TAU);ctx.fill();ctx.stroke();}
      if(M.vt&&cur&&cur.pt){const p=cur.pt;ctx.fillStyle='#8c8c96';ctx.beginPath();ctx.ellipse(p.x,p.y,9,7,0,0,TAU);ctx.fill();loop(p.x,p.y,16,14,fract(ph),1);tag('Narbe',p.x+20,p.y+4,'#555');}
      if(ev.sp.length||ev.V.some(v=>v.kind==='paced')){ctx.strokeStyle='#39424f';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(116,46);ctx.bezierCurveTo(112,140,150,210,170,250);ctx.bezierCurveTo(190,300,205,370,RVAPEX[0]-4,RVAPEX[1]-4);ctx.stroke();ctx.fillStyle='#39424f';ctx.beginPath();ctx.arc(RVAPEX[0]-4,RVAPEX[1]-4,3.5,0,TAU);ctx.fill();
        if(ev.sp.some(s=>t>=s-.005&&t<s+.05)){ctx.strokeStyle='#ff2a2a';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(RVAPEX[0]-4,RVAPEX[1]-4,9,0,TAU);ctx.stroke();}}
      for(const v of ev.V){if(!v.pt||v.kind==='paced'||M.vt)continue;if(t>=v.t0-.04&&t<v.t0+.25){ctx.strokeStyle='#d0101c';ctx.lineWidth=2;const r=6+((t-v.t0+.04)*40)%8;ctx.beginPath();ctx.arc(v.pt.x,v.pt.y,r,0,TAU);ctx.stroke();ctx.fillStyle='#d0101c';ctx.beginPath();ctx.arc(v.pt.x,v.pt.y,3.5,0,TAU);ctx.fill();}}
      if(M.av3||M.av==='high'&&false){}
      if(blockMark)cross(blockMark.x,blockMark.y);
      if(capV&&capV.blockB){const p=capV.blockB==='l'?[240,258]:[220,286];cross(p[0],p[1]);}
    }
    /* Beschriftung */
    ctx.font='bold 13px Inter,system-ui,sans-serif';ctx.fillStyle='rgba(40,60,100,.55)';ctx.textAlign='center';ctx.fillText('RA',150,160);ctx.fillText('RV',160,305);ctx.fillStyle='rgba(140,50,50,.55)';ctx.fillText('LA',296,150);ctx.fillText('LV',292,310);ctx.textAlign='left';
    tag('Sinusknoten',SA[0]-12,SA[1]-14,'#1d4a4d','right');tag('AV-Knoten',AVN[0]+12,AVN[1]-2,'#1d4a4d');tag('His',HISB[0]+7,HISB[1]-6,'#1d4a4d');
    ctx.font='11px Inter,system-ui,sans-serif';ctx.fillStyle='#6a7686';ctx.fillText('rechts im Körper',18,50);ctx.textAlign='right';ctx.fillText('links im Körper',432,50);ctx.textAlign='left';
    /* Summenvektor und Ableitung */
    if(this.ecg&&this.ecg.vec&&(this.opt.vector||this.opt.axis)){const e=this.ecg,i=clamp(Math.round(t*e.fs),0,e.vec.x.length-1),vx=e.vec.x[i],vy=e.vec.y[i],vz=e.vec.z[i],K=62;
      const FR={I:0,II:60,III:120,aVR:-150,aVL:-30,aVF:90},HZ={V1:115,V2:90,V3:72,V4:55,V5:28,V6:0};const arrow=(x0,y0,dx,dy,col,w)=>{const L=Math.hypot(dx,dy);if(L<3)return;ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x0+dx,y0+dy);ctx.stroke();const a=Math.atan2(dy,dx);ctx.beginPath();ctx.moveTo(x0+dx,y0+dy);ctx.lineTo(x0+dx-Math.cos(a-.4)*9,y0+dy-Math.sin(a-.4)*9);ctx.lineTo(x0+dx-Math.cos(a+.4)*9,y0+dy-Math.sin(a+.4)*9);ctx.closePath();ctx.fill();};
      const proj=(cx,cy,R,ux,uy,px,py,lbl)=>{if(this.opt.axis){ctx.strokeStyle='rgba(20,40,80,.55)';ctx.lineWidth=1.3;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(cx-ux*R,cy-uy*R);ctx.lineTo(cx+ux*R,cy+uy*R);ctx.stroke();ctx.setLineDash([]);
          ctx.fillStyle='#fff';ctx.strokeStyle='#14284f';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx+ux*R,cy+uy*R,10,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#14284f';ctx.font='bold 9px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.fillText(lbl,cx+ux*R,cy+uy*R+3);ctx.fillText('+',cx+ux*(R+17),cy+uy*(R+17)+3);ctx.textAlign='left';
          const s=px*ux+py*uy;if(Math.abs(s)>2){ctx.strokeStyle=s>0?'rgba(10,143,78,.9)':'rgba(216,30,44,.9)';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+ux*s,cy+uy*s);ctx.stroke();
            if(this.opt.vector){ctx.strokeStyle='rgba(20,40,80,.4)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx+px,cy+py);ctx.lineTo(cx+ux*s,cy+uy*s);ctx.stroke();}}}
        if(this.opt.vector)arrow(cx,cy,px,py,'#14284f',3);};
      if(FR[this.lead]!=null){const a=FR[this.lead]*Math.PI/180;proj(236,300,150,Math.cos(a),Math.sin(a),clamp(vx*K,-150,150),clamp(vy*K,-150,150),this.lead);}
      else{/* Brustwand: Horizontalschnitt, Blick von unten */const cx=84,cy=406,R=40,a=HZ[this.lead]*Math.PI/180;ctx.fillStyle='rgba(255,255,255,.92)';ctx.strokeStyle='#9aa6b8';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(cx,cy,56,50,0,0,TAU);ctx.fill();ctx.stroke();
        ctx.font='10px Inter,system-ui,sans-serif';ctx.fillStyle='#6a7686';ctx.textAlign='center';ctx.fillText('vorne',cx,cy-53);ctx.fillText('Horizontalschnitt',cx,cy+62);ctx.textAlign='left';
        proj(cx,cy,R,Math.cos(a),-Math.sin(a),clamp(vx*24,-40,40),clamp(-vz*24,-40,40),this.lead);if(this.opt.vector)arrow(236,300,clamp(vx*K,-150,150),clamp(vy*K,-150,150),'#14284f',3);}}
    /* Text unten */
    if(ev){let c=cap;const refr=blockMark&&blockMark.n;
      if(M.vf)c='Kein geordneter Schlag – die Kammern pumpen nicht';
      else if(capV&&t<capV.t0+capV.dur){const k=capV.kind;c=k==='lbbb'?'QRS: linker Schenkel blockiert – die linke Kammer wird verspätet über das Septum erregt (breiter QRS)':k==='rbbb'?'QRS: rechter Schenkel blockiert – die rechte Kammer wird verspätet erregt (breiter QRS)':k==='paced'?'QRS: Schrittmacher reizt in der rechten Kammerspitze – Ausbreitung von Zelle zu Zelle (breiter QRS)':
          (k.startsWith('pvc')||k==='esc'||k==='vt')?'QRS: Erregung entsteht in der Kammer – langsame Ausbreitung von Zelle zu Zelle (breiter QRS)':capV.pre?'QRS: Zusatzbahn erregt die Kammer früh (Delta-Welle), dann kommt die normale Leitung dazu':capV.junct?'QRS: Erregung aus dem AV-Knoten-Bereich – Kammern normal über die Schenkel (schmaler QRS)':'QRS: Kammern werden über beide Schenkel gleichzeitig erregt (schmaler QRS)';}
      else if(refr)c=refr.level==='his'?'Blockiert unterhalb des AV-Knotens – auf diese P-Welle folgt kein QRS':refr.why==='refr'?'P-Welle wird nicht übergeleitet (AV-Knoten nicht bereit)':'Blockiert im AV-Knoten – auf diese P-Welle folgt kein QRS';
      else if(!c&&capA)c=capA.retro?'Vorhöfe werden rückwärts erregt (retrograde P-Welle)':'P-Welle: Sinusknoten erregt die Vorhöfe';
      else if(!c&&capV&&t<capV.t0+capV.qt)c='T-Welle: Erregung der Kammern bildet sich zurück';
      else if(!c)c=M.af||M.fl?'Vorhöfe ständig erregt – keine isoelektrische Linie':'Ruhe (isoelektrische Linie)';
      if(this.elC.textContent!==c)this.elC.textContent=c;}
  }
}
root.Heart2D=Heart2D;
})(typeof window!=='undefined'?window:globalThis);
