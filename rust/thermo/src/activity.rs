//! Activity/excess-property kernel for the qualified numerical core.
//! Analytic differentiation and f64; datasets are never blended or zero-filled.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::ops::{Add, Div, Mul, Neg, Sub};
const R: f64 = 8.31446261815324;
const MAX: usize = 64;
#[derive(Clone, Copy, Debug)]
struct Jet<const N: usize> {
    v: f64,
    t: f64,
    tt: f64,
    x: [f64; N],
}
impl<const N: usize> Jet<N> {
    fn c(v: f64) -> Self {
        Self {
            v,
            t: 0.,
            tt: 0.,
            x: [0.; N],
        }
    }
    fn temperature(v: f64) -> Self {
        Self {
            t: 1.,
            ..Self::c(v)
        }
    }
    fn fraction(v: f64, i: usize) -> Self {
        let mut s = Self::c(v);
        s.x[i] = 1.;
        s
    }
    fn unary(self, v: f64, d: f64, dd: f64) -> Self {
        Self {
            v,
            t: d * self.t,
            tt: d * self.tt + dd * self.t * self.t,
            x: self.x.map(|x| d * x),
        }
    }
    fn ln(self) -> Self {
        self.unary(self.v.ln(), 1. / self.v, -1. / (self.v * self.v))
    }
    fn exp(self) -> Self {
        let v = self.v.exp();
        self.unary(v, v, v)
    }
    fn inv(self) -> Self {
        self.unary(
            1. / self.v,
            -1. / (self.v * self.v),
            2. / (self.v * self.v * self.v),
        )
    }
}
impl<const N: usize> Add for Jet<N> {
    type Output = Self;
    fn add(self, b: Self) -> Self {
        Self {
            v: self.v + b.v,
            t: self.t + b.t,
            tt: self.tt + b.tt,
            x: std::array::from_fn(|i| self.x[i] + b.x[i]),
        }
    }
}
impl<const N: usize> Neg for Jet<N> {
    type Output = Self;
    fn neg(self) -> Self {
        Self {
            v: -self.v,
            t: -self.t,
            tt: -self.tt,
            x: self.x.map(|x| -x),
        }
    }
}
impl<const N: usize> Sub for Jet<N> {
    type Output = Self;
    fn sub(self, b: Self) -> Self {
        self + (-b)
    }
}
impl<const N: usize> Mul for Jet<N> {
    type Output = Self;
    fn mul(self, b: Self) -> Self {
        Self {
            v: self.v * b.v,
            t: self.t * b.v + self.v * b.t,
            tt: self.tt * b.v + 2. * self.t * b.t + self.v * b.tt,
            x: std::array::from_fn(|i| self.x[i] * b.v + self.v * b.x[i]),
        }
    }
}
#[allow(clippy::suspicious_arithmetic_impl)]
impl<const N: usize> Div for Jet<N> {
    type Output = Self;
    fn div(self, b: Self) -> Self {
        self * b.inv()
    }
}
#[derive(Clone, Deserialize)]
pub struct Species {
    #[serde(rename = "vpRange")]
    range: Option<[f64; 2]>,
    groups: Option<BTreeMap<usize, f64>>,
}
#[derive(Clone, Deserialize)]
pub struct Mixture {
    pub model: String,
    pub cas: Vec<String>,
    pub species: Vec<Species>,
    #[serde(default, rename = "missingDataset")]
    pub missing_dataset: bool,
    #[serde(rename = "missingDefinition")]
    pub missing_definition: Option<usize>,
    #[serde(rename = "missingInteraction")]
    pub missing_interaction: Option<[usize; 2]>,
    #[serde(default, rename = "missingNotice")]
    pub missing_notice: bool,
}
#[derive(Clone, Deserialize)]
struct Definition {
    #[serde(rename = "R")]
    r: f64,
    #[serde(rename = "Q")]
    q: f64,
    main: usize,
}
#[derive(Clone, Deserialize)]
#[serde(untagged)]
enum Coeff {
    Scalar(f64),
    Abc([f64; 3]),
}
impl Coeff {
    fn abc(&self) -> [f64; 3] {
        match self {
            Self::Scalar(a) => [*a, 0., 0.],
            Self::Abc(v) => *v,
        }
    }
}
#[derive(Clone, Deserialize)]
struct Source {
    #[serde(rename = "useRestriction")]
    restriction: Option<String>,
    notice: Option<String>,
}
#[derive(Clone, Deserialize)]
pub struct Dataset {
    version: u8,
    definitions: BTreeMap<usize, Definition>,
    interactions: BTreeMap<usize, BTreeMap<usize, Coeff>>,
    source: Option<Source>,
}
#[derive(Deserialize)]
pub struct State {
    pub t: f64,
    pub zs: Vec<f64>,
}
#[derive(Serialize)]
pub struct Activity {
    pub gamma: Vec<f64>,
    pub lngamma: Vec<f64>,
    pub dlngamma_dt: Vec<f64>,
    pub dlngamma_dn: Vec<Vec<f64>>,
    pub ge: f64,
    pub he: f64,
    pub cpe: f64,
}
#[derive(Serialize)]
pub struct Point {
    pub t: f64,
    pub zs: Vec<f64>,
    pub active: Vec<usize>,
    pub activity: Activity,
}
#[derive(Default, Deserialize)]
pub struct Registry {
    pub datasets: HashMap<String, Dataset>,
}
fn sum<const N: usize>(values: impl Iterator<Item = Jet<N>>) -> Jet<N> {
    values.fold(Jet::<N>::c(0.), |a, b| a + b)
}
fn group_residual<const N: usize>(
    counts: &[Jet<N>],
    q: &[f64],
    psi: &[Vec<Jet<N>>],
) -> Vec<Jet<N>> {
    let m = q.len();
    let total = sum((0..m).map(|i| counts[i] * Jet::<N>::c(q[i])));
    let theta: Vec<Jet<N>> = (0..m)
        .map(|i| counts[i] * Jet::<N>::c(q[i]) / total)
        .collect();
    let den: Vec<Jet<N>> = (0..m)
        .map(|j| sum((0..m).map(|i| theta[i] * psi[i][j])))
        .collect();
    (0..m)
        .map(|i| {
            Jet::<N>::c(q[i])
                * (Jet::<N>::c(1.)
                    - den[i].ln()
                    - sum((0..m).map(|j| theta[j] * psi[i][j] / den[j])))
        })
        .collect()
}
fn unifac<const N: usize>(
    m: &Mixture,
    datasets: &HashMap<String, Dataset>,
    t: Jet<N>,
    xs: &[Jet<N>],
    active: &[usize],
) -> Result<Vec<Jet<N>>, String> {
    if m.missing_dataset {
        return Err("Selected release does not contain group dataset".into());
    }
    let d = datasets
        .get(&m.model)
        .ok_or("Missing selected group dataset")?;
    if m.model == "modified-unifac-2.0" {
        let valid = d.source.as_ref().is_some_and(|s| {
            s.restriction.as_deref() == Some("non-commercial-only")
                && s.notice.as_ref().is_some_and(|n| !n.is_empty())
        });
        if m.missing_notice || !valid {
            return Err("UNIFAC 2.0 requires source-pinned noncommercial notice".into());
        }
    }
    if d.version > 1 {
        return Err("Unsupported group formulation".into());
    }
    let mut assignments = Vec::new();
    let mut group_ids = BTreeSet::new();
    for &i in active {
        let a = m.species[i]
            .groups
            .as_ref()
            .filter(|a| !a.is_empty())
            .ok_or("Missing group assignment")?;
        assignments.push(a);
        group_ids.extend(a.keys().copied());
    }
    let ids: Vec<usize> = group_ids.into_iter().collect();
    let ng = ids.len();
    let n = xs.len();
    let mut defs = Vec::new();
    for &id in &ids {
        if m.missing_definition == Some(id) {
            return Err("Missing subgroup definition".into());
        }
        defs.push(
            d.definitions
                .get(&id)
                .ok_or("Missing subgroup definition")?,
        );
    }
    let nu: Vec<Vec<f64>> = assignments
        .iter()
        .map(|a| {
            ids.iter()
                .map(|id| a.get(id).copied().unwrap_or(0.))
                .collect()
        })
        .collect();
    let rs: Vec<f64> = nu
        .iter()
        .map(|v| v.iter().zip(&defs).map(|(v, d)| v * d.r).sum())
        .collect();
    let qs: Vec<f64> = nu
        .iter()
        .map(|v| v.iter().zip(&defs).map(|(v, d)| v * d.q).sum())
        .collect();
    if rs.iter().chain(&qs).any(|v| !v.is_finite() || *v <= 0.) {
        return Err("Invalid group surface/volume totals".into());
    }
    let mut psi = vec![vec![Jet::<N>::c(1.); ng]; ng];
    for i in 0..ng {
        for j in 0..ng {
            let a = defs[i].main;
            let b = defs[j].main;
            let coeff = if m.missing_interaction == Some([a, b]) {
                None
            } else {
                d.interactions.get(&a).and_then(|row| row.get(&b))
            };
            let [aa, bb, cc] = match coeff {
                Some(c) => c.abc(),
                None if a == b => [0.; 3],
                None => return Err("Missing main-group interaction".into()),
            };
            psi[i][j] = if d.version == 1 {
                (-Jet::<N>::c(aa) / t - Jet::<N>::c(bb) - Jet::<N>::c(cc) * t).exp()
            } else {
                (-Jet::<N>::c(aa) / t).exp()
            };
        }
    }
    let qg: Vec<f64> = defs.iter().map(|d| d.q).collect();
    let counts: Vec<Jet<N>> = (0..ng)
        .map(|k| sum((0..n).map(|i| xs[i] * Jet::<N>::c(nu[i][k]))))
        .collect();
    let residual = group_residual(&counts, &qg, &psi);
    let rx = sum((0..n).map(|i| xs[i] * Jet::<N>::c(rs[i])));
    let qx = sum((0..n).map(|i| xs[i] * Jet::<N>::c(qs[i])));
    let rmod: Vec<f64> = rs
        .iter()
        .map(|r| if d.version == 1 { r.powf(0.75) } else { *r })
        .collect();
    let rmodx = sum((0..n).map(|i| xs[i] * Jet::<N>::c(rmod[i])));
    let mut result = Vec::new();
    for i in 0..n {
        let v = Jet::<N>::c(rs[i]) / rx;
        let f = Jet::<N>::c(qs[i]) / qx;
        let vp = Jet::<N>::c(rmod[i]) / rmodx;
        let vf = v / f;
        let comb = Jet::<N>::c(1.) - vp + vp.ln()
            - Jet::<N>::c(5. * qs[i]) * (Jet::<N>::c(1.) - vf + vf.ln());
        let pure_counts: Vec<Jet<N>> = nu[i].iter().copied().map(Jet::<N>::c).collect();
        let pure = group_residual(&pure_counts, &qg, &psi);
        result.push(comb + sum((0..ng).map(|k| Jet::<N>::c(nu[i][k]) * (residual[k] - pure[k]))));
    }
    Ok(result)
}
// Specialize storage and derivative arithmetic for common mixture sizes.
// The 64-component implementation remains the reference for larger mixtures.
pub fn properties(m: &Mixture, registry: &Registry, s: State) -> Result<Point, String> {
    match s.zs.len() {
        0..=2 => properties_capacity::<2>(m, registry, s),
        3..=8 => properties_capacity::<8>(m, registry, s),
        _ => properties_capacity::<MAX>(m, registry, s),
    }
}
fn properties_capacity<const N: usize>(
    m: &Mixture,
    registry: &Registry,
    s: State,
) -> Result<Point, String> {
    let n = s.zs.len();
    if n == 0
        || n > MAX
        || n != m.cas.len()
        || n != m.species.len()
        || s.zs.iter().any(|x| !x.is_finite() || *x < 0.)
        || (s.zs.iter().sum::<f64>() - 1.).abs() > 1e-10
    {
        return Err("Invalid normalized composition".into());
    }
    if !s.t.is_finite() {
        return Err("Invalid temperature".into());
    }
    let active: Vec<usize> = (0..n).filter(|i| s.zs[*i] > 0.).collect();
    let mut low: f64 = 50.;
    let mut high: f64 = 2500.;
    for &i in &active {
        let r = m.species[i]
            .range
            .ok_or("Missing source temperature range")?;
        low = low.max(r[0]);
        high = high.min(r[1]);
    }
    if low >= high || s.t < low || s.t > high {
        return Err("Outside shared source temperature range".into());
    }
    let xs: Vec<Jet<N>> = active
        .iter()
        .enumerate()
        .map(|(i, &j)| Jet::<N>::fraction(s.zs[j], i))
        .collect();
    let t = Jet::<N>::temperature(s.t);
    let ln = match m.model.as_str() {
        "ideal-solution" | "ideal-gas" => vec![Jet::<N>::c(0.); xs.len()],
        "modified-unifac-2.0" => unifac(m, &registry.datasets, t, &xs, &active)?,
        _ => return Err("Unsupported model".into()),
    };
    let k = ln.len();
    let avg = sum((0..k).map(|i| Jet::<N>::c(xs[i].v) * ln[i]));
    let dn = ln
        .iter()
        .map(|g| {
            let weighted = (0..k).map(|j| xs[j].v * g.x[j]).sum::<f64>();
            (0..k).map(|j| g.x[j] - weighted).collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let a = Activity {
        gamma: ln.iter().map(|g| g.v.exp()).collect(),
        lngamma: ln.iter().map(|g| g.v).collect(),
        dlngamma_dt: ln.iter().map(|g| g.t).collect(),
        dlngamma_dn: dn,
        ge: R * s.t * avg.v,
        he: -R * s.t * s.t * avg.t,
        cpe: -R * (2. * s.t * avg.t + s.t * s.t * avg.tt),
    };
    if ![a.ge, a.he, a.cpe]
        .into_iter()
        .chain(a.gamma.iter().copied())
        .chain(a.lngamma.iter().copied())
        .chain(a.dlngamma_dt.iter().copied())
        .chain(a.dlngamma_dn.iter().flatten().copied())
        .all(f64::is_finite)
    {
        return Err("Non-finite activity result".into());
    }
    Ok(Point {
        t: s.t,
        zs: s.zs,
        active,
        activity: a,
    })
}
