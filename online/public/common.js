/* EKG-Trainer – gemeinsame Hilfen: Datensatz packen/entpacken, Live-Schleife, Netzwerk */
(function(root){'use strict';
const L12=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'],L8=['I','II','V1','V2','V3','V4','V5','V6'];
const b64=i16=>{const u=new Uint8Array(i16.buffer,i16.byteOffset,i16.byteLength);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
const unb64=s=>{const bin=atob(s),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Int16Array(u.buffer);};
const SCALE=.0025; // mV je Stufe
const toI16=f=>{const o=new Int16Array(f.length);for(let i=0;i<f.length;i++)o[i]=Math.max(-32767,Math.min(32767,Math.round(f[i]/SCALE)));return o;};
const toF32=i=>{const o=new Float32Array(i.length);for(let k=0;k<i.length;k++)o[k]=i[k]*SCALE;return o;};
/* Datensatz für die Papieransicht aus einem Engine-Ergebnis; ohne Befund */
function makeRecord(ecg,o){o=o||{};const m=ecg.meta;const n=Math.min(ecg.leads.I.length,ecg.fs*10),leads={};for(const L of L12)leads[L]=ecg.leads[L].subarray(0,n);
  return {fs:ecg.fs,leads,head:{sex:m.sex,age:m.age,hr:m.hr,pr:m.pr,qrs:m.qrs,qt:m.qt,qtc:m.qtc,axP:m.axP,axQRS:m.axQRS,axT:m.axT,show:o.showValues!==false},footer:'EKG-Trainer · synthetisches Trainings-EKG',note:o.clean?'ohne Störungen':''};}
function pack(rec){const leads={};for(const L of L8)leads[L]=b64(toI16(rec.leads[L]));return {fs:rec.fs,leads,head:rec.head,footer:rec.footer,note:rec.note};}
function unpack(p){const l={};for(const L of L8)l[L]=toF32(unb64(p.leads[L]));const n=l.I.length;for(const L of ['III','aVR','aVL','aVF'])l[L]=new Float32Array(n);
  for(let i=0;i<n;i++){const I=l.I[i],II=l.II[i];l.III[i]=II-I;l.aVR[i]=-(I+II)/2;l.aVL[i]=I-II/2;l.aVF[i]=II-I/2;}return {fs:p.fs,leads:l,head:p.head,footer:p.footer,note:p.note};}
/* Live-Schleife (eine Ableitung): an QRS-Grenzen geschlossen, mit Monitor- oder Diagnosefilter */
function liveLoop(g,lead,mode){const fs=g.fs,dur=g.dur;let a=0,b=dur-1;const q=g.qrs;
  if(q.length>4){const q0=q.find(x=>x.t>=.6);if(q0){const c=q.filter(x=>x.t<dur-1.2&&x.t>q0.t+20&&x.kind===q0.kind);if(c.length){a=q0.t-.32;b=c[c.length-1].t-.32;}}}
  const i0=Math.round(a*fs),len=Math.round(b*fs)-i0,src=g.leads[lead],out=new Float32Array(len);
  if(mode==='diag'){for(let i=0;i<len;i++)out[i]=src[i0+i];}
  else{const dt=1/fs,rcH=1/(2*Math.PI*.5),aH=rcH/(rcH+dt),rcL=1/(2*Math.PI*40),aL=dt/(rcL+dt);let y=0,xp=src[i0],l=0;
    for(let pass=0;pass<2;pass++)for(let i=0;i<len;i++){const x=src[i0+i];y=aH*(y+x-xp);xp=x;l+=aL*(y-l);out[i]=l;}
    for(const st of g.spikes){const i=Math.round((st-a)*fs);if(i>=0&&i<len){out[i]=.9;if(i+1<len)out[i+1]-=.1;}}}
  return {fs,sig:out,qrs:q.filter(x=>x.t>=a&&x.t<b).map(x=>+(x.t-a).toFixed(3)),lead,noQrs:g.meta.rhythm==='vf'?'vf':null};}
const packLive=d=>({fs:d.fs,sig:b64(toI16(d.sig)),qrs:d.qrs,lead:d.lead,noQrs:d.noQrs});
const unpackLive=p=>({fs:p.fs,sig:toF32(unb64(p.sig)),qrs:p.qrs,lead:p.lead,noQrs:p.noQrs});
/* WebSocket mit automatischem Wiederverbinden */
class Net{constructor(url){this.url=url;this.h={};this.open=false;this.q=[];this.closed=false;this._go();}
  _go(){if(this.closed)return;let ws;try{ws=new WebSocket(this.url);}catch(e){this._emit('status','fehler');return;}this.ws=ws;
    ws.onopen=()=>{this.open=true;this._emit('status','verbunden');for(const m of this.q)ws.send(m);this.q=[];};
    ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch(x){return;}this._emit(m.t,m);};
    ws.onclose=e=>{this.open=false;if(e.code===4001||e.code===4003){this.closed=true;this._emit('status',e.code===4001?'entfernt':'abgelehnt');return;}this._emit('status','getrennt');setTimeout(()=>this._go(),1500);};
    ws.onerror=()=>{};}
  on(t,f){(this.h[t]=this.h[t]||[]).push(f);return this;}
  _emit(t,m){for(const f of (this.h[t]||[]))f(m);}
  send(o){const s=JSON.stringify(o);if(this.open)this.ws.send(s);else if(o.k){this.q=this.q.filter(x=>JSON.parse(x).k!==o.k);this.q.push(s);}}
  close(){this.closed=true;try{this.ws.close();}catch(e){}}}
function qrSvg(text,size){const q=root.qrcode(0,'M');q.addData(text);q.make();const n=q.getModuleCount(),c=size/(n+8);let p='';for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(q.isDark(r,k))p+=`M${(k+4)*c},${(r+4)*c}h${c}v${c}h${-c}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#fff"/><path d="${p}" fill="#000"/></svg>`;}
root.EKGCommon={makeRecord,pack,unpack,liveLoop,packLive,unpackLive,Net,qrSvg,L12};
})(typeof self!=='undefined'?self:this);
