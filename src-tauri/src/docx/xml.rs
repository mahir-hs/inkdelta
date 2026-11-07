//! A minimal XML tree.
//!
//! Word files are XML. Parsing them into a small tree first keeps the real
//! parser (`parser.rs`) simple: it can look at children and attributes
//! directly instead of tracking state across a stream of events.
//!
//! Namespace prefixes are dropped: `w:p` becomes `p`, `r:embed` becomes `embed`.

use crate::error::{AppError, AppResult};
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};

#[derive(Default, Debug)]
pub struct Node {
    pub name: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<Node>,
    /// Text directly inside this element.
    pub text: String,
}

impl Node {
    pub fn attr(&self, key: &str) -> Option<&str> {
        self.attrs.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
    }

    /// First direct child with this name.
    pub fn child(&self, name: &str) -> Option<&Node> {
        self.children.iter().find(|c| c.name == name)
    }

    /// All direct children with this name.
    pub fn children_named<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Node> {
        self.children.iter().filter(move |c| c.name == name)
    }

    /// Every descendant (any depth) with this name, in document order.
    pub fn descendants(&self, name: &str) -> Vec<&Node> {
        let mut found = Vec::new();
        self.collect_descendants(name, &mut found);
        found
    }

    fn collect_descendants<'a>(&'a self, name: &str, out: &mut Vec<&'a Node>) {
        for child in &self.children {
            if child.name == name {
                out.push(child);
            }
            child.collect_descendants(name, out);
        }
    }

    /// Concatenated text of every `<t>` descendant. This is how Word stores visible text.
    pub fn all_text(&self) -> String {
        self.descendants("t").iter().map(|t| t.text.as_str()).collect()
    }
}

pub fn parse(bytes: &[u8]) -> AppResult<Node> {
    let mut reader = Reader::from_reader(bytes);
    let mut buffer = Vec::new();
    // The bottom of the stack is a dummy root that ends up holding the real root.
    let mut stack: Vec<Node> = vec![Node::default()];

    loop {
        let event = reader.read_event_into(&mut buffer).map_err(|e| AppError::Docx(format!("xml: {e}")))?;
        match event {
            Event::Start(tag) => stack.push(node_from_tag(&tag)),
            Event::Empty(tag) => {
                let node = node_from_tag(&tag);
                top(&mut stack).children.push(node);
            }
            Event::End(_) => {
                let finished = stack.pop().ok_or_else(|| AppError::Docx("unbalanced xml".into()))?;
                top(&mut stack).children.push(finished);
            }
            Event::Text(text) => {
                top(&mut stack).text.push_str(&text.xml_content(XmlVersion::Implicit1_0));
            }
            Event::GeneralRef(reference) => {
                // Numeric references (&#233;) resolve directly; named ones (&amp;) by lookup.
                if let Ok(Some(c)) = reference.resolve_char_ref() {
                    top(&mut stack).text.push(c);
                } else if let Some(resolved) = resolve_entity(&reference.xml_content(XmlVersion::Implicit1_0)) {
                    top(&mut stack).text.push_str(&resolved);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    let mut root = stack.pop().ok_or_else(|| AppError::Docx("empty xml".into()))?;
    if root.children.is_empty() {
        return Err(AppError::Docx("empty xml".into()));
    }
    Ok(root.children.remove(0))
}

fn top(stack: &mut [Node]) -> &mut Node {
    stack.last_mut().expect("stack always has a root")
}

fn node_from_tag(tag: &BytesStart) -> Node {
    let attrs = tag
        .attributes()
        .flatten()
        .map(|a| {
            let value = a.normalized_value(XmlVersion::Implicit1_0).map(|v| v.to_string()).unwrap_or_default();
            (local_name(a.key.as_ref()), value)
        })
        .collect();
    Node { name: local_name(tag.name().as_ref()), attrs, children: Vec::new(), text: String::new() }
}

fn local_name(full: &str) -> String {
    match full.rsplit_once(':') {
        Some((_, local)) => local.to_string(),
        None => full.to_string(),
    }
}

/// Turns `amp`, `lt`, `#233`, `#xE9` ... into the character they stand for.
fn resolve_entity(name: &str) -> Option<String> {
    match name {
        "amp" => Some("&".into()),
        "lt" => Some("<".into()),
        "gt" => Some(">".into()),
        "quot" => Some("\"".into()),
        "apos" => Some("'".into()),
        _ => {
            let code = if let Some(hex) = name.strip_prefix("#x").or_else(|| name.strip_prefix("#X")) {
                u32::from_str_radix(hex, 16).ok()?
            } else {
                name.strip_prefix('#')?.parse().ok()?
            };
            char::from_u32(code).map(|c| c.to_string())
        }
    }
}
