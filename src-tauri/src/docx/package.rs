//! Opens the .docx zip and reads files out of it.

use super::xml::{self, Node};
use crate::error::{AppError, AppResult};
use std::io::{Cursor, Read};

pub struct Package {
    archive: zip::ZipArchive<Cursor<Vec<u8>>>,
}

impl Package {
    pub fn open(bytes: Vec<u8>) -> AppResult<Self> {
        let archive = zip::ZipArchive::new(Cursor::new(bytes))
            .map_err(|e| AppError::Docx(format!("not a valid .docx file ({e})")))?;
        Ok(Self { archive })
    }

    /// Raw bytes of a file inside the zip, or None if it is not there.
    pub fn read(&mut self, path: &str) -> Option<Vec<u8>> {
        let mut file = self.archive.by_name(path).ok()?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).ok()?;
        Some(bytes)
    }

    /// A file inside the zip parsed as XML. None if missing or not valid XML.
    pub fn read_xml(&mut self, path: &str) -> Option<Node> {
        let bytes = self.read(path)?;
        xml::parse(&bytes).ok()
    }
}
