use crate::activity;
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chemical {
    id: String,
    molecular_weight: f64,
    cp: f64,
    #[serde(default)]
    formation_enthalpy: f64,
    #[serde(default)]
    antoine: Vec<Antoine>,
    groups: Option<BTreeMap<usize, f64>>,
}

#[derive(Deserialize)]
pub struct Antoine {
    a: f64,
    b: f64,
    c: f64,
    min: f64,
    max: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    model_id: Model,
    temperature: f64,
    pressure: f64,
    composition: Vec<f64>,
    chemicals: Vec<Chemical>,
    #[serde(default)]
    extrapolate: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Properties {
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

// Antoine records use K and bar; both pressure and derivative are converted explicitly.
fn saturation(c: &Chemical, t: f64, extrapolate: bool) -> Result<(f64, f64, bool), String> {
    let in_range = c.antoine.iter().find(|a| t >= a.min && t <= a.max);
    let a = in_range.or_else(|| if extrapolate {
        c.antoine.iter().min_by(|a,b| {
            (a.min-t).max(0.).max(t-a.max).total_cmp(&(b.min-t).max(0.).max(t-b.max))
        })
    } else { None }).ok_or_else(|| format!("{}: no vapor-pressure data at {t} K; select a supported temperature or explicitly enable extrapolation.", c.id))?;
    ensure(
        t + a.c > 0.
            && [a.a, a.b, a.c, a.min, a.max].iter().all(|v| v.is_finite())
            && a.min < a.max
            && a.b > 0.,
        "Invalid Antoine record",
    )?;
    let pressure = 1e5 * 10_f64.powf(a.a - a.b / (t + a.c));
    let latent = R * t * t * 10_f64.ln() * a.b / (t + a.c).powi(2);
    ensure(
        pressure.is_finite() && pressure > 0. && latent.is_finite(),
        "Nonfinite vapor pressure",
    )?;
    Ok((pressure, latent, in_range.is_none()))
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

pub fn evaluate(req: Request) -> Result<Properties, String> {
    let Request {
        model_id: model,
        temperature: t,
        pressure: p,
        composition: z,
        chemicals,
        extrapolate,
    } = req;
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
        "Invalid temperature or pressure",
    )?;
    let mut ids = std::collections::BTreeSet::new();
    for c in &chemicals {
        ensure(ids.insert(&c.id), "Duplicate chemical")?;
        ensure(
            c.cp.is_finite()
                && c.cp > 0.
                && c.molecular_weight.is_finite()
                && c.molecular_weight > 0.
                && c.formation_enthalpy.is_finite(),
            "Invalid sample caloric data",
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
        .map(|c| c.cp * (t - T_REF) + c.formation_enthalpy)
        .collect();
    let mut result = Properties {
        phase: "vapor", vapor_fraction: Some(1.), liquid_composition: None,
        vapor_composition: Some(z.clone()), k_values: None, activity_coefficients: vec![1.;n],
        saturation_pressures: None, partial_pressures: Some(z.iter().map(|z| z*p).collect()),
        molar_enthalpy: Some(dot(&z,&h_gas)), gas_molar_volume: Some(R*t/p),
        molecular_weight: z.iter().zip(&chemicals).map(|(z,c)| z*c.molecular_weight).sum(),
        iterations: 0, equilibrium_residual: 0., component_residual: 0.,
        warnings: vec!["Constant heat capacities are sample approximations, referenced to 298.15 K; they are not a validated caloric database.".into()],
    };
    if model == Model::Gas {
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
    let registry: activity::Registry = serde_json::from_value(json!({"datasets": {
        "modified-unifac-2.0": serde_json::from_str::<serde_json::Value>(include_str!("../sample-groups.json")).map_err(|e| e.to_string())?
    }})).map_err(|e| e.to_string())?;
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
    result.warnings.push("Low-pressure vapor–liquid model; no liquid–liquid stability search, pressure correction or liquid density. Latent heat is estimated from the Antoine derivative.".into());
    if model == Model::IdealSolution
        && chemicals.iter().any(|c| c.id == "ethanol")
        && chemicals.iter().any(|c| c.id == "water")
    {
        result.warnings.push("Ideal ethanol/water misses strong nonideality and its azeotrope; do not use for purity predictions.".into());
    }
    if model == Model::Modified {
        result.warnings.push("Modified UNIFAC 2.0 uses a small sample parameter subset (CC BY-NC 4.0); predictive VLE only, without LLE or industrial accuracy qualification.".into());
    }
    ensure(
        result.molar_enthalpy.is_none_or(f64::is_finite),
        "Nonfinite enthalpy",
    )?;
    Ok(result)
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
