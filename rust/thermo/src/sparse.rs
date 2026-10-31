//! Sparse partial-pivot elimination with sorted contiguous numeric rows.
//! Column incidence tracks fill-in; no factor survives a changed Jacobian.
use crate::column_numerics::{require, Res};
use std::collections::{BTreeMap, BTreeSet};
pub type Matrix = Vec<BTreeMap<usize, f64>>;
// Dense incidence is bounded to 512 KiB for all columns. Larger systems retain
// sparse sets, avoiding an unbounded quadratic metadata allocation.
enum Incidence {
    Bits(Vec<u64>),
    Tree(BTreeSet<usize>),
}
impl Incidence {
    fn new(n: usize) -> Self {
        if n <= 2048 {
            Self::Bits(vec![0; n.div_ceil(64)])
        } else {
            Self::Tree(BTreeSet::new())
        }
    }
    fn insert(&mut self, i: usize) {
        match self {
            Self::Bits(b) => b[i / 64] |= 1u64 << (i % 64),
            Self::Tree(t) => {
                t.insert(i);
            }
        }
    }
    fn remove(&mut self, i: &usize) {
        match self {
            Self::Bits(b) => b[i / 64] &= !(1u64 << (i % 64)),
            Self::Tree(t) => {
                t.remove(i);
            }
        }
    }
    fn from(&self, start: usize) -> Box<dyn Iterator<Item = usize> + '_> {
        match self {
            Self::Tree(t) => Box::new(t.range(start..).copied()),
            Self::Bits(b) => Box::new(b.iter().enumerate().skip(start / 64).flat_map(
                move |(j, &word)| {
                    let mut remaining = if j == start / 64 {
                        word & (u64::MAX << (start % 64))
                    } else {
                        word
                    };
                    std::iter::from_fn(move || {
                        if remaining == 0 {
                            return None;
                        }
                        let bit = remaining.trailing_zeros() as usize;
                        remaining &= remaining - 1;
                        Some(j * 64 + bit)
                    })
                },
            )),
        }
    }
}

fn position(row: &[(usize, f64)], col: usize) -> Option<usize> {
    row.binary_search_by_key(&col, |v| v.0).ok()
}
pub fn solve(a: Matrix, mut b: Vec<f64>) -> Res<Vec<f64>> {
    let n = a.len();
    require(n == b.len(), "Sparse dimensions")?;
    let mut columns: Vec<Incidence> = (0..n).map(|_| Incidence::new(n)).collect();
    let mut rows: Vec<Vec<(usize, f64)>> = Vec::with_capacity(n);
    for (i, row) in a.into_iter().enumerate() {
        for (&j, &v) in &row {
            require(j < n, "Sparse column index")?;
            require(v.is_finite(), "Nonfinite sparse coefficient")?;
            columns[j].insert(i);
        }
        rows.push(row.into_iter().collect());
    }
    let mut scratch = Vec::new();
    for k in 0..n {
        let pivot = columns[k]
            .from(k)
            .max_by(|&i, &j| {
                rows[i][position(&rows[i], k).unwrap()]
                    .1
                    .abs()
                    .total_cmp(&rows[j][position(&rows[j], k).unwrap()].1.abs())
            })
            .ok_or("Singular sparse Jacobian")?;
        require(
            rows[pivot][position(&rows[pivot], k).unwrap()].1.abs() > 1e-22,
            "Singular sparse pivot",
        )?;
        if pivot != k {
            for &(j, _) in &rows[k] {
                columns[j].remove(&k);
            }
            for &(j, _) in &rows[pivot] {
                columns[j].remove(&pivot);
            }
            rows.swap(k, pivot);
            b.swap(k, pivot);
            for &(j, _) in &rows[k] {
                columns[j].insert(k);
            }
            for &(j, _) in &rows[pivot] {
                columns[j].insert(pivot);
            }
        }
        let diag_index = position(&rows[k], k).unwrap();
        let diag = rows[k][diag_index].1;
        let neighbors: Vec<usize> = columns[k].from(k + 1).collect();
        for i in neighbors {
            let index = position(&rows[i], k).unwrap();
            let factor = rows[i][index].1 / diag;
            columns[k].remove(&i);
            b[i] -= factor * b[k];
            scratch.clear();
            scratch.extend_from_slice(&rows[i][..index]);
            let mut old = index + 1;
            let mut pivot_index = diag_index + 1;
            while old < rows[i].len() || pivot_index < rows[k].len() {
                let old_col = rows[i].get(old).map(|v| v.0).unwrap_or(usize::MAX);
                let pivot_col = rows[k].get(pivot_index).map(|v| v.0).unwrap_or(usize::MAX);
                if old_col < pivot_col {
                    scratch.push(rows[i][old]);
                    old += 1;
                    continue;
                }
                let present = old_col == pivot_col;
                let before = if present { rows[i][old].1 } else { 0. };
                let value = before - factor * rows[k][pivot_index].1;
                if value == 0. {
                    if present {
                        columns[pivot_col].remove(&i);
                    }
                } else {
                    scratch.push((pivot_col, value));
                    if !present {
                        columns[pivot_col].insert(i);
                    }
                }
                if present {
                    old += 1;
                }
                pivot_index += 1;
            }
            std::mem::swap(&mut rows[i], &mut scratch);
        }
    }
    for i in (0..n).rev() {
        let index = position(&rows[i], i).ok_or("Singular sparse pivot")?;
        for &(j, v) in &rows[i][index + 1..] {
            b[i] -= v * b[j];
        }
        b[i] /= rows[i][index].1;
    }
    require(b.iter().all(|v| v.is_finite()), "Nonfinite sparse solution")?;
    Ok(b)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn incidence_matches_sparse_set_at_boundaries() {
        for n in [1, 63, 64, 65, 2048, 2049] {
            let mut actual = Incidence::new(n);
            let mut expected = BTreeSet::new();
            for i in 0..n {
                if i % 3 != 0 {
                    actual.insert(i);
                    expected.insert(i);
                }
            }
            for i in (0..n).step_by(7) {
                actual.remove(&i);
                expected.remove(&i);
            }
            for start in [0, n / 2, n - 1, n] {
                assert_eq!(
                    actual.from(start).collect::<Vec<_>>(),
                    expected.range(start..).copied().collect::<Vec<_>>()
                );
            }
        }
    }
    #[test]
    fn pivot_fill_cancellation_and_sparse_systems() {
        for n in [2, 3, 17, 64, 129] {
            let mut dense = vec![vec![0.; n]; n];
            for (i, row) in dense.iter_mut().enumerate() {
                for (j, v) in row.iter_mut().enumerate() {
                    if i == j {
                        *v = 10.;
                    } else if (i * 31 + j * 17) % 7 == 0 {
                        *v = ((i + j) % 5) as f64 - 2.;
                    }
                }
            }
            dense.swap(0, n - 1); // Requires actual row pivoting, not only diagonal solving.
            let expected: Vec<f64> = (0..n).map(|i| i as f64 * 0.03 - 1.).collect();
            let rhs: Vec<f64> = dense
                .iter()
                .map(|row| row.iter().zip(&expected).map(|(a, x)| a * x).sum())
                .collect();
            let a: Matrix = dense
                .iter()
                .map(|row| {
                    row.iter()
                        .enumerate()
                        .filter(|(_, v)| **v != 0.)
                        .map(|(j, v)| (j, *v))
                        .collect()
                })
                .collect();
            let result = solve(a, rhs).unwrap();
            for (x, y) in result.iter().zip(expected) {
                assert!((x - y).abs() < 1e-11);
            }
        }
        assert!(solve(vec![BTreeMap::new(); 2], vec![1., 2.]).is_err());
        assert!(solve(vec![[(1, 1.)].into()], vec![1.]).is_err());
        assert!(solve(vec![[(0, f64::NAN)].into()], vec![1.]).is_err());
    }
}
