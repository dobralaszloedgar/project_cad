"""Generate independent reference fixtures from the public catalog.
Usage: python scripts/catalog/reference.py catalog.json output.json
"""
import json,math,sys
from scipy.integrate import quad
from chemicals.heat_capacity import TRCCp,Shomate
from chemicals.dippr import EQ101,EQ106
from thermo.unifac import UNIFAC, DOUFSG,load_unifac_ip
from thermo import unifac
j=json.load(open(sys.argv[1]))
ids=['7782-44-7','7727-37-9','64-17-5','7732-18-5','67-56-1','67-64-1','100-42-5','110-54-3','71-43-2','108-88-3']
cs=[c for c in j['chemicals'] if c['id'] in ids];by={c['id']:c for c in cs}
def sensible(c,t):
 rs=c['gasCp']['ranges'];model=c['gasCp']['model']
 def f(t):
  r=next(r for r in rs if r['min']<=t<=r['max']);a=r['coefficients']
  if model=='trc':return TRCCp(t,*a)
  if model=='shomate':return Shomate(t,*a)
  return a[0]+math.exp(a[1]/t+a[2]+a[3]*t+a[4]*t*t)
 lo,hi=sorted([298.15,t]);points=sorted(set([lo,hi]+[r['max'] for r in rs if lo<r['max']<hi]+[r['coefficients'][7] for r in rs if model=='trc' and lo<r['coefficients'][7]<hi]))
 return (1 if t>=298.15 else -1)*sum(quad(f,a,b,epsabs=1e-10,epsrel=1e-13)[0] for a,b in zip(points,points[1:]))
gas=[]
for c in cs:
 for t in [280,350,500,750]:
  if any(r['min']<=t<=r['max'] for r in c['gasCp']['ranges']):gas.append({'id':c['id'],'temperature':t,'enthalpy':c['formationEnthalpy']+sensible(c,t)})
load_unifac_ip();liquid=[]
for ids in [['67-56-1','7732-18-5'],['67-64-1','64-17-5'],['110-54-3','71-43-2']]:
 for t in [310,330,350]:
  for z in [[.2,.8],[.5,.5],[.8,.2]]:
   cc=[by[i] for i in ids];groups=[{int(k):v for k,v in c['groups'].items()} for c in cc]
   u=UNIFAC.from_subgroups(T=t,xs=z,chemgroups=groups,subgroups=DOUFSG,interaction_data=unifac.DOUF2IP,version=1)
   ps=[EQ101(t,*c['vaporPressure']['coefficients']) for c in cc]
   hv=[EQ106(t,c['latentHeat']['criticalTemperature'],*c['latentHeat']['coefficients']) for c in cc]
   hg=[c['formationEnthalpy']+sensible(c,t) for c in cc]
   hl=sum(x*(h-v) for x,h,v in zip(z,hg,hv))
   liquid.append({'ids':ids,'temperature':t,'composition':z,'gamma':u.gammas(),'psat':ps,'idealEnthalpy':hl,'modifiedEnthalpy':hl+u.HE()})
groups={k for c in cs for k in c.get('groups',{})};d=j['parameters'];d['definitions']={k:v for k,v in d['definitions'].items() if k in groups};mains={str(v['main']) for v in d['definitions'].values()};d['interactions']={k:{j:v for j,v in row.items() if j in mains} for k,row in d['interactions'].items() if k in mains}
fixture={'source':'Independent Python thermo 0.6.1 UNIFAC(version=1, DOUF2IP), chemicals 1.5.2 EQ101/EQ106/TRCCp/Shomate, scipy quadrature. Run against the pinned public catalog; no application solver used.','chemicals':cs,'parameters':d,'gas':gas,'liquid':liquid}
open(sys.argv[2],'w').write(json.dumps(fixture,indent=2,ensure_ascii=False)+'\n')
print('Independent reference states',len(gas),len(liquid))
