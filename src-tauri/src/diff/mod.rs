//! Compares two documents and produces the redline.
//!
//! * `blocks` - aligns paragraphs and tables (the main algorithm)
//! * `align`  - pairs up similar blocks that were edited
//! * `words`  - word-by-word diff inside one paragraph
//!
//! Public entry point: [`compare`].

mod align;
mod blocks;
mod words;

use crate::model::*;

/// Compare an older document with a newer one.
pub fn compare(old: &Document, new: &Document) -> DiffDocument {
    let mut blocks = blocks::diff_blocks(&old.blocks, &new.blocks);

    let mut change_counter = 0;
    number_changes(&mut blocks, &mut change_counter);

    let mut stats = Stats::default();
    collect_stats(&blocks, &mut stats);

    // Images from both versions are needed: deleted pictures only exist in the old one.
    let mut images = old.images.clone();
    images.extend(new.images.clone());

    DiffDocument { blocks, change_count: change_counter, stats, images, comments: new.comments.clone() }
}

/// Give every changed paragraph a 1-based number, in reading order.
fn number_changes(blocks: &mut [DiffBlock], counter: &mut usize) {
    for block in blocks {
        match block {
            DiffBlock::Paragraph(paragraph) => {
                if paragraph.kind != BlockKind::Equal {
                    *counter += 1;
                    paragraph.change = Some(*counter);
                }
            }
            DiffBlock::Table { rows, .. } => {
                for cell in rows.iter_mut().flatten() {
                    number_changes(cell, counter);
                }
            }
        }
    }
}

fn collect_stats(blocks: &[DiffBlock], stats: &mut Stats) {
    for block in blocks {
        match block {
            DiffBlock::Paragraph(paragraph) => {
                match paragraph.kind {
                    BlockKind::Inserted => stats.inserted_paragraphs += 1,
                    BlockKind::Deleted => stats.deleted_paragraphs += 1,
                    BlockKind::Modified => stats.modified_paragraphs += 1,
                    BlockKind::Equal => {}
                }
                for segment in &paragraph.segments {
                    let words = count_words(&segment.text);
                    match segment.op {
                        SegmentOp::Inserted => stats.words_added += words,
                        SegmentOp::Deleted => stats.words_removed += words,
                        SegmentOp::Equal => {}
                    }
                }
            }
            DiffBlock::Table { rows, .. } => {
                for cell in rows.iter().flatten() {
                    collect_stats(cell, stats);
                }
            }
        }
    }
}

fn count_words(text: &str) -> usize {
    text.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).count()
}

#[cfg(test)]
mod smoke_tests {
    use super::*;
    use crate::model::{Source, SourceKind};
    use crate::{docx, git};

    /// Manual check against a real repository:
    ///   INKDELTA_REPO=<repo> INKDELTA_FILE=<file.docx> INKDELTA_OLD_REV=<commit> cargo test smoke -- --ignored --nocapture
    #[test]
    #[ignore]
    fn smoke_compare_real_document() {
        let repo = std::env::var("INKDELTA_REPO").expect("set INKDELTA_REPO");
        let file = std::env::var("INKDELTA_FILE").expect("set INKDELTA_FILE");
        let rev = std::env::var("INKDELTA_OLD_REV").expect("set INKDELTA_OLD_REV");

        let old = Source { kind: SourceKind::Git, repo: Some(repo.clone()), rev: Some(rev), path: file.clone() };
        let new = Source { kind: SourceKind::Workdir, repo: Some(repo.clone()), rev: None, path: file.clone() };
        let old_doc = docx::parse(git::read_source(&old).unwrap()).unwrap();
        let new_doc = docx::parse(git::read_source(&new).unwrap()).unwrap();

        println!("old blocks: {}, new blocks: {}, images: {}", old_doc.blocks.len(), new_doc.blocks.len(), new_doc.images.len());
        let result = compare(&old_doc, &new_doc);
        println!("changes: {}  stats: {:?}", result.change_count, result.stats);

        let info = git::open_repository(&repo).unwrap();
        println!("repo: {} [{}] docx: {:?}", info.name, info.branch, info.docx_files);
        let versions = git::file_versions(&repo, &file).unwrap();
        for v in &versions {
            println!("  {:?} {} {} dirty={}", v.kind, v.short_id, v.summary, v.dirty);
        }
    }
}
