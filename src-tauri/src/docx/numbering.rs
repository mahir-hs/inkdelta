//! Works out list markers ("1.", "a)", a bullet ...) from `word/numbering.xml`.
//!
//! Word does not store the marker text in the paragraph. It stores "this
//! paragraph is list item number X at level Y", and the marker has to be
//! reconstructed by counting. `Numbering::next_marker` does that counting.

use super::xml::Node;
use std::collections::HashMap;

#[derive(Default)]
pub struct Numbering {
    /// list id (numId) -> abstract definition id
    list_to_definition: HashMap<String, String>,
    /// (definition id, level) -> (number format, marker template such as "%1.")
    levels: HashMap<(String, u8), (String, String)>,
    /// how many items have been seen so far per (list id, level)
    counters: HashMap<(String, u8), u32>,
}

impl Numbering {
    pub fn from_xml(root: &Node) -> Self {
        let mut numbering = Numbering::default();

        for definition in root.children_named("abstractNum") {
            let id = definition.attr("abstractNumId").unwrap_or("").to_string();
            for level in definition.children_named("lvl") {
                let index: u8 = level.attr("ilvl").and_then(|s| s.parse().ok()).unwrap_or(0);
                let format = level.child("numFmt").and_then(|n| n.attr("val")).unwrap_or("decimal");
                let template = level.child("lvlText").and_then(|n| n.attr("val")).unwrap_or("");
                numbering.levels.insert((id.clone(), index), (format.to_string(), template.to_string()));
            }
        }

        for list in root.children_named("num") {
            let list_id = list.attr("numId");
            let definition_id = list.child("abstractNumId").and_then(|n| n.attr("val"));
            if let (Some(list_id), Some(definition_id)) = (list_id, definition_id) {
                numbering.list_to_definition.insert(list_id.to_string(), definition_id.to_string());
            }
        }

        numbering
    }

    /// Marker for the next item of `list_id` at `level`. Call once per list paragraph, in order.
    pub fn next_marker(&mut self, list_id: &str, level: u8) -> Option<String> {
        if list_id == "0" {
            return None; // "0" means "no list" in Word
        }
        let definition_id = self.list_to_definition.get(list_id)?.clone();
        let (format, template) = self
            .levels
            .get(&(definition_id, level))
            .cloned()
            .unwrap_or_else(|| ("decimal".to_string(), "%1.".to_string()));

        match format.as_str() {
            "bullet" => return Some("\u{2022}".to_string()),
            "none" => return None,
            _ => {}
        }

        // Count this item and restart every deeper level.
        *self.counters.entry((list_id.to_string(), level)).or_insert(0) += 1;
        for deeper in (level + 1)..9 {
            self.counters.remove(&(list_id.to_string(), deeper));
        }

        // Fill "%1.%2" style templates with the counters of each level.
        let mut marker = if template.is_empty() { "%1.".to_string() } else { template };
        for lvl in 0..=level {
            let count = self.counters.get(&(list_id.to_string(), lvl)).copied().unwrap_or(1);
            let lvl_format = if lvl == level { format.as_str() } else { "decimal" };
            marker = marker.replace(&format!("%{}", lvl + 1), &format_number(count, lvl_format));
        }
        Some(marker)
    }
}

fn format_number(n: u32, format: &str) -> String {
    match format {
        "lowerLetter" => letters(n, b'a'),
        "upperLetter" => letters(n, b'A'),
        "lowerRoman" => roman(n).to_lowercase(),
        "upperRoman" => roman(n),
        _ => n.to_string(),
    }
}

/// 1 -> a, 26 -> z, 27 -> aa ...
fn letters(n: u32, first: u8) -> String {
    let mut n = n.max(1) - 1;
    let mut out = String::new();
    loop {
        out.insert(0, (first + (n % 26) as u8) as char);
        if n < 26 {
            return out;
        }
        n = n / 26 - 1;
    }
}

fn roman(mut n: u32) -> String {
    const TABLE: [(u32, &str); 13] = [
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"),
        (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ];
    let mut out = String::new();
    for (value, text) in TABLE {
        while n >= value {
            out.push_str(text);
            n -= value;
        }
    }
    out
}
