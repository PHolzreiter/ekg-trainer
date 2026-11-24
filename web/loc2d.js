/* EKG-Trainer – Infarktlokalisation: welche Ableitungen schauen auf welche Wand, welches Gefäß versorgt sie.
   Links Frontalebene (Extremitätenableitungen, Cabrera-Kreis), rechts Horizontalebene (Brustwandableitungen).
   Zuordnung nach gängiger Lehrmeinung (z. B. LITFL, UWorld): septal V1–V2 (LAD), anterior V3–V4 (LAD),
   lateral I, aVL, V5–V6 (LAD/RCX), inferior II, III, aVF (RCA ~80 %, RCX), posterior V7–V9 (Spiegelbild ST-Senkung V1–V3),
   rechter Ventrikel V4R (proximale RCA). */
(function(root){'use strict';
const W=640,H=350,TAU=Math.PI*2,F='Inter,system-ui,sans-serif';
const RED='#d81e2c',BLUE='#1d5fd1',GREEN='#0a8f4e';
const GROUPS=[
 {id:'inferior',leads:['II','III','aVF'],wall:'Hinterwand (inferior)',vessel:'RCA (ca. 80 %), seltener RCX',walls:['inferior'],recip:['I','aVL']},
 {id:'hochlateral',leads:['I','aVL'],wall:'Hohe Seitenwand',vessel:'Diagonalast (LAD) oder RCX',walls:['hochlateral'],recip:['III','aVF']},
 {id:'septal',leads:['V1','V2'],wall:'Septum',vessel:'LAD (Septaläste)',walls:['septal']},
 {id:'anterior',leads:['V3','V4'],wall:'Vorderwand',vessel:'LAD',walls:['anterior','apikal']},
 {id:'lateral',leads:['V5','V6','I','aVL'],wall:'Seitenwand',vessel:'LAD (Diagonalast) oder RCX',walls:['lateral','hochlateral']},
 {id:'posterior',leads:['V7','V8','V9'],wall:'Hinterwand (posterior)',vessel:'RCX oder RCA',walls:['posterior'],recip:['V1','V2','V3'],note:'Mit 12 Ableitungen nicht direkt sichtbar: Spiegelbild = ST-Senkung V1–V3, Beweis = ST-Hebung V7–V9.'},
 {id:'rv',leads:['V4R'],wall:'Rechter Ventrikel',vessel:'proximale RCA',walls:['rv'],note:'Bei jedem Hinterwandinfarkt V4R ableiten (oft auch ST-Hebung V1).'}];
const WALLN={inferior:'Hinterwand (inferior)',septal:'Septum',anterior:'Vorderwand',apikal:'Herzspitze',lateral:'Seitenwand',hochlateral:'hohe Seitenwand',posterior:'Hinterwand (posterior)',rv:'rechter Ventrikel',diffus:'diffus (subendokardial)'};
const VESSELN={LAD:'LAD (Ramus interventricularis anterior)',RCA:'RCA (rechte Koronararterie)',RCX:'RCX (Ramus circumflexus)',D1:'1. Diagonalast der LAD',LM:'Hauptstamm (LM) oder Mehrgefäß'};
/* Frontalebene */
const FC=[160,178],FR=128,LIMB={I:0,II:60,III:120,aVF:90,aVL:-30,aVR:-150};
const HEART=[[104,112],[150,96],[200,90],[236,104],[250,140],[244,192],[226,238],[202,270],[184,274],[160,256],[126,218],[104,176],[98,140]];
const LADP=[[200,96],[194,140],[192,190],[194,236],[198,268]],RCAP=[[166,96],[134,104],[108,128],[100,170],[114,214],[146,252]],RCAB=[[146,252],[176,272],[200,272]];
const LMP=[[176,96],[200,96]],RCXP=[[200,96],[228,106],[246,134]],RCXB=[[246,134],[250,176],[236,230]],D1P=[[195,134],[226,158],[242,178]];
const ZF={inferior:[[60,214],[260,248],[260,330],[60,330]],hochlateral:[[206,80],[290,80],[290,170],[220,150]],lateral:[[228,130],[290,130],[290,260],[214,250]],
  apikal:'circ',anterior:[[164,110],[226,110],[222,256],[170,240]],septal:[[184,110],[206,110],[204,250],[186,246]],rv:[[60,80],[172,80],[172,250],[60,250]]};
/* Horizontalebene (von unten gesehen: oben = vorne, rechts im Bild = links im Körper) */
const HC=[480,176],TH={rx:142,ry:104},LVC=[498,180],LVR=[48,28];
const CHEST={V1:-101,V2:-79,V3:-63,V4:-47,V5:-27,V6:-2,V7:24,V8:48,V9:72,V4R:-133};
const SEG={septal:[150,215],anterior:[215,300],lateral:[300,390],posterior:[30,150]};
function stElev(L,v,sex,age){const w=String(sex||'').toLowerCase().startsWith('w');if(L==='V2'||L==='V3')return v>=(w?1.5:(age<40?2.5:2));return v>=1;}
class LocView{
  constructor(host,opt){this.opt=opt||{};host.classList.add('loc');host.innerHTML='<div class="loc-cv"><canvas></canvas></div><div class="loc-info"></div><div class="loc-tab"></div>';
    this.cv=host.querySelector('canvas');this.ctx=this.cv.getContext('2d');this.elI=host.querySelector('.loc-info');this.elT=host.querySelector('.loc-tab');this.sel=null;this.ecg=null;
    this._table();new ResizeObserver(()=>this._size()).observe(this.cv.parentNode);this._size();}
  _table(){const t=this.elT;t.innerHTML='<div class="loc-th"><span>Ableitungen</span><span>Wand</span><span>Gefäß</span></div>';
    for(const g of GROUPS){const r=document.createElement('button');r.className='loc-row';r.dataset.id=g.id;r.innerHTML=`<span><b>${g.leads.join(', ')}</b></span><span>${g.wall}</span><span>${g.vessel}</span>`;r.onclick=()=>this.select(this.sel===g.id?null:g.id,true);t.appendChild(r);}}
  select(id,user){this.sel=id;this.elT.querySelectorAll('.loc-row').forEach(r=>r.classList.toggle('on',r.dataset.id===id));this._info();this._draw();if(user&&this.opt.onSelect)this.opt.onSelect(id);}
  setECG(e){this.ecg=e;this.mi=e&&e.meta.mi&&e.meta.mi.walls?e.meta.mi:null;this.meas=this._measure();this._info();this._draw();}
  /* gemessene ST-Abweichung je Ableitung; beim LSB nur konkordante Veränderungen (Sgarbossa) */
  _measure(){const e=this.ecg,out={};if(!e||!e.meta.st)return out;const m=e.meta,lb=e.meta.model&&e.meta.model.morph==='lbbb';
    const pol=L=>{const q=e.qrs.find(x=>x.t>.5)||e.qrs[0];if(!q)return 0;const a=e.leads[L],i0=Math.round(q.t*e.fs),n=Math.round((m.qrs||100)/1000*e.fs);let mx=-9,mn=9;for(let i=i0;i<i0+n&&i<a.length;i++){mx=Math.max(mx,a[i]);mn=Math.min(mn,a[i]);}return {pos:mx+mn>0,s:-mn};};
    for(const L in m.st){const v=m.st[L];if(lb){const p=pol(L);if(v>=1&&p.pos)out[L]='up';else if(v<=-1&&!p.pos&&['V1','V2','V3'].includes(L))out[L]='down';else if(v>=1&&!p.pos&&p.s>0&&v/10/p.s>=.25)out[L]='up';continue;}
      if(stElev(L,v,m.sex,m.age))out[L]='up';else if(v<=-.5)out[L]='down';}
    return out;}
  /* Rahmen fürs Papier */
  marks(){const out={};if(this.sel){const g=GROUPS.find(x=>x.id===this.sel);for(const L of g.leads)out[L]={c:GREEN,t:g.wall};for(const L of g.recip||[])if(!out[L])out[L]={c:'#7a2bd0',t:'Spiegelbild'};return out;}
    for(const L in this.meas)out[L]=this.meas[L]==='up'?{c:RED,t:'ST ↑'}:{c:BLUE,t:'ST ↓'};return out;}
  _info(){const m=this.mi,el=this.elI,ms=this.meas||{};const up=Object.keys(ms).filter(L=>ms[L]==='up'),dn=Object.keys(ms).filter(L=>ms[L]==='down');
    let h='';if(this.sel){const g=GROUPS.find(x=>x.id===this.sel);h=`<b>${g.wall}</b> – Ableitungen ${g.leads.join(', ')} · Gefäß: ${g.vessel}${g.recip?` · Spiegelbild in ${g.recip.join(', ')}`:''}${g.note?`<br>${g.note}`:''}`;}
    else if(m){const st=m.stage==='narbe'?'Alter Infarkt (Narbe)':m.stage==='stenose'?'Kritische Stenose, noch kein Verschluss':m.lbbb?'Infarkt bei Linksschenkelblock (Sgarbossa)':'Infarkt';
      h=`<b>${st}: ${m.walls.map(w=>WALLN[w]).join(', ')}</b> · Gefäß: ${VESSELN[m.vessel]||m.vessel}${m.site?' – '+m.site:''}${m.alt?` (oder ${VESSELN[m.alt]||m.alt})`:''}`;
      h+=`<br><span style="color:${RED}">ST-Hebung: ${up.length?up.join(', '):'—'}</span> · <span style="color:${BLUE}">ST-Senkung: ${dn.length?dn.join(', '):'—'}</span>`;
      if(m.walls.includes('posterior'))h+='<br>Hinterwand: ST-Senkung V1–V3 ist das Spiegelbild – V7–V9 ableiten.';if(m.walls.includes('rv'))h+='<br>Rechter Ventrikel: V4R ableiten.';
      if(m.stage==='narbe')h+='<br>Hinweis: Q-Zacken statt ST-Hebung.';}
    else h=`Kein Infarktbefund.${up.length||dn.length?` Gemessen: ST-Hebung ${up.join(', ')||'—'}, ST-Senkung ${dn.join(', ')||'—'}.`:''} Eine Zeile antippen: zeigt, welche Ableitungen auf welche Wand schauen.`;
    el.innerHTML=h;}
  _size(){const r=this.cv.parentNode.getBoundingClientRect();if(r.width<20||r.height<20)return;const d=Math.max(1,root.devicePixelRatio||1);this.s=Math.min(r.width/W,r.height/H);
    this.cv.width=Math.round(W*this.s*d);this.cv.height=Math.round(H*this.s*d);this.cv.style.width=W*this.s+'px';this.cv.style.height=H*this.s+'px';this.d=d;this._draw();}
  _state(){/* welche Wände, Gefäß, Elektrodenfarben */const g=this.sel?GROUPS.find(x=>x.id===this.sel):null;const st={};
    if(g){for(const L of g.leads)st[L]='sel';for(const L of g.recip||[])st[L]='rec';return {walls:g.walls,vessel:null,el:st,occl:null};}
    const ms=this.meas||{};for(const L in ms)st[L]=ms[L];const m=this.mi;
    if(m){if(m.walls.includes('posterior'))for(const L of ['V7','V8','V9'])st[L]=st[L]||'exp';if(m.walls.includes('rv'))st.V4R='exp';}
    return {walls:m?m.walls:[],vessel:m?m.vessel:null,site:m?m.site:'',el:st,narbe:m&&m.stage==='narbe'};}
  _draw(){const ctx=this.ctx;if(!this.s)return;const k=this.s*this.d;ctx.setTransform(k,0,0,k,0,0);ctx.clearRect(0,0,W,H);ctx.lineJoin='round';ctx.lineCap='round';
    const S=this._state(),zoneCol=S.narbe?'rgba(90,90,100,.5)':this.sel?'rgba(10,143,78,.35)':'rgba(216,30,44,.42)';
    const poly=(pts,close)=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));if(close)ctx.closePath();};
    const smoothP=pts=>{const p=new Path2D(),n=pts.length;for(let i=0;i<n;i++){const a=pts[(i+n-1)%n],b=pts[i],c=pts[(i+1)%n],d=pts[(i+2)%n];if(i===0)p.moveTo(b[0],b[1]);p.bezierCurveTo(b[0]+(c[0]-a[0])/6,b[1]+(c[1]-a[1])/6,c[0]-(d[0]-b[0])/6,c[1]-(d[1]-b[1])/6,c[0],c[1]);}p.closePath();return p;};
    const txt=(s,x,y,sz,col,al,b)=>{ctx.font=(b?'bold ':'')+sz+'px '+F;ctx.fillStyle=col||'#243040';ctx.textAlign=al||'center';ctx.fillText(s,x,y);ctx.textAlign='left';};
    const elec=(L,x,y,dash)=>{const s=S.el[L];const col=s==='up'?RED:s==='down'?BLUE:s==='sel'?GREEN:s==='rec'?'#7a2bd0':s==='exp'?RED:'#8b96a8';const on=!!s;
      ctx.beginPath();ctx.arc(x,y,on?13:11,0,TAU);ctx.fillStyle=on&&s!=='exp'?col:'#fff';ctx.fill();ctx.lineWidth=on?2.2:1.3;ctx.strokeStyle=col;if(dash)ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
      txt(L,x,y+3.6,L.length>2?9:10.5,on&&s!=='exp'?'#fff':'#243040','center',true);
      if(s==='up'||s==='down'||s==='exp')txt(s==='down'?'↓':'↑',x+(x<HC[0]-60&&x<320?-18:18),y+5,15,col,'center',true);};
    /* ---- Frontalebene ---- */
    txt('Extremitätenableitungen – Frontalebene',FC[0],18,12,'#243040','center',true);
    ctx.strokeStyle='#c3cad6';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(FC[0],FC[1],FR,0,TAU);ctx.stroke();ctx.setLineDash([]);
    const hp=smoothP(HEART);ctx.fillStyle='#f3cfc7';ctx.fill(hp);
    for(const w of S.walls){const z=ZF[w];if(!z)continue;ctx.save();ctx.clip(hp);ctx.fillStyle=zoneCol;if(z==='circ'){ctx.beginPath();ctx.arc(194,262,30,0,TAU);ctx.fill();}else{poly(z,true);ctx.fill();}ctx.restore();}
    if(S.walls.includes('diffus')){ctx.save();ctx.clip(hp);ctx.fillStyle=zoneCol;ctx.fill(hp);ctx.restore();}
    ctx.strokeStyle='#9a5a52';ctx.lineWidth=1.6;ctx.stroke(hp);
    /* Koronarien */
    const art=(pts,col,dash,w)=>{ctx.strokeStyle=col;ctx.lineWidth=w||3;if(dash)ctx.setLineDash([5,4]);poly(pts);ctx.stroke();ctx.setLineDash([]);};
    const hot=v=>S.vessel&&(S.vessel===v||(S.vessel==='LM'&&(v==='LAD'||v==='RCX'||v==='LM'))),vc=v=>hot(v)?'#b3001b':'#d9653b';
    ctx.fillStyle='#f6dede';ctx.strokeStyle='#b07070';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(172,86,22,12,0,0,TAU);ctx.fill();ctx.stroke();txt('Aorta',172,72,10,'#7a5050');
    art(RCAP,vc('RCA'));art(RCAB,vc('RCA'),true);art(LMP,vc('LM'));art(LADP,vc('LAD'));art(D1P,(hot('D1')||(S.vessel==='LAD'&&S.site==='proximal'))?'#b3001b':'#d9653b',false,2.2);art(RCXP,vc('RCX'));art(RCXB,vc('RCX'),true);
    txt('RCA',92,120,10.5,'#7a3020','center',true);txt('LAD',214,214,10.5,'#7a3020','left',true);txt('RCX',236,126,10.5,'#7a3020','right',true);txt('D1',248,196,10,'#7a3020','left',true);
    /* Verschluss */
    if(S.vessel&&!this.sel){const occ={LAD:S.site==='Mitte'?[193,165]:S.site&&S.site.startsWith('distal')?[194,232]:[198,112],RCA:S.site==='proximal'?[140,104]:[104,160],RCX:[222,104],D1:[214,150],LM:[188,96]}[S.vessel];
      if(occ){const x=occ[0],y=occ[1];ctx.strokeStyle='#fff';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(x-7,y-7);ctx.lineTo(x+7,y+7);ctx.moveTo(x+7,y-7);ctx.lineTo(x-7,y+7);ctx.stroke();ctx.strokeStyle=S.narbe?'#555':'#000';ctx.lineWidth=3;ctx.stroke();}}
    for(const L in LIMB){const a=LIMB[L]*Math.PI/180,x=FC[0]+Math.cos(a)*FR,y=FC[1]+Math.sin(a)*FR;ctx.strokeStyle='rgba(120,130,150,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(FC[0],FC[1]);ctx.lineTo(x,y);ctx.stroke();elec(L,x,y);}
    txt('rechts',FC[0]-FR-4,FC[1]+FR+8,10,'#8a94a6','left');txt('links',FC[0]+FR+4,FC[1]+FR+8,10,'#8a94a6','right');
    /* ---- Horizontalebene ---- */
    txt('Brustwandableitungen – Querschnitt (von unten)',HC[0],18,12,'#243040','center',true);
    ctx.fillStyle='#f6f8fb';ctx.strokeStyle='#b9c2d0';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(HC[0],HC[1],TH.rx,TH.ry,0,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle='#dfe4ec';ctx.fillRect(HC[0]-10,HC[1]-TH.ry+2,20,12);txt('Brustbein',HC[0],HC[1]-TH.ry+26,9,'#8a94a6');ctx.beginPath();ctx.arc(HC[0],HC[1]+TH.ry-14,10,0,TAU);ctx.fill();txt('Wirbelsäule',HC[0],HC[1]+TH.ry+13,9,'#8a94a6');
    txt('vorne',HC[0],HC[1]-TH.ry-6,10,'#8a94a6');txt('rechts',HC[0]-TH.rx+30,HC[1]+4,10,'#8a94a6');txt('links',HC[0]+TH.rx-26,HC[1]+50,10,'#8a94a6');
    /* RV-Sichel und LV-Ring */
    const rvp=new Path2D();rvp.ellipse(LVC[0]-26,LVC[1]-18,70,56,0,0,TAU);const lvo=new Path2D();lvo.arc(LVC[0],LVC[1],LVR[0],0,TAU);
    ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.arc(LVC[0],LVC[1],LVR[0]+1,0,TAU,true);ctx.clip();ctx.fillStyle='#e9c3bb';ctx.fill(rvp);
    if(S.walls.includes('rv')){ctx.fillStyle=zoneCol;ctx.fill(rvp);}ctx.strokeStyle='#9a5a52';ctx.lineWidth=1.4;ctx.stroke(rvp);ctx.restore();
    ctx.fillStyle='#e3ebf8';ctx.beginPath();ctx.ellipse(LVC[0]-40,LVC[1]-26,40,26,-.25,0,TAU);ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.arc(LVC[0],LVC[1],LVR[0]+1,0,TAU,true);ctx.clip();ctx.beginPath();ctx.ellipse(LVC[0]-34,LVC[1]-24,46,30,-.2,0,TAU);ctx.fill();ctx.restore();
    ctx.fillStyle='#e8b4aa';ctx.beginPath();ctx.arc(LVC[0],LVC[1],LVR[0],0,TAU);ctx.arc(LVC[0],LVC[1],LVR[1],0,TAU,true);ctx.fill('evenodd');
    for(const w of S.walls){const sg=SEG[w==='inferior'?'posterior_':w==='hochlateral'?'lateral':w==='apikal'?'anterior':w];if(!sg||(w==='inferior'))continue;const a0=sg[0]*Math.PI/180,a1=sg[1]*Math.PI/180;ctx.beginPath();ctx.arc(LVC[0],LVC[1],LVR[0],a0,a1);ctx.arc(LVC[0],LVC[1],LVR[1],a1,a0,true);ctx.closePath();ctx.fillStyle=zoneCol;ctx.fill();}
    if(S.walls.includes('diffus')){ctx.beginPath();ctx.arc(LVC[0],LVC[1],LVR[1]+7,0,TAU);ctx.arc(LVC[0],LVC[1],LVR[1],0,TAU,true);ctx.fillStyle=zoneCol;ctx.fill('evenodd');}
    ctx.strokeStyle='#9a5a52';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(LVC[0],LVC[1],LVR[0],0,TAU);ctx.stroke();ctx.beginPath();ctx.arc(LVC[0],LVC[1],LVR[1],0,TAU);ctx.stroke();ctx.fillStyle='#fbe6e4';ctx.beginPath();ctx.arc(LVC[0],LVC[1],LVR[1]-.8,0,TAU);ctx.fill();
    txt('LV',LVC[0],LVC[1]+4,11,'#8a4a4a','center',true);txt('RV',LVC[0]-58,LVC[1]-34,11,'#4a5a8a','center',true);
    for(const [w,a] of [['Septum',182],['Vorderwand',258],['Seitenwand',345],['Hinterwand',90]]){const r=a*Math.PI/180,R=LVR[0]+12;txt(w,LVC[0]+Math.cos(r)*R,LVC[1]+Math.sin(r)*R+(a===90?12:a===258?-4:4),9,'#7a4a4a',a===345?'left':a===182?'right':'center');}
    for(const L in CHEST){const a=CHEST[L]*Math.PI/180,x=HC[0]+Math.cos(a)*TH.rx,y=HC[1]+Math.sin(a)*TH.ry;const extra=['V7','V8','V9','V4R'].includes(L);
      if(S.el[L]&&S.el[L]!=='exp'){ctx.strokeStyle=S.el[L]==='down'?'rgba(29,95,209,.35)':S.el[L]==='rec'?'rgba(122,43,208,.35)':S.el[L]==='sel'?'rgba(10,143,78,.4)':'rgba(216,30,44,.4)';ctx.lineWidth=2;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(LVC[0],LVC[1]);ctx.stroke();ctx.setLineDash([]);}
      elec(L,x,y,extra);}
    txt('gestrichelt: Zusatzableitungen (nicht im 12-Kanal-EKG)',HC[0],H-6,9.5,'#8a94a6');}
}
root.LocView=LocView;root.LocView.GROUPS=GROUPS;
})(typeof window!=='undefined'?window:globalThis);
