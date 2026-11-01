"""Independent thermodynamic fixtures: Python thermo/chemicals + SciPy.

Reads published component data, never calls the application or reads its results.
Constructs two-phase states from prescribed liquid composition and vapor amount;
the application must recover them by a TP flash. No shared flash implementation.
"""
import argparse
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path

from chemicals.dippr import EQ101, EQ106
from chemicals.heat_capacity import TRCCp, Shomate
from scipy.integrate import quad
from thermo.unifac import UNIFAC, DOUFSG, load_unifac_ip
from thermo import unifac

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source = Path(__file__).resolve().parents[2] / 'tests/fixtures/catalog-reference.json'
catalog = json.loads(source.read_text(encoding='utf-8'))
chemicals = {c['id']: c for c in catalog['chemicals']}
load_unifac_ip()


def sensible(c, temperature):
    ranges = c['gasCp']['ranges']
    model = c['gasCp']['model']

    def cp(t):
        r = next(r for r in ranges if r['min'] <= t <= r['max'])
        a = r['coefficients']
        if model == 'trc':
            return TRCCp(t, *a)
        if model == 'shomate':
            return Shomate(t, *a)
        if model == 'chemsep-16':
            return a[0] + math.exp(a[1]/t+a[2]+a[3]*t+a[4]*t*t)
        raise ValueError(model)

    low, high = sorted([298.15, temperature])
    points = sorted(set([low, high] + [r['max'] for r in ranges if low < r['max'] < high]
                        + [r['coefficients'][7] for r in ranges
                           if model == 'trc' and low < r['coefficients'][7] < high]))
    return (1 if temperature >= 298.15 else -1) * sum(
        quad(cp, a, b, epsabs=1e-9, epsrel=1e-12)[0] for a, b in zip(points, points[1:]))


gas = []
for c in chemicals.values():
    for t in [280., 298.15, 320., 400., 550., 750.]:
        if any(r['min'] <= t <= r['max'] for r in c['gasCp']['ranges']):
            gas.append({'id': c['id'], 'temperature': t,
                        'enthalpy': c['formationEnthalpy'] + sensible(c, t)})

mixtures = [
    ['71-43-2', '108-88-3'], ['67-56-1', '7732-18-5'],
    ['64-17-5', '7732-18-5'], ['67-64-1', '64-17-5'],
    ['110-54-3', '71-43-2', '108-88-3'], ['67-56-1', '64-17-5', '7732-18-5'],
]
rows = []
for ids in mixtures:
    cc = [chemicals[i] for i in ids]
    groups = [{int(k): v for k, v in c['groups'].items()} for c in cc]
    compositions = [[.05, .95], [.5, .5], [.95, .05]] if len(ids) == 2 else [
        [.2, .3, .5], [.7, .2, .1], [.0001, .4999, .5]]
    for t in [310., 330., 350.]:
        psat = [EQ101(t, *c['vaporPressure']['coefficients']) for c in cc]
        latent = [EQ106(t, c['latentHeat']['criticalTemperature'],
                        *c['latentHeat']['coefficients']) for c in cc]
        hg = [c['formationEnthalpy'] + sensible(c, t) for c in cc]
        for x in compositions:
            for model in ['ideal-solution', 'modified-unifac-2.0']:
                u = UNIFAC.from_subgroups(T=t, xs=x, chemgroups=groups,
                                         subgroups=DOUFSG, interaction_data=unifac.DOUF2IP, version=1)
                gamma = u.gammas() if model == 'modified-unifac-2.0' else [1.]*len(ids)
                excess = u.HE() if model == 'modified-unifac-2.0' else 0.
                pressure = sum(a*b*c for a, b, c in zip(x, gamma, psat))
                y = [a*b*c/pressure for a, b, c in zip(x, gamma, psat)]
                hl = sum(a*(b-c) for a, b, c in zip(x, hg, latent)) + excess
                hv = sum(a*b for a, b in zip(y, hg))
                for beta in [.1, .5, .9]:
                    z = [(1-beta)*a+beta*b for a, b in zip(x, y)]
                    rows.append({'ids': ids, 'model': model, 'temperature': t,
                                 'pressure': pressure, 'composition': z,
                                 'liquidComposition': x, 'vaporComposition': y,
                                 'vaporFraction': beta, 'gamma': gamma,
                                 'enthalpy': (1-beta)*hl + beta*hv})

data = {'source': 'Python thermo UNIFAC(version=1, DOUF2IP), chemicals DIPPR, SciPy quadrature; prescribed liquid composition and phase amount',
        'versions': {p: importlib.metadata.version(p) for p in ['thermo', 'chemicals', 'scipy', 'numpy']},
        'catalogSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'units': {'temperature': 'K', 'pressure': 'Pa', 'enthalpy': 'J/mol', 'composition': 'mole fraction'},
        'gas': gas, 'rows': rows}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(data, indent=2, allow_nan=False)+'\n', encoding='utf-8')
print(f'Wrote {len(gas)} gas enthalpies and {len(rows)} independent two-phase states: {args.output}')
