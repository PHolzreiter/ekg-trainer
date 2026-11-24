const E=require('/home/claude/trainer/engine/ekg-engine.js');
for(const v of ['plain','sg_lat','sg_inf','sg_v13','smith']){let hit=0,n=60,ex='';
  for(let s=0;s<n;s++){const r=E.generateECG('lsb',s*977+3,{variant:v});const g=r.meta.sgarbossa;const pos=g.c1.length||g.c2.length||g.smith.length;if(pos)hit++;
    if(s<2)ex+=` [score ${g.score} c1:${g.c1} c2:${g.c2} smith:${g.smith} ratio:${JSON.stringify(g.ratio)}]`;}
  console.log(v.padEnd(7),'positiv',hit+'/'+n,ex);}
