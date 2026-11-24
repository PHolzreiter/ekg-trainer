import numpy as np, json
K=9; tfull=np.arange(600)/500.0
Dinv=np.array([[.156,-.227,.022],[-.010,.887,.102],[-.172,.057,-.229],[-.074,-.019,-.310],[.122,-.106,-.246],[.231,-.022,-.063],[.239,.041,.055],[.194,.048,.108]]); DM=np.linalg.pinv(Dinv.T)
rd=lambda a,n=3:[round(float(x),n) for x in a]
def build(tag,real,wide):
    P=np.load(tag+'_p.npy'); R=np.load(tag+'_r.npy'); REAL=np.load(real); lib=[]; rej={'r':0,'D':0,'PR':0,'cancel':0}; st=[]
    b0,b1=(78,103) if wide else (95,125); dlo,dhi=(.105,.165) if wide else (.058,.112); plo,phi=(.11,.3) if wide else (.115,.205)
    for idx,(q,r) in enumerate(zip(P,R)):
        if r<(.9 if wide else .93): rej['r']+=1; continue
        tt=q[0:18:2]; ss=q[1:18:2]; V=q[18:].reshape(K,3).copy()
        y=REAL[idx]-np.median(REAL[idx][b0:b1],0); Gf=np.array([np.exp(-(tfull-tt[k])**2/(2*ss[k]**2)) for k in range(K)])
        ks=(7,8); w=(tfull>=tt[6]+.08)&(tfull<=tt[8]+.12); other=[k for k in range(K) if k not in ks]
        res=y[w]-(Gf[other][:,w].T@V[other])@DM.T
        Mx=np.einsum('tk,lj->tlkj',Gf[list(ks)][:,w].T,DM).reshape(w.sum()*8,6); Mr=np.vstack([Mx,np.sqrt(.002)*np.eye(6)])
        v,*_=np.linalg.lstsq(Mr,np.concatenate([res.reshape(-1),np.zeros(6)]),rcond=None); V[list(ks)]=v.reshape(2,3)
        w=(tfull>=tt[0]-.07)&(tfull<=tt[2]-.025); other=list(range(2,K)); res=y[w]-(Gf[other][:,w].T@V[other])@DM.T; A=Gf[:2][:,w].T
        PL,*_=np.linalg.lstsq(np.vstack([A,np.sqrt(.02)*np.eye(2)]),np.vstack([res,np.zeros((2,8))]),rcond=None)
        V[:,2]*=-1
        g=lambda k,x: np.exp(-(x-tt[k])**2/(2*ss[k]**2)); xs=np.arange(tt[4]-.4,tt[4]+.2,.001)
        qv=sum(np.outer(g(k,xs),V[k]) for k in range(2,7)); qm=np.linalg.norm(qv,axis=1); ii=np.where(qm>.04*qm.max())[0]; on=xs[ii[0]]; off=xs[ii[-1]]; D=off-on
        if not (dlo<=D<=dhi): rej['D']+=1; continue
        pm=np.linalg.norm(sum(np.outer(g(k,xs),PL[k]) for k in (0,1)),axis=1); pm[xs>on-.03]=0
        if pm.max()<=0: rej['PR']+=1; continue
        pon=xs[np.where(pm>.15*pm.max())[0][0]]; PR=on-pon
        if not (plo<=PR<=phi): rej['PR']+=1; continue
        amp=np.linalg.norm(V,axis=1)
        if not wide:
            net=sum(V[k]*ss[k] for k in range(2,7)); I=.632*net[0]-.235*net[1]-.06*net[2]; II=.234*net[0]+1.066*net[1]+.131*net[2]; axq=np.degrees(np.arctan2((II-I/2)/.866,I))
            if not (-30<=axq<=100) or D>.097 or qm.max()<.7: rej['D']+=1; continue
        if amp[2:7].sum()>(3.6 if wide else 3.0)*qm.max(): rej['cancel']+=1; continue
        e={'pr':round(float(PR),3),'d':round(float(D)+(.008 if wide else .011),3),'q':[[round(float(tt[k]-on),4),round(float(ss[k]),4)]+rd(V[k]) for k in range(2,7)]}
        if wide: e['tg']=[[round(float(tt[k]-on),4),round(float(ss[k]),4)]+rd(V[k]) for k in (7,8)]
        else:
            xs2=np.arange(off+.05,off+.4,.002); tv=sum(np.outer(g(k,xs2),V[k]) for k in (7,8)); e['t']=rd(tv[np.argmax(np.linalg.norm(tv,axis=1))])
            e['p']=[[round(float(tt[k]-pon),4),round(float(ss[k]),4)]+rd(PL[k]) for k in (0,1)]
        lib.append(e); st.append([PR,D])
    s=np.array(st); print(tag,'Patienten',len(lib),'verworfen',rej,'PR/D Median',np.median(s,0).round(3)); return lib
out={'normal':build('fitall','real_all.npy',False)}
import os
for k,tag,real in (('lbbb','fitL','real_CLBBB.npy'),('rbbb','fitR','real_CRBBB.npy')):
    if os.path.exists(tag+'_r.npy'): out[k]=build(tag,real,True)
js=json.dumps(out,separators=(',',':'))
open('/home/claude/trainer/engine/ekg-lib.js','w').write("/* EKG-Formbibliothek: Dipol-Parameter, angepasst an Medianschläge (GE 12SL) aus PTB-XL+ (Strodthoff et al. 2023, CC BY 4.0), Grunddaten PTB-XL (Wagner et al. 2020, CC BY 4.0).\n   Koordinaten: x links, y kaudal, z anterior, mV; q/tg: [t ab QRS-Beginn, Sigma, vx, vy, vz]; p: [t ab P-Beginn, Sigma, I, II, V1..V6]. */\n(function(root){const LIB="+js+";if(typeof module!=='undefined'&&module.exports)module.exports=LIB;else root.LeitWerkECGLib=LIB;})(typeof self!=='undefined'?self:this);\n")
print('kB',len(js)//1000)
