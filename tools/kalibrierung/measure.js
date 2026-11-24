// Misst das eigene Modell wie ein EKG-Gerät: Medianschlag je Ableitung, dann R/S/Q/T/P/ST
const E=require('/home/claude/trainer/engine/ekg-engine.js');
const [,,caseId,variant,nStr]=process.argv;const n=+nStr||200;const fs=500;const rows=[];
for(let s=0;s<n;s++){
  const r=E.generateECG(caseId,s*7919+101,{variant:variant==='-'?undefined:variant});
  const D=(r.meta.qrs||100)/1000;const qs=r.qrs.filter(q=>q.t>.6&&q.t<9.2&&!q.kind.startsWith('pvc')).map(q=>Math.round(q.t*fs));
  if(qs.length<3)continue;
  const row={seed:s,hr:r.meta.hr,pr:r.meta.pr,qrs:r.meta.qrs,qt:r.meta.qt,qtc:r.meta.qtc,ax:r.meta.axQRS};
  for(const L of E.LEADS){const W=[-150,300];const med=[];
    for(let k=W[0];k<W[1];k++){const v=qs.map(i=>r.leads[L][i+k]).sort((a,b)=>a-b);med.push(v[v.length>>1]);}
    const at=ms=>med[Math.round(ms/2)-W[0]];const base=at(-10);const seg=(a,b)=>{const o=[];for(let t=a;t<=b;t+=2)o.push(at(t)-base);return o;};
    const q=seg(0,D*1000);const rIdx=q.indexOf(Math.max(...q));const R=Math.max(0,q[rIdx]);
    const S=Math.min(0,...q.slice(rIdx));const Q=Math.min(0,...q.slice(0,Math.max(1,rIdx)));
    const tw=seg(D*1000+60,Math.min(560,D*1000+420));const tmax=Math.max(...tw),tmin=Math.min(...tw);const T=Math.abs(tmax)>=Math.abs(tmin)?tmax:tmin;
    const pw=seg(-260,-40);const pmax=Math.max(...pw),pmin=Math.min(...pw);const Pp=Math.abs(pmax)>=Math.abs(pmin)?pmax:pmin;
    row['R_'+L]=R;row['S_'+L]=S;row['Q_'+L]=Q;row['T_'+L]=T;row['P_'+L]=Pp;row['ST_'+L]=at(D*1000)-base;}
  rows.push(row);}
console.log(JSON.stringify(rows));
