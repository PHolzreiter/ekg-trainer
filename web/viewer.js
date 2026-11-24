/* EKG-Trainer – Papieransicht mit Zoom, Stift, Radierer und Messzirkel.
   Koordinaten des Papiers in Millimetern (25 mm/s, 10 mm/mV). */
(function(root){'use strict';
const LEADS=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
const W=268,H=186,TOP=30,ROWH=38,X0=11,MMS=25,MMV=10;
const ROWS=[['I','aVR','V1','V4'],['II','aVL','V2','V5'],['III','aVF','V3','V6']];
const COLORS=['#d81e2c','#1d5fd1','#0a8f4e','#f08c00','#111111'];
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}

class EcgPaper{
  constructor(host,opt){opt=opt||{};this.opt=opt;this.host=host;host.classList.add('ekgv');
    this.bar=el('div','ekgv-bar');this.wrap=el('div','ekgv-wrap');this.cv=el('canvas');this.wrap.appendChild(this.cv);
    host.appendChild(this.bar);host.appendChild(this.wrap);this.ctx=this.cv.getContext('2d');
    this.rec=null;this.view={s:1,x:0,y:0};this.tool='pan';this.color=COLORS[0];this.snap=false;
    this.ink=[];this.cals=[];this.remote={ink:[],cals:[]};this.cursor=null;this.reveal=null;this.fitted=true;
    this.onInk=opt.onInk||null;this.onView=opt.onView||null;
    this._toolbar();this._events();
    new ResizeObserver(()=>this._resize()).observe(this.wrap);this._resize();}
  _toolbar(){const b=this.bar;b.innerHTML='';const mk=(id,label,title)=>{const x=el('button','ekgv-btn',label);x.dataset.tool=id;x.title=title||label;x.onclick=()=>this.setTool(id);b.appendChild(x);return x;};
    mk('pan','Bewegen','Verschieben und Zoomen');mk('pen','Stift','Zeichnen');mk('cal','Messen','Messzirkel: von Punkt zu Punkt ziehen');mk('erase','Radierer','Striche und Messungen entfernen');
    const cols=el('span','ekgv-cols');COLORS.forEach(c=>{const s=el('button','ekgv-col');s.style.background=c;s.onclick=()=>{this.color=c;this._marks();if(this.tool!=='pen'&&this.tool!=='cal')this.setTool('pen');};s.dataset.c=c;cols.appendChild(s);});b.appendChild(cols);
    const sn=el('label','ekgv-chk');const cb=el('input');cb.type='checkbox';cb.onchange=()=>{this.snap=cb.checked;};sn.appendChild(cb);sn.appendChild(document.createTextNode(' Raster'));sn.title='Messpunkte rasten am Millimeterraster ein';b.appendChild(sn);
    const sp=el('span','ekgv-sp');b.appendChild(sp);
    const z1=el('button','ekgv-btn','−');z1.onclick=()=>this.zoomBy(1/1.4);const z2=el('button','ekgv-btn','+');z2.onclick=()=>this.zoomBy(1.4);
    const fit=el('button','ekgv-btn','Einpassen');fit.onclick=()=>this.fit();const clr=el('button','ekgv-btn','Alles löschen');clr.onclick=()=>this.clearInk();
    b.append(z1,z2,fit,clr);this._marks();}
  _marks(){this.bar.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('on',x.dataset.tool===this.tool));
    this.bar.querySelectorAll('.ekgv-col').forEach(x=>x.classList.toggle('on',x.dataset.c===this.color));
    this.cv.style.cursor=this.tool==='pan'?'grab':'crosshair';}
  setTool(t){this.tool=t;this._marks();}
  setRecord(rec,keepInk){this.rec=rec;this.reveal=null;if(!keepInk){this.ink=[];this.cals=[];}this.draw();}
  setReveal(lines){this.reveal=lines&&lines.length?lines:null;this.draw();}
  setRemote(r){this.remote=r||{ink:[],cals:[]};this.draw();}
  setCursor(t){this.cursor=t;this.draw();}
  getInk(){return {ink:this.ink,cals:this.cals};}
  clearInk(){this.ink=[];this.cals=[];this._changed();this.draw();}
  _changed(){if(this.onInk)this.onInk(this.getInk());}
  _resize(){const r=this.wrap.getBoundingClientRect();if(r.width<10||r.height<10)return;const d=Math.max(1,root.devicePixelRatio||1);this.dpr=d;this.pw=r.width;this.ph=r.height;
    this.cv.width=Math.round(r.width*d);this.cv.height=Math.round(r.height*d);this.cv.style.width=r.width+'px';this.cv.style.height=r.height+'px';
    if(this.fitted)this.fit();else this.draw();}
  fit(){if(!this.pw)return;const s=Math.min(this.pw/W,this.ph/H);this.view={s,x:(this.pw-W*s)/2,y:(this.ph-H*s)/2};this.fitted=true;this.draw();if(this.onView)this.onView(this.getView());}
  getView(){const v=this.view;return {cx:(this.pw/2-v.x)/v.s,cy:(this.ph/2-v.y)/v.s,z:v.s/Math.min(this.pw/W,this.ph/H)};}
  setView(o){if(!this.pw)return;const s=o.z*Math.min(this.pw/W,this.ph/H);this.view={s,x:this.pw/2-o.cx*s,y:this.ph/2-o.cy*s};this.fitted=o.z<=1.001;this.draw();}
  zoomBy(f,px,py){const v=this.view;px=px==null?this.pw/2:px;py=py==null?this.ph/2:py;const min=Math.min(this.pw/W,this.ph/H)*.9,ns=Math.max(min,Math.min(v.s*f,60));const k=ns/v.s;
    v.x=px-(px-v.x)*k;v.y=py-(py-v.y)*k;v.s=ns;this.fitted=false;this._clamp();this.draw();if(this.onView)this.onView(this.getView());}
  _clamp(){const v=this.view,m=40;v.x=Math.min(this.pw-m,Math.max(m-W*v.s,v.x));v.y=Math.min(this.ph-m,Math.max(m-H*v.s,v.y));}
  _mm(e){const r=this.cv.getBoundingClientRect();const px=e.clientX-r.left,py=e.clientY-r.top;return {px,py,x:(px-this.view.x)/this.view.s,y:(py-this.view.y)/this.view.s};}
  _snap(p){if(!this.snap)return p;return {...p,x:Math.round(p.x*2)/2,y:Math.round(p.y*2)/2};}
  _events(){const cv=this.cv,pts=new Map();let pinch=null,drag=null;cv.style.touchAction='none';
    cv.addEventListener('wheel',e=>{e.preventDefault();const p=this._mm(e);this.zoomBy(Math.exp(-e.deltaY*.0015),p.px,p.py);},{passive:false});
    cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);const p=this._mm(e);pts.set(e.pointerId,p);
      if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:Math.hypot(a.px-b.px,a.py-b.py),s:this.view.s};if(drag&&drag.stroke){this.ink.pop();}drag=null;return;}
      if(this.tool==='pan'){drag={pan:true,px:p.px,py:p.py,x:this.view.x,y:this.view.y};cv.style.cursor='grabbing';}
      else if(this.tool==='pen'){const s={c:this.color,w:.5,p:[+p.x.toFixed(2),+p.y.toFixed(2)]};this.ink.push(s);drag={stroke:s};}
      else if(this.tool==='cal'){const a=this._snap(p);const c={c:this.color,a:[a.x,a.y],b:[a.x,a.y]};this.cals.push(c);drag={cal:c};}
      else if(this.tool==='erase'){drag={erase:true};this._erase(p);}
      this.draw();});
    cv.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;const p=this._mm(e);pts.set(e.pointerId,p);
      if(pinch&&pts.size===2){const [a,b]=[...pts.values()];const d=Math.hypot(a.px-b.px,a.py-b.py);const mx=(a.px+b.px)/2,my=(a.py+b.py)/2;
        if(pinch.mx!=null){this.view.x+=mx-pinch.mx;this.view.y+=my-pinch.my;}pinch.mx=mx;pinch.my=my;this.zoomBy(d/pinch.d*pinch.s/this.view.s,mx,my);return;}
      if(!drag)return;
      if(drag.pan){this.view.x=drag.x+p.px-drag.px;this.view.y=drag.y+p.py-drag.py;this.fitted=false;this._clamp();}
      else if(drag.stroke){const s=drag.stroke.p,n=s.length;if(Math.hypot(p.x-s[n-2],p.y-s[n-1])>.25)s.push(+p.x.toFixed(2),+p.y.toFixed(2));}
      else if(drag.cal){const b=this._snap(p);drag.cal.b=[b.x,b.y];}
      else if(drag.erase)this._erase(p);
      this.draw();});
    const up=e=>{if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size<2)pinch=null;
      if(drag){if(drag.cal&&Math.hypot(drag.cal.a[0]-drag.cal.b[0],drag.cal.a[1]-drag.cal.b[1])<.6)this.cals.pop();
        if(drag.stroke&&drag.stroke.p.length<4)drag.stroke.p.push(drag.stroke.p[0]+.1,drag.stroke.p[1]+.1);
        if(drag.pan){if(this.onView)this.onView(this.getView());}else this._changed();}
      drag=null;this._marks();this.draw();};
    cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
    cv.addEventListener('dblclick',()=>{if(this.tool==='pan')this.fit();});}
  _erase(p){const r=2.2/Math.max(1,this.view.s/6);const hit=(x,y)=>Math.hypot(x-p.x,y-p.y)<Math.max(1.2,r);
    this.ink=this.ink.filter(s=>{for(let i=0;i<s.p.length;i+=2)if(hit(s.p[i],s.p[i+1]))return false;return true;});
    this.cals=this.cals.filter(c=>{for(let k=0;k<=10;k++){const x=c.a[0]+(c.b[0]-c.a[0])*k/10,y=c.a[1]+(c.b[1]-c.a[1])*k/10;if(hit(x,y))return false;}return true;});}
  /* Zeit (s) -> x-Positionen auf dem Papier: [{x,row}] */
  timeToX(t){const out=[];if(t==null||t<0||t>=10)return out;const c=Math.min(3,Math.floor(t/2.5));const x=X0+t*MMS;out.push({x,y0:TOP+2,y1:TOP+3*ROWH});out.push({x,y0:TOP+3*ROWH+2,y1:H-2});return out;}
  draw(){if(this._raf)return;this._raf=requestAnimationFrame(()=>{this._raf=0;this._draw();});}
  _draw(){const ctx=this.ctx,v=this.view,d=this.dpr||1;if(!this.pw)return;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=this.opt.bg||'#e9edf3';ctx.fillRect(0,0,this.cv.width,this.cv.height);
    ctx.setTransform(v.s*d,0,0,v.s*d,v.x*d,v.y*d);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff6f4';ctx.fillRect(0,TOP,W,H-TOP);
    const fine=v.s>2.2;const xa=Math.max(0,Math.floor(-v.x/v.s)),xb=Math.min(W,Math.ceil((this.pw-v.x)/v.s)),ya=Math.max(TOP,Math.floor(-v.y/v.s)),yb=Math.min(H,Math.ceil((this.ph-v.y)/v.s));
    const line=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
    for(let x=xa;x<=xb;x++){const big=x%5===0;if(!big&&!fine)continue;ctx.strokeStyle=big?'#eda3a3':'#f8d7d5';ctx.lineWidth=big?.16:.08;line(x,Math.max(TOP,ya),x,yb);}
    for(let y=ya;y<=yb;y++){const big=(y-TOP)%5===0;if(!big&&!fine)continue;ctx.strokeStyle=big?'#eda3a3':'#f8d7d5';ctx.lineWidth=big?.16:.08;line(xa,y,xb,y);}
    const rec=this.rec;const F='Inter,system-ui,-apple-system,"Segoe UI",sans-serif';
    if(rec){const h=rec.head||{},f=x=>x==null?'—':x;ctx.fillStyle='#111';ctx.textAlign='left';ctx.textBaseline='alphabetic';
      ctx.font='bold 4.4px '+F;ctx.fillText('12-Kanal-EKG',4,7);ctx.font='3.1px '+F;
      ctx.textAlign='right';ctx.fillText('25 mm/s   10 mm/mV   0,05–150 Hz',W-4,7);if(rec.note)ctx.fillText(rec.note,W-4,12);ctx.textAlign='left';
      if(h.sex)ctx.fillText(`Pat.: ${h.sex}, ${h.age} J.`,4,12);
      if(h.show!==false){ctx.font='bold 3.3px '+F;ctx.fillText(`HF ${h.hr?h.hr+'/min':'—'}    PQ ${f(h.pr)} ms    QRS ${f(h.qrs)} ms    QT/QTc ${f(h.qt)}/${f(h.qtc)} ms    P-QRS-T-Achse ${f(h.axP)}°/${f(h.axQRS)}°/${f(h.axT)}°`,4,17.5);}
      if(this.reveal){ctx.font='3.0px '+F;const txt=this.reveal.join('  ·  ');ctx.fillStyle=txt.includes('***')?'#b00018':'#0b3a8f';ctx.fillText(txt,4,23.5,W-8);}
      const fs=rec.fs;ctx.strokeStyle='#101010';ctx.lineWidth=Math.max(.14,Math.min(.24,.9/v.s+.1));ctx.lineJoin='round';ctx.fillStyle='#111';
      const trace=(arr,i0,i1,x0,b)=>{ctx.beginPath();for(let i=i0;i<i1;i++){const x=x0+(i-i0)/fs*MMS,y=b-arr[i]*MMV;i===i0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();};
      for(let r=0;r<4;r++){const b=TOP+19+r*ROWH;ctx.beginPath();ctx.moveTo(2,b);ctx.lineTo(3.5,b);ctx.lineTo(3.5,b-10);ctx.lineTo(8.5,b-10);ctx.lineTo(8.5,b);ctx.lineTo(10,b);ctx.stroke();
        ctx.font='bold 3.4px '+F;
        if(r<3){for(let c=0;c<4;c++){const L=ROWS[r][c],i0=Math.round(c*2.5*fs),i1=Math.min(rec.leads[L].length,Math.round((c+1)*2.5*fs)),x0=X0+c*2.5*MMS;trace(rec.leads[L],i0,i1,x0,b);ctx.fillText(L,x0+1.2,b-11);
            if(c>0){ctx.beginPath();ctx.moveTo(x0,b-3);ctx.lineTo(x0,b+3);ctx.stroke();}}}
        else{trace(rec.leads.II,0,Math.min(rec.leads.II.length,fs*10),X0,b);ctx.fillText('II',X0+1.2,b-11);}}
      ctx.font='2.6px '+F;ctx.fillStyle='#8a5a5a';ctx.fillText(rec.footer||'Synthetisches Trainings-EKG',4,H-2);
    }else{ctx.fillStyle='#5b6678';ctx.font='6px '+F;ctx.textAlign='center';ctx.fillText(this.opt.empty||'Noch kein EKG',W/2,H/2);ctx.textAlign='left';}
    if(this.cursor!=null){ctx.strokeStyle='rgba(29,95,209,.85)';ctx.lineWidth=.35;for(const s of this.timeToX(this.cursor))line(s.x,s.y0,s.x,s.y1);}
    const strokes=(list,alpha)=>{ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';for(const s of list){ctx.strokeStyle=s.c;ctx.lineWidth=s.w||.5;ctx.beginPath();for(let i=0;i<s.p.length;i+=2)i?ctx.lineTo(s.p[i],s.p[i+1]):ctx.moveTo(s.p[0],s.p[1]);ctx.stroke();}ctx.globalAlpha=1;};
    strokes(this.remote.ink||[],.9);strokes(this.ink,1);
    const cal=(c)=>{const [ax,ay]=c.a,[bx,by]=c.b;ctx.strokeStyle=c.c;ctx.fillStyle=c.c;ctx.lineWidth=.3;const k=Math.max(.6,Math.min(1.6,7/v.s));
      line(ax,ay-3*k,ax,ay+3*k);line(bx,by-3*k,bx,by+3*k);line(ax,ay,bx,ay);if(Math.abs(by-ay)>.4){ctx.setLineDash([.8,.8]);line(bx,ay,bx,by);ctx.setLineDash([]);}
      const dt=Math.abs(bx-ax)/MMS*1000,dv=(ay-by)/MMV;let t=`${Math.round(dt)} ms`;if(dt>=200&&dt<=3000)t+=` · ${Math.round(60000/dt)}/min`;if(Math.abs(dv)>=.04)t+=` · ${dv>0?'+':''}${dv.toFixed(2).replace('.',',')} mV`;
      ctx.font=`bold ${3*k}px ${F}`;const tw=ctx.measureText(t).width,tx=(ax+bx)/2-tw/2,ty=Math.min(ay,by)-2.2*k;ctx.fillStyle='rgba(255,255,255,.88)';ctx.fillRect(tx-.8,ty-3*k,tw+1.6,3.9*k);ctx.fillStyle=c.c;ctx.fillText(t,tx,ty);};
    for(const c of (this.remote.cals||[]))cal(c);for(const c of this.cals)cal(c);
  }
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
