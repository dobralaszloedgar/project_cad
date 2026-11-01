//! Numerical helpers for simultaneous MESH equations and sparse linear solves.
use serde_json::Value;
pub type Res<T> = Result<T, String>;
pub fn require(ok: bool, msg: &str) -> Res<()> {
    if ok {
        Ok(())
    } else {
        Err(msg.into())
    }
}
pub fn num(v: &Value, k: &str) -> Res<f64> {
    v[k].as_f64()
        .filter(|x| x.is_finite())
        .ok_or(format!("Missing/invalid {k}"))
}
pub fn numbers(v: &Value) -> Res<Vec<f64>> {
    v.as_array()
        .ok_or("Missing numeric array")?
        .iter()
        .map(|x| {
            x.as_f64()
                .filter(|x| x.is_finite())
                .ok_or("Invalid number".into())
        })
        .collect()
}
pub fn norm(a: &[f64]) -> f64 {
    a.iter().map(|x| x * x).sum::<f64>().sqrt()
}
pub fn maxabs(a: &[f64]) -> f64 {
    a.iter().map(|x| x.abs()).fold(0., f64::max)
}
#[derive(Clone)]
pub struct PhaseDerivatives {
    pub lnphi_t: Vec<f64>,
    pub lnphi_logx: Vec<Vec<f64>>,
    pub h_t: f64,
    pub h_logx: Vec<f64>,
}
