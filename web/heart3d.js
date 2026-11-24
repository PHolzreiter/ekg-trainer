/* EKG-Trainer – 3D-Herz mit Erregungsleitung (Lehrmodell, stilisiert).
   Engine-Koordinaten: x links, y kaudal, z anterior  ->  three: X = x, Y = -y, Z = z (Blick von vorne auf den Patienten). */
(function(root){'use strict';
const T=root.THREE;
const V=(x,y,z)=>new T.Vector3(x,y,z);
const E2T=v=>V(v[0],-v[1],v[2]);
const REST=[.80,.42,.42],FRONT=[1,.97,.55],PLAT=[.98,.62,.22],ATR_REST=[.82,.52,.50];
const BASE=V(-.6,1.6,-1.0),APEX=V(4.0,-4.3,1.4),CENTER=V(1.2,-1.0,.2);
const SA=V(-3.9,4.6,.5),AVN=V(-1.1,1.25,-.1),HIS=V(-.35,.55,.25);

function ellipsoid(center,axisTo,rLong,rA,rB,seg){const g=new T.SphereGeometry(1,seg||44,seg?Math.round(seg*.7):30);
  const m=new T.Matrix4(),q=new T.Quaternion().setFromUnitVectors(V(0,1,0),axisTo.clone().normalize());
  m.compose(center,q,V(rA,rLong,rB));g.applyMatrix4(m);return g;}
function colorize(g,c){const n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++){a[i*3]=c[0];a[i*3+1]=c[1];a[i*3+2]=c[2];}g.setAttribute('color',new T.BufferAttribute(a,3));}
function label(txt,color,size){const c=document.createElement('canvas'),f='bold 44px Inter,system-ui,sans-serif';let x=c.getContext('2d');x.font=f;const w=Math.ceil(x.measureText(txt).width)+24;c.width=w;c.height=64;x=c.getContext('2d');x.font=f;x.textAlign='center';x.textBaseline='middle';
  x.lineWidth=7;x.strokeStyle='rgba(255,255,255,.9)';x.strokeText(txt,w/2,34);x.fillStyle=color||'#152033';x.fillText(txt,w/2,34);
  const s=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false,transparent:true}));const h=size||1.6;s.scale.set(h*w/64,h,1);s.renderOrder=10;return s;}
function tube(points,r,color){const curve=new T.CatmullRomCurve3(points);const m=new T.Mesh(new T.TubeGeometry(curve,40,r,8,false),new T.MeshBasicMaterial({color}));m.userData.curve=curve;return m;}

class Heart3D{
  constructor(host,opt){this.host=host;this.opt=Object.assign({vector:true,axis:true,electrodes:true},opt||{});
    const r=this.renderer=new T.WebGLRenderer({antialias:true,alpha:true});r.setPixelRatio(Math.min(2,root.devicePixelRatio||1));host.appendChild(r.domElement);r.domElement.style.touchAction='none';r.domElement.style.display='block';
    this.scene=new T.Scene();this.cam=new T.PerspectiveCamera(32,1,.1,200);this.dist=42;this.rotY=-.25;this.rotX=.1;
    this.scene.add(new T.AmbientLight(0xffffff,.75));const dl=new T.DirectionalLight(0xffffff,.65);dl.position.set(6,10,14);this.scene.add(dl);
    this.grp=new T.Group();this.scene.add(this.grp);this.lead='II';this.ecg=null;this.t=0;
    this._build();this._events();new ResizeObserver(()=>this._size()).observe(host);this._size();}
  _build(){const G=this.grp,ax=APEX.clone().sub(BASE);
    const mat=()=>new T.MeshLambertMaterial({vertexColors:true,transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide});
    const lvC=BASE.clone().lerp(APEX,.52).add(V(.35,0,-.55)),rvC=BASE.clone().lerp(APEX,.42).add(V(-1.7,-.1,1.55));
    this.lv=new T.Mesh(ellipsoid(lvC,ax,3.9,2.55,2.55),mat());this.rv=new T.Mesh(ellipsoid(rvC,ax,3.5,2.5,1.75),mat());
    this.ra=new T.Mesh(ellipsoid(V(-3.3,2.9,.3),V(.2,1,0),2.2,1.9,1.9,30),mat());this.la=new T.Mesh(ellipsoid(V(.9,3.5,-2.5),V(.4,1,0),1.9,2.2,1.8,30),mat());
    for(const m of [this.lv,this.rv])colorize(m.geometry,REST);for(const m of [this.ra,this.la])colorize(m.geometry,ATR_REST);
    G.add(this.lv,this.rv,this.ra,this.la);
    const vm=c=>new T.MeshLambertMaterial({color:c,transparent:true,opacity:.35,depthWrite:false});
    const ves=(pts,rad,c)=>{const m=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),24,rad,12,false),vm(c));G.add(m);};
    ves([V(.2,3.2,-.3),V(.1,6.2,-.2),V(1.6,7.6,-1.2),V(3.2,6.6,-2.6),V(3.4,3.5,-3.4)],1.0,0xc94848);   // Aorta
    ves([V(-.6,2.6,1.6),V(.4,5.2,1.0),V(1.8,6.0,-.4)],.95,0x5878c8);                                     // Truncus pulmonalis
    ves([V(-3.7,4.4,.3),V(-3.6,8.2,.1)],.9,0x5878c8);ves([V(-3.3,1.2,-.4),V(-3.1,-3.4,-.8)],.95,0x5878c8); // Hohlvenen
    /* Reizleitungssystem */
    const sept=u=>BASE.clone().lerp(APEX,u).add(V(-.75*(1-u*.5),0,.75*(1-u*.4)));
    const P={inter1:[SA,V(-3.6,3.2,1.2),V(-2.2,1.9,.6),AVN],inter2:[SA,V(-2.8,3.2,-.3),AVN],inter3:[SA,V(-4.3,2.4,-.9),V(-2.6,1.2,-.9),AVN],bach:[SA,V(-1.6,4.9,-.6),V(.9,4.2,-2.2)],
      his:[AVN,HIS,sept(.14)],
      rbb:[sept(.14),sept(.4).add(V(-.35,0,.35)),sept(.78).add(V(-.5,0,.5)),V(2.3,-3.5,2.3),V(.3,-2.6,3.0),V(-1.7,-.9,2.9)],
      lbb:[sept(.14),sept(.24).add(V(.35,0,-.3))],
      laf:[sept(.24).add(V(.35,0,-.3)),V(1.6,.3,.9),V(3.2,-.4,.4),V(3.9,-1.9,-.6)],
      lpf:[sept(.24).add(V(.35,0,-.3)),V(1.2,-1.6,-1.0),V(2.4,-3.2,-.9),V(3.6,-3.3,.2)]};
    this.path={};const cs=0xffd21e;
    for(const k in P){const m=tube(P[k],k==='his'?.11:.075,k.startsWith('inter')||k==='bach'?0xe8b94a:cs);m.renderOrder=3;m.material.depthTest=false;m.material.transparent=true;m.material.opacity=.9;G.add(m);this.path[k]=m.userData.curve;}
    const node=(p,rad,c)=>{const m=new T.Mesh(new T.SphereGeometry(rad,18,14),new T.MeshBasicMaterial({color:c,depthTest:false,transparent:true}));m.position.copy(p);m.renderOrder=4;G.add(m);return m;};
    this.saNode=node(SA,.3,0xffb300);this.avNode=node(AVN,.3,0xffb300);
    const l1=label('Sinusknoten','#7a5200',.95);l1.position.copy(SA).add(V(-.6,1.1,0));G.add(l1);const l2=label('AV-Knoten','#7a5200',.95);l2.position.copy(AVN).add(V(-3.6,-.9,0));G.add(l2);
    this.pulses=[];for(let i=0;i<6;i++){const m=node(V(0,0,0),.3,0x19c2ff);m.visible=false;m.renderOrder=6;this.pulses.push(m);}
    this.blockMark=label('✕','#e0182d',1.5);this.blockMark.visible=false;G.add(this.blockMark);
    this.bbbMark=label('✕','#e0182d',1.2);this.bbbMark.visible=false;G.add(this.bbbMark);
    this.origin=node(V(0,0,0),.34,0xff3b30);this.origin.visible=false;
    /* Purkinje-Stützpunkte mit Ankunftszeit (relativ, Einheit cm bei schneller Leitung) */
    const sample=(k,t0)=>{const c=this.path[k],L=c.getLength(),out=[];for(let i=0;i<=10;i++)out.push({p:c.getPoint(i/10),d:t0+L*i/10});return {pts:out,end:t0+L};};
    const hisL=this.path.his.getLength();const r=sample('rbb',hisL),lb=sample('lbb',hisL),laf=sample('laf',lb.end),lpf=sample('lpf',lb.end);
    this.purk={r:r.pts.slice(3),l:laf.pts.slice(2).concat(lpf.pts.slice(2))};
    /* Summenvektor, Ableitungsachse, Elektroden */
    this.arrow=new T.ArrowHelper(V(1,0,0),CENTER,1,0x1d5fd1,.9,.55);this.arrow.line.material.linewidth=3;this.arrow.renderOrder=8;this.arrow.line.material.depthTest=false;this.arrow.cone.material.depthTest=false;G.add(this.arrow);
    this.axisLine=new T.Line(new T.BufferGeometry().setFromPoints([V(0,0,0),V(1,0,0)]),new T.LineBasicMaterial({color:0x222222,depthTest:false,transparent:true,opacity:.7}));G.add(this.axisLine);
    this.axisPlus=label('+','#222',1.4);this.axisName=label('II','#222',1.3);G.add(this.axisPlus,this.axisName);
    this.projBar=new T.Mesh(new T.CylinderGeometry(.16,.16,1,10),new T.MeshBasicMaterial({color:0x1d9d55,depthTest:false,transparent:true,opacity:.95}));this.projBar.renderOrder=7;G.add(this.projBar);
    this.elec={};const D=root.LeitWerkECG?root.LeitWerkECG.DOWER:null;
    if(D)for(const k of ['V1','V2','V3','V4','V5','V6']){const d=E2T(D[k]).normalize();const m=node(CENTER.clone().add(d.multiplyScalar(7.6)),.3,0x6b7686);const lb2=label(k,'#44505f',.9);lb2.position.copy(m.position).add(V(0,.75,0));G.add(lb2);this.elec[k]={m,lb:lb2};}
    this._actCache={};
  }
  _events(){const el=this.renderer.domElement;let drag=null;
    el.addEventListener('pointerdown',e=>{el.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,ry:this.rotY,rx:this.rotX};});
    el.addEventListener('pointermove',e=>{if(!drag)return;this.rotY=drag.ry+(e.clientX-drag.x)*.01;this.rotX=Math.max(-1.3,Math.min(1.3,drag.rx+(e.clientY-drag.y)*.01));this.render();});
    const up=()=>{drag=null;};el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
    el.addEventListener('wheel',e=>{e.preventDefault();this.dist=Math.max(20,Math.min(90,this.dist*Math.exp(e.deltaY*.001)));this.render();},{passive:false});
    el.addEventListener('dblclick',()=>{this.rotY=-.25;this.rotX=.1;this.dist=42;this.render();});}
  _size(){const r=this.host.getBoundingClientRect();if(r.width<10||r.height<10)return;this.renderer.setSize(r.width,r.height,false);this.renderer.domElement.style.width=r.width+'px';this.renderer.domElement.style.height=r.height+'px';this.cam.aspect=r.width/r.height;this.cam.updateProjectionMatrix();this.render();}
  setOptions(o){Object.assign(this.opt,o);this.render();}
  setLead(L){this.lead=L;this.render();}
  /* Aktivierungsanteil 0..1 je Kammer-Vertex für eine Schlagart */
  _act(kind,model){const key=kind+(model.delta?'d':'');if(this._actCache[key])return this._actCache[key];
    const vP=1,vM=7;   // Myokard 7x langsamer als Purkinje
    const calc=(mesh,src)=>{const pos=mesh.geometry.attributes.position,n=pos.count,a=new Float32Array(n),p=V(0,0,0);
      for(let i=0;i<n;i++){p.fromBufferAttribute(pos,i);let best=1e9;for(const s of src){const d=s.d*vP+p.distanceTo(s.p)*vM;if(d<best)best=d;}a[i]=best;}return a;};
    let srcL,srcR,originPt=null;
    const wide=kind==='lbbb'?'l':kind==='rbbb'?'r':null;
    if(kind==='normal'||wide){srcL=wide==='l'?this.purk.r:this.purk.l;srcR=wide==='r'?this.purk.l:this.purk.r;
      if(!wide){const all=this.purk.l.concat(this.purk.r);srcL=all;srcR=all;}
      if(model.delta){originPt=this._surfacePoint(E2T(model.delta).multiplyScalar(-1),true);const extra=[{p:originPt,d:-14}];srcL=srcL.concat(extra);srcR=srcR.concat(extra);}}
    else{let dir;if(kind==='paced')dir=V(.55,-.75,.35);else{const v=kind==='vt'?model.vtV:kind==='esc'?model.escV:model.pvcV;dir=E2T(v||[.5,.5,0]).multiplyScalar(-1);}
      originPt=this._surfacePoint(dir,false);srcL=srcR=[{p:originPt,d:0}];}
    const aL=calc(this.lv,srcL),aR=calc(this.rv,srcR);let lo=1e9,hi=-1e9;for(const a of [aL,aR])for(const x of a){if(x<lo)lo=x;if(x>hi)hi=x;}
    for(const a of [aL,aR])for(let i=0;i<a.length;i++)a[i]=(a[i]-lo)/(hi-lo);
    return this._actCache[key]={aL,aR,originPt,wide};}
  _surfacePoint(dir,baseRing){dir=dir.clone().normalize();let best=-1e9,bp=V(0,0,0);const p=V(0,0,0),ax=APEX.clone().sub(BASE).normalize();
    for(const mesh of [this.lv,this.rv]){const pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i+=2){p.fromBufferAttribute(pos,i);const rel=p.clone().sub(CENTER);let s=rel.dot(dir);
        if(baseRing){const u=p.clone().sub(BASE).dot(ax);s-=Math.abs(u-.6)*1.5;}if(s>best){best=s;bp=p.clone();}}}return bp;}
  setECG(ecg){this.ecg=ecg;this._actCache={};
    if(ecg){const pos=this.ra.geometry.attributes.position,p=V(0,0,0);const mk=(mesh,from)=>{const pp=mesh.geometry.attributes.position,a=new Float32Array(pp.count);let hi=0;for(let i=0;i<pp.count;i++){p.fromBufferAttribute(pp,i);a[i]=p.distanceTo(from);if(a[i]>hi)hi=a[i];}return {a,hi};};
      this.atr={ra:mk(this.ra,SA),la:mk(this.la,SA),raR:mk(this.ra,AVN),laR:mk(this.la,AVN)};const hi=Math.max(this.atr.ra.hi,this.atr.la.hi),hiR=Math.max(this.atr.raR.hi,this.atr.laR.hi);
      for(const k of ['ra','la'])for(let i=0;i<this.atr[k].a.length;i++){this.atr[k].a[i]/=hi;this.atr[k+'R'].a[i]/=hiR;}}
    this.setTime(0);}
  setTime(t){this.t=t;this.render();}
  _paint(mesh,fn){const col=mesh.geometry.attributes.color,n=col.count;for(let i=0;i<n;i++){const c=fn(i);col.array[i*3]=c[0];col.array[i*3+1]=c[1];col.array[i*3+2]=c[2];}col.needsUpdate=true;}
  render(){const e=this.ecg,t=this.t;
    this.cam.position.set(CENTER.x+this.dist*Math.sin(this.rotY)*Math.cos(this.rotX),CENTER.y+1+this.dist*Math.sin(this.rotX),CENTER.z+this.dist*Math.cos(this.rotY)*Math.cos(this.rotX));this.cam.lookAt(CENTER.x,CENTER.y+1.2,CENTER.z);
    this.pulses.forEach(p=>p.visible=false);this.blockMark.visible=false;this.bbbMark.visible=false;this.origin.visible=false;let np=0;
    const pulse=(pt,color)=>{const m=this.pulses[np++];if(!m)return;m.position.copy(pt);m.material.color.set(color||0x19c2ff);m.visible=true;};
    const mix=(a,b,k)=>[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];
    const shade=(dt,apd,rest)=>dt<0?rest:dt<.03?mix(rest,FRONT,Math.min(1,dt/.012)):dt<apd?mix(FRONT,PLAT,Math.min(1,(dt-.03)/.05)):dt<apd+.12?mix(PLAT,rest,(dt-apd)/.12):rest;
    if(e){const M=e.meta.model,D=(M.d||.09),rh=M.rhythm;
      /* Vorhöfe */
      const afib=rh==='af'||M.under==='af',flut=rh==='flutter';
      const retroQ=(M.retroP||rh==='junct')?e.qrs.filter(q=>q.t<=t+.02&&q.t>t-.5).pop():null;
      const pe=e.atria.filter(a=>a.t<=t&&a.t>t-.6).pop();
      const atr=(key)=>i=>{if(afib){const ph=Math.sin(i*12.9898+Math.floor(t*14)*78.233)*43758.5453;return (ph-Math.floor(ph))>.82?FRONT:ATR_REST;}
        if(flut){const pos=this[key].geometry.attributes.position;const ang=Math.atan2(pos.getZ(i)-.3,pos.getX(i)+3.3)/(2*Math.PI)+.5;const ph=((t*(M.aRate||300)/60)-ang)%1;return ((ph+1)%1)<.18?FRONT:ATR_REST;}
        if(pe)return shade(t-(pe.t+this.atr[key].a[i]*.085),.16,ATR_REST);
        if(retroQ)return shade(t-(retroQ.t+.02+this.atr[key+'R'].a[i]*.07),.16,ATR_REST);return ATR_REST;};
      this._paint(this.ra,atr('ra'));this._paint(this.la,atr('la'));
      /* Impuls im Vorhof und AV-Knoten */
      for(const a of e.atria){const dt=t-a.t;if(dt<0||dt>1.6)continue;
        if(dt<.07){const k=dt/.07;pulse(this.path.inter1.getPoint(k));pulse(this.path.inter3.getPoint(k));pulse(this.path.bach.getPoint(k));}
        else if(a.q!=null){const tHis=a.q-.035;if(t<tHis)pulse(AVN,0xffffff);}
        else if(dt<.75&&rh!=='av3'){pulse(AVN,0xe0182d);this.blockMark.position.copy(AVN).add(V(.9,.9,.4));this.blockMark.visible=true;}
        else if(dt<.5&&rh==='av3'){pulse(AVN,0xe0182d);this.blockMark.position.copy(AVN).add(V(.9,.9,.4));this.blockMark.visible=true;}}
      /* Kammern */
      const qs=e.qrs.filter(q=>q.t-.05<=t&&q.t>t-.75);const acts=qs.map(q=>{const kind=q.kind.startsWith('pvc')?'pvc':q.kind;const base=(kind==='normal'||kind==='rbbb'||kind==='lbbb')?kind:(kind==='sine'?'normal':kind);
        return {q,a:this._act(base,base==='pvc'||base==='vt'||base==='esc'?Object.assign({},M,q.kind.length>3&&q.kind.startsWith('pvc')?{}:{}):M),dur:base==='normal'?D:base==='rbbb'||base==='lbbb'?Math.max(D,.13):.16,base};});
      const vfib=rh==='vf';
      const ven=(arr)=>i=>{if(vfib){const ph=Math.sin(i*7.13+Math.floor(t*11)*31.7)*9973.1;return (ph-Math.floor(ph))>.7?FRONT:REST;}
        let c=REST;for(const A of acts){const dt=t-(A.q.t+A.a[arr][i]*A.dur);if(dt>=0)c=shade(dt,.26,REST);}return c;};
      this._paint(this.lv,ven('aL'));this._paint(this.rv,ven('aR'));
      for(const A of acts){const dt=t-A.q.t;
        if(A.base==='normal'||A.base==='rbbb'||A.base==='lbbb'){const k=(dt+.035)/.05;   // His -> Schenkel
          if(k>=0&&k<=1){if(k<.3)pulse(this.path.his.getPoint(k/.3));else{const u=(k-.3)/.7;if(A.base!=='rbbb')pulse(this.path.rbb.getPoint(u));if(A.base!=='lbbb'){pulse(this.path.laf.getPoint(u));pulse(this.path.lpf.getPoint(u));}}}
          if(A.a.wide){const c=A.a.wide==='r'?this.path.rbb:this.path.lbb;this.bbbMark.position.copy(c.getPoint(A.a.wide==='r'?.22:.6)).add(V(0,0,.5));this.bbbMark.visible=true;}
          if(A.a.originPt&&dt>-.04&&dt<.12){this.origin.position.copy(A.a.originPt);this.origin.material.color.set(0xff9500);this.origin.visible=true;}}
        else if(A.a.originPt&&dt>-.02&&dt<.2){this.origin.position.copy(A.a.originPt);this.origin.material.color.set(0xff3b30);this.origin.visible=true;}}
      if(M.morph==='rbbb'||M.morph==='lbbb'){const w=M.morph==='rbbb'?'r':'l';const c=w==='r'?this.path.rbb:this.path.lbb;this.bbbMark.position.copy(c.getPoint(w==='r'?.22:.6)).add(V(0,0,.5));this.bbbMark.visible=true;}
      /* Summenvektor + Projektion */
      const i=Math.max(0,Math.min(e.vec.x.length-1,Math.round(t*e.fs)));const v=E2T([e.vec.x[i],e.vec.y[i],e.vec.z[i]]);const len=v.length(),SC=4.2;
      this.arrow.visible=this.opt.vector&&len>.02;if(this.arrow.visible){this.arrow.setDirection(v.clone().normalize());this.arrow.setLength(Math.max(.4,len*SC),Math.min(.9,len*SC*.4),Math.min(.55,len*SC*.25));}
      const D8=root.LeitWerkECG.DOWER,I=D8.I,II=D8.II,row={I,II,III:[II[0]-I[0],II[1]-I[1],II[2]-I[2]],aVR:[-(I[0]+II[0])/2,-(I[1]+II[1])/2,-(I[2]+II[2])/2],aVL:[I[0]-II[0]/2,I[1]-II[1]/2,I[2]-II[2]/2],aVF:[II[0]-I[0]/2,II[1]-I[1]/2,II[2]-I[2]/2]}[this.lead]||D8[this.lead];
      const show=this.opt.axis&&row;this.axisLine.visible=this.axisPlus.visible=this.axisName.visible=!!show;this.projBar.visible=false;
      if(show){const d=E2T(row).normalize(),a=CENTER.clone().sub(d.clone().multiplyScalar(7.5)),b=CENTER.clone().add(d.clone().multiplyScalar(7.5));this.axisLine.geometry.setFromPoints([a,b]);
        this.axisPlus.position.copy(b).add(d.clone().multiplyScalar(.8));this.axisName.position.copy(b).add(d.clone().multiplyScalar(2.0));
        const pr=v.dot(d)*SC;if(Math.abs(pr)>.08&&this.opt.vector){this.projBar.visible=true;this.projBar.scale.set(1,Math.abs(pr),1);this.projBar.position.copy(CENTER).add(d.clone().multiplyScalar(pr/2));this.projBar.quaternion.setFromUnitVectors(V(0,1,0),d);this.projBar.material.color.set(pr>0?0x1d9d55:0xd81e2c);}}
      for(const k in this.elec){const on=this.opt.electrodes;this.elec[k].m.visible=on;this.elec[k].lb.visible=on;this.elec[k].m.material.color.set(k===this.lead?0x1d5fd1:0x6b7686);}
    }
    this.renderer.render(this.scene,this.cam);}
}
root.Heart3D=Heart3D;
})(typeof self!=='undefined'?self:this);
