//! Simultaneous steady-state MESH equations; source-scaled balances and sparse solves.
use crate::{column_numerics::*, sparse};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
#[derive(Clone)]
pub struct Props {
    pub pl: Vec<f64>,
    pub pv: Vec<f64>,
    pub hl: f64,
    pub hv: f64,
    pub derivatives: Option<(
        crate::column_numerics::PhaseDerivatives,
        crate::column_numerics::PhaseDerivatives,
    )>,
}
#[derive(Clone)]
struct Decoded {
    xr: Vec<Vec<f64>>,
    yr: Vec<Vec<f64>>,
    x: Vec<Vec<f64>>,
    y: Vec<Vec<f64>>,
    t: Vec<f64>,
    l: Vec<f64>,
    v: Vec<f64>,
}
struct Eval {
    d: Decoded,
    mat: Vec<Vec<f64>>,
    eq: Vec<Vec<f64>>,
    sums: Vec<[f64; 2]>,
    energy: Vec<f64>,
    hl: Vec<f64>,
    hv: Vec<f64>,
    props: Vec<Props>,
    residual: Vec<f64>,
}
struct Cache {
    states: Vec<VecDeque<(Vec<u64>, Props)>>,
    calls: usize,
    hits: usize,
    residuals: usize,
}
fn flow_jacobian(a: &mut sparse::Matrix, e: &Eval, z: &[f64], rows: &[usize], cols: &[usize]) {
    let n = z.len();
    let m = e.d.t.len();
    let rw = 2 * n + 2;
    let offset = m * (2 * n + 1);
    let mut add = |row: usize, col: usize, value: f64| {
        if value != 0. {
            *a[rows[row]].entry(cols[col]).or_insert(0.) += value;
        }
    };
    for k in 1..m {
        for (gas, col, flow, h, x) in [
            (false, offset + k - 1, e.d.l[k], e.hl[k], &e.d.x[k]),
            (true, offset + m - 1 + k - 1, e.d.v[k], e.hv[k], &e.d.y[k]),
        ] {
            let neighbor = if gas {
                k.checked_sub(1)
            } else {
                Some(k + 1).filter(|j| *j < m)
            };
            for (j, sign) in std::iter::once((k, -1.)).chain(neighbor.map(|j| (j, 1.))) {
                for i in 0..n {
                    add(j * rw + i, col, sign * flow * x[i] / z[i]);
                }
                if j > 0 && j < m - 1 {
                    add(m * rw + j - 1, col, sign * flow * h / 40000.);
                }
            }
        }
    }
}
fn analytic_jacobian(
    e: &Eval,
    z: &[f64],
    sl: &[f64],
    sv: &[f64],
    dist: f64,
    temperature_scale: f64,
    rows: &[usize],
    cols: &[usize],
) -> sparse::Matrix {
    let n = z.len();
    let m = e.d.t.len();
    let width = 2 * n + 1;
    let rw = 2 * n + 2;
    let mut a = vec![BTreeMap::new(); rows.len()];
    flow_jacobian(&mut a, e, z, rows, cols);
    let mut add = |row: usize, col: usize, value: f64| {
        if value != 0. {
            *a[rows[row]].entry(cols[col]).or_insert(0.) += value;
        }
    };
    for k in 0..m {
        let (ld, vd) = e.props[k].derivatives.as_ref().unwrap();
        for (gas, d, x, raw, flow, draw) in [
            (false, ld, &e.d.x[k], &e.d.xr[k], e.d.l[k], sl[k]),
            (true, vd, &e.d.y[k], &e.d.yr[k], e.d.v[k], sv[k]),
        ] {
            let sign = if gas { -1. } else { 1. };
            let neighbor = if gas {
                k.checked_sub(1)
            } else {
                Some(k + 1).filter(|j| *j < m)
            };
            let outgoing = flow + draw + if !gas && k == 0 { dist } else { 0. };
            for j in 0..n {
                let col = k * width + if gas { n + j } else { j };
                for i in 0..n {
                    let dx = x[i] * ((if i == j { 1. } else { 0. }) - x[j]);
                    add(k * rw + i, col, -outgoing * dx / z[i]);
                    if let Some(next) = neighbor {
                        add(next * rw + i, col, flow * dx / z[i]);
                    }
                    add(
                        k * rw + n + i,
                        col,
                        sign * ((if i == j { 1. } else { 0. }) - x[j] + d.lnphi_logx[i][j]),
                    );
                }
                add(k * rw + 2 * n + usize::from(gas), col, raw[j]);
                if k > 0 && k < m - 1 {
                    add(m * rw + k - 1, col, -outgoing * d.h_logx[j] / 40000.);
                }
                if let Some(next) = neighbor {
                    if next > 0 && next < m - 1 {
                        add(m * rw + next - 1, col, flow * d.h_logx[j] / 40000.);
                    }
                }
            }
            let col = k * width + 2 * n;
            for i in 0..n {
                add(k * rw + n + i, col, sign * d.lnphi_t[i] * temperature_scale);
            }
            if k > 0 && k < m - 1 {
                add(
                    m * rw + k - 1,
                    col,
                    -outgoing * d.h_t * temperature_scale / 40000.,
                );
            }
            if let Some(next) = neighbor {
                if next > 0 && next < m - 1 {
                    add(
                        m * rw + next - 1,
                        col,
                        flow * d.h_t * temperature_scale / 40000.,
                    );
                }
            }
        }
    }
    a
}
fn integer(v: &Value, k: &str) -> Res<usize> {
    v[k].as_u64()
        .map(|v| v as usize)
        .ok_or(format!("Invalid integer {k}"))
}
fn decode(u: &[f64], n: usize, m: usize, low: f64, high: f64, l0: f64, v0: f64) -> Decoded {
    let width = 2 * n + 1;
    let offset = m * width;
    let mut xr = vec![];
    let mut yr = vec![];
    let mut x = vec![];
    let mut y = vec![];
    let mut t = vec![];
    for j in 0..m {
        let xx: Vec<f64> = u[j * width..j * width + n]
            .iter()
            .map(|x| x.exp())
            .collect();
        let yy: Vec<f64> = u[j * width + n..j * width + 2 * n]
            .iter()
            .map(|x| x.exp())
            .collect();
        let sx: f64 = xx.iter().sum();
        let sy: f64 = yy.iter().sum();
        x.push(xx.iter().map(|v| v / sx).collect());
        y.push(yy.iter().map(|v| v / sy).collect());
        xr.push(xx);
        yr.push(yy);
        t.push(low + (high - low) * u[j * width + 2 * n]);
    }
    let mut l = vec![l0];
    let mut v = vec![v0];
    l.extend(u[offset..offset + m - 1].iter().map(|v| v.exp()));
    v.extend(u[offset + m - 1..].iter().map(|v| v.exp()));
    Decoded {
        xr,
        yr,
        x,
        y,
        t,
        l,
        v,
    }
}
pub fn solve<F>(
    req: &Value,
    z: &[f64],
    feed_h: f64,
    range: [f64; 2],
    seed: f64,
    properties: F,
    profile: Option<&Value>,
) -> Res<Value>
where
    F: Fn(f64, f64, &[f64], &[f64]) -> Res<Props>,
{
    let c = &req["column"];
    let condenser_type = match c.get("condenserType") {
        None => "total",
        Some(value) => value.as_str().ok_or("Invalid condenser type")?,
    };
    require(
        ["total", "partial"].contains(&condenser_type),
        "Invalid condenser type",
    )?;
    let partial = condenser_type == "partial";
    let n = z.len();
    let trays = integer(c, "trayCount")?;
    let feed = integer(c, "feedTray")?;
    let rate = num(c, "feedMolS")?;
    let dist = num(c, "distillateMolS")?;
    let reflux = num(c, "refluxRatio")?;
    let budget = integer(c, "maxIterations")?;
    let mb = num(c, "tolerance")?.min(1e-7);
    let eqtol = num(c, "kTolerance")?.min(1e-7);
    let htol = num(c, "enthalpyTolerance")?.min(1e-7);
    require(
        (2..=64).contains(&n)
            && z.iter().all(|v| v.is_finite() && *v > 0.)
            && (z.iter().sum::<f64>() - 1.).abs() < 1e-10,
        "Column requires 2–64 positive normalized active components",
    )?;
    require(
        (1..=200).contains(&trays) && (1..=trays).contains(&feed),
        "Invalid tray count/feed tray",
    )?;
    require(
        rate.is_finite() && feed_h.is_finite() && dist > 0. && dist < rate && reflux > 0.,
        "Invalid distillate/reflux/feed",
    )?;
    require(
        budget > 0 && mb > 0. && eqtol > 0. && htol > 0.,
        "Positive iteration budget/tolerances required",
    )?;
    let [low, high] = range;
    require(
        low > 0. && low < seed && seed < high && high.is_finite(),
        "Column initialization outside source range",
    )?;
    let m = trays + 2;
    let p0 = num(c, "pressurePa")?;
    let drop = num(c, "pressureDropPa")?;
    require(
        p0 > 0. && drop >= 0.,
        "Column pressure must be positive and nondecreasing",
    )?;
    let pressures: Vec<_> = (0..m)
        .map(|j| p0 + drop * j as f64 / (m - 1) as f64)
        .collect();
    let draws = c.get("sideDraws").cloned().unwrap_or(json!([]));
    let draws_array = draws.as_array().ok_or("Invalid side draw list")?;
    require(draws_array.len() <= 20, "At most 20 side draws")?;
    let mut sl = vec![0.; m];
    let mut sv = vec![0.; m];
    let mut ids = BTreeSet::new();
    for draw in draws_array {
        let id = draw["id"].as_str().ok_or("Missing side draw ID")?;
        let j = integer(draw, "tray")?;
        let flow = num(draw, "flowMolS")?;
        let phase = draw["phase"].as_str().ok_or("Missing side phase")?;
        require(
            draw.as_object().is_some_and(|x| x.len() == 4)
                && !id.is_empty()
                && !["distillate", "bottoms"].contains(&id)
                && ids.insert(id)
                && (1..=trays).contains(&j)
                && flow > 0.
                && ["liquid", "vapor"].contains(&phase),
            "Invalid side draw ID/tray/phase/flow",
        )?;
        if phase == "liquid" {
            sl[j] += flow / rate;
        } else {
            sv[j] += flow / rate;
        }
    }
    let dist = dist / rate;
    let liquid_dist = if partial { 0. } else { dist };
    let vapor_dist = if partial { dist } else { 0. };
    require(
        dist + sl.iter().sum::<f64>() + sv.iter().sum::<f64>() < 1.,
        "Side draws leave no positive bottoms",
    )?;
    let l0 = reflux * dist;
    let width = 2 * n + 1;
    let offset = m * width;
    let size = offset + 2 * (m - 1);
    let rw = 2 * n + 2;
    let mut cache = Cache {
        states: vec![VecDeque::new(); m],
        calls: 0,
        hits: 0,
        residuals: 0,
    };
    let mut evaluate = |u: &[f64]| -> Res<Eval> {
        cache.residuals += 1;
        let d = decode(u, n, m, low, high, l0, vapor_dist);
        let mut hl = vec![0.; m];
        let mut hv = vec![0.; m];
        let mut eq = vec![vec![0.; n]; m];
        let mut stage_props = Vec::with_capacity(m);
        for j in 0..m {
            let mut key = vec![d.t[j].to_bits(), pressures[j].to_bits()];
            key.extend(d.x[j].iter().chain(&d.y[j]).map(|v| v.to_bits()));
            let cached = cache.states[j].iter().position(|a| a.0 == key);
            let props = if let Some(k) = cached {
                cache.hits += 1;
                let item = cache.states[j].remove(k).unwrap();
                let props = item.1.clone();
                cache.states[j].push_back(item);
                props
            } else {
                cache.calls += 1;
                let props = properties(d.t[j], pressures[j], &d.x[j], &d.y[j])?;
                require(
                    props.pl.len() == n
                        && props.pv.len() == n
                        && props.pl.iter().chain(&props.pv).all(|v| v.is_finite())
                        && props.hl.is_finite()
                        && props.hv.is_finite(),
                    "Stage property output invalid",
                )?;
                cache.states[j].push_back((key, props.clone()));
                if cache.states[j].len() > 4 {
                    cache.states[j].pop_front();
                }
                props
            };
            hl[j] = props.hl;
            hv[j] = props.hv;
            for i in 0..n {
                eq[j][i] = d.x[j][i].ln() + props.pl[i] - d.y[j][i].ln() - props.pv[i];
            }
            stage_props.push(props);
        }
        let mut mat = vec![vec![0.; n]; m];
        let mut energy = vec![0.; m];
        let mut sums = vec![[0.; 2]; m];
        for j in 0..m {
            for i in 0..n {
                mat[j][i] = -(d.l[j] + sl[j]) * d.x[j][i] - (d.v[j] + sv[j]) * d.y[j][i];
                if j > 0 {
                    mat[j][i] += d.l[j - 1] * d.x[j - 1][i];
                }
                if j + 1 < m {
                    mat[j][i] += d.v[j + 1] * d.y[j + 1][i];
                }
                if j == 0 {
                    mat[j][i] -= liquid_dist * d.x[0][i];
                }
                if j == feed {
                    mat[j][i] += z[i];
                }
            }
            energy[j] = -(d.l[j] + sl[j]) * hl[j] - (d.v[j] + sv[j]) * hv[j];
            if j > 0 {
                energy[j] += d.l[j - 1] * hl[j - 1];
            }
            if j + 1 < m {
                energy[j] += d.v[j + 1] * hv[j + 1];
            }
            if j == 0 {
                energy[j] -= liquid_dist * hl[0];
            }
            if j == feed {
                energy[j] += feed_h;
            }
            sums[j] = [
                d.xr[j].iter().sum::<f64>() - 1.,
                d.yr[j].iter().sum::<f64>() - 1.,
            ];
        }
        let mut residual = Vec::with_capacity(size);
        for j in 0..m {
            residual.extend(mat[j].iter().zip(z).map(|(v, z)| v / z));
            residual.extend_from_slice(&eq[j]);
            residual.extend_from_slice(&sums[j]);
        }
        residual.extend(energy[1..m - 1].iter().map(|v| v / 40000.));
        Ok(Eval {
            d,
            mat,
            eq,
            sums,
            energy,
            hl,
            hv,
            props: stage_props,
            residual,
        })
    };
    let mut initial = vec![0.; size];
    let mut ls = vec![l0; m - 1];
    let mut vs = vec![(reflux + 1.) * dist; m - 1];
    for j in 1..m {
        if j >= feed {
            ls[j - 1] += 1.;
        }
        ls[j - 1] = (ls[j - 1] - sl[..=j].iter().sum::<f64>()).max(l0.max(0.1) * 0.1);
        vs[j - 1] += sv[..j].iter().sum::<f64>();
    }
    ls[m - 2] = 1. - dist - sl.iter().sum::<f64>() - sv.iter().sum::<f64>();
    for j in 0..m {
        for i in 0..n {
            initial[j * width + i] = z[i].ln();
            initial[j * width + n + i] = z[i].ln();
        }
        initial[j * width + 2 * n] = (seed - low) / (high - low);
    }
    if let Some(profile) = profile {
        let stages = profile.as_array().ok_or("Invalid initial profile")?;
        require(stages.len() == m, "Wrong initial stage count")?;
        for (j, s) in stages.iter().enumerate() {
            let x = numbers(&s["liquidComposition"])?;
            let y = numbers(&s["vaporComposition"])?;
            require(
                x.len() == n && y.len() == n,
                "Wrong profile composition count",
            )?;
            for i in 0..n {
                initial[j * width + i] = x[i].ln();
                initial[j * width + n + i] = y[i].ln();
            }
            initial[j * width + 2 * n] = (num(s, "temperatureK")? - low) / (high - low);
            if j > 0 {
                ls[j - 1] = num(s, "liquidMolS")? / rate;
                vs[j - 1] = num(s, "vaporMolS")? / rate;
            }
        }
    }
    for j in 0..m - 1 {
        initial[offset + j] = ls[j].ln();
        initial[offset + m - 1 + j] = vs[j].ln();
    }
    let mut lower = vec![-80.; size];
    let mut upper = vec![25.; size];
    for j in 0..m {
        lower[j * width + 2 * n] = 1e-10;
        upper[j * width + 2 * n] = 1. - 1e-10;
        for i in 0..2 * n {
            upper[j * width + i] = 5.;
        }
    }
    require(
        (0..size).all(|i| initial[i].is_finite() && initial[i] > lower[i] && initial[i] < upper[i]),
        "Column initialization outside bounds",
    )?;
    // Reuse adjacency and coloring. Interleaving flow variables keeps sparse fill local.
    let mut pattern = vec![vec![]; size];
    for j in 0..m {
        let mut cols = vec![];
        for k in j.saturating_sub(1)..(j + 2).min(m) {
            cols.extend(k * width..(k + 1) * width);
            if k > 0 {
                cols.extend([offset + k - 1, offset + m - 1 + k - 1]);
            }
        }
        for &col in &cols {
            pattern[col].extend(j * rw..(j + 1) * rw);
            if j > 0 && j < m - 1 {
                pattern[col].push(m * rw + j - 1);
            }
        }
    }
    let mut groups = vec![];
    for color in 0..3 {
        for k in 0..width + 2 {
            let cols: Vec<_> = (color..m)
                .step_by(3)
                .filter(|&j| k < width || j > 0)
                .map(|j| {
                    if k < width {
                        j * width + k
                    } else {
                        offset + (k - width) * (m - 1) + j - 1
                    }
                })
                .collect();
            if !cols.is_empty() {
                groups.push(cols);
            }
        }
    }
    let mut col_order = vec![];
    let mut row_order = vec![];
    for j in 0..m {
        col_order.extend(j * width..(j + 1) * width);
        if j > 0 {
            col_order.extend([offset + j - 1, offset + m - 1 + j - 1]);
        }
        row_order.extend(j * rw..(j + 1) * rw);
        if j > 0 && j < m - 1 {
            row_order.push(m * rw + j - 1);
        }
    }
    let mut col_map = vec![0; size];
    let mut row_map = vec![0; size];
    for (i, &j) in col_order.iter().enumerate() {
        col_map[j] = i;
    }
    for (i, &j) in row_order.iter().enumerate() {
        row_map[j] = i;
    }
    let mut u = initial;
    let mut r = evaluate(&u)?.residual;
    let mut iterations = 1;
    let target = mb.min(eqtol).min(htol).min(1e-10);
    let mut fallback = req["forceFallback"].as_bool().unwrap_or(false);
    let mut used_fallback = fallback;
    let mut lambda = 1e-6_f64;
    let mut factors = 0;
    let reference = req["referenceJacobian"].as_bool().unwrap_or(false);
    let mut analytic_steps = 0;
    let mut reference_steps = 0;
    let mut derivative_checks = 0;
    let mut derivative_max_ratio = 0_f64;
    while iterations < budget && maxabs(&r) > target {
        let steps: Vec<f64> = (0..size)
            .map(|i| {
                let h = f64::EPSILON.sqrt() * u[i].abs().max(1.);
                if u[i] + h < upper[i] {
                    h
                } else {
                    -h
                }
            })
            .collect();
        let mut jac: sparse::Matrix = vec![BTreeMap::new(); size];
        let state = evaluate(&u)?;
        let complete = !reference && state.props.iter().all(|p| p.derivatives.is_some());
        if complete {
            jac = analytic_jacobian(
                &state,
                z,
                &sl,
                &sv,
                liquid_dist,
                high - low,
                &row_map,
                &col_map,
            );
            analytic_steps += 1;
        } else {
            reference_steps += 1;
            for group in &groups {
                // Unsupported thermodynamic derivatives retain the colored reference
                // path. Flow derivatives remain exact unless reference is requested.
                let cols: Vec<_> = group
                    .iter()
                    .copied()
                    .filter(|c| reference || *c < offset)
                    .collect();
                if cols.is_empty() {
                    continue;
                }
                let mut shifted = u.clone();
                for &col in &cols {
                    shifted[col] += steps[col];
                }
                let rr = evaluate(&shifted)?.residual;
                for &col in &cols {
                    for &row in &pattern[col] {
                        let v = (rr[row] - r[row]) / steps[col];
                        if v != 0. {
                            jac[row_map[row]].insert(col_map[col], v);
                        }
                    }
                }
            }
            if !reference {
                flow_jacobian(&mut jac, &state, z, &row_map, &col_map);
            }
        }
        if req["verifyJacobian"].as_bool().unwrap_or(false) && derivative_checks == 0 {
            // Validate the actual assembled matrix at the off-solution initial
            // state, including normalization, side draws, pressure and energy.
            for col in 0..size {
                let h = if col < offset && col % width == 2 * n {
                    1e-6
                } else {
                    1e-4
                };
                require(
                    u[col] - h > lower[col] && u[col] + h < upper[col],
                    "Jacobian verification outside bounds",
                )?;
                let mut plus = u.clone();
                let mut minus = u.clone();
                plus[col] += h;
                minus[col] -= h;
                let rp = evaluate(&plus)?.residual;
                let rm = evaluate(&minus)?.residual;
                for row in 0..size {
                    let finite = (rp[row] - rm[row]) / (2. * h);
                    let analytic = jac[row_map[row]].get(&col_map[col]).copied().unwrap_or(0.);
                    let ratio = (analytic - finite).abs()
                        / (1e-5 + 5e-5 * finite.abs().max(analytic.abs()));
                    derivative_max_ratio = derivative_max_ratio.max(ratio);
                    derivative_checks += 1;
                    require(ratio <= 1., &format!("Jacobian check failed row={row} col={col} analytic={analytic} finite={finite} ratio={ratio}"))?;
                }
            }
        }
        let mut accepted = false;
        for attempt in 0..if fallback { 16 } else { 2 } {
            let ordered_r: Vec<_> = row_order.iter().map(|&i| r[i]).collect();
            let answer = if fallback {
                let mut scales = vec![0_f64; size];
                for row in &jac {
                    for (&j, &v) in row {
                        scales[j] += v * v;
                    }
                }
                for s in &mut scales {
                    *s = s.sqrt().max(1e-12);
                }
                let mut a: sparse::Matrix = vec![BTreeMap::new(); size];
                let mut rhs = vec![0.; size];
                for (i, row) in jac.iter().enumerate() {
                    let vals: Vec<_> = row.iter().map(|(&j, &v)| (j, v / scales[j])).collect();
                    for &(j, v) in &vals {
                        rhs[j] -= v * ordered_r[i];
                        for &(k, w) in &vals {
                            *a[j].entry(k).or_insert(0.) += v * w;
                        }
                    }
                }
                for j in 0..size {
                    *a[j].entry(j).or_insert(0.) += lambda;
                }
                sparse::solve(a, rhs).map(|s| {
                    s.iter()
                        .zip(&scales)
                        .map(|(s, c)| s / c)
                        .collect::<Vec<_>>()
                })
            } else {
                sparse::solve(jac.clone(), ordered_r.iter().map(|r| -r).collect())
            };
            factors += 1;
            let step_ordered = match answer {
                Ok(s) => s,
                Err(_) => {
                    fallback = true;
                    used_fallback = true;
                    lambda *= 10.;
                    continue;
                }
            };
            let mut step = vec![0.; size];
            for (i, &j) in col_order.iter().enumerate() {
                step[j] = step_ordered[i];
            }
            let mut fraction = 1_f64.min(5. / maxabs(&step).max(5.));
            for i in 0..size {
                if step[i] > 0. {
                    fraction = fraction.min(0.99 * (upper[i] - u[i]) / step[i]);
                } else if step[i] < 0. {
                    fraction = fraction.min(0.99 * (lower[i] - u[i]) / step[i]);
                }
            }
            let cost = norm(&r);
            while fraction > 1e-8 && iterations < budget {
                let trial: Vec<_> = u.iter().zip(&step).map(|(u, s)| u + fraction * s).collect();
                let candidate = evaluate(&trial)?.residual;
                iterations += 1;
                if norm(&candidate) < (1. - 1e-4 * fraction) * cost {
                    u = trial;
                    r = candidate;
                    accepted = true;
                    if fallback {
                        lambda = (lambda * 0.2).max(1e-14);
                    }
                    break;
                }
                fraction *= 0.5;
            }
            if accepted {
                break;
            }
            if !fallback {
                fallback = true;
                used_fallback = true;
            } else {
                lambda = (lambda * 10.).min(1e16);
            }
            if iterations >= budget || attempt == 15 {
                break;
            }
        }
        if !accepted {
            break;
        }
    }
    let final_state = evaluate(&u)?;
    let d = &final_state.d;
    let stage_material: Vec<_> = final_state
        .mat
        .iter()
        .map(|row| {
            row.iter()
                .zip(z)
                .map(|(m, z)| (m / z).abs())
                .fold(0., f64::max)
        })
        .collect();
    let material = maxabs(&stage_material);
    let component = (0..n)
        .map(|i| {
            ((liquid_dist * d.x[0][i]
                + vapor_dist * d.y[0][i]
                + d.l[m - 1] * d.x[m - 1][i]
                + (0..m)
                    .map(|j| sl[j] * d.x[j][i] + sv[j] * d.y[j][i])
                    .sum::<f64>()
                - z[i])
                / z[i])
                .abs()
        })
        .fold(0., f64::max);
    let equilibrium = final_state.eq.iter().map(|x| maxabs(x)).fold(0., f64::max);
    let energy = maxabs(&final_state.energy[1..m - 1]) / 40000.;
    let summation = final_state
        .sums
        .iter()
        .map(|x| maxabs(x))
        .fold(0., f64::max);
    if !(material <= mb
        && component <= mb
        && equilibrium <= eqtol
        && energy <= htol
        && summation <= mb)
    {
        return Err(format!("COLUMN_CONVERGENCE: {iterations} evaluations; material={material}, overall={component}, equilibrium={equilibrium}, energy={energy}, sums={summation}"));
    }
    require(
        d.l.iter().all(|v| *v > 0.) && d.v[1..].iter().all(|v| *v > 0.),
        "Dry stage or nonpositive internal flow",
    )?;
    let qc = -final_state.energy[0] * rate;
    let qr = -final_state.energy[m - 1] * rate;
    require(
        qc < 0. && qr > 0.,
        "Column requires condenser cooling and reboiler heating",
    )?;
    let overall_energy = (rate * feed_h + qc + qr
        - rate * (liquid_dist * final_state.hl[0] + vapor_dist * final_state.hv[0])
        - rate
            * (d.l[m - 1] * final_state.hl[m - 1]
                + (0..m)
                    .map(|j| sl[j] * final_state.hl[j] + sv[j] * final_state.hv[j])
                    .sum::<f64>()))
    .abs();
    require(
        overall_energy <= htol * 40000. * rate,
        "Column overall energy closure failed",
    )?;
    let stages:Vec<_>=(0..m).map(|j|json!({"stage":j,"kind":if j==0{"condenser"}else if j==m-1{"reboiler"}else{"tray"},"temperatureK":d.t[j],"pressurePa":pressures[j],"liquidMolS":d.l[j]*rate,"vaporMolS":d.v[j]*rate,"liquidComposition":d.x[j],"vaporComposition":d.y[j],"liquidEnthalpy":final_state.hl[j],"vaporEnthalpy":final_state.hv[j],"residuals":{"material":stage_material[j],"equilibrium":maxabs(&final_state.eq[j]),"energy":if j>0&&j<m-1{final_state.energy[j].abs()/40000.}else{0.},"summation":maxabs(&final_state.sums[j])}})).collect();
    std::mem::drop(evaluate);
    let solver_version = if partial {
        "project-column-mesh-v2"
    } else {
        "project-column-mesh-v1"
    };
    Ok(
        json!({"solverVersion":solver_version,"condenserType":condenser_type,"iterations":iterations,"sideDraws":draws,"feedTray":feed,"feedMolS":rate,"feedComposition":z,"residuals":{"material":material,"component":component,"equilibrium":equilibrium,"energy":energy,"summation":summation,"overallEnergyW":overall_energy},"condenserDutyW":qc,"reboilerDutyW":qr,"distillateMolS":dist*rate,"bottomsMolS":d.l[m-1]*rate,"stages":stages,"diagnostics":{"propertyCalls":cache.calls,"propertyCacheHits":cache.hits,"residualCalls":cache.residuals,"sparseFactorizations":factors,"fallbackUsed":used_fallback,"analyticJacobianSteps":analytic_steps,"referenceJacobianSteps":reference_steps,"derivativeChecks":derivative_checks,"derivativeMaxToleranceRatio":derivative_max_ratio,"linearSolver":"sparse partial-pivot LU with stage-interleaved ordering","fallbackSolver":"bounded sparse damped least squares"}}),
    )
}
#[cfg(test)]
pub fn controlled(req: &Value) -> Res<Value> {
    let alpha = numbers(&req["alpha"])?;
    let range = numbers(&req["temperatureRange"])?;
    require(range.len() == 2, "Controlled range")?;
    solve(
        req,
        &numbers(&req["zs"])?,
        num(req, "feedH")?,
        [range[0], range[1]],
        num(req, "seedTemperature")?,
        |t, _p, x, _y| {
            require(x.len() == alpha.len(), "Controlled dimensions")?;
            Ok(Props {
                pl: alpha.iter().map(|a| a.ln() + (t - 350.) / 40.).collect(),
                pv: vec![0.; alpha.len()],
                hl: 0.,
                hv: 40000.,
                derivatives: if req["unsupportedDerivatives"].as_bool().unwrap_or(false) {
                    None
                } else {
                    Some((
                        crate::column_numerics::PhaseDerivatives {
                            lnphi_t: vec![1. / 40.; alpha.len()],
                            lnphi_logx: vec![vec![0.; alpha.len()]; alpha.len()],
                            h_t: 0.,
                            h_logx: vec![0.; alpha.len()],
                        },
                        crate::column_numerics::PhaseDerivatives {
                            lnphi_t: vec![0.; alpha.len()],
                            lnphi_logx: vec![vec![0.; alpha.len()]; alpha.len()],
                            h_t: 0.,
                            h_logx: vec![0.; alpha.len()],
                        },
                    ))
                },
            })
        },
        None,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn analytical_partial_condenser() {
        // Independent elimination at alpha=2, F=1, D=B=.5, R=2:
        // yD=1-xB, x0=(1-xB)/(1+xB), x1=(xB+3*yB)/4,
        // 1.5*y1=x0+.5*yD gives xB^4+19*xB^3+71*xB^2+17*xB-12=0.
        let (mut low, mut high) = (0_f64, 1_f64);
        for _ in 0..80 {
            let b = (low + high) / 2.;
            if b.powi(4) + 19. * b.powi(3) + 71. * b * b + 17. * b - 12. > 0. {
                high = b;
            } else {
                low = b;
            }
        }
        let xb = (low + high) / 2.;
        for finite_differences in [false, true] {
            for fallback in [false, true] {
                let req = json!({
                    "alpha":[2.,1.], "zs":[0.5,0.5], "feedH":0.,
                    "temperatureRange":[280.,400.], "seedTemperature":330.,
                    "unsupportedDerivatives":finite_differences, "forceFallback":fallback,
                    "verifyJacobian":true,
                    "column":{"condenserType":"partial","trayCount":1,"feedTray":1,
                        "feedMolS":1.,"distillateMolS":0.5,"refluxRatio":2.,
                        "pressurePa":101325.,"pressureDropPa":0.,"maxIterations":200,
                        "tolerance":1e-9,"kTolerance":1e-9,"enthalpyTolerance":1e-9}
                });
                let result = controlled(&req).unwrap();
                assert!(
                    (result["stages"][2]["liquidComposition"][0]
                        .as_f64()
                        .unwrap()
                        - xb)
                        .abs()
                        < 1e-8
                );
                assert!(
                    (result["stages"][0]["vaporComposition"][0].as_f64().unwrap() - (1. - xb))
                        .abs()
                        < 1e-8
                );
                assert_eq!(result["stages"][0]["vaporMolS"], 0.5);
                assert!((num(&result, "condenserDutyW").unwrap() + 40000.).abs() < 1e-4);
                assert!((num(&result, "reboilerDutyW").unwrap() - 60000.).abs() < 1e-4);
            }
        }
    }
    #[test]
    fn analytical_one_tray_column() {
        // Independent elimination of the binary stage equations, alpha=2,
        // F=1, D=B=.5, R=2, saturated liquid feed on the single tray:
        // x_B^2 + 11*x_B - 4 = 0, x_D = 1-x_B; L1=2, V1=V2=1.5.
        let xb = (137_f64.sqrt() - 11.) / 2.;
        for finite_differences in [false, true] {
            for fallback in [false, true] {
                let req = json!({
                    "alpha":[2.,1.], "zs":[0.5,0.5], "feedH":0.,
                    "temperatureRange":[280.,400.], "seedTemperature":330.,
                    "unsupportedDerivatives":finite_differences, "forceFallback":fallback,
                    "column":{"trayCount":1,"feedTray":1,"feedMolS":1.,"distillateMolS":0.5,
                        "refluxRatio":2.,"pressurePa":101325.,"pressureDropPa":0.,
                        "maxIterations":200,"tolerance":1e-9,"kTolerance":1e-9,"enthalpyTolerance":1e-9}
                });
                let result = controlled(&req).unwrap();
                assert!(
                    (result["stages"][2]["liquidComposition"][0]
                        .as_f64()
                        .unwrap()
                        - xb)
                        .abs()
                        < 1e-8
                );
                assert!(
                    (result["stages"][0]["liquidComposition"][0]
                        .as_f64()
                        .unwrap()
                        - (1. - xb))
                        .abs()
                        < 1e-8
                );
                assert!((num(&result, "condenserDutyW").unwrap() + 60000.).abs() < 1e-4);
                assert!((num(&result, "reboilerDutyW").unwrap() - 60000.).abs() < 1e-4);
            }
        }
    }
}
