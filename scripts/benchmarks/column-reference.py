"""Independent binary Raoult MESH solution with SciPy bounded least squares.

Direct liquid mole fractions, temperatures and flows; no application imports,
Rust solver, application stage profiles, or shared nonlinear implementation.
"""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path

import numpy as np
from chemicals.dippr import EQ101, EQ106
from chemicals.heat_capacity import TRCCp
from scipy.integrate import quad
from scipy.optimize import brentq, least_squares

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source = Path(__file__).resolve().parents[2] / 'tests/fixtures/catalog-reference.json'
catalog = json.loads(source.read_text(encoding='utf-8'))
ids = ['71-43-2', '108-88-3']
cc = [next(c for c in catalog['chemicals'] if c['id'] == i) for i in ids]
assert all(c['gasCp']['model'] == 'trc' and len(c['gasCp']['ranges']) == 1 for c in cc)
assert all(c['gasCp']['ranges'][0]['min'] <= 298.15 and
           c['gasCp']['ranges'][0]['max'] >= 385 for c in cc)


def properties(t, p, x):
    xs = np.array([x, 1-x])
    psat = np.array([EQ101(t, *c['vaporPressure']['coefficients']) for c in cc])
    hg = np.array([c['formationEnthalpy'] + quad(
        lambda temp: TRCCp(temp, *c['gasCp']['ranges'][0]['coefficients']),
        298.15, t, epsabs=1e-8, epsrel=1e-12)[0] for c in cc])
    latent = np.array([EQ106(t, c['latentHeat']['criticalTemperature'],
                            *c['latentHeat']['coefficients']) for c in cc])
    y = xs*psat/p
    return y, float(xs @ (hg-latent)), float(y @ hg)


rows = []
for trays, feed_tray, reflux, drop in [(2, 1, 1.5, 0.), (6, 3, 2.5, 0.), (10, 5, 3., 5000.)]:
    stages = trays+2
    feed, distillate, bottoms = 10., 5., 5.
    feed_t, pressure = 320., 55000.
    pressures = np.linspace(pressure, pressure+drop, stages)
    # 320 K / 80 kPa is independently confirmed subcooled liquid.
    feed_y, feed_h, _ = properties(feed_t, 80000., .5)
    assert sum(feed_y) < 1

    def unpack(v):
        x = v[:stages]
        temperatures = v[stages:2*stages]
        liquid = np.r_[reflux*distillate, v[2*stages:2*stages+trays], bottoms]
        vapor = np.r_[0., (reflux+1)*distillate, v[2*stages+trays:]]
        return x, temperatures, liquid, vapor

    def residual(v):
        x, temperatures, liquid, vapor = unpack(v)
        props = [properties(t, p, z) for t, p, z in zip(temperatures, pressures, x)]
        y = np.array([p[0] for p in props])
        hl, hv = np.array([[p[1], p[2]] for p in props]).T
        equations = list(y.sum(axis=1)-1)
        equations.append(x[0]-y[1, 0])  # Total condenser.
        for j in range(1, stages):
            incoming = liquid[j-1]*x[j-1] + (vapor[j+1]*y[j+1, 0] if j < stages-1 else 0)
            incoming += feed*.5 if j == feed_tray else 0
            equations.append((incoming-liquid[j]*x[j]-vapor[j]*y[j, 0])/feed)
        for j in range(1, stages-1):
            f = feed if j == feed_tray else 0.
            equations.append((liquid[j-1]+vapor[j+1]+f-liquid[j]-vapor[j])/feed)
            energy = liquid[j-1]*hl[j-1]+vapor[j+1]*hv[j+1]+f*feed_h-liquid[j]*hl[j]-vapor[j]*hv[j]
            equations.append(energy/(40000*feed))
        return equations

    x0 = np.linspace(.85, .15, stages)
    temperatures = [brentq(lambda t: sum(properties(t, p, x)[0])-1, 310., 385.)
                    for p, x in zip(pressures, x0)]
    initial = np.r_[x0, temperatures,
                    [reflux*distillate+(feed if j >= feed_tray else 0) for j in range(1, trays+1)],
                    [(reflux+1)*distillate]*(trays)]
    low = np.r_[[1e-10]*stages, [310.]*stages, [1e-8]*(2*trays)]
    high = np.r_[[1-1e-10]*stages, [385.]*stages, [100.]*(2*trays)]
    result = least_squares(residual, initial, bounds=(low, high), x_scale='jac',
                           ftol=1e-13, xtol=1e-13, gtol=1e-13, max_nfev=1000)
    residual_max = max(abs(r) for r in residual(result.x))
    if not result.success or residual_max > 1e-10:
        raise RuntimeError(f'Independent column did not converge: {result.message}, residual {residual_max}')
    x, temperatures, liquid, vapor = unpack(result.x)
    props = [properties(t, p, z) for t, p, z in zip(temperatures, pressures, x)]
    condenser = (liquid[0]+distillate)*props[0][1]-vapor[1]*props[1][2]
    reboiler = bottoms*props[-1][1]+vapor[-1]*props[-1][2]-liquid[-2]*props[-2][1]
    stages_out = [dict(temperature=float(t), pressure=float(p), liquidFlow=float(l), vaporFlow=float(v),
                       liquidComposition=[float(z), float(1-z)], vaporComposition=pr[0].tolist())
                  for t, p, l, v, z, pr in zip(temperatures, pressures, liquid, vapor, x, props)]
    rows.append(dict(ids=ids, trays=trays, feedTray=feed_tray, reflux=reflux, pressure=pressure,
                     pressureDrop=drop, feedTemperature=feed_t, feedPressure=80000., feedFlow=feed,
                     feedComposition=[.5, .5], distillateFlow=distillate,
                     condenserDuty=float(condenser), reboilerDuty=float(reboiler),
                     stages=stages_out, residual=residual_max, evaluations=result.nfev))
    print(f'{trays} trays: xD={x[0]:.10f}, xB={x[-1]:.10f}, residual={residual_max:.3g}')

data = {'source': 'Independent SciPy least_squares, direct composition/flow variables, chemicals DIPPR/TRCCp and quadrature',
        'versions': {p: importlib.metadata.version(p) for p in ['scipy', 'chemicals', 'numpy']},
        'catalogSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'units': 'K, Pa, mol/s, W, mole fractions; trays exclude condenser and reboiler', 'rows': rows}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(data, indent=2, allow_nan=False)+'\n', encoding='utf-8')
