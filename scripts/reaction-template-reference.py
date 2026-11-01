"""Independent numerical references; requires scipy, no application imports.

Run: python scripts/reaction-template-reference.py
Choi & Stenger (2003), doi:10.1016/S0378-7753(03)00614-1, eqs. 12/14.
Vanden Bussche & Froment (1996), doi:10.1006/jcat.1996.0156, eq. 3/Table 2.
"""
import json
import math
from pathlib import Path
from scipy.integrate import quad, solve_ivp
from scipy.optimize import brentq

R = 8.31446261815324
CO, WATER, CO2, H2, MEOH, AR = (
    "630-08-0", "7732-18-5", "124-38-9", "1333-74-0", "67-56-1", "7440-37-1"
)


def wgs_rate(t, pressure, flows):
    total = sum(flows.values())
    p = {i: n / total * pressure / 101325 for i, n in flows.items()}
    k = 296000 * math.exp(-47400 / R / t)
    equilibrium = math.exp(4577.8 / t - 4.33)
    return k * (p[CO] * p[WATER] - p[CO2] * p[H2] / equilibrium) / 3.6


def methanol_rates(t, pressure, flows):
    total = sum(flows.values())
    p = {i: n / total * pressure / 100000 for i, n in flows.items()}
    b = (1 + 3453.38 * p[WATER] / p[H2]
         + 0.499 * math.exp(17197 / R / t) * math.sqrt(p[H2])
         + 6.62e-11 * math.exp(124119 / R / t) * p[WATER])
    k1 = 10 ** (3066 / t - 10.592)
    k3 = 10 ** (2073 / t - 2.029)
    meoh = (1.07 * math.exp(36696 / R / t) * p[CO2] * p[H2]
            * (1 - p[WATER] * p[MEOH] / (k1 * p[H2]**3 * p[CO2])) / b**3)
    rwgs = (1.22e10 * math.exp(-94765 / R / t) * p[CO2]
            * (1 - k3 * p[WATER] * p[CO] / (p[CO2] * p[H2])) / b)
    return meoh, rwgs


rate_cases = []
for t in [393.15, 493.15, 523.15]:
    flows = {CO: .002, WATER: .003, CO2: .001, H2: .004}
    rate_cases.append(dict(template="pbr-water-gas-shift", temperature=t,
                           pressure=101325, flows=flows,
                           rates={"wgs": wgs_rate(t, 101325, flows)}))
for t in [453.15, 493.2, 553.15]:
    flows = {CO2: .0003, H2: .0078, CO: .0004, WATER: .0002, MEOH: .0002, AR: .0011}
    meoh, rwgs = methanol_rates(t, 1500000, flows)
    rate_cases.append(dict(template="pbr-methanol-synthesis", temperature=t,
                           pressure=1500000, flows=flows,
                           rates={"methanol": meoh, "rwgs": rwgs}))

# Constant total molar flow permits independent quadrature of W = integral dxi/r.
def mass_at_conversion(x):
    def integrand(extent):
        flows = {CO: .002-extent, WATER: .004-extent, CO2: extent, H2: .004+extent}
        return 1 / wgs_rate(493.15, 101325, flows)
    return quad(integrand, 0, .002*x, epsabs=1e-13, epsrel=1e-12)[0]


conversion = brentq(lambda x: mass_at_conversion(x) - .1, 0, .95, xtol=1e-14)
extent = .002 * conversion
wgs = dict(conversion=conversion, catalystMass=.1,
           flows={CO: .002-extent, WATER: .004-extent, CO2: extent, H2: .004+extent})
sizing = dict(conversion=.9, catalystMass=mass_at_conversion(.9))

# Integrate six species directly with an implicit Radau method, independently
# of the application's explicit Dormand-Prince integration in extent space.
ids = [CO2, H2, CO, WATER, MEOH, AR]
initial = [.0003, .0082, .0004, 0, 0, .0011]


def derivative(_mass, n):
    methanol, shift = methanol_rates(493.2, 1500000, dict(zip(ids, n)))
    return [-methanol-shift, -3*methanol-shift, shift, methanol+shift, methanol, 0]


solution = solve_ivp(derivative, [0, .0348], initial, method="Radau", rtol=1e-11, atol=1e-15)
assert solution.success
outlet = solution.y[:, -1]
methanol = dict(conversion=1-outlet[0]/initial[0], catalystMass=.0348,
                flows=dict(zip(ids, outlet.tolist())))
reference = dict(source="Independent SciPy quadrature, Brent root and Radau species balances; see scripts/reaction-template-reference.py",
                 rateCases=rate_cases, waterGasShift=wgs, sizing=sizing, methanol=methanol)
destination = Path(__file__).resolve().parents[1] / "tests/fixtures/reaction-templates-reference.json"
destination.write_text(json.dumps(reference, indent=2) + "\n", encoding="utf-8")
print(json.dumps(dict(waterGasShift=wgs, sizing=sizing, methanol=methanol), indent=2))
