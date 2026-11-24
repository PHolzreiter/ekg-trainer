/* EKG-Trainer – Papieransicht mit Zoom, Stift, Leuchtstift, EKG-Lineal, Radierer und Messzirkel.
   Koordinaten des Papiers in Millimetern (25 mm/s, 10 mm/mV).
   Darstellungen: '4x3' (4 Spalten nacheinander + Rhythmusstreifen II) und
   '6x2' (alle 12 Ableitungen gleichzeitig, je 5 s, darunter Rhythmusstreifen II über 10 s). */
(function(root){'use strict';
const LEADS=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
const W=268,TOP=30,ROWH=38,X0=11,MMS=25,MMV=10,H4=186;
const ROWS=[['I','aVR','V1','V4'],['II','aVL','V2','V5'],['III','aVF','V3','V6']];
const COLS6=[['I','II','III','aVR','aVL','aVF'],['V1','V2','V3','V4','V5','V6']],ROW6=23.5,X6=[11,139],B6=TOP+14,RB6=B6+5*ROW6+28,H6=RB6+12;
const COLORS=['#d81e2c','#1d5fd1','#0a8f4e','#f08c00','#ffd400','#111111'];
const WIDTHS=[.3,.6,1.2];
/* EKG-Lineal (mm): Länge, Breite, Nullpunkt der Skalen */
const RL=200,RW=40,RZ=12;
const HR1=[300,250,200,180,160,150,140,130,120,110,100,90,80,75,70,65,60,55,50,45,40,35,30,25,20],HR1L=[300,150,100,75,60,50,40,30,20];
const HR2=[300,250,200,180,160,150,140,130,120,110,100,90,80,75,70,65,60,55,50,45,40,35,30,25,20],HR2L=[300,200,150,120,100,80,70,60,50,40,30,25,20];
const LAGE=[[-90,-30,'überdr. Linkstyp','#e9d5f5'],[-30,30,'Linkstyp','#d8e6fb'],[30,60,'Indifferenztyp','#d9f2e3'],[60,90,'Steiltyp','#fdf0c8'],[90,120,'Rechtstyp','#fde0cc'],[120,180,'überdr. Rechtstyp','#f9d3d6']];
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}
const F='Inter,system-ui,-apple-system,"Segoe UI",sans-serif';

class EcgPaper{
  constructor(host,opt){opt=opt||{};this.opt=opt;this.host=host;host.classList.add('ekgv');this.ro=opt.toolbar===false;
    this.bar=el('div','ekgv-bar');this.wrap=el('div','ekgv-wrap');this.cv=el('canvas');this.wrap.appendChild(this.cv);
    if(!this.ro)host.appendChild(this.bar);host.appendChild(this.wrap);this.ctx=this.cv.getContext('2d');
    this.rec=null;this.view={s:1,x:0,y:0};this.tool='pan';this.color=COLORS[0];this.wi=1;this.snap=false;
    this.layout='4x3';this.page=0;this.marks=null;this.segs=[];
    this.ink=[];this.cals=[];this.ruler=null;this.hist=[];this.remote={ink:[],cals:[],ruler:null};this.cursor=null;this.reveal=null;this.fitted=true;
    this.onInk=opt.onInk||null;this.onView=opt.onView||null;this.onLayout=opt.onLayout||null;
    if(!this.ro){this._toolbar();this._events();}else this.cv.style.pointerEvents='none';
    new ResizeObserver(()=>this._resize()).observe(this.wrap);this._resize();}
  get H(){return this.layout==='6x2'?H6:H4;}
  _toolbar(){const b=this.bar;b.innerHTML='';const mk=(id,label,title)=>{const x=el('button','ekgv-btn',label);x.dataset.tool=id;x.title=title||label;x.onclick=()=>this.setTool(id);b.appendChild(x);return x;};
    mk('pan','Bewegen','Verschieben und Zoomen');mk('pen','Stift','Zeichnen (an der Linealkante wird die Linie gerade)');mk('hl','Leuchtstift','Durchscheinend markieren');
    mk('ruler','EKG-Lineal','EKG-Lineal anlegen: ziehen = verschieben, runder Griff = drehen. Nochmal klicken = weglegen');
    mk('cal','Messen','Messzirkel: von Punkt zu Punkt ziehen');mk('erase','Radierer','Striche und Messungen entfernen');
    const cols=el('span','ekgv-cols');COLORS.forEach(c=>{const s=el('button','ekgv-col');s.style.background=c;s.title='Farbe';s.onclick=()=>{this.color=c;this._marks();if(!['pen','hl','cal'].includes(this.tool))this.setTool('pen');};s.dataset.c=c;cols.appendChild(s);});b.appendChild(cols);
    const ws=el('span','ekgv-ws');WIDTHS.forEach((w,i)=>{const s=el('button','ekgv-w');s.title=['Fein','Mittel','Dick'][i];s.dataset.w=i;const d=el('i');d.style.width=d.style.height=(4+i*4)+'px';s.appendChild(d);s.onclick=()=>{this.wi=i;this._marks();};ws.appendChild(s);});b.appendChild(ws);
    const sn=el('label','ekgv-chk');const cb=el('input');cb.type='checkbox';cb.onchange=()=>{this.snap=cb.checked;};sn.appendChild(cb);sn.appendChild(document.createTextNode(' Raster'));sn.title='Messpunkte rasten am Millimeterraster ein';b.appendChild(sn);
    const sp=el('span','ekgv-sp');b.appendChild(sp);
    const lay=el('select','ekgv-sel');lay.title='Darstellung';lay.appendChild(new Option('4×3 nacheinander','4x3'));lay.appendChild(new Option('6×2 gleichzeitig','6x2'));lay.onchange=()=>this.setLayout(lay.value,this.page,true);this.elLay=lay;
    const pg=el('button','ekgv-btn','0–5 s');pg.title='Zeitabschnitt der beiden Spalten wechseln';pg.onclick=()=>this.setLayout(this.layout,1-this.page,true);this.elPage=pg;
    const un=el('button','ekgv-btn','↶');un.title='Rückgängig';un.onclick=()=>this.undo();
    const z1=el('button','ekgv-btn','−');z1.onclick=()=>this.zoomBy(1/1.4);const z2=el('button','ekgv-btn','+');z2.onclick=()=>this.zoomBy(1.4);
    const fit=el('button','ekgv-btn','Einpassen');fit.onclick=()=>this.fit();const clr=el('button','ekgv-btn','Alles löschen');clr.onclick=()=>this.clearInk();
    b.append(lay,pg,un,z1,z2,fit,clr);this._marks();}
  _marks(){if(this.ro)return;this.bar.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('on',x.dataset.tool===this.tool||(x.dataset.tool==='ruler'&&this.ruler&&this._cur(this.ruler))));
    this.bar.querySelectorAll('.ekgv-col').forEach(x=>x.classList.toggle('on',x.dataset.c===this.color));
    this.bar.querySelectorAll('.ekgv-w').forEach(x=>x.classList.toggle('on',+x.dataset.w===this.wi));
    if(this.elLay){this.elLay.value=this.layout;this.elPage.style.display=this.layout==='6x2'?'':'none';this.elPage.textContent=this.page?'5–10 s':'0–5 s';}
    this.cv.style.cursor=this.tool==='pan'?'grab':this.tool==='ruler'?'move':'crosshair';}
  get lk(){return this.layout==='6x2'?'b'+this.page:'a';}
  _cur(o){return (o.L||'a')===this.lk;}
  setLayout(l,page,user){l=l==='6x2'?'6x2':'4x3';page=l==='6x2'&&page?1:0;if(l===this.layout&&page===this.page)return;const ch=l!==this.layout;this.layout=l;this.page=page;this._marks();if(ch&&this.fitted)this.fit();else this.draw();if(user&&this.onLayout)this.onLayout({l,page});}
  setTool(t){if(t==='ruler'){const r=this.ruler;if(r&&this._cur(r)&&this.tool==='ruler'){this.ruler=null;this.tool='pan';this._changed();}
      else{if(!r||!this._cur(r)){const g=this.getView();this.ruler={x:+(g.cx-RL/2).toFixed(1),y:+(g.cy-RW/2).toFixed(1),a:0,L:this.lk};this._changed();}this.tool='ruler';}}
    else this.tool=t;this._marks();this.draw();}
  setRecord(rec,keepInk){this.rec=rec;this.reveal=null;if(!keepInk){this.ink=[];this.cals=[];this.hist=[];}this.draw();}
  setReveal(lines){this.reveal=lines&&lines.length?lines:null;this.draw();}
  setRemote(r){this.remote=r||{ink:[],cals:[],ruler:null};this.draw();}
  /* marks: {Ableitung:{c:Farbe,t:Text}} – Rahmen um Ableitungen (z. B. ST-Hebung/-Senkung) */
  setMarks(m){this.marks=m&&Object.keys(m).length?m:null;this.draw();}
  setCursor(t){this.cursor=t;if(t!=null&&this.layout==='6x2'){const p=t>=5?1:0;if(p!==this.page){this.page=p;this._marks();}}this.draw();}
  getInk(){return {ink:this.ink,cals:this.cals,ruler:this.ruler};}
  clearInk(){this.ink=[];this.cals=[];this.ruler=null;this.hist=[];if(this.tool==='ruler')this.tool='pan';this._marks();this._changed();this.draw();}
  undo(){const o=this.hist.pop();if(!o)return;let i=this.ink.indexOf(o);if(i>=0)this.ink.splice(i,1);i=this.cals.indexOf(o);if(i>=0)this.cals.splice(i,1);this._changed();this.draw();}
  _changed(){if(this.onInk)this.onInk(this.getInk());}
  _resize(){const r=this.wrap.getBoundingClientRect();if(r.width<10||r.height<10)return;const d=Math.max(1,root.devicePixelRatio||1);this.dpr=d;this.pw=r.width;this.ph=r.height;
    this.cv.width=Math.round(r.width*d);this.cv.height=Math.round(r.height*d);this.cv.style.width=r.width+'px';this.cv.style.height=r.height+'px';
    if(this.fitted)this.fit();else this.draw();}
  _base(){return Math.min(this.pw/W,this.ph/this.H);}
  fit(){if(!this.pw)return;const s=this._base();this.view={s,x:(this.pw-W*s)/2,y:(this.ph-this.H*s)/2};this.fitted=true;this.draw();if(this.onView)this.onView(this.getView());}
  getView(){const v=this.view;return {cx:(this.pw/2-v.x)/v.s,cy:(this.ph/2-v.y)/v.s,z:v.s/this._base(),fit:this.fitted};}
  setView(o){if(!this.pw)return;if(o.fit){this.fit();return;}const s=o.z*this._base();this.view={s,x:this.pw/2-o.cx*s,y:this.ph/2-o.cy*s};this.fitted=o.z<=1.001;this.draw();}
  zoomBy(f,px,py){const v=this.view;px=px==null?this.pw/2:px;py=py==null?this.ph/2:py;const min=this._base()*.9,ns=Math.max(min,Math.min(v.s*f,60));const k=ns/v.s;
    v.x=px-(px-v.x)*k;v.y=py-(py-v.y)*k;v.s=ns;this.fitted=false;this._clamp();this.draw();if(this.onView)this.onView(this.getView());}
  _clamp(){const v=this.view,m=40;v.x=Math.min(this.pw-m,Math.max(m-W*v.s,v.x));v.y=Math.min(this.ph-m,Math.max(m-this.H*v.s,v.y));}
  _mm(e){const r=this.cv.getBoundingClientRect();const px=e.clientX-r.left,py=e.clientY-r.top;return {px,py,x:(px-this.view.x)/this.view.s,y:(py-this.view.y)/this.view.s};}
  _snap(p){if(!this.snap)return p;return {...p,x:Math.round(p.x*2)/2,y:Math.round(p.y*2)/2};}
  /* EKG-Lineal: lokale Koordinaten (u entlang, v quer), Ursprung = linke obere Ecke */
  _loc(r,p){const c=Math.cos(r.a),s=Math.sin(r.a),dx=p.x-r.x,dy=p.y-r.y;return {u:dx*c+dy*s,v:-dx*s+dy*c};}
  _glob(r,u,v){const c=Math.cos(r.a),s=Math.sin(r.a);return {x:r.x+u*c-v*s,y:r.y+u*s+v*c};}
  _knob(r){return this._glob(r,RL+7,RW/2);}
  _rulerHit(p){const r=this.ruler;if(!r||!this._cur(r))return null;const k=this._knob(r);if(Math.hypot(p.x-k.x,p.y-k.y)<Math.max(4.5,20/this.view.s))return 'rot';
    const q=this._loc(r,p);if(q.u>=-1&&q.u<=RL+1&&q.v>=-1&&q.v<=RW+1)return 'm';return null;}
  _edgeSnap(p){const r=this.ruler;if(!r||!this._cur(r))return null;const q=this._loc(r,p);if(q.u<-3||q.u>RL+3)return null;const tol=Math.max(1.6,14/this.view.s);
    for(const off of [0,RW])if(Math.abs(q.v-off)<tol)return {r,off};return null;}
  _onEdge(e,p){const q=this._loc(e.r,p);return this._glob(e.r,q.u,e.off);}
  _events(){const cv=this.cv,pts=new Map();let pinch=null,drag=null;cv.style.touchAction='none';
    const startPan=p=>{drag={pan:true,px:p.px,py:p.py,x:this.view.x,y:this.view.y};cv.style.cursor='grabbing';};
    cv.addEventListener('wheel',e=>{e.preventDefault();const p=this._mm(e);this.zoomBy(Math.exp(-e.deltaY*.0015),p.px,p.py);},{passive:false});
    cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);const p=this._mm(e);pts.set(e.pointerId,p);
      if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:Math.hypot(a.px-b.px,a.py-b.py),s:this.view.s};if(drag&&drag.stroke){this.ink.pop();this.hist.pop();}drag=null;return;}
      const rh=this._rulerHit(p);
      if(this.tool==='ruler'||(rh==='rot'&&this.tool==='pan')){if(rh){const r=this.ruler;drag={ruler:rh,p0:p,x:r.x,y:r.y,a:r.a};}else startPan(p);}
      else if(this.tool==='pan')startPan(p);
      else if(this.tool==='pen'||this.tool==='hl'){const hl=this.tool==='hl';const edge=this._edgeSnap(p);const q=edge?this._onEdge(edge,p):p;
        const s={c:this.color,w:hl?[2.5,4,6.5][this.wi]:WIDTHS[this.wi],p:[+q.x.toFixed(2),+q.y.toFixed(2)],L:this.lk};if(hl)s.h=1;this.ink.push(s);this.hist.push(s);drag={stroke:s,edge};}
      else if(this.tool==='cal'){const a=this._snap(p);const c={c:this.color,a:[a.x,a.y],b:[a.x,a.y],L:this.lk};this.cals.push(c);this.hist.push(c);drag={cal:c};}
      else if(this.tool==='erase'){drag={erase:true};this._erase(p);}
      this.draw();});
    cv.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;const p=this._mm(e);pts.set(e.pointerId,p);
      if(pinch&&pts.size===2){const [a,b]=[...pts.values()];const d=Math.hypot(a.px-b.px,a.py-b.py);const mx=(a.px+b.px)/2,my=(a.py+b.py)/2;
        if(pinch.mx!=null){this.view.x+=mx-pinch.mx;this.view.y+=my-pinch.my;}pinch.mx=mx;pinch.my=my;this.zoomBy(d/pinch.d*pinch.s/this.view.s,mx,my);return;}
      if(!drag)return;
      if(drag.pan){this.view.x=drag.x+p.px-drag.px;this.view.y=drag.y+p.py-drag.py;this.fitted=false;this._clamp();}
      else if(drag.ruler){const r=this.ruler;
        if(drag.ruler==='m'){r.x=+(drag.x+p.x-drag.p0.x).toFixed(2);r.y=+(drag.y+p.y-drag.p0.y).toFixed(2);}
        else{/* drehen um die Mitte */const c0=this._glob({x:drag.x,y:drag.y,a:drag.a},RL/2,RW/2);let a=Math.atan2(p.y-c0.y,p.x-c0.x)-Math.atan2(0,RL/2+7);
          for(const k of [0,Math.PI/2,Math.PI,-Math.PI/2,-Math.PI])if(Math.abs(a-k)<.035)a=k;r.a=+a.toFixed(4);const o=this._glob({x:0,y:0,a:r.a},RL/2,RW/2);r.x=+(c0.x-o.x).toFixed(2);r.y=+(c0.y-o.y).toFixed(2);}}
      else if(drag.stroke){const ev=e.getCoalescedEvents?e.getCoalescedEvents():[e];for(const ce of (ev.length?ev:[e])){let q=this._mm(ce);if(drag.edge)q=this._onEdge(drag.edge,q);
          const s=drag.stroke.p,n=s.length;if(drag.edge&&n>=4){s[n-2]=+q.x.toFixed(2);s[n-1]=+q.y.toFixed(2);}else if(Math.hypot(q.x-s[n-2],q.y-s[n-1])>Math.max(.12,.9/this.view.s))s.push(+q.x.toFixed(2),+q.y.toFixed(2));}}
      else if(drag.cal){const b=this._snap(p);drag.cal.b=[b.x,b.y];}
      else if(drag.erase)this._erase(p);
      this.draw();});
    const up=e=>{if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size<2)pinch=null;
      if(drag){if(drag.cal&&Math.hypot(drag.cal.a[0]-drag.cal.b[0],drag.cal.a[1]-drag.cal.b[1])<.6){this.cals.pop();this.hist.pop();}
        if(drag.stroke&&drag.stroke.p.length<4)drag.stroke.p.push(drag.stroke.p[0]+.1,drag.stroke.p[1]+.1);
        if(drag.pan){if(this.onView)this.onView(this.getView());}else this._changed();}
      drag=null;this._marks();this.draw();};
    cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
    cv.addEventListener('dblclick',()=>{if(this.tool==='pan')this.fit();});}
  _erase(p){const r=2.2/Math.max(1,this.view.s/6);const hit=(x,y,w)=>Math.hypot(x-p.x,y-p.y)<Math.max(1.2,r)+(w||0)/2;const n0=this.ink.length+this.cals.length;
    this.ink=this.ink.filter(s=>{if(!this._cur(s))return true;const q=s.p;for(let i=0;i<q.length;i+=2){if(hit(q[i],q[i+1],s.w))return false;
        if(i+3<q.length){const d=Math.hypot(q[i+2]-q[i],q[i+3]-q[i+1]),n=Math.min(40,Math.floor(d));for(let k=1;k<n;k++)if(hit(q[i]+(q[i+2]-q[i])*k/n,q[i+1]+(q[i+3]-q[i+1])*k/n,s.w))return false;}}return true;});
    this.cals=this.cals.filter(c=>{if(!this._cur(c))return true;for(let k=0;k<=10;k++){const x=c.a[0]+(c.b[0]-c.a[0])*k/10,y=c.a[1]+(c.b[1]-c.a[1])*k/10;if(hit(x,y))return false;}return true;});
    if(this.ink.length+this.cals.length!==n0)this.hist=this.hist.filter(o=>this.ink.includes(o)||this.cals.includes(o));}
  /* Zellen der Ableitungen in der aktuellen Darstellung (für Rahmen) */
  _cells(){const out=[];if(this.layout==='6x2'){for(let c=0;c<2;c++)for(let r=0;r<6;r++)out.push({L:COLS6[c][r],x:X6[c]-.5,y:B6+r*ROW6-ROW6/2,w:126,h:ROW6});}
    else for(let r=0;r<3;r++)for(let c=0;c<4;c++)out.push({L:ROWS[r][c],x:X0+c*62.5+.4,y:TOP+19+r*ROWH-ROWH/2+.5,w:61.7,h:ROWH-1});return out;}
  draw(){if(this._raf)return;this._raf=requestAnimationFrame(()=>{this._raf=0;this._draw();});}
  _draw(){const ctx=this.ctx,v=this.view,d=this.dpr||1,H=this.H;if(!this.pw)return;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=this.opt.bg||'#e9edf3';ctx.fillRect(0,0,this.cv.width,this.cv.height);
    ctx.setTransform(v.s*d,0,0,v.s*d,v.x*d,v.y*d);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff6f4';ctx.fillRect(0,TOP,W,H-TOP);
    const fine=v.s>2.2;const xa=Math.max(0,Math.floor(-v.x/v.s)),xb=Math.min(W,Math.ceil((this.pw-v.x)/v.s)),ya=Math.max(TOP,Math.floor(-v.y/v.s)),yb=Math.min(H,Math.ceil((this.ph-v.y)/v.s));
    const line=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
    for(let x=xa;x<=xb;x++){const big=x%5===0;if(!big&&!fine)continue;ctx.strokeStyle=big?'#eda3a3':'#f8d7d5';ctx.lineWidth=big?.16:.08;line(x,Math.max(TOP,ya),x,yb);}
    for(let y=ya;y<=yb;y++){const big=(y-TOP)%5===0;if(!big&&!fine)continue;ctx.strokeStyle=big?'#eda3a3':'#f8d7d5';ctx.lineWidth=big?.16:.08;line(xa,y,xb,y);}
    const rec=this.rec;this.segs=[];
    if(rec){const h=rec.head||{},f=x=>x==null?'—':x;ctx.fillStyle='#111';ctx.textAlign='left';ctx.textBaseline='alphabetic';
      ctx.font='bold 4.4px '+F;ctx.fillText('12-Kanal-EKG',4,7);ctx.font='3.1px '+F;
      ctx.textAlign='right';ctx.fillText('25 mm/s   10 mm/mV   0,05–150 Hz'+(this.layout==='6x2'?`   Spalten ${this.page?'5–10':'0–5'} s`:''),W-4,7);if(rec.note)ctx.fillText(rec.note,W-4,12);ctx.textAlign='left';
      if(h.sex)ctx.fillText(`Pat.: ${h.sex}, ${h.age} J.`,4,12);
      if(h.show!==false){ctx.font='bold 3.3px '+F;ctx.fillText(`HF ${h.hr?h.hr+'/min':'—'}    PQ ${f(h.pr)} ms    QRS ${f(h.qrs)} ms    QT/QTc ${f(h.qt)}/${f(h.qtc)} ms    P-QRS-T-Achse ${f(h.axP)}°/${f(h.axQRS)}°/${f(h.axT)}°`,4,17.5);}
      if(this.reveal){ctx.font='3.0px '+F;const txt=this.reveal.join('  ·  ');ctx.fillStyle=txt.includes('***')?'#b00018':'#0b3a8f';ctx.fillText(txt,4,23.5,W-8);}
      if(this.marks){for(const c of this._cells()){const m=this.marks[c.L];if(!m)continue;ctx.fillStyle=m.c;ctx.globalAlpha=.09;ctx.fillRect(c.x,c.y,c.w,c.h);ctx.globalAlpha=1;ctx.strokeStyle=m.c;ctx.lineWidth=.55;ctx.strokeRect(c.x,c.y,c.w,c.h);
          if(m.t){ctx.font='bold 3px '+F;const tw=ctx.measureText(m.t).width;ctx.fillStyle=m.c;ctx.fillRect(c.x+c.w-tw-2.6,c.y+.6,tw+2,4.2);ctx.fillStyle='#fff';ctx.fillText(m.t,c.x+c.w-tw-1.6,c.y+3.8);}}}
      const fs=rec.fs;ctx.strokeStyle='#101010';ctx.lineWidth=Math.max(.14,Math.min(.24,.9/v.s+.1));ctx.lineJoin='round';ctx.fillStyle='#111';
      const trace=(L,i0,i1,x0,b)=>{const arr=rec.leads[L];i1=Math.min(arr.length,i1);ctx.beginPath();for(let i=i0;i<i1;i++){const x=x0+(i-i0)/fs*MMS,y=b-arr[i]*MMV;i===i0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();this.segs.push({L,i0,i1,x0,b});};
      const calib=(x,b)=>{ctx.beginPath();ctx.moveTo(x,b);ctx.lineTo(x+1.5,b);ctx.lineTo(x+1.5,b-10);ctx.lineTo(x+6.5,b-10);ctx.lineTo(x+6.5,b);ctx.lineTo(x+8,b);ctx.stroke();};
      ctx.font='bold 3.4px '+F;
      if(this.layout==='6x2'){const i0=Math.round(this.page*5*fs);
        for(let c=0;c<2;c++)for(let r=0;r<6;r++){const L=COLS6[c][r],b=B6+r*ROW6,x0=X6[c];if(c===0)calib(2,b);trace(L,i0,i0+Math.round(5*fs),x0,b);ctx.fillText(L,x0+1.2,b-7.5);}
        ctx.beginPath();ctx.moveTo(X6[1]-1.5,TOP+2);ctx.lineTo(X6[1]-1.5,B6+5*ROW6+10);ctx.strokeStyle='#c98f8f';ctx.lineWidth=.2;ctx.stroke();ctx.strokeStyle='#101010';ctx.lineWidth=Math.max(.14,Math.min(.24,.9/v.s+.1));
        calib(2,RB6);trace('II',0,fs*10,X0,RB6);ctx.fillText('II',X0+1.2,RB6-8);}
      else for(let r=0;r<4;r++){const b=TOP+19+r*ROWH;calib(2,b);
        if(r<3){for(let c=0;c<4;c++){const L=ROWS[r][c],i0=Math.round(c*2.5*fs),i1=Math.round((c+1)*2.5*fs),x0=X0+c*2.5*MMS;trace(L,i0,i1,x0,b);ctx.fillText(L,x0+1.2,b-11);
            if(c>0){ctx.beginPath();ctx.moveTo(x0,b-3);ctx.lineTo(x0,b+3);ctx.stroke();}}}
        else{trace('II',0,fs*10,X0,b);ctx.fillText('II',X0+1.2,b-11);}}
      ctx.font='2.6px '+F;ctx.fillStyle='#8a5a5a';ctx.fillText(rec.footer||'Synthetisches Trainings-EKG',4,H-2);
    }else{ctx.fillStyle='#5b6678';ctx.font='6px '+F;ctx.textAlign='center';ctx.fillText(this.opt.empty||'Noch kein EKG',W/2,H/2);ctx.textAlign='left';}
    const path=s=>{const q=s.p,n=q.length;ctx.beginPath();ctx.moveTo(q[0],q[1]);if(n<=4){ctx.lineTo(q[n-2],q[n-1]);}else{for(let i=2;i<n-2;i+=2){const mx=(q[i]+q[i+2])/2,my=(q[i+1]+q[i+3])/2;ctx.quadraticCurveTo(q[i],q[i+1],mx,my);}ctx.lineTo(q[n-2],q[n-1]);}ctx.stroke();};
    const strokes=(list,alpha,hl)=>{ctx.lineJoin='round';for(const s of list){if(!this._cur(s)||!!s.h!==hl)continue;ctx.globalAlpha=hl?.38*alpha:alpha;ctx.lineCap=hl?'butt':'round';ctx.strokeStyle=s.c;ctx.lineWidth=s.w||.5;path(s);}ctx.globalAlpha=1;ctx.lineCap='butt';};
    ctx.globalCompositeOperation='multiply';strokes(this.remote.ink||[],.9,true);strokes(this.ink,1,true);ctx.globalCompositeOperation='source-over';
    if(this.cursor!=null&&rec)this._drawCursor(this.cursor);
    strokes(this.remote.ink||[],.9,false);strokes(this.ink,1,false);
    const cal=(c)=>{if(!this._cur(c))return;const [ax,ay]=c.a,[bx,by]=c.b;ctx.strokeStyle=c.c;ctx.fillStyle=c.c;ctx.lineWidth=.3;const k=Math.max(.6,Math.min(1.6,7/v.s));
      line(ax,ay-3*k,ax,ay+3*k);line(bx,by-3*k,bx,by+3*k);line(ax,ay,bx,ay);if(Math.abs(by-ay)>.4){ctx.setLineDash([.8,.8]);line(bx,ay,bx,by);ctx.setLineDash([]);}
      const dt=Math.abs(bx-ax)/MMS*1000,dv=(ay-by)/MMV;let t=`${Math.round(dt)} ms`;if(dt>=200&&dt<=3000)t+=` · ${Math.round(60000/dt)}/min`;if(Math.abs(dv)>=.04)t+=` · ${dv>0?'+':''}${dv.toFixed(2).replace('.',',')} mV`;
      ctx.font=`bold ${3*k}px ${F}`;const tw=ctx.measureText(t).width,tx=(ax+bx)/2-tw/2,ty=Math.min(ay,by)-2.2*k;ctx.fillStyle='rgba(255,255,255,.88)';ctx.fillRect(tx-.8,ty-3*k,tw+1.6,3.9*k);ctx.fillStyle=c.c;ctx.fillText(t,tx,ty);};
    for(const c of (this.remote.cals||[]))cal(c);for(const c of this.cals)cal(c);
    if(this.remote.ruler)this._drawRuler(this.remote.ruler,false);if(this.ruler)this._drawRuler(this.ruler,this.tool==='ruler');
  }
  /* wandernder Punkt: zeigt in jeder sichtbaren Ableitung, wo die Erregung gerade ist */
  _drawCursor(t){const ctx=this.ctx,rec=this.rec,fs=rec.fs,v=this.view,i=Math.round(t*fs),r=Math.max(.75,Math.min(1.6,4.2/v.s));
    for(const s of this.segs){if(i<s.i0||i>=s.i1)continue;const a=rec.leads[s.L],X=k=>s.x0+(k-s.i0)/fs*MMS,Y=k=>s.b-a[k]*MMV,j0=Math.max(s.i0,i-Math.round(.12*fs));
      ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='rgba(255,140,0,.55)';ctx.lineWidth=Math.max(.6,2.4/v.s);ctx.beginPath();for(let k=j0;k<=i;k++){k===j0?ctx.moveTo(X(k),Y(k)):ctx.lineTo(X(k),Y(k));}ctx.stroke();
      ctx.beginPath();ctx.arc(X(i),Y(i),r,0,7);ctx.fillStyle='#ff7a00';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=r*.35;ctx.stroke();ctx.beginPath();ctx.arc(X(i),Y(i),r*1.6,0,7);ctx.strokeStyle='rgba(255,122,0,.45)';ctx.lineWidth=r*.3;ctx.stroke();}
    ctx.lineCap='butt';}
  _drawRuler(r,active){if(!this._cur(r))return;const ctx=this.ctx,v=this.view;ctx.save();ctx.translate(r.x,r.y);ctx.rotate(r.a);
    const ink='rgba(40,40,60,.92)',fine=v.s>1.3;
    ctx.fillStyle='rgba(225,240,255,.22)';ctx.strokeStyle='rgba(30,70,140,.8)';ctx.lineWidth=.25;
    ctx.beginPath();if(ctx.roundRect)ctx.roundRect(0,0,RL,RW,2.2);else ctx.rect(0,0,RL,RW);ctx.fill();ctx.stroke();
    ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.textBaseline='alphabetic';
    const tick=(u,y0,y1,w)=>{ctx.lineWidth=w||.14;ctx.beginPath();ctx.moveTo(u,y0);ctx.lineTo(u,y1);ctx.stroke();};
    const txt=(s,u,y,sz,al,b)=>{ctx.font=(b?'bold ':'')+sz+'px '+F;ctx.textAlign=al||'center';ctx.fillText(s,u,y);};
    /* Nullpunkt-Pfeil */
    ctx.fillStyle='#d0101c';ctx.beginPath();ctx.moveTo(RZ-1.4,0);ctx.lineTo(RZ+1.4,0);ctx.lineTo(RZ,2.4);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(RZ-1.4,RW);ctx.lineTo(RZ+1.4,RW);ctx.lineTo(RZ,RW-2.4);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(208,16,28,.5)';tick(RZ,2.4,RW-2.4,.12);ctx.strokeStyle=ink;ctx.fillStyle=ink;
    /* Herzfrequenz: 1 RR-Abstand (Reihe oben) und 2 RR-Abstände (Reihe darunter) */
    for(const hr of HR1){const u=RZ+1500/hr;tick(u,0,HR1L.includes(hr)?2.6:1.6);if(HR1L.includes(hr))txt(String(hr),u,4.7,1.9);}
    ctx.strokeStyle='rgba(30,70,140,.35)';ctx.beginPath();ctx.moveTo(RZ,6.2);ctx.lineTo(RZ+150,6.2);ctx.lineWidth=.1;ctx.stroke();ctx.strokeStyle=ink;
    for(const hr of HR2){const u=RZ+3000/hr;if(u>RZ+152)continue;tick(u,6.2,HR2L.includes(hr)?8.6:7.6);if(HR2L.includes(hr))txt(String(hr),u,10.8,1.9);}
    txt('HF/min · 1 RR',RZ+56,4.7,1.7,'left',true);txt('HF/min · 2 RR (genauer)',RZ+122,10.8,1.7,'left',true);
    txt('Pfeil ▼ auf eine R-Zacke legen, an der nächsten (1 RR) bzw. übernächsten R-Zacke (2 RR) ablesen · 25 mm/s',RZ+1,14.2,1.55,'left');
    /* Zeitskala unten */
    for(let m=0;m<=150;m++){const u=RZ+m,big=m%5===0;if(!big&&!fine)continue;tick(u,RW,RW-(m%25===0?3.2:big?2.3:1.2),m%25===0?.2:.13);if(big&&m>0)txt((m*.04).toFixed(1).replace('.',','),u,RW-3.6,1.75);}
    txt('s',RZ+152,RW-3.6,1.9,'left',true);txt('1 mm = 40 ms · 5 mm = 0,2 s',RZ+1,RW-6.8,1.55,'left');
    /* mV-Skala links (senkrecht, von der Unterkante) */
    for(let k=0;k<=30;k++){const y=RW-k,big=k%5===0;if(!big&&!fine)continue;ctx.lineWidth=big?.18:.11;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(big?3.4:1.8,y);ctx.stroke();if(big&&k>0&&k<30)txt((k/10).toFixed(1).replace('.',','),4,y+.7,1.6,'left');}
    txt('mV',4,RW-31.2,1.7,'left',true);
    /* Normwerte */
    const nx=RZ+4,ny=19;ctx.fillStyle=ink;
    txt('Normwerte Erwachsene (Orientierung)',nx,ny,1.9,'left',true);
    txt('P < 120 ms   ·   PQ 120–200 ms   ·   QRS < 110 ms (≥ 120 ms = kompletter Block)',nx,ny+3.2,1.75,'left');
    txt('QTc verlängert: ♂ ≥ 450 ms, ♀ ≥ 460 ms   ·   Spannung: 10 mm = 1 mV',nx,ny+6.4,1.75,'left');
    /* Cabrera-Kreis */
    const cx=RL-21,cy=RW/2,R=15.5,rad=a=>a*Math.PI/180;
    for(const [a0,a1,name,col] of LAGE){ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,rad(a0),rad(a1));ctx.closePath();ctx.fillStyle=col;ctx.globalAlpha=.85;ctx.fill();ctx.globalAlpha=1;}
    ctx.strokeStyle=ink;ctx.lineWidth=.15;ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.stroke();
    for(const [L,a] of [['I',0],['II',60],['III',120],['aVF',90],['aVL',-30],['aVR',-150]]){const x=Math.cos(rad(a)),y=Math.sin(rad(a));ctx.lineWidth=.12;ctx.beginPath();ctx.moveTo(cx-x*R,cy-y*R);ctx.lineTo(cx+x*R,cy+y*R);ctx.stroke();
      ctx.fillStyle=ink;txt(L,cx+x*(R+2.6),cy+y*(R+2.6)+.7,1.7,'center',true);}
    ctx.fillStyle=ink;for(const [a0,a1,name] of LAGE){const m=rad((a0+a1)/2);ctx.save();ctx.translate(cx+Math.cos(m)*R*.62,cy+Math.sin(m)*R*.62);txt(name.replace('überdr. ','ü. '),0,.5,1.35,'center');ctx.restore();}
    txt('Lagetyp (Cabrera)',cx,RW-.8,1.6,'center',true);
    ctx.restore();
    if(active){const k=this._knob(r),rr=Math.max(2.2,9/v.s);ctx.beginPath();ctx.arc(k.x,k.y,rr,0,7);ctx.fillStyle='rgba(29,95,209,.9)';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=rr*.18;ctx.stroke();
      ctx.beginPath();ctx.arc(k.x,k.y,rr*.5,-.4,3.6);ctx.stroke();}}
}

/* Live-Monitor: eine Ableitung läuft durch */
class EcgMonitor{
  constructor(host,opt){this.opt=opt||{};this.host=host;host.classList.add('ekgm');
    host.innerHTML='<div class="ekgm-top"><span class="ekgm-lead"></span><span class="ekgm-info"></span></div><div class="ekgm-body"><canvas></canvas><div class="ekgm-hr"><div class="ekgm-lbl">HF /min</div><div class="ekgm-val">--</div></div></div>';
    this.cv=host.querySelector('canvas');this.ctx=this.cv.getContext('2d');this.elLead=host.querySelector('.ekgm-lead');this.elInfo=host.querySelector('.ekgm-info');this.elHr=host.querySelector('.ekgm-val');
    this.win=6;this.gain=1;this.beepOn=false;this.paused=false;this.data=null;this.onTime=null;
    new ResizeObserver(()=>this._size()).observe(this.cv);this._tick=this._tick.bind(this);requestAnimationFrame(this._tick);}
  /* data: {fs, sig:Float32Array (Schleife), qrs:[s], lead, noQrs:'vf'|'asys'|null} */
  setData(d){this.data=d;this.t=0;this.sweep=0;this.last=null;this.hist=[];this.lastBeat=-99;this.prev=null;this.elLead.textContent=d?d.lead:'';this.elHr.textContent='--';this._size();}
  setInfo(t){this.elInfo.textContent=t;}
  _size(){const d=Math.max(1,root.devicePixelRatio||1),r=this.cv.getBoundingClientRect();if(r.width<5)return;this.cv.width=Math.round(r.width*d);this.cv.height=Math.round(r.height*d);this.ctx.setTransform(d,0,0,d,0,0);this.ctx.fillStyle='#05090b';this.ctx.fillRect(0,0,r.width,r.height);this.prev=null;}
  beep(){if(!this.beepOn)return;try{const A=EcgMonitor.audio=EcgMonitor.audio||new (root.AudioContext||root.webkitAudioContext)();if(A.state==='suspended')A.resume();
      const t=A.currentTime+.005,dur=.065,o1=A.createOscillator(),o2=A.createOscillator(),g=A.createGain(),g2=A.createGain(),lp=A.createBiquadFilter();
      o1.type='square';o1.frequency.value=950;o2.type='sine';o2.frequency.value=950;lp.type='lowpass';lp.frequency.value=2600;g2.gain.value=.35;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.09,t+.004);g.gain.setValueAtTime(.09,t+dur-.012);g.gain.linearRampToValueAtTime(0,t+dur);
      o1.connect(lp);o2.connect(g2);g2.connect(lp);lp.connect(g);g.connect(A.destination);o1.start(t);o2.start(t);o1.stop(t+dur+.01);o2.stop(t+dur+.01);}catch(e){}}
  _tick(ts){requestAnimationFrame(this._tick);const D=this.data;if(!D||!this.cv.clientWidth||this.host.offsetParent===null){this.last=null;return;}
    if(this.last==null){this.last=ts;return;}const dt=Math.min(.1,(ts-this.last)/1000);this.last=ts;if(this.paused)return;
    const ctx=this.ctx,Wp=this.cv.clientWidth,Hp=this.cv.clientHeight,fs=D.fs,len=D.sig.length,pxS=Wp/this.win,mid=Hp*.55,sc=Hp*.28*this.gain,t0=this.t,t1=t0+dt;
    ctx.strokeStyle='#3dff7a';ctx.lineWidth=1.6;ctx.lineJoin='round';ctx.beginPath();let first=true;
    for(let s=Math.floor(t0*fs);s<=Math.floor(t1*fs);s++){const x=((this.sweep+(s/fs-t0))%this.win)*pxS,y=mid-D.sig[((s%len)+len)%len]*sc;
      if(this.prev&&x<this.prev[0]){ctx.stroke();ctx.beginPath();first=true;}
      if(first){if(this.prev&&x>=this.prev[0])ctx.moveTo(this.prev[0],this.prev[1]);else ctx.moveTo(x,y);first=false;}ctx.lineTo(x,y);this.prev=[x,y];}
    ctx.stroke();const xe=((this.sweep+dt)%this.win)*pxS;ctx.fillStyle='#05090b';ctx.fillRect(xe+1,0,16,Hp);if(xe+17>Wp)ctx.fillRect(0,0,xe+17-Wp,Hp);
    const L=len/fs,a=t0%L,b=t1%L;
    for(const q of D.qrs){const hit=a<=b?(q>=a&&q<b):(q>=a||q<b);if(hit){const at=t0+((q-a+L)%L);if(this.lastBeat>-99){const rr=at-this.lastBeat;if(rr>.2)this.hist.push(rr);if(this.hist.length>5)this.hist.shift();}this.lastBeat=at;this.beep();}}
    const since=t1-this.lastBeat;let hr='--';
    if(this.hist.length>=2&&since<3.5)hr=Math.round(60/(this.hist.reduce((s,x)=>s+x,0)/this.hist.length));else if(this.lastBeat>-99&&since>=6)hr='0';else if(!D.qrs.length&&t1>4)hr=D.noQrs==='vf'?'---':'0';
    this.elHr.textContent=hr;this.t=t1;this.sweep+=dt;if(this.onTime)this.onTime(t1%L);}
}
root.EKGView={EcgPaper,EcgMonitor,LEADS,COLORS};
})(typeof self!=='undefined'?self:this);
