//! The commit graph: every commit once, with the lane layout needed to draw it.
//!
//! Layout idea ("lanes"): each lane is a vertical track waiting for one commit.
//! Walking from newest to oldest, a commit takes the lane that was waiting for
//! it (or a free one), then hands its lane to its first parent. Extra parents
//! (merges) get their own lane. Where two lanes wait for the same commit they
//! join at that commit.

use super::common::{find_repository, short_id};
use crate::error::AppResult;
use crate::model::*;
use git2::{Oid, Repository, Sort};
use std::collections::HashMap;

pub fn commit_graph(repo_path: &str, limit: usize) -> AppResult<Graph> {
    let repo = find_repository(repo_path)?;
    if repo.head().is_err() && repo.references()?.next().is_none() {
        return Ok(Graph { rows: Vec::new(), lane_count: 0, truncated: false });
    }

    let labels = ref_labels(&repo);
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    for pattern in ["refs/heads/*", "refs/remotes/*", "refs/tags/*"] {
        let _ = walk.push_glob(pattern);
    }
    let _ = walk.push_head();

    let mut lanes: Vec<Option<Oid>> = Vec::new();
    let mut rows = Vec::new();
    let mut widest = 0;
    let mut truncated = false;

    for oid in walk {
        if rows.len() >= limit {
            truncated = true;
            break;
        }
        let commit = repo.find_commit(oid?)?;
        let row = place_commit(&commit, &mut lanes, labels.get(&commit.id()).cloned().unwrap_or_default());
        widest = widest.max(row.lane + 1).max(row.top.iter().chain(&row.bottom).map(|l| l.from.max(l.to) + 1).max().unwrap_or(0));
        rows.push(row);
    }
    Ok(Graph { rows, lane_count: widest, truncated })
}

/// Put one commit into the lanes and describe the lines around it.
fn place_commit(commit: &git2::Commit, lanes: &mut Vec<Option<Oid>>, refs: Vec<RefLabel>) -> GraphRow {
    let id = commit.id();
    let incoming = lanes.clone();

    // Lanes already waiting for this commit; the first becomes its column.
    let waiting: Vec<usize> = incoming.iter().enumerate().filter(|(_, l)| **l == Some(id)).map(|(i, _)| i).collect();
    let lane = waiting.first().copied().unwrap_or_else(|| free_lane(lanes));

    // Lines arriving from above: waiting lanes bend into this commit, others pass straight through.
    let top: Vec<LaneLink> = incoming
        .iter()
        .enumerate()
        .filter(|(_, l)| l.is_some())
        .map(|(i, l)| LaneLink { from: i, to: if *l == Some(id) { lane } else { i } })
        .collect();

    for i in &waiting {
        lanes[*i] = None;
    }
    if lane >= lanes.len() {
        lanes.resize(lane + 1, None);
    }

    // Hand the lane to the first parent; merge parents take their own lanes.
    let parents: Vec<Oid> = commit.parent_ids().collect();
    let mut parent_links = Vec::new();
    for (n, parent) in parents.iter().enumerate() {
        let target = if n == 0 {
            lane
        } else {
            lanes.iter().position(|l| *l == Some(*parent)).unwrap_or_else(|| free_lane(lanes))
        };
        if target >= lanes.len() {
            lanes.resize(target + 1, None);
        }
        lanes[target] = Some(*parent);
        parent_links.push(LaneLink { from: lane, to: target });
    }

    // Lines continuing past this row without touching it.
    let target_lanes: Vec<usize> = parent_links.iter().map(|l| l.to).collect();
    let mut bottom: Vec<LaneLink> = lanes
        .iter()
        .enumerate()
        .filter(|(i, l)| l.is_some() && *i != lane && !target_lanes.contains(i))
        .map(|(i, _)| LaneLink { from: i, to: i })
        .collect();
    bottom.extend(parent_links);

    while lanes.last().is_some_and(Option::is_none) {
        lanes.pop();
    }

    GraphRow {
        id: id.to_string(),
        short_id: short_id(&id),
        parents: parents.iter().map(Oid::to_string).collect(),
        summary: commit.summary().ok().flatten().unwrap_or("").to_string(),
        author: commit.author().name().unwrap_or("").to_string(),
        time: commit.time().seconds(),
        refs,
        lane,
        top,
        bottom,
    }
}

fn free_lane(lanes: &mut Vec<Option<Oid>>) -> usize {
    match lanes.iter().position(Option::is_none) {
        Some(i) => i,
        None => {
            lanes.push(None);
            lanes.len() - 1
        }
    }
}

/// commit id -> branch / tag / HEAD labels shown next to it
fn ref_labels(repo: &Repository) -> HashMap<Oid, Vec<RefLabel>> {
    let mut map: HashMap<Oid, Vec<RefLabel>> = HashMap::new();
    let head_target = repo.head().ok().and_then(|h| h.target());
    let head_name = repo.head().ok().and_then(|h| if h.is_branch() { h.shorthand().ok().map(str::to_string) } else { None });

    let Ok(references) = repo.references() else { return map };
    for reference in references.flatten() {
        let Ok(full) = reference.name() else { continue };
        let Ok(commit) = reference.peel_to_commit() else { continue };
        let (name, kind) = if let Some(n) = full.strip_prefix("refs/heads/") {
            (n.to_string(), if head_name.as_deref() == Some(n) { RefKind::Head } else { RefKind::Branch })
        } else if let Some(n) = full.strip_prefix("refs/remotes/") {
            if n.ends_with("/HEAD") {
                continue;
            }
            (n.to_string(), RefKind::Remote)
        } else if let Some(n) = full.strip_prefix("refs/tags/") {
            (n.to_string(), RefKind::Tag)
        } else {
            continue;
        };
        map.entry(commit.id()).or_default().push(RefLabel { name, kind });
    }

    // Detached HEAD: label the commit itself.
    if head_name.is_none() {
        if let Some(target) = head_target {
            map.entry(target).or_default().push(RefLabel { name: "HEAD".into(), kind: RefKind::Head });
        }
    }
    for labels in map.values_mut() {
        labels.sort_by_key(|l| match l.kind {
            RefKind::Head => 0,
            RefKind::Branch => 1,
            RefKind::Remote => 2,
            RefKind::Tag => 3,
        });
    }
    map
}

/// Files changed by one commit (compared with its first parent).
pub fn commit_files(repo_path: &str, id: &str) -> AppResult<Vec<CommitFile>> {
    let repo = find_repository(repo_path)?;
    let commit = repo.revparse_single(id)?.peel_to_commit()?;
    let tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let mut diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)?;
    diff.find_similar(None)?;

    let mut files = Vec::new();
    for delta in diff.deltas() {
        let path = delta.new_file().path().or_else(|| delta.old_file().path());
        let Some(path) = path else { continue };
        let status = match delta.status() {
            git2::Delta::Added => ChangeStatus::Added,
            git2::Delta::Deleted => ChangeStatus::Deleted,
            git2::Delta::Renamed => ChangeStatus::Renamed,
            git2::Delta::Typechange => ChangeStatus::TypeChange,
            _ => ChangeStatus::Modified,
        };
        files.push(CommitFile { path: path.to_string_lossy().replace('\\', "/"), status });
    }
    Ok(files)
}
