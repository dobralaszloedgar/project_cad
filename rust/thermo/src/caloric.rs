//! Ideal-gas enthalpy relative to 298.15 K, using published Cp correlations.
use serde::Deserialize;

#[derive(Clone, Deserialize)]
pub struct GasCp {
    model: String,
    ranges: Vec<Range>,
}
#[derive(Clone, Deserialize)]
struct Range {
    min: f64,
    max: f64,
    coefficients: Vec<f64>,
}
impl GasCp {
    fn validate(&self) -> Result<(), String> {
        let count = match self.model.as_str() {
            "shomate" | "chemsep-16" | "polynomial" => 5,
            "trc" => 8,
            _ => return Err("Unsupported gas heat-capacity correlation".into()),
        };
        if self.ranges.is_empty()
            || self.ranges.len() > 12
            || self.ranges.iter().any(|r| {
                !r.min.is_finite()
                    || !r.max.is_finite()
                    || r.min <= 0.
                    || r.min >= r.max
                    || r.coefficients.len() != count
                    || r.coefficients.iter().any(|v| !v.is_finite())
            })
        {
            return Err("Invalid gas heat-capacity data".into());
        }
        Ok(())
    }
    pub fn intervals(&self) -> Result<Vec<(f64, f64)>, String> {
        self.validate()?;
        let mut intervals: Vec<_> = self.ranges.iter().map(|r| (r.min, r.max)).collect();
        intervals.sort_by(|a, b| a.0.total_cmp(&b.0));
        // Only the connected interval containing the enthalpy reference is usable.
        let mut merged: Vec<(f64, f64)> = Vec::new();
        for (a, b) in intervals {
            if let Some(last) = merged.last_mut().filter(|v| a <= v.1) {
                last.1 = last.1.max(b);
            } else {
                merged.push((a, b));
            }
        }
        Ok(merged
            .into_iter()
            .filter(|(a, b)| *a <= 298.15 && *b >= 298.15)
            .collect())
    }
    fn value(&self, r: &Range, t: f64) -> Result<f64, String> {
        let c = &r.coefficients;
        let value = match self.model.as_str() {
            "polynomial" => c[0] + t * (c[1] + t * (c[2] + t * (c[3] + t * c[4]))),
            "shomate" => c[0] + t * (c[1] + t * (c[2] + t * c[3])) + c[4] / t.powi(2),
            "chemsep-16" => c[0] + (c[1] / t + c[2] + t * (c[3] + c[4] * t)).exp(),
            "trc" => {
                let y = if t > c[7] {
                    (t - c[7]) / (t + c[6])
                } else {
                    0.
                };
                let tail = if t > c[7] {
                    (c[4] - c[5] / (t - c[7]).powi(2)) * y.powi(8)
                } else {
                    0.
                };
                8.31446261815324
                    * (c[0] + c[1] / t.powi(2) * (-c[2] / t).exp() + c[3] * y * y + tail)
            }
            _ => unreachable!(),
        };
        if !value.is_finite() || value <= 0. {
            return Err("Nonpositive or nonfinite gas heat capacity".into());
        }
        Ok(value)
    }
    fn integral(&self, r: &Range, a: f64, b: f64) -> Result<f64, String> {
        let c = &r.coefficients;
        if self.model == "polynomial" || self.model == "shomate" {
            let primitive = |t: f64| {
                c[0] * t
                    + c[1] * t * t / 2.
                    + c[2] * t.powi(3) / 3.
                    + c[3] * t.powi(4) / 4.
                    + if self.model == "shomate" {
                        -c[4] / t
                    } else {
                        c[4] * t.powi(5) / 5.
                    }
            };
            self.value(r, a)?;
            self.value(r, b)?;
            self.value(r, (a + b) / 2.)?;
            return Ok(primitive(b) - primitive(a));
        }
        // 16-point Gauss–Legendre per <=25 K segment. Break at TRC's threshold.
        const NODES: [(f64, f64); 8] = [
            (0.09501250983763744, 0.1894506104550685),
            (0.2816035507792589, 0.1826034150449236),
            (0.4580167776572274, 0.16915651939500254),
            (0.6178762444026438, 0.14959598881657673),
            (0.755404408355003, 0.12462897125553388),
            (0.8656312023878318, 0.09515851168249278),
            (0.9445750230732326, 0.06225352393864789),
            (0.9894009349916499, 0.027152459411754095),
        ];
        if self.model == "trc" && a < c[7] && c[7] < b {
            return Ok(self.integral(r, a, c[7])? + self.integral(r, c[7], b)?);
        }
        let n = ((b - a) / 25.).ceil().max(1.) as usize;
        let step = (b - a) / (n as f64);
        let mut sum = 0.;
        for i in 0..n {
            let center = a + (i as f64 + 0.5) * step;
            for (x, w) in NODES {
                sum += w * step / 2.
                    * (self.value(r, center - x * step / 2.)?
                        + self.value(r, center + x * step / 2.)?);
            }
        }
        Ok(sum)
    }
    pub fn enthalpy(&self, t: f64) -> Result<f64, String> {
        self.validate()?;
        let mut ordered: Vec<_> = self.ranges.iter().collect();
        ordered.sort_by(|a, b| a.min.total_cmp(&b.min));
        let mut a = t.min(298.15);
        let b = t.max(298.15);
        if !ordered.iter().any(|r| t >= r.min && t <= r.max) {
            return Err(format!("No gas heat-capacity data at {t} K"));
        }
        let mut result = 0.;
        while a < b {
            let r = ordered.iter().find(|r| r.min <= a && r.max > a).ok_or(
                "Gap in gas heat-capacity data between 298.15 K and requested temperature",
            )?;
            let end = r.max.min(b);
            result += self.integral(r, a, end)?;
            a = end;
        }
        Ok(if t < 298.15 { -result } else { result })
    }
}
