//! Splits text into the tokens we compare.
//!
//! Comparing word by word (rather than character by character) makes the
//! redline read like a human edit: "colour" -> "color" shows as one word
//! replaced, not as two scattered letters.

#[derive(PartialEq, Clone, Copy)]
enum CharClass {
    Word,
    Space,
    Punctuation,
}

fn classify(c: char) -> CharClass {
    if c.is_alphanumeric() || c == '_' {
        CharClass::Word
    } else if c.is_whitespace() {
        CharClass::Space
    } else {
        CharClass::Punctuation
    }
}

/// "Hello, world" -> ["Hello", ",", " ", "world"]
pub fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut current_class = CharClass::Word;

    for c in text.chars() {
        let class = classify(c);
        // Start a new token when the class changes. Punctuation is always one mark per token.
        if !current.is_empty() && (class != current_class || class == CharClass::Punctuation) {
            tokens.push(std::mem::take(&mut current));
        }
        current.push(c);
        current_class = class;
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_words_spaces_and_punctuation() {
        assert_eq!(tokenize("Hello, world"), vec!["Hello", ",", " ", "world"]);
    }

    #[test]
    fn keeps_double_spaces_together() {
        assert_eq!(tokenize("a  b"), vec!["a", "  ", "b"]);
    }

    #[test]
    fn handles_empty_text() {
        assert!(tokenize("").is_empty());
    }
}
