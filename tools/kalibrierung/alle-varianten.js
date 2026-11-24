const E=require('/home/claude/trainer/engine/ekg-engine.js');let n=0,bad=0;
for(const [id,c] of Object.entries(E.CASES)){
  const vs=c.variants?Object.keys(c.variants):[null];
  for(const v of vs){
    for(let s=0;s<6;s++){const r=E.generateECG(id,s*4241+17,{variant:v});n++;
      for(const L of E.LEADS){let ok=true;for(const x of r.leads[L])if(!isFinite(x)||Math.abs(x)>9){ok=false;break;}if(!ok){bad++;console.log('BAD',id,v,s,L);break;}}
      if(s===0)console.log((id+'/'+(v||'-')).padEnd(26),'hr',r.meta.hr,'qrs',r.meta.qrs,'ax',r.meta.axQRS,'sp',r.spikes.length,'|',r.meta.device.join(' · ').slice(0,150));}
  }}
console.log('total',n,'bad',bad);
const a=E.generateECG('schrittmacher',42,{variant:'ddd'}),b=E.generateECG('schrittmacher',42,{variant:'ddd',dur:60});let d=0;for(let i=0;i<5000;i++)d=Math.max(d,Math.abs(a.leads.II[i]-b.leads.II[i]));console.log('prefix',d);
