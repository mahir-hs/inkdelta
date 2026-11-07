//! Word-level comparison of two versions of one paragraph.
//!
//! Output is a list of segments, each tagged equal / inserted / deleted, that
//! the UI draws in black / green / red.

use crate::model::*;
use similar::{capture_diff_slices, Algorithm, DiffOp};

/// Compare two versions of the same paragraph.
pub fn diff_paragraph(old: &Paragraph, new: &Paragraph) -> DiffParagraph {
    let old_keys: Vec<String> = old.tokens.iter().map(Token::compare_key).collect();
    let new_keys: Vec<String> = new.tokens.iter().map(Token::compare_key).collect();

    let mut segments: Vec<DiffSegment> = Vec::new();
    for op in capture_diff_slices(Algorithm::Myers, &old_keys, &new_keys) {
        match op {
            DiffOp::Equal { new_index, len, .. } => {
                push_tokens(&mut segments, &new.tokens[new_index..new_index + len], SegmentOp::Equal);
            }
            DiffOp::Delete { old_index, old_len, .. } => {
                push_tokens(&mut segments, &old.tokens[old_index..old_index + old_len], SegmentOp::Deleted);
            }
            DiffOp::Insert { new_index, new_len, .. } => {
                push_tokens(&mut segments, &new.tokens[new_index..new_index + new_len], SegmentOp::Inserted);
            }
            DiffOp::Replace { old_index, old_len, new_index, new_len } => {
                push_tokens(&mut segments, &old.tokens[old_index..old_index + old_len], SegmentOp::Deleted);
                push_tokens(&mut segments, &new.tokens[new_index..new_index + new_len], SegmentOp::Inserted);
            }
        }
    }

    let segments = merge_adjacent(group_changes(absorb_trivial_matches(segments)));
    let changed = segments.iter().any(|s| s.op != SegmentOp::Equal);

    DiffParagraph {
        kind: if changed { BlockKind::Modified } else { BlockKind::Equal },
        heading: new.heading,
        list_marker: new.list_marker.clone(),
        indent: new.indent,
        position: new.position,
        editable: new.editable,
        segments,
        change: None,
    }
}

/// Show a whole paragraph as inserted, deleted or unchanged.
pub fn whole_paragraph(paragraph: &Paragraph, kind: BlockKind) -> DiffParagraph {
    let op = match kind {
        BlockKind::Inserted => SegmentOp::Inserted,
        BlockKind::Deleted => SegmentOp::Deleted,
        _ => SegmentOp::Equal,
    };
    let mut segments = Vec::new();
    push_tokens(&mut segments, &paragraph.tokens, op);
    DiffParagraph {
        kind,
        heading: paragraph.heading,
        list_marker: paragraph.list_marker.clone(),
        indent: paragraph.indent,
        position: paragraph.position,
        editable: paragraph.editable && kind != BlockKind::Deleted,
        segments: merge_adjacent(segments),
        change: None,
    }
}

fn push_tokens(segments: &mut Vec<DiffSegment>, tokens: &[Token], op: SegmentOp) {
    for token in tokens {
        segments.push(DiffSegment {
            op,
            text: token.text.clone(),
            bold: token.format.bold,
            italic: token.format.italic,
            underline: token.format.underline,
            superscript: token.format.superscript,
            subscript: token.format.subscript,
            math: token.format.math,
            image: token.image.clone(),
        });
    }
}

/// A lone space or comma shared by two changes makes the diff look choppy:
///   "the [-old-] [+new+] result"  is fine, but
///   "[-a-] , [-b-]" with an equal "," between reads badly.
/// Turn such tiny equal pieces into delete + insert so the change reads as one block.
fn absorb_trivial_matches(segments: Vec<DiffSegment>) -> Vec<DiffSegment> {
    let mut result = Vec::with_capacity(segments.len());
    for (i, segment) in segments.iter().enumerate() {
        let between_changes = i > 0
            && i + 1 < segments.len()
            && segments[i - 1].op != SegmentOp::Equal
            && segments[i + 1].op != SegmentOp::Equal;
        if segment.op == SegmentOp::Equal && between_changes && is_trivial(&segment.text) && segment.image.is_none() {
            result.push(DiffSegment { op: SegmentOp::Deleted, ..segment.clone() });
            result.push(DiffSegment { op: SegmentOp::Inserted, ..segment.clone() });
        } else {
            result.push(segment.clone());
        }
    }
    result
}

fn is_trivial(text: &str) -> bool {
    text.trim().is_empty() || (text.chars().count() <= 2 && !text.chars().any(char::is_alphanumeric))
}

/// Inside each run of changed segments, list all deletions first, then all insertions.
fn group_changes(segments: Vec<DiffSegment>) -> Vec<DiffSegment> {
    let mut result = Vec::with_capacity(segments.len());
    let mut deletions = Vec::new();
    let mut insertions = Vec::new();

    let flush = |result: &mut Vec<DiffSegment>, deletions: &mut Vec<DiffSegment>, insertions: &mut Vec<DiffSegment>| {
        result.append(deletions);
        result.append(insertions);
    };

    for segment in segments {
        match segment.op {
            SegmentOp::Deleted => deletions.push(segment),
            SegmentOp::Inserted => insertions.push(segment),
            SegmentOp::Equal => {
                flush(&mut result, &mut deletions, &mut insertions);
                result.push(segment);
            }
        }
    }
    flush(&mut result, &mut deletions, &mut insertions);
    result
}

/// Join neighbouring text segments that look identical (same status, same format).
fn merge_adjacent(segments: Vec<DiffSegment>) -> Vec<DiffSegment> {
    let mut result: Vec<DiffSegment> = Vec::with_capacity(segments.len());
    for segment in segments {
        let can_merge = result.last().is_some_and(|last| {
            last.op == segment.op
                && last.image.is_none()
                && segment.image.is_none()
                && last.bold == segment.bold
                && last.italic == segment.italic
                && last.underline == segment.underline
                && last.superscript == segment.superscript
                && last.subscript == segment.subscript
                && last.math == segment.math
        });
        if can_merge {
            result.last_mut().expect("checked above").text.push_str(&segment.text);
        } else {
            result.push(segment);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paragraph(text: &str) -> Paragraph {
        let tokens = text
            .split_inclusive(' ')
            .map(|piece| Token { text: piece.to_string(), format: Format::default(), image: None })
            .collect();
        Paragraph { tokens, ..Paragraph::default() }
    }

    #[test]
    fn identical_paragraphs_are_equal() {
        let p = paragraph("same words here");
        assert_eq!(diff_paragraph(&p, &p).kind, BlockKind::Equal);
    }

    #[test]
    fn a_changed_word_is_marked_deleted_then_inserted() {
        let result = diff_paragraph(&paragraph("the cat sat "), &paragraph("the dog sat "));
        assert_eq!(result.kind, BlockKind::Modified);
        let ops: Vec<SegmentOp> = result.segments.iter().map(|s| s.op).collect();
        assert_eq!(ops, vec![SegmentOp::Equal, SegmentOp::Deleted, SegmentOp::Inserted, SegmentOp::Equal]);
    }
}
