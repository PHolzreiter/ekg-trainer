import numpy as np
from scipy.optimize import least_squares
from multiprocessing import Pool
R=np.load('real_8.npy')
Dinv=np.array([[.156,-.227,.022],[-.010,.887,.102],[-.172,.057,-.229],[-.074,-.019,-.310],[.122,-.106,-.246],[.231,-.022,-.063],[.239,.041,.055],[.194,.048,.108]])
D=np.linalg.pinv(Dinv.T)
sl=slice(100,520,2); t=(np.arange(600)/500.0)[sl]; T=len(t)
#        Mitte, Sigma, dt, smin, smax
init=[(.318,.014,.035,.007,.022),(.350,.014,.035,.007,.022),(.455,.006,.014,.004,.012),(.468,.008,.012,.004,.014),(.480,.007,.010,.004,.014),(.494,.008,.012,.004,.016),(.510,.009,.016,.004,.018),(.70,.045,.07,.02,.07),(.77,.035,.07,.018,.06)]
K=len(init)
def basis(p): return np.array([np.exp(-(t-p[2*k])**2/(2*p[2*k+1]**2)) for k in range(K)])
def solve(p,y):
    G=basis(p); M=np.einsum('tk,lj->tlkj',G.T,D).reshape(T*8,K*3)
    lam=0.03; Mr=np.vstack([M,np.sqrt(lam)*np.eye(K*3)]); yr=np.concatenate([y.reshape(-1),np.zeros(K*3)])
    v,*_=np.linalg.lstsq(Mr,yr,rcond=None); return v.reshape(K,3),M@v
def fit(y0):
    y=(y0-np.median(y0[95:125],0))
    sh=(np.argmax(np.abs(y[:,1]))/500.0)-0.478; y=y[sl]
    p0=[];lo=[];hi=[]
    for c,s,dt,a,b in init: p0+=[c+sh,s]; lo+=[c+sh-dt,a]; hi+=[c+sh+dt,b]
    res=least_squares(lambda p: solve(p,y)[1]-y.reshape(-1),p0,bounds=(lo,hi),max_nfev=80)
    V,yh=solve(res.x,y); r=np.corrcoef(yh,y.reshape(-1))[0,1]; return res.x,V,r
def job(i):
    try:
        p,V,r=fit(R[i]); return np.concatenate([p,V.reshape(-1)]),r
    except Exception as e:
        return np.zeros(2*K+3*K),0.0
if __name__=='__main__':
    import sys
    src=sys.argv[1] if len(sys.argv)>1 else None
    if src: R=np.load(src)
    with Pool(2) as pool: res=pool.map(job,range(len(R)),chunksize=4)
    out=sys.argv[2] if len(sys.argv)>2 else 'fit2'
    np.save(out+'_p.npy',np.array([a for a,_ in res])); np.save(out+'_r.npy',np.array([b for _,b in res]))
    rs=np.array([b for _,b in res]); print('Fits',len(rs),'r p10/50/90',np.percentile(rs,[10,50,90]).round(3))
