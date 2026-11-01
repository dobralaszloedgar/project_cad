// Keep the verified JSON as text: bundlers can round JSON numeric literals
// by one ULP, invalidating the catalog record hashes. Parse it at runtime.
export const templateChemicalJson = String.raw`{
  "release": "274a918002b627c078e898199c08def7cd95bed6e1bbd5d8c31ae613c29c5b33",
  "chemicals": [
    {
      "id": "630-08-0",
      "name": "carbon monoxide",
      "formula": "CO",
      "molecularWeight": 0.028010100000000003,
      "gasCp": {
        "model": "shomate",
        "ranges": [
          {
            "min": 298,
            "max": 1300,
            "coefficients": [
              25.56759, 0.00609613, 0.000004054656, -2.671301e-9, 131021
            ]
          },
          {
            "min": 1300,
            "max": 6000,
            "coefficients": [
              35.1507, 0.001300095, -2.0592099999999998e-7, 1.355e-11, -3282780
            ]
          }
        ],
        "source": "NIST Chemistry WebBook Shomate gas coefficients; chemicals 1.5.2; https://webbook.nist.gov/"
      },
      "formationEnthalpy": -110525,
      "formationSource": "ATCT_G; chemicals 1.5.2; standard ideal gas at 298.15 K",
      "antoine": []
    },
    {
      "id": "7732-18-5",
      "name": "water",
      "formula": "H2O",
      "molecularWeight": 0.01801528,
      "gasCp": {
        "model": "trc",
        "ranges": [
          {
            "min": 50,
            "max": 5000,
            "coefficients": [4, 870000, 1646, 3.111, 1.728, -54010000, 559, 304]
          }
        ],
        "source": "TRC ideal-gas heat capacities; chemicals 1.5.2; https://chemicals.readthedocs.io/chemicals.heat_capacity.html"
      },
      "formationEnthalpy": -241822,
      "formationSource": "ATCT_G; chemicals 1.5.2; standard ideal gas at 298.15 K",
      "antoine": [],
      "vaporPressure": {
        "model": "dippr-101",
        "coefficients": [74.55502, -7295.586, -7.442448, 0.0000042881, 2],
        "min": 263.15,
        "max": 647.29,
        "criticalTemperature": 647.14,
        "source": "ChemSep v8.3, equation 101; https://raw.githubusercontent.com/DanWBR/dwsim/1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766/DWSIM.Thermodynamics/Assets/Databases/chemsep1.xml"
      },
      "latentHeat": {
        "model": "dippr-106",
        "coefficients": [59640, 0.86515, -1.1134, 0.67764, -0.026925],
        "min": 273.15,
        "max": 647.28,
        "criticalTemperature": 647.14,
        "source": "ChemSep v8.3, equation 106, converted to J/mol; https://raw.githubusercontent.com/DanWBR/dwsim/1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766/DWSIM.Thermodynamics/Assets/Databases/chemsep1.xml"
      },
      "groups": {
        "16": 1
      },
      "groupSource": "DDBST modified UNIFAC assignments distributed with thermo 0.6.1; https://www.ddbst.com/published-parameters-unifac.html"
    },
    {
      "id": "124-38-9",
      "name": "carbon dioxide",
      "formula": "CO2",
      "molecularWeight": 0.0440095,
      "gasCp": {
        "model": "shomate",
        "ranges": [
          {
            "min": 298,
            "max": 1200,
            "coefficients": [
              24.99735, 0.05518696, -0.00003369137, 7.948387e-9, -136638
            ]
          },
          {
            "min": 1200,
            "max": 6000,
            "coefficients": [
              58.16639, 0.002720074, -4.922889999999999e-7,
              3.8843999999999994e-11, -6447293
            ]
          }
        ],
        "source": "NIST Chemistry WebBook Shomate gas coefficients; chemicals 1.5.2; https://webbook.nist.gov/"
      },
      "formationEnthalpy": -393474,
      "formationSource": "ATCT_G; chemicals 1.5.2; standard ideal gas at 298.15 K",
      "antoine": [],
      "vaporPressure": {
        "model": "dippr-101",
        "coefficients": [95.478, -4070, -12.07, 0.000029505, 2],
        "min": 216.4,
        "max": 304.21,
        "criticalTemperature": 304.21,
        "source": "ChemSep v8.3, equation 101; https://raw.githubusercontent.com/DanWBR/dwsim/1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766/DWSIM.Thermodynamics/Assets/Databases/chemsep1.xml"
      },
      "latentHeat": {
        "model": "dippr-106",
        "coefficients": [21092, 0.35366, -0.46134, 0.43554, 0.037671],
        "min": 216.58,
        "max": 304.21,
        "criticalTemperature": 304.21,
        "source": "ChemSep v8.3, equation 106, converted to J/mol; https://raw.githubusercontent.com/DanWBR/dwsim/1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766/DWSIM.Thermodynamics/Assets/Databases/chemsep1.xml"
      }
    },
    {
      "id": "1333-74-0",
      "name": "hydrogen",
      "formula": "H2",
      "molecularWeight": 0.0020158800000000003,
      "gasCp": {
        "model": "shomate",
        "ranges": [
          {
            "min": 298,
            "max": 1000,
            "coefficients": [
              33.066178, -0.011363417, 0.000011432816, -2.7728739999999998e-9,
              -158558
            ]
          },
          {
            "min": 1000,
            "max": 2500,
            "coefficients": [
              18.563083, 0.012257357, -0.000002859786, 2.68238e-10, 1977990
            ]
          },
          {
            "min": 2500,
            "max": 6000,
            "coefficients": [
              43.41356, -0.004293079, 0.0000012724279999999998,
              -9.687600000000001e-11, -20533862
            ]
          }
        ],
        "source": "NIST Chemistry WebBook Shomate gas coefficients; chemicals 1.5.2; https://webbook.nist.gov/"
      },
      "formationEnthalpy": 0,
      "formationSource": "ATCT_G; chemicals 1.5.2; standard ideal gas at 298.15 K",
      "antoine": []
    },
    {
      "id": "67-56-1",
      "name": "methanol",
      "formula": "CH4O",
      "molecularWeight": 0.03204186,
      "gasCp": {
        "model": "trc",
        "ranges": [
          {
            "min": 50,
            "max": 3000,
            "coefficients": [
              4, 212000, 392, 20.921, -13.466, 29080000, 354, 182
            ]
          }
        ],
        "source": "TRC ideal-gas heat capacities; chemicals 1.5.2; https://chemicals.readthedocs.io/chemicals.heat_capacity.html"
      },
      "formationEnthalpy": -200700,
      "formationSource": "ATCT_G; chemicals 1.5.2; standard ideal gas at 298.15 K",
      "antoine": [],
      "vaporPressure": {
        "model": "dippr-101",
        "coefficients": [73.40342, -6548.076, -7.409987, 0.00000572492, 2],
        "min": 175.47,
        "max": 512.64,
        "criticalTemperature": 512.64,
        "source": "ChemSep v8.3, equation 101; https://raw.githubusercontent.com/DanWBR/dwsim/1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766/DWSIM.Thermodynamics/Assets/Databases/chemsep1.xml"
      },
      "latentHeat": {
        "model": "dippr-106",
        "coefficients": [58058, 0.87168, -0.81501, 0.1695, 0.17846],
        "min": 175.47,
        "max": 513.15,
        "criticalTemperature": 512.64,
        "source": "ChemSep v8.3, equation 106, converted to J/mol; https://raw.githubusercontent.com/DanWBR/dwsim/1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766/DWSIM.Thermodynamics/Assets/Databases/chemsep1.xml"
      },
      "groups": {
        "15": 1
      },
      "groupSource": "DDBST modified UNIFAC assignments distributed with thermo 0.6.1; https://www.ddbst.com/published-parameters-unifac.html"
    },
    {
      "id": "7440-37-1",
      "name": "argon",
      "formula": "Ar",
      "molecularWeight": 0.039948,
      "gasCp": {
        "model": "shomate",
        "ranges": [
          {
            "min": 298,
            "max": 6000,
            "coefficients": [
              20.786, 2.825911e-10, -1.464191e-13, 1.092131e-17, -0.03661371
            ]
          }
        ],
        "source": "NIST Chemistry WebBook Shomate gas coefficients; chemicals 1.5.2; https://webbook.nist.gov/"
      },
      "formationEnthalpy": 0,
      "formationSource": "ATCT_G; chemicals 1.5.2; standard ideal gas at 298.15 K",
      "antoine": []
    }
  ],
  "recordHashes": [
    "82d29fbb8eadcb2961ca1acd578b97180cc25d7bfdd0bd0b98a873fd32f599de",
    "abb84f4f98553563cfae15fec6f89e61888ca5f4abac2e47146ab76334f03456",
    "c3c882703eac0298d04cf9d9cebdba26850aa95ba614dd7b51319d8ebd25b1be",
    "e5507563e80d31e12d0305acc16895045f715c79e4feeca3eae304eb15ab7224",
    "3a2da8b3ed92614d9cc4816d667215104bf5ac7276ccf12f8a7f5939cfe06bec",
    "cb11cdef14e692fd9543f202b310aa7c6973ab8bae0ed1d2a67c0dacdf618d90"
  ]
}`;
