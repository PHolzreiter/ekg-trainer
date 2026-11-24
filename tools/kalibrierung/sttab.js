const E=require('/home/claude/trainer/engine/ekg-engine.js');
const want=process.argv[2]?process.argv[2].split(','):Object.keys(E.CASES);
console.log('Fall/Variante'.padEnd(24)+E.LEADS.map(l=>l.padStart(5)).join('')+'  QRS  Achse');
for(const id of want){const c=E.CASES[id];for(const v of (c.variants?Object.keys(c.variants):[null])){
  const acc={};let n=0,qrs=0,ax=[];
  for(let s=0;s<24;s++){const r=E.generateECG(id,s*911+5,{variant:v});if(!r.meta.st)continue;n++;for(const L of E.LEADS)acc[L]=(acc[L]||0)+r.meta.st[L];qrs+=r.meta.qrs;ax.push(r.meta.axQRS);}
  if(!n){console.log((id+'/'+(v||'-')).padEnd(24)+' (kein QRS)');continue;}
  ax.sort((a,b)=>a-b);console.log((id+'/'+(v||'-')).padEnd(24)+E.LEADS.map(L=>(acc[L]/n).toFixed(1).padStart(5)).join('')+'  '+Math.round(qrs/n)+'  '+ax[2]+'..'+ax[ax.length-3]);}}
