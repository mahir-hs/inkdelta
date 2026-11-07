//! Plain data types shared by every layer. No logic lives here.
//!
//! * `document` - what we parse out of a .docx
//! * `diff`     - what the comparison produces (sent to the UI)
//! * `git`      - status, branches, stash and graph for the Git client
//! * `source`   - how the UI points at a document, repo or version
//! * `outline`  - flat list of paragraphs, used by the reviewer-comments panel

pub mod diff;
pub mod document;
pub mod git;
pub mod outline;
pub mod source;

pub use diff::*;
pub use document::*;
pub use git::*;
pub use outline::*;
pub use source::*;
