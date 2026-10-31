"""Build a portable catalog from pinned public sources, without private inputs.
Usage: python scripts/catalog/build.py /absolute/path/catalog.json
Install scripts/catalog/requirements.txt in a separate virtual environment first.
"""
import hashlib
import io
import json
import math
from pathlib import Path
import sys
from urllib.request import urlopen
import xml.etree.ElementTree as ET
import zipfile

import chemicals
from chemicals import heat_capacity as hc, identifiers, reaction
import thermo
from thermo import unifac

assert chemicals.__version__ == "1.5.2" and thermo.__version__ == "0.6.1"
CHEMSEP = "https://raw.githubusercontent.com/DanWBR/dwsim/1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766/DWSIM.Thermodynamics/Assets/Databases/chemsep1.xml"
CHEMSEP_HASH = "31e72c40b2b3b084161314c3262e227fcdd773c0bf2070bacbae9c5da203533f"
GROUPS = "https://ndownloader.figshare.com/files/54360069"
GROUPS_HASH = "3d8b5d34aefb4dc1a5c11c2725efdc00cb73d5434c46c00f68dea61559b4004e"
MATRIX_HASH = "5ada1ec5463d54ed03048fba6400ac0f0e379a2cc32e4c8e228d775a86cca476"


def download(url, digest):
    with urlopen(url, timeout=60) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f"Source integrity check failed: {url}")
    return data


def val(node, key, default=None):
    child = node.find(key)
    return child.get("value", default) if child is not None else default


def correlation(node, name, equation):
    prop = node.find(name)
    if prop is None or val(prop, "eqno") != str(equation):
        return None
    values = [float(val(prop, key, "0")) for key in "ABCDE"]
    low, high = float(val(prop, "Tmin")), float(val(prop, "Tmax"))
    if not all(math.isfinite(x) for x in values + [low, high]) or low >= high:
        return None
    return {"coefficients": values, "min": low, "max": high}


def cp_record(model, ranges, source):
    if not any(r["min"] <= 298.15 <= r["max"] for r in ranges):
        return None  # No hidden extrapolation to the enthalpy reference.
    return {"model": model, "ranges": ranges, "source": source}


def build():
    xml = ET.fromstring(download(CHEMSEP, CHEMSEP_HASH))
    chemsep = {val(c, "CAS"): c for c in xml if val(c, "CAS")}
    hc._load_Cp_data()
    unifac.load_unifac_ip()
    matrix_file = Path(thermo.__file__).parent / "Phase Change/UNIFAC 2.0 Dortmund interaction parameters.tsv"
    assert hashlib.sha256(matrix_file.read_bytes()).hexdigest() == MATRIX_HASH

    # Read all 125 subgroup definitions directly from the publisher supplement.
    archive = zipfile.ZipFile(io.BytesIO(download(GROUPS, GROUPS_HASH)))
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    strings = ["".join(s.itertext()) for s in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
    definitions = {}
    for name in archive.namelist():
        if not (name.startswith("xl/worksheets/sheet") and name.endswith(".xml")):
            continue
        for row in ET.fromstring(archive.read(name)).findall(".//m:row", ns):
            values = []
            for cell in row:
                v = cell.find("m:v", ns)
                value = v.text if v is not None else ""
                values.append(strings[int(value)] if cell.get("t") == "s" else value)
            if len(values) == 6 and values[0].isdigit() and values[2].isdigit():
                definitions[values[0]] = {"main": int(values[2]), "R": float(values[4]), "Q": float(values[5])}
    assert len(definitions) == 125
    citation = "Nicolas Hayer, Hans Hasse and Fabian Jirasek (2025). Modified UNIFAC 2.0—A Group-Contribution Method Completed with Machine Learning. Industrial & Engineering Chemistry Research 64, 10304–10313."
    parameters = {
        "version": 1, "definitions": definitions,
        "interactions": {str(k): {str(j): list(v) for j, v in row.items()} for k, row in unifac.DOUF2IP.items()},
        "source": {"citation": citation, "doi": "10.1021/acs.iecr.5c00077", "license": "CC-BY-NC-4.0",
                   "useRestriction": "non-commercial-only", "url": "https://acs.figshare.com/articles/dataset/28986186",
                   "sha256": MATRIX_HASH,
                   "notice": citation + " CC-BY-NC-4.0: https://creativecommons.org/licenses/by-nc/4.0/ Published matrix coefficients are unchanged from the pinned thermo 0.6.1 mirror. Subgroups come from the publisher supplement. This model is for non-commercial use only. Attribution and license notices must be retained; no author endorsement is implied. Group assignments retain their separate provenance."},
    }
    chemicals_out, omitted = [], []
    candidates = sorted(set(chemsep) | set(hc.TRC_gas_data.index) | set(hc.WebBook_Shomate_coefficients))
    for cas in candidates:
        cp = None
        shomate = hc.WebBook_Shomate_coefficients.get(cas, [None, None, None])[2]
        if shomate:
            cp = cp_record("shomate", [{"min": r[0], "max": r[1], "coefficients": r[2:]} for r in shomate],
                           "NIST Chemistry WebBook Shomate gas coefficients; chemicals 1.5.2; https://webbook.nist.gov/")
        if cp is None and cas in hc.TRC_gas_data.index:
            row = hc.TRC_gas_data.loc[cas]
            cp = cp_record("trc", [{"min": float(row.Tmin), "max": float(row.Tmax),
                                    "coefficients": [float(row[f"a{i}"]) for i in range(8)]}],
                           "TRC ideal-gas heat capacities; chemicals 1.5.2; https://chemicals.readthedocs.io/chemicals.heat_capacity.html")
        compound = chemsep.get(cas)
        if cp is None and compound is not None:
            r = correlation(compound, "IdealGasHeatCapacityCp", 16)
            if r:
                # Convert A + exp(B/T+C+DT+ET²) from J/kmol/K to J/mol/K.
                r["coefficients"][0] /= 1000
                r["coefficients"][2] -= math.log(1000)
                cp = cp_record("chemsep-16", [r], "ChemSep v8.3, equation 16, converted to J/mol/K; " + CHEMSEP)
        if cp is None:
            omitted.append(cas)
            continue
        try:
            identity = identifiers.search_chemical(cas)
            mw, name, formula = identity.MW / 1000, identity.common_name, identity.formula
        except ValueError:
            if compound is None:
                omitted.append(cas)
                continue
            mw, name, formula = float(val(compound, "MolecularWeight"))/1000, val(compound, "CompoundID"), val(compound, "StructureFormula", "")
        record = {"id": cas, "name": name, "formula": formula, "molecularWeight": mw,
                  "gasCp": cp, "antoine": []}
        # A zero per-species reference is explicitly identified if no formation datum exists.
        formation_methods = [m for m in reaction.Hfg_methods(cas) if m not in ("JOBACK",)]
        if formation_methods:
            method = formation_methods[0]
            record["formationEnthalpy"] = reaction.Hfg(cas, method=method)
            record["formationSource"] = f"{method}; chemicals 1.5.2; standard ideal gas at 298.15 K"
        else:
            record["formationEnthalpy"] = 0
            record["formationSource"] = "Explicit reference convention: zero gas enthalpy at 298.15 K; formation enthalpy unavailable. Nonreacting balances only."
        if compound is not None:
            tc = float(val(compound, "CriticalTemperature", "0"))
            vp = correlation(compound, "VaporPressure", 101)
            if vp and tc > 250 and vp["max"] > 250:
                record["vaporPressure"] = {"model": "dippr-101", **vp, "criticalTemperature": tc, "source": "ChemSep v8.3, equation 101; " + CHEMSEP}
                latent = correlation(compound, "HeatOfVaporization", 106)
                if latent:
                    latent["coefficients"][0] /= 1000
                    record["latentHeat"] = {"model": "dippr-106", **latent, "criticalTemperature": tc, "source": "ChemSep v8.3, equation 106, converted to J/mol; " + CHEMSEP}
        groups = unifac.UNIFAC_group_assignment_DDBST(cas, "MODIFIED_UNIFAC")
        if groups:
            record["groups"] = {str(k): int(v) for k, v in groups.items()}
            record["groupSource"] = "DDBST modified UNIFAC assignments distributed with thermo 0.6.1; https://www.ddbst.com/published-parameters-unifac.html"
        chemicals_out.append(record)
    sources = []
    for package in (chemicals, thermo):
        root = Path(package.__file__).parent
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.suffix in ("tsv", ".tsv", ".json", ".sqlite") and (
                package is chemicals and any(part in str(path) for part in ("Heat Capacity", "Reactions", "Identifiers")) or
                package is thermo and ("UNIFAC" in path.name or "UNIFAC" in str(path))):
                sources.append({"file": f"{package.__name__}/{path.relative_to(root)}", "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    return {"schemaVersion": 1, "chemicals": chemicals_out, "parameters": parameters,
            "sources": {"chemicals": chemicals.__version__, "thermo": thermo.__version__,
                        "chemsep": {"url": CHEMSEP, "sha256": CHEMSEP_HASH, "notice": xml.get("library")},
                        "subgroups": {"url": GROUPS, "sha256": GROUPS_HASH}, "files": sources},
            "omittedWithoutReferenceCp": omitted}


if __name__ == "__main__":
    output = Path(sys.argv[1])
    result = build()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"chemicals": len(result["chemicals"]), "omitted": len(result["omittedWithoutReferenceCp"]),
                      "subgroups": len(result["parameters"]["definitions"]), "mainGroups": len(result["parameters"]["interactions"])}))
