import pandas as pd, json, numpy as np, sys
G=pd.read_pickle('/home/claude/ptbxl/groups.pkl'); R=G[sys.argv[1]]; M=pd.DataFrame(json.load(open(sys.argv[2])))
L=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6']
q=lambda s:(lambda s:f"{s.quantile(.1):5.2f} {s.median():5.2f} {s.quantile(.9):5.2f}")(s.dropna())
bad=0;n=0
for w,rc in [('R','R_Amp_'),('S','S_Amp_'),('T','T_Amp_'),('P','P_Amp_'),('ST','ST_Amp_')]:
  for l in L:
    a=R[rc+l].dropna(); b=M[w+'_'+l]; sp=max(a.quantile(.9)-a.quantile(.1),.05); d=abs(a.median()-b.median())/sp; n+=1; flag='  <<' if d>.35 else ''; bad+=d>.35
    if flag or len(sys.argv)>3: print(f"{w}_{l:4s} | echt {q(a)} | Modell {q(b)}{flag}")
for a,b in [('PR_Int_Global','pr'),('QRS_Dur_Global','qrs'),('QT_IntBazett_Global','qtc'),('R_AxisFrontal_Global','ax'),('HR_Ventr_Global','hr')]:
  print(f"{a:22s} | {R[a].dropna().quantile(.1):6.0f} {R[a].median():6.0f} {R[a].dropna().quantile(.9):6.0f} | {M[b].dropna().quantile(.1):6.0f} {M[b].median():6.0f} {M[b].dropna().quantile(.9):6.0f}")
print('auffällige Merkmale:',bad,'von',n)
