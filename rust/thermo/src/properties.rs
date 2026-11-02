use crate::activity;
use crate::caloric::GasCp;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;

const R: f64 = 8.31446261815324;
const T_REF: f64 = 298.15;

#[derive(Deserialize, Clone, Copy, PartialEq)]
pub enum Model {
    #[serde(rename = "ideal-gas")]
    Gas,
    #[serde(rename = "ideal-solution")]
    IdealSolution,
    #[serde(rename = "modified-unifac-2.0")]
    Modified,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Chemical {
    id: String,
    molecular_weight: f64,
    cp: Option<f64>,
    gas_cp: Option<GasCp>,
    #[serde(default)]
    formation_enthalpy: f64,
    #[serde(default)]
    antoine: Vec<Antoine>,
    vapor_pressure: Option<VaporPressure>,
    latent_heat: Option<LatentHeat>,
    groups: Option<BTreeMap<usize, f64>>,
}

#[derive(Deserialize, Clone)]
pub struct Antoine {
    a: f64,
    b: f64,
    c: f64,
    min: f64,
    max: f64,
}

#[derive(Deserialize, Clone)]
#[serde(tag = "model")]
pub enum VaporPressure {
    #[serde(rename = "iapws-1992")]
    Iapws1992,
    #[serde(rename = "dippr-101", rename_all = "camelCase")]
    Dippr101 {
        coefficients: [f64; 5],
        min: f64,
        max: f64,
        critical_temperature: f64,
    },
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LatentHeat {
    coefficients: [f64; 5],
    min: f64,
    max: f64,
    critical_temperature: f64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    model_id: Model,
    temperature: f64,
    pressure: f64,
    composition: Vec<f64>,
    chemicals: Vec<Chemical>,
    #[serde(default)]
    extrapolate: bool,
    molar_enthalpy: Option<f64>,
    vapor_fraction: Option<f64>,
    activity_parameters: Option<activity::Dataset>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Properties {
    temperature: f64,
    phase: &'static str,
    vapor_fraction: Option<f64>,
    liquid_composition: Option<Vec<f64>>,
    vapor_composition: Option<Vec<f64>>,
    k_values: Option<Vec<f64>>,
    activity_coefficients: Vec<f64>,
    saturation_pressures: Option<Vec<f64>>,
    partial_pressures: Option<Vec<f64>>,
    molar_enthalpy: Option<f64>,
    gas_molar_volume: Option<f64>,
    molecular_weight: f64,
    iterations: usize,
    equilibrium_residual: f64,
    component_residual: f64,
    enthalpy_residual: Option<f64>,
    warnings: Vec<String>,
}

fn ensure(condition: bool, error: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(error.into())
    }
}
fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(a, b)| a * b).sum()
}
fn normalize(values: &[f64]) -> Vec<f64> {
    let total: f64 = values.iter().sum();
    values.iter().map(|x| x / total).collect()
}

// Return ln(P/Pa) and its analytic temperature derivative.
fn antoine(a: &Antoine, t: f64) -> Result<(f64, f64), String> {
    ensure(t + a.c > 0., "Invalid Antoine temperature")?;
    Ok((
        1e5_f64.ln() + 10_f64.ln() * (a.a - a.b / (t + a.c)),
        10_f64.ln() * a.b / (t + a.c).powi(2),
    ))
}

fn saturation(c: &Chemical, t: f64, extrapolate: bool) -> Result<(f64, f64, bool), String> {
    let (log_p, derivative, outside) = if let Some(VaporPressure::Dippr101 {
        coefficients: a,
        min,
        max,
        critical_temperature,
    }) = &c.vapor_pressure
    {
        ensure(
            a.iter().all(|v| v.is_finite())
                && min.is_finite()
                && max.is_finite()
                && min < max
                && critical_temperature.is_finite()
                && t < *critical_temperature,
            "Invalid vapor-pressure data or temperature at/above the critical point",
        )?;
        let outside = t < *min || t > *max;
        ensure(
            !outside || extrapolate,
            &format!("{}: no vapor-pressure data at {t} K", c.id),
        )?;
        (
            a[0] + a[1] / t + a[2] * t.ln() + a[3] * t.powf(a[4]),
            -a[1] / (t * t) + a[2] / t + a[3] * a[4] * t.powf(a[4] - 1.),
            outside,
        )
    } else if matches!(c.vapor_pressure, Some(VaporPressure::Iapws1992)) {
        // IAPWS SR1-86(1992), Eq. 1. Only saturation pressure is used;
        // the caloric model below remains the low-pressure sample approximation.
        const TC: f64 = 647.096;
        ensure(
            (273.16..=TC).contains(&t),
            "IAPWS water vapor-pressure range is 273.16–647.096 K; extrapolation is unavailable",
        )?;
        let theta = 1. - t / TC;
        let mut sum = 0.;
        let mut slope = 0.;
        for (a, power) in [
            (-7.85951783, 1.),
            (1.84408259, 1.5),
            (-11.7866497, 3.),
            (22.6807411, 3.5),
            (-15.9618719, 4.),
            (1.80122502, 7.5),
        ] {
            sum += a * theta.powf(power);
            slope += a * power * theta.powf(power - 1.);
        }
        (
            22.064e6_f64.ln() + TC / t * sum,
            -TC / (t * t) * sum - slope / t,
            false,
        )
    } else {
        let mut records: Vec<_> = c.antoine.iter().collect();
        for a in &records {
            ensure(
                [a.a, a.b, a.c, a.min, a.max].iter().all(|v| v.is_finite())
                    && a.min < a.max
                    && a.b > 0.,
                "Invalid Antoine record",
            )?;
        }
        records.sort_by(|a, b| a.min.total_cmp(&b.min).then(b.max.total_cmp(&a.max)));
        // A contained record does not extend coverage. Prefer the existing wider fit.
        let mut chain: Vec<&Antoine> = Vec::new();
        for a in records {
            if chain.last().is_none_or(|last| a.max > last.max) {
                chain.push(a);
            }
        }
        if let Some(start) = chain.iter().position(|a| t >= a.min && t <= a.max) {
            let mut previous = chain[start];
            let (mut value, mut slope) = antoine(previous, t)?;
            for a in &chain[start + 1..] {
                if t < a.min {
                    break;
                }
                // Blend ln(P) over the full overlap with a C2 smoothstep.
                // Include dw/dT: enthalpy must use the derivative of this same curve.
                let width = previous.max - a.min;
                ensure(
                    width > 0.,
                    "Antoine records must overlap for a continuous transition",
                )?;
                let u = (t - a.min) / width;
                let w = u.powi(3) * (10. - 15. * u + 6. * u * u);
                let dw = 30. * u * u * (1. - u).powi(2) / width;
                let (next, next_slope) = antoine(a, t)?;
                slope = (1. - w) * slope + w * next_slope + dw * (next - value);
                value = (1. - w) * value + w * next;
                previous = a;
            }
            (value, slope, false)
        } else {
            let a = chain.iter().filter(|_| extrapolate).min_by(|a, b| {
                (a.min - t).max(0.).max(t - a.max)
                    .total_cmp(&(b.min - t).max(0.).max(t - b.max))
            }).ok_or_else(|| format!("{}: no vapor-pressure data at {t} K; select a supported temperature or explicitly enable extrapolation.", c.id))?;
            let (value, slope) = antoine(a, t)?;
            (value, slope, true)
        }
    };
    let pressure = log_p.exp();
    let latent = if let Some(h) = &c.latent_heat {
        ensure(
            h.coefficients.iter().all(|v| v.is_finite())
                && h.min.is_finite()
                && h.max.is_finite()
                && h.min < h.max
                && t >= h.min
                && t <= h.max
                && h.critical_temperature.is_finite()
                && t < h.critical_temperature,
            &format!("{}: no latent-heat data at {t} K", c.id),
        )?;
        let tr = t / h.critical_temperature;
        let a = &h.coefficients;
        a[0] * (1. - tr).powf(a[1] + tr * (a[2] + tr * (a[3] + tr * a[4])))
    } else {
        R * t * t * derivative
    };
    ensure(
        pressure.is_finite() && pressure > 0. && latent.is_finite() && latent > 0.,
        "Nonfinite vapor pressure",
    )?;
    Ok((pressure, latent, outside))
}

// Bracketed Rachford–Rice, including single-phase endpoints and an indeterminate saturation state.
fn split(z: &[f64], k: &[f64]) -> (Option<f64>, Vec<f64>, Vec<f64>) {
    let rr = |beta: f64| {
        z.iter()
            .zip(k)
            .filter(|(z, _)| **z > 0.)
            .map(|(z, k)| z * (k - 1.) / (1. + beta * (k - 1.)))
            .sum::<f64>()
    };
    if z.iter()
        .zip(k)
        .all(|(z, k)| *z == 0. || (k - 1.).abs() < 1e-10)
    {
        return (None, z.to_vec(), z.to_vec());
    }
    let beta = if rr(0.) <= 1e-10 {
        0.
    } else if rr(1.) >= -1e-10 {
        1.
    } else {
        let (mut low, mut high) = (0., 1.);
        for _ in 0..100 {
            let mid = (low + high) / 2.;
            if rr(mid) > 0. {
                low = mid;
            } else {
                high = mid;
            }
            if high - low < 1e-14 {
                break;
            }
        }
        (low + high) / 2.
    };
    let x: Vec<_> = z
        .iter()
        .zip(k)
        .map(|(z, k)| {
            if *z == 0. {
                0.
            } else {
                z / (1. + beta * (k - 1.))
            }
        })
        .collect();
    let y: Vec<_> = x.iter().zip(k).map(|(x, k)| x * k).collect();
    (Some(beta), normalize(&x), normalize(&y))
}

fn evaluate_tp(req: &Request) -> Result<Properties, String> {
    let Request {
        model_id: model,
        temperature: t,
        pressure: p,
        composition: z,
        chemicals,
        extrapolate,
        vapor_fraction,
        ..
    } = req.clone();
    let n = z.len();
    ensure(
        n > 0 && n <= 64 && chemicals.len() == n,
        "Expected 1–64 matching chemicals and fractions",
    )?;
    ensure(
        z.iter().all(|z| z.is_finite() && *z >= 0.) && (z.iter().sum::<f64>() - 1.).abs() <= 1e-10,
        "Composition must be nonnegative and normalized",
    )?;
    ensure(
        t.is_finite() && (250. ..=800.).contains(&t) && p.is_finite() && p > 0. && p <= 1e8,
        "Invalid temperature or pressure: require 250–800 K and positive pressure up to 100 MPa",
    )?;
    ensure(
        vapor_fraction.is_none_or(|v| v.is_finite() && (0. ..=1.).contains(&v)),
        "Invalid specified vapor fraction",
    )?;
    let mut ids = std::collections::BTreeSet::new();
    for c in &chemicals {
        ensure(ids.insert(&c.id), "Duplicate chemical")?;
        ensure(
            (c.gas_cp.is_some() || c.cp.is_some_and(|cp| cp.is_finite() && cp > 0.))
                && c.molecular_weight.is_finite()
                && c.molecular_weight > 0.
                && c.formation_enthalpy.is_finite(),
            "Invalid caloric data",
        )?;
        if let Some(groups) = &c.groups {
            ensure(
                groups.values().all(|n| n.is_finite() && *n > 0.),
                "Invalid group count",
            )?;
        }
    }
    let h_gas: Vec<_> = chemicals
        .iter()
        .zip(&z)
        .map(|(c, z)| {
            if *z == 0. {
                return Ok(0.);
            }
            let sensible = if let Some(cp) = &c.gas_cp {
                cp.enthalpy(t).map_err(|e| format!("{}: {e}", c.id))?
            } else {
                c.cp.unwrap() * (t - T_REF)
            };
            Ok(sensible + c.formation_enthalpy)
        })
        .collect::<Result<Vec<f64>, String>>()?;
    let mut result = Properties {
        temperature: t,
        phase: "vapor",
        vapor_fraction: Some(1.),
        liquid_composition: None,
        vapor_composition: Some(z.clone()),
        k_values: None,
        activity_coefficients: vec![1.; n],
        saturation_pressures: None,
        partial_pressures: Some(z.iter().map(|z| z * p).collect()),
        molar_enthalpy: Some(dot(&z, &h_gas)),
        gas_molar_volume: Some(R * t / p),
        molecular_weight: z
            .iter()
            .zip(&chemicals)
            .map(|(z, c)| z * c.molecular_weight)
            .sum(),
        iterations: 0,
        equilibrium_residual: 0.,
        component_residual: 0.,
        enthalpy_residual: None,
        warnings: if chemicals.iter().any(|c| c.gas_cp.is_none()) {
            vec!["Constant heat capacities are sample approximations, referenced to 298.15 K; they are not a validated caloric database.".into()]
        } else {
            Vec::new()
        },
    };
    if model == Model::Gas {
        ensure(
            vapor_fraction.is_none_or(|v| v == 1.),
            "Specified vapor fraction conflicts with ideal gas",
        )?;
        result
            .warnings
            .push("Ideal gas assumption; no condensation or liquid volume prediction.".into());
        return Ok(result);
    }
    ensure(
        (1000. ..=200000.).contains(&p),
        "Liquid-solution models support 1–200 kPa only",
    )?;
    let mut ps = vec![0.; n];
    let mut latent = vec![0.; n];
    for i in 0..n {
        if z[i] == 0. {
            continue;
        }
        let (pressure, heat, outside) = saturation(&chemicals[i], t, extrapolate)?;
        ps[i] = pressure;
        latent[i] = heat;
        if outside {
            result.warnings.push(format!(
                "{}: vapor pressure extrapolated outside its source temperature range.",
                chemicals[i].id
            ));
        }
    }
    let dataset = if let Some(dataset) = &req.activity_parameters {
        dataset.clone()
    } else {
        serde_json::from_str(include_str!("../sample-groups.json")).map_err(|e| e.to_string())?
    };
    let mut registry = activity::Registry::default();
    registry
        .datasets
        .insert("modified-unifac-2.0".into(), dataset);
    let mixture: activity::Mixture = serde_json::from_value(json!({
        "model": "modified-unifac-2.0",
        "cas": chemicals.iter().map(|c| &c.id).collect::<Vec<_>>(),
        "species": chemicals.iter().map(|c| json!({"groups":c.groups,"vpRange":[250.,800.]})).collect::<Vec<_>>()
    })).map_err(|e| e.to_string())?;
    let activity_at = |x: &[f64]| -> Result<(Vec<f64>, f64), String> {
        if model != Model::Modified {
            return Ok((vec![1.; n], 0.));
        }
        let a = activity::properties(&mixture, &registry, activity::State { t, zs: x.to_vec() })?;
        let mut gamma = vec![1.; n];
        for (j, i) in a.active.iter().enumerate() {
            gamma[*i] = a.activity.gamma[j];
        }
        Ok((gamma, a.activity.he))
    };
    let (g, _) = activity_at(&z)?;
    let mut k: Vec<_> = (0..n)
        .map(|i| if z[i] > 0. { g[i] * ps[i] / p } else { 1. })
        .collect();
    let mut accepted = None;
    for iteration in 0..300 {
        let (beta, x, y) = split(&z, &k);
        let (gamma, excess) = activity_at(&x)?;
        let next: Vec<_> = (0..n)
            .map(|i| if z[i] > 0. { gamma[i] * ps[i] / p } else { 1. })
            .collect();
        ensure(
            next.iter().all(|v| v.is_finite() && *v > 0.),
            "Nonfinite equilibrium ratio",
        )?;
        let residual = next
            .iter()
            .zip(&k)
            .map(|(a, b)| (a.ln() - b.ln()).abs())
            .fold(0., f64::max);
        if residual < 1e-10 {
            result.iterations = iteration + 1;
            result.equilibrium_residual = residual;
            accepted = Some((beta, x, y, gamma, excess));
            break;
        }
        k = next
            .iter()
            .zip(&k)
            .map(|(a, b)| (0.5 * (a.ln() + b.ln())).exp())
            .collect();
    }
    let (beta, x, y, gamma, excess) =
        accepted.ok_or("Vapor–liquid equilibrium did not converge")?;
    if let (Some(actual), Some(specified)) = (beta, vapor_fraction) {
        ensure(
            (actual - specified).abs() < 1e-8,
            "Specified vapor fraction conflicts with TP equilibrium",
        )?;
    }
    // At pure-component saturation (or a degenerate mixture), PH supplies the
    // missing phase amount. Unspecified TP states remain indeterminate.
    let beta = beta.or(vapor_fraction);
    result.k_values = Some(k);
    result.saturation_pressures = Some(ps);
    result.activity_coefficients = gamma;
    result.vapor_fraction = beta;
    result.gas_molar_volume = None;
    result.partial_pressures = None;
    result.vapor_composition = None;
    result.liquid_composition = None;
    result.molar_enthalpy = None;
    if let Some(beta) = beta {
        result.phase = if beta == 0. {
            "liquid"
        } else if beta == 1. {
            "vapor"
        } else {
            "two-phase"
        };
        let h_liquid = dot(&x, &h_gas) - dot(&x, &latent) + excess;
        result.molar_enthalpy = Some((1. - beta) * h_liquid + beta * dot(&y, &h_gas));
        result.component_residual = (0..n)
            .map(|i| ((1. - beta) * x[i] + beta * y[i] - z[i]).abs())
            .fold(0., f64::max);
        ensure(
            result.component_residual < 1e-8,
            "Flash component balance failed",
        )?;
        if beta < 1. {
            result.liquid_composition = Some(x);
        }
        if beta > 0. {
            result.partial_pressures = Some(y.iter().map(|y| y * p).collect());
            result.vapor_composition = Some(y);
            if beta == 1. {
                result.gas_molar_volume = Some(R * t / p);
            }
        }
    } else {
        result.phase = "saturation";
        result.warnings.push("At saturation, temperature and pressure do not determine phase amounts or bulk enthalpy.".into());
    }
    result.warnings.push("Low-pressure vapor–liquid model; no liquid–liquid stability search, pressure correction or liquid density.".into());
    if chemicals
        .iter()
        .zip(&z)
        .any(|(c, z)| *z > 0. && c.latent_heat.is_none())
    {
        result.warnings.push("Latent heat is estimated from the vapor-pressure derivative where no caloric correlation is supplied.".into());
    }
    if model == Model::IdealSolution
        && chemicals
            .iter()
            .any(|c| c.id == "ethanol" || c.id == "64-17-5")
        && chemicals
            .iter()
            .any(|c| c.id == "water" || c.id == "7732-18-5")
    {
        result.warnings.push("Ideal ethanol/water misses strong nonideality and its azeotrope; do not use for purity predictions.".into());
    }
    if model == Model::Modified {
        result.warnings.push("Modified UNIFAC 2.0 published parameters are CC BY-NC 4.0; predictive VLE only, without LLE or industrial accuracy qualification.".into());
    }
    ensure(
        result.molar_enthalpy.is_none_or(f64::is_finite),
        "Nonfinite enthalpy",
    )?;
    Ok(result)
}

/// Couple the simultaneous MESH solver to the shared caloric VLE model.
/// Both phases use the same correlations and enthalpy reference as stream flashes.
pub fn column(mut req: Request, spec: serde_json::Value) -> Result<serde_json::Value, String> {
    use crate::column_numerics::{num, require};
    require(
        req.model_id != Model::Gas,
        "MESH requires Raoult or Modified UNIFAC liquid thermodynamics; ideal gas cannot condense",
    )?;
    // Validate the original feed before filtering inactive components.
    let feed = evaluate_tp(&req)?;
    let feed_h = feed
        .molar_enthalpy
        .ok_or("MESH requires a determinate feed enthalpy")?;
    let active: Vec<_> = req
        .composition
        .iter()
        .enumerate()
        .filter(|(_, z)| **z > 0.)
        .map(|(i, _)| i)
        .collect();
    require(
        active.len() >= 2,
        "MESH requires at least two positive-flow feed components",
    )?;
    req.chemicals = active.iter().map(|&i| req.chemicals[i].clone()).collect();
    req.composition = active.iter().map(|&i| req.composition[i]).collect();
    let n = req.chemicals.len();
    let trays = spec["trayCount"].as_u64().ok_or("Invalid tray count")?;
    let feed_tray = spec["feedTray"].as_u64().ok_or("Invalid feed tray")?;
    require(
        (2..=80).contains(&trays) && (1..=trays).contains(&feed_tray),
        "MESH needs 2–80 trays and a feed tray within the column",
    )?;
    require(
        spec["maxIterations"]
            .as_u64()
            .is_some_and(|v| (1..=2000).contains(&v)),
        "Invalid MESH iteration budget",
    )?;
    require(
        spec.as_object().is_some_and(|v| {
            v.keys().all(|k| {
                [
                    "trayCount",
                    "condenserType",
                    "feedTray",
                    "pressurePa",
                    "pressureDropPa",
                    "feedMolS",
                    "distillateMolS",
                    "refluxRatio",
                    "maxIterations",
                    "tolerance",
                    "kTolerance",
                    "enthalpyTolerance",
                ]
                .contains(&k.as_str())
            })
        }),
        "Unsupported MESH specification",
    )?;
    let p0 = num(&spec, "pressurePa")?;
    let drop = num(&spec, "pressureDropPa")?;
    require(
        drop >= 0. && p0 >= 1000. && p0 + drop <= 200000.,
        "MESH pressure profile must remain within 1–200 kPa",
    )?;
    let feed_pressure = p0 + drop * feed_tray as f64 / (trays + 1) as f64;
    require(
        req.pressure >= feed_pressure,
        "Feed pressure is below the specified feed-tray pressure",
    )?;
    let dataset = if let Some(dataset) = &req.activity_parameters {
        dataset.clone()
    } else {
        serde_json::from_str(include_str!("../sample-groups.json")).map_err(|e| e.to_string())?
    };
    let mut registry = activity::Registry::default();
    registry
        .datasets
        .insert("modified-unifac-2.0".into(), dataset);
    let mixture: activity::Mixture = serde_json::from_value(json!({
        "model": "modified-unifac-2.0",
        "cas": req.chemicals.iter().map(|c| &c.id).collect::<Vec<_>>(),
        "species": req.chemicals.iter().map(|c| json!({"groups":c.groups,"vpRange":[250.,800.]})).collect::<Vec<_>>()
    })).map_err(|e| e.to_string())?;
    let props = |t: f64, p: f64, x: &[f64], y: &[f64]| -> Result<crate::mesh::Props, String> {
        let mut log_k = Vec::with_capacity(n);
        let mut gas = Vec::with_capacity(n);
        let mut latent = Vec::with_capacity(n);
        for c in &req.chemicals {
            let (ps, hvap, _) = saturation(c, t, req.extrapolate)?;
            log_k.push((ps / p).ln());
            latent.push(hvap);
            gas.push(
                c.formation_enthalpy
                    + if let Some(cp) = &c.gas_cp {
                        cp.enthalpy(t)?
                    } else {
                        c.cp.unwrap() * (t - T_REF)
                    },
            );
        }
        let mut excess = 0.;
        if req.model_id == Model::Modified {
            let a =
                activity::properties(&mixture, &registry, activity::State { t, zs: x.to_vec() })?;
            for (j, &i) in a.active.iter().enumerate() {
                log_k[i] += a.activity.gamma[j].ln();
            }
            excess = a.activity.he;
        }
        Ok(crate::mesh::Props {
            pl: log_k,
            pv: vec![0.; n],
            hl: dot(x, &gas) - dot(x, &latent) + excess,
            hv: dot(y, &gas),
            derivatives: None,
        })
    };
    // Locate a supported bubble point for initialization; never bridge a data gap.
    let mut initialization = None;
    for (low, high) in temperature_intervals(&req)? {
        if high - low < 1e-5 {
            continue;
        }
        let bubble = |t| -> Result<f64, String> {
            let state = props(t, feed_pressure, &req.composition, &req.composition)?;
            Ok(req
                .composition
                .iter()
                .zip(state.pl)
                .map(|(x, k)| x * k.exp())
                .sum::<f64>()
                - 1.)
        };
        let (mut a, mut b) = (low + 1e-6, high - 1e-6);
        if bubble(a)? > 0. || bubble(b)? < 0. {
            continue;
        }
        for _ in 0..70 {
            let t = (a + b) / 2.;
            if bubble(t)? > 0. {
                b = t;
            } else {
                a = t;
            }
        }
        initialization = Some(([low, high], (a + b) / 2.));
        break;
    }
    let (range, seed) = initialization.ok_or("No supported bubble point at column pressure; check pressure and shared property temperature ranges")?;
    let mut result = crate::mesh::solve(
        &json!({"column":spec}),
        &req.composition,
        feed_h,
        range,
        seed,
        props,
        None,
    )?;
    // Independently TP-flash a two-phase blend on every converged stage. A bad
    // root/unsupported state must not be returned as a successful column.
    let mut warnings = feed.warnings;
    for stage in result["stages"].as_array().ok_or("Missing MESH stages")? {
        let x = crate::column_numerics::numbers(&stage["liquidComposition"])?;
        let y = crate::column_numerics::numbers(&stage["vaporComposition"])?;
        let mut check = req.clone();
        check.temperature = num(stage, "temperatureK")?;
        check.pressure = num(stage, "pressurePa")?;
        check.composition = x.iter().zip(&y).map(|(x, y)| (x + y) / 2.).collect();
        check.vapor_fraction = None;
        let verified = evaluate_tp(&check)?;
        let vx = verified
            .liquid_composition
            .as_ref()
            .ok_or("MESH stage verification lost liquid phase")?;
        let vy = verified
            .vapor_composition
            .as_ref()
            .ok_or("MESH stage verification lost vapor phase")?;
        require(
            vx.iter()
                .zip(&x)
                .chain(vy.iter().zip(&y))
                .all(|(a, b)| (a - b).abs() < 1e-6),
            "MESH stage failed independent equilibrium verification",
        )?;
        let h = (num(stage, "liquidEnthalpy")? + num(stage, "vaporEnthalpy")?) / 2.;
        require(
            (verified.molar_enthalpy.ok_or("Missing stage enthalpy")? - h).abs() < 0.01,
            "MESH stage failed independent enthalpy verification",
        )?;
        warnings.extend(verified.warnings);
    }
    warnings.sort();
    warnings.dedup();
    result["componentIds"] = json!(req.chemicals.iter().map(|c| &c.id).collect::<Vec<_>>());
    result["feedEnthalpy"] = json!(feed_h);
    result["warnings"] = json!(warnings);
    Ok(result)
}

// Intersect the UNION of each active chemical's data intervals. Never bridge an
// unsupported gap just because the endpoints of a temperature bracket are valid.
fn temperature_intervals(req: &Request) -> Result<Vec<(f64, f64)>, String> {
    let mut shared: Vec<(f64, f64)> = vec![(250., 800.)];
    for (z, c) in req.composition.iter().zip(&req.chemicals) {
        if *z == 0. {
            continue;
        }
        let mut ranges = if req.model_id == Model::Gas {
            vec![(250., 800.)]
        } else if let Some(VaporPressure::Dippr101 {
            min,
            max,
            critical_temperature,
            ..
        }) = &c.vapor_pressure
        {
            let (low, high) = if req.extrapolate {
                (250., 800.)
            } else {
                (*min, *max)
            };
            vec![(low, high.min(*critical_temperature - 1e-6))]
        } else if matches!(c.vapor_pressure, Some(VaporPressure::Iapws1992)) {
            vec![(273.16, 647.096 - 1e-6)]
        } else if req.extrapolate && !c.antoine.is_empty() {
            vec![(250., 800.)]
        } else {
            c.antoine.iter().map(|a| (a.min, a.max)).collect::<Vec<_>>()
        };
        if let Some(cp) = &c.gas_cp {
            ranges = intersect(&ranges, &cp.intervals()?);
        }
        if req.model_id != Model::Gas {
            if let Some(h) = &c.latent_heat {
                ranges = intersect(
                    &ranges,
                    &[(h.min, h.max.min(h.critical_temperature - 1e-6))],
                );
            }
        }
        ranges.sort_by(|a, b| a.0.total_cmp(&b.0));
        let mut merged: Vec<(f64, f64)> = Vec::new();
        for (low, high) in ranges {
            if let Some(last) = merged.last_mut().filter(|last| low <= last.1) {
                last.1 = last.1.max(high);
            } else {
                merged.push((low, high));
            }
        }
        shared = shared
            .iter()
            .flat_map(|(a, b)| {
                merged.iter().filter_map(move |(c, d)| {
                    let (low, high) = (a.max(*c), b.min(*d));
                    (low <= high).then_some((low, high))
                })
            })
            .collect();
    }
    ensure(
        !shared.is_empty(),
        "No shared property temperature range for PH flash",
    )?;
    Ok(shared)
}

fn intersect(a: &[(f64, f64)], b: &[(f64, f64)]) -> Vec<(f64, f64)> {
    a.iter()
        .flat_map(|(lo, hi)| {
            b.iter().filter_map(move |(x, y)| {
                let (low, high) = (lo.max(*x), hi.min(*y));
                (low <= high).then_some((low, high))
            })
        })
        .collect()
}

fn ph_state(req: &Request, t: f64, target: f64) -> Result<(Properties, f64), String> {
    let mut point = req.clone();
    point.temperature = t;
    let mut state = evaluate_tp(&point)?;
    if state.molar_enthalpy.is_none() {
        point.vapor_fraction = Some(0.);
        let liquid = evaluate_tp(&point)?.molar_enthalpy.unwrap();
        point.vapor_fraction = Some(1.);
        let vapor = evaluate_tp(&point)?.molar_enthalpy.unwrap();
        ensure(
            vapor > liquid,
            "PH flash requires positive heat of vaporization",
        )?;
        point.vapor_fraction = Some(((target - liquid) / (vapor - liquid)).clamp(0., 1.));
        state = evaluate_tp(&point)?;
    }
    let residual = state.molar_enthalpy.unwrap() - target;
    state.enthalpy_residual = Some(residual);
    Ok((state, residual))
}

pub fn evaluate(req: Request) -> Result<Properties, String> {
    let Some(target) = req.molar_enthalpy else {
        return evaluate_tp(&req);
    };
    ensure(
        target.is_finite() && req.vapor_fraction.is_none(),
        "Invalid PH flash specification",
    )?;
    // Validate composition, data and pressure before indexing or finding bounds.
    // Use a valid shared temperature below; TP validates the full request there.
    ensure(
        !req.composition.is_empty()
            && req.composition.len() <= 64
            && req.composition.len() == req.chemicals.len()
            && req.composition.iter().all(|z| z.is_finite() && *z >= 0.)
            && (req.composition.iter().sum::<f64>() - 1.).abs() <= 1e-10,
        "Expected 1–64 matching chemicals and normalized fractions",
    )?;
    if req.model_id == Model::Gas && req.chemicals.iter().all(|c| c.gas_cp.is_none()) {
        let cp: f64 = req
            .composition
            .iter()
            .zip(&req.chemicals)
            .map(|(z, c)| z * c.cp.unwrap_or(f64::NAN))
            .sum();
        let formation: f64 = req
            .composition
            .iter()
            .zip(&req.chemicals)
            .map(|(z, c)| z * c.formation_enthalpy)
            .sum();
        return ph_state(&req, T_REF + (target - formation) / cp, target).map(|(state, _)| state);
    }
    let tolerance = 1e-7 + 1e-11 * target.abs();
    for (mut low, mut high) in temperature_intervals(&req)? {
        let (lower, lower_h) = ph_state(&req, low, target)?;
        if lower_h.abs() <= tolerance {
            return Ok(lower);
        }
        let (upper, upper_h) = ph_state(&req, high, target)?;
        if upper_h.abs() <= tolerance {
            return Ok(upper);
        }
        if lower_h > 0. || upper_h < 0. {
            continue;
        }
        for _ in 0..100 {
            let mid = (low + high) / 2.;
            let (state, residual) = ph_state(&req, mid, target)?;
            if residual.abs() <= tolerance {
                return Ok(state);
            }
            if residual < 0. {
                low = mid;
            } else {
                high = mid;
            }
        }
        return Err(
            "PH flash energy balance did not converge within the supported property range".into(),
        );
    }
    Err(
        "Target enthalpy is outside the supported vapor-pressure temperature ranges for PH flash"
            .into(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bracketed_flash_closes_components() {
        let (b, x, y) = split(&[0.5, 0.5], &[2., 0.5]);
        assert!((b.unwrap() - 0.5).abs() < 1e-12);
        for i in 0..2 {
            assert!((0.5 * x[i] + 0.5 * y[i] - 0.5).abs() < 1e-12);
        }
    }
    #[test]
    fn endpoints_and_saturation() {
        assert_eq!(split(&[0.4, 0.6], &[0.2, 0.8]).0, Some(0.));
        assert_eq!(split(&[0.4, 0.6], &[2., 3.]).0, Some(1.));
        assert_eq!(split(&[1., 0.], &[1., 2.]).0, None);
    }
}
