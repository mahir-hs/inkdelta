//! Compares two lists of blocks (paragraphs and tables).
//!
//! Two passes:
//!   1. Match identical blocks exactly (fast, standard diff).
//!   2. Where a stretch differs, pair up *similar* blocks as edits
//!      (`align.rs`) and compare those word by word (`words.rs`).
//! Tables whose shape is unchanged are compared cell by cell, which calls this
//! module again for the content of each cell.

use super::align::{align, Pairing};
use super::words::{diff_paragraph, whole_paragraph};
use crate::model::*;
use similar::{capture_diff_slices, Algorithm, DiffOp, TextDiff};

pub fn diff_blocks(old: &[Block], new: &[Block]) -> Vec<DiffBlock> {
    let old_keys: Vec<String> = old.iter().map(block_key).collect();
    let new_keys: Vec<String> = new.iter().map(block_key).collect();

    let mut result = Vec::new();
    for op in capture_diff_slices(Algorithm::Myers, &old_keys, &new_keys) {
        match op {
            DiffOp::Equal { new_index, len, .. } => {
                result.extend(new[new_index..new_index + len].iter().map(|b| whole_block(b, BlockKind::Equal)));
            }
            DiffOp::Delete { old_index, old_len, .. } => {
                result.extend(old[old_index..old_index + old_len].iter().map(|b| whole_block(b, BlockKind::Deleted)));
            }
            DiffOp::Insert { new_index, new_len, .. } => {
                result.extend(new[new_index..new_index + new_len].iter().map(|b| whole_block(b, BlockKind::Inserted)));
            }
            DiffOp::Replace { old_index, old_len, new_index, new_len } => {
                let old_part = &old[old_index..old_index + old_len];
                let new_part = &new[new_index..new_index + new_len];
                result.extend(diff_changed_stretch(old_part, new_part));
            }
        }
    }
    result
}

/// A stretch where old and new differ: pair up similar blocks as edits, the rest as removed/added.
fn diff_changed_stretch(old: &[Block], new: &[Block]) -> Vec<DiffBlock> {
    let pairs = align(old.len(), new.len(), |i, j| block_similarity(&old[i], &new[j]));
    pairs
        .into_iter()
        .flat_map(|pairing| match pairing {
            Pairing::Removed(i) => vec![whole_block(&old[i], BlockKind::Deleted)],
            Pairing::Added(j) => vec![whole_block(&new[j], BlockKind::Inserted)],
            Pairing::Edited(i, j) => diff_pair(&old[i], &new[j]),
        })
        .collect()
}

/// Two blocks of the same type that were judged to be versions of each other.
fn diff_pair(old: &Block, new: &Block) -> Vec<DiffBlock> {
    match (old, new) {
        (Block::Paragraph(a), Block::Paragraph(b)) => vec![DiffBlock::Paragraph(diff_paragraph(a, b))],
        (Block::Table(a), Block::Table(b)) => vec![diff_tables(a, b)],
        // Cannot happen (similarity is 0 across types) but stay safe.
        _ => vec![whole_block(old, BlockKind::Deleted), whole_block(new, BlockKind::Inserted)],
    }
}

fn diff_tables(old: &[Vec<Vec<Block>>], new: &[Vec<Vec<Block>>]) -> DiffBlock {
    let same_shape = old.len() == new.len() && old.iter().zip(new).all(|(a, b)| a.len() == b.len());
    if !same_shape {
        // Rows or columns were added/removed: show the old table struck out, then the new one.
        return DiffBlock::Table {
            kind: BlockKind::Modified,
            rows: vec![vec![vec![
                whole_block(&Block::Table(old.to_vec()), BlockKind::Deleted),
                whole_block(&Block::Table(new.to_vec()), BlockKind::Inserted),
            ]]],
        };
    }
    let rows = old
        .iter()
        .zip(new)
        .map(|(old_row, new_row)| old_row.iter().zip(new_row).map(|(a, b)| diff_blocks(a, b)).collect())
        .collect();
    DiffBlock::Table { kind: BlockKind::Modified, rows }
}

/// Render one block entirely as inserted, deleted or unchanged.
pub fn whole_block(block: &Block, kind: BlockKind) -> DiffBlock {
    match block {
        Block::Paragraph(p) => DiffBlock::Paragraph(whole_paragraph(p, kind)),
        Block::Table(rows) => DiffBlock::Table {
            kind,
            rows: rows
                .iter()
                .map(|row| {
                    row.iter()
                        .map(|cell| cell.iter().map(|b| whole_block(b, kind)).collect())
                        .collect()
                })
                .collect(),
        },
    }
}

/// Text used to decide whether two blocks are exactly the same.
fn block_key(block: &Block) -> String {
    match block {
        Block::Paragraph(p) => format!("P{}|{}", p.heading, p.plain_text()),
        Block::Table(rows) => {
            let cells: Vec<String> = rows.iter().flatten().flatten().map(block_key).collect();
            format!("T{}x|{}", rows.len(), cells.join("\u{1}"))
        }
    }
}

/// 0.0 - 1.0: how much the two blocks look like versions of one another.
fn block_similarity(old: &Block, new: &Block) -> f32 {
    match (old, new) {
        (Block::Paragraph(a), Block::Paragraph(b)) => text_similarity(&a.plain_text(), &b.plain_text()),
        (Block::Table(_), Block::Table(_)) => text_similarity(&block_key(old), &block_key(new)),
        _ => 0.0,
    }
}

fn text_similarity(a: &str, b: &str) -> f32 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    TextDiff::from_chars(a, b).ratio()
}
