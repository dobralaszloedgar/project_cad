"""Run the real DWSIM 9.0.5 .NET engine; never imports Project CAD code.

python dwsim-reference.py --dwsim-dir PATH --output PATH
Requires Windows/.NET Framework and pythonnet==3.0.5. See docs/BENCHMARKS.txt.
"""
import argparse
import hashlib
import json
import os
import statistics
import sys
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--dwsim-dir', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root, output = args.dwsim_dir.resolve(), args.output.resolve()
binary = root / 'DWSIM.Thermodynamics.dll'
assembly_hash = hashlib.sha256(binary.read_bytes()).hexdigest()
if assembly_hash != 'c5a038c86cdfd3304be5e283527ab377df7579ca306eac69950ab4b8c495c544':
    raise RuntimeError('Expected the pinned official DWSIM 9.0.5 Windows thermodynamics assembly')
os.chdir(root)
sys.path.insert(0, str(root))
dll_directory = os.add_dll_directory(str(root))
import clr
clr.AddReference(str(root / 'DWSIM.Thermodynamics.dll'))
from DWSIM.Thermodynamics.CalculatorInterface import Calculator
from DWSIM.Thermodynamics.PropertyPackages import RaoultPropertyPackage
from System import Array, Double, String
from System.Diagnostics import FileVersionInfo
from System.Globalization import CultureInfo
from System.Threading import Thread

Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture
calculator = Calculator()
calculator.Initialize()
calculator.DisableParallelProcessing()
calculator.DisableSIMDExtensions()
package = RaoultPropertyPackage(True)
package.LiquidFugacity_UsePoyntingCorrectionFactor = False
default_package = RaoultPropertyPackage(True)
for key in list(package.FlashSettings.Keys):
    if str(key) in ('PTFlash_External_Loop_Tolerance', 'PTFlash_Internal_Loop_Tolerance'):
        package.FlashSettings[key] = '1E-12'
    if str(key) in ('PTFlash_Maximum_Number_Of_External_Iterations', 'PTFlash_Maximum_Number_Of_Internal_Iterations'):
        package.FlashSettings[key] = '1000'

mixtures = [
    [('71-43-2', 'Benzene'), ('108-88-3', 'Toluene')],
    [('67-56-1', 'Methanol'), ('7732-18-5', 'Water')],
    [('64-17-5', 'Ethanol'), ('7732-18-5', 'Water')],
    [('67-64-1', 'Acetone'), ('64-17-5', 'Ethanol')],
    [('110-54-3', 'N-hexane'), ('71-43-2', 'Benzene'), ('108-88-3', 'Toluene')],
    [('67-56-1', 'Methanol'), ('64-17-5', 'Ethanol'), ('7732-18-5', 'Water')],
]


def flash(pp, names, temperature, pressure, z):
    result = calculator.PTFlash(pp, 0, pressure, temperature,
                               Array[String](names), Array[Double](z))
    phases = {str(result[0, j]): {
        'fraction': float(result[1, j]),
        'composition': [float(result[2+i, j]) for i in range(len(names))],
    } for j in range(result.GetLength(1)) if result[0, j] is not None}
    if any(v['fraction'] > 1e-10 for k, v in phases.items()
           if k not in ('Vapor', 'Liquid')):
        raise RuntimeError(f'Unexpected phase: {phases}')
    vapor = phases.get('Vapor', {'fraction': 0, 'composition': None})
    liquid = phases.get('Liquid', {'fraction': 0, 'composition': None})
    beta = vapor['fraction']
    return {'vaporFraction': beta,
            'liquidComposition': liquid['composition'] if liquid['fraction'] > 1e-10 else None,
            'vaporComposition': vapor['composition'] if beta > 1e-10 else None}


rows, times, defaults = [], [], []
for mixture in mixtures:
    ids, names = map(list, zip(*mixture))
    compositions = [[.1, .9], [.5, .5], [.9, .1]] if len(ids) == 2 else [
        [.2, .3, .5], [.7, .2, .1], [.001, .499, .5]]
    for temperature in [320., 350., 365.]:
        psat = [float(calculator.GetCompoundTDepProp(n, 'vaporPressure', temperature))
                for n in names]
        for z in compositions:
            bubble = sum(x*p for x, p in zip(z, psat))
            dew = 1 / sum(x/p for x, p in zip(z, psat))
            # Exercise liquid, vapor, and an interior two-phase state for every mixture.
            for pressure in [.8*dew, (dew+bubble)/2, min(200000., 1.2*bubble)]:
                started = time.perf_counter()
                result = flash(package, names, temperature, pressure, z)
                times.append((time.perf_counter()-started)*1000)
                row = {'ids': ids, 'temperature': temperature, 'pressure': pressure,
                       'composition': z, 'saturationPressures': psat, **result}
                rows.append(row)
                if 1e-8 < result['vaporFraction'] < 1-1e-8:
                    defaults.append({'case': len(rows)-1,
                                     **flash(default_package, names, temperature, pressure, z)})

data = {
    'source': 'DWSIM 9.0.5, Calculator.PTFlash using RaoultPropertyPackage; real .NET execution',
    'release': 'https://github.com/DanWBR/dwsim/releases/tag/v9.0.5',
    'releaseAssetSha256': 'f2a3da3ca25b1908d56cdbacdb8dc52e9fba45cb9b978c411736da2a67af45f4',
    'assemblyVersion': FileVersionInfo.GetVersionInfo(str(binary)).FileVersion,
    'assemblySha256': assembly_hash,
    'settings': {'propertyPackage': "Raoult's Law", 'poyntingCorrection': False,
                 'vaporFugacity': 'Ideal', 'parallelProcessing': False,
                 'ptFlashInternalTolerance': 1e-12, 'ptFlashExternalTolerance': 1e-12,
                 'defaultTolerance': 1e-4,
                 'note': "DWSIM 9.0.5 Raoult fugacity uses Psat/P directly; the Poynting flag has no effect in this package.",
                 'data': 'DWSIM built-in ChemSep records; no coefficients overridden'},
    'units': {'temperature': 'K', 'pressure': 'Pa', 'composition': 'mole fraction',
              'vaporFraction': 'molar'},
    'timing': {'count': len(times), 'medianMs': statistics.median(times[1:]),
               'note': 'Descriptive Python/.NET API wall time; first flash excluded, no startup. Not a controlled speed comparison.'},
    'rows': rows, 'withDefaultFlashTolerance': defaults,
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(data, indent=2, allow_nan=False)+'\n', encoding='utf-8')
print(f'Wrote {len(rows)} matched-model flashes and {len(defaults)} default-setting comparisons: {output}')
