//! Pairs up "old" items with "new" items that are probably the same thing, edited.
//!
//! When a stretch of the document changed, we know some old paragraphs were
//! replaced by some new ones, but not *which* became *which*. This module
//! answers that by similarity: each old item is matched with the new item most
//! like it, keeping document order (a classic alignment / LCS problem).

/// Items need at least this much similarity (0.0 - 1.0) to count as "an edit of".
const MIN_SIMILARITY: f32 = 0.4;

/// Above this many comparisons we skip pairing to keep the app fast.
const MAX_COMPARISONS: usize = 40_000;

#[derive(Debug, PartialEq, Eq)]
pub enum Pairing {
    /// Old item `.0` was edited into new item `.1`.
    Edited(usize, usize),
    /// Old item `.0` has no counterpart: it was deleted.
    Removed(usize),
    /// New item `.0` has no counterpart: it was added.
    Added(usize),
}

/// Align `old_count` old items with `new_count` new items.
///
/// `similarity(i, j)` returns 0.0 - 1.0 for old item `i` vs new item `j`.
/// The result is in document order. Within a gap, removals come before additions.
pub fn align(old_count: usize, new_count: usize, similarity: impl Fn(usize, usize) -> f32) -> Vec<Pairing> {
    if old_count * new_count > MAX_COMPARISONS {
        return everything_replaced(old_count, new_count);
    }

    // score[i][j] = best total similarity using the first i old and first j new items
    let mut score = vec![vec![0.0f32; new_count + 1]; old_count + 1];
    let mut sim = vec![vec![0.0f32; new_count]; old_count];
    for i in 0..old_count {
        for j in 0..new_count {
            let s = similarity(i, j);
            sim[i][j] = if s >= MIN_SIMILARITY { s } else { 0.0 };
        }
    }
    for i in 1..=old_count {
        for j in 1..=new_count {
            let matched = score[i - 1][j - 1] + sim[i - 1][j - 1];
            let skip_old = score[i - 1][j];
            let skip_new = score[i][j - 1];
            score[i][j] = matched.max(skip_old).max(skip_new);
        }
    }

    // Walk back from the end to recover which items were paired.
    let mut matches: Vec<(usize, usize)> = Vec::new();
    let (mut i, mut j) = (old_count, new_count);
    while i > 0 && j > 0 {
        let s = sim[i - 1][j - 1];
        if s > 0.0 && (score[i][j] - (score[i - 1][j - 1] + s)).abs() < f32::EPSILON {
            matches.push((i - 1, j - 1));
            i -= 1;
            j -= 1;
        } else if score[i - 1][j] >= score[i][j - 1] {
            i -= 1;
        } else {
            j -= 1;
        }
    }
    matches.reverse();

    // Fill the gaps between matches with removals, then additions.
    let mut result = Vec::new();
    let (mut next_old, mut next_new) = (0, 0);
    for (old_index, new_index) in matches {
        result.extend((next_old..old_index).map(Pairing::Removed));
        result.extend((next_new..new_index).map(Pairing::Added));
        result.push(Pairing::Edited(old_index, new_index));
        next_old = old_index + 1;
        next_new = new_index + 1;
    }
    result.extend((next_old..old_count).map(Pairing::Removed));
    result.extend((next_new..new_count).map(Pairing::Added));
    result
}

fn everything_replaced(old_count: usize, new_count: usize) -> Vec<Pairing> {
    (0..old_count).map(Pairing::Removed).chain((0..new_count).map(Pairing::Added)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairs_similar_items_in_order() {
        // old: [A, B]  new: [A', B']  where X matches X'
        let sim = |i: usize, j: usize| if i == j { 0.9 } else { 0.0 };
        assert_eq!(align(2, 2, sim), vec![Pairing::Edited(0, 0), Pairing::Edited(1, 1)]);
    }

    #[test]
    fn unmatched_items_are_removed_or_added() {
        let sim = |_: usize, _: usize| 0.0;
        assert_eq!(align(1, 1, sim), vec![Pairing::Removed(0), Pairing::Added(0)]);
    }

    #[test]
    fn inserted_item_between_matches() {
        // old: [A, B]  new: [A, NEW, B]
        let sim = |i: usize, j: usize| match (i, j) {
            (0, 0) | (1, 2) => 1.0,
            _ => 0.0,
        };
        assert_eq!(
            align(2, 3, sim),
            vec![Pairing::Edited(0, 0), Pairing::Added(1), Pairing::Edited(1, 2)]
        );
    }
}
