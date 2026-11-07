//! A real terminal inside the app: a shell running in a pseudo-terminal (ConPTY on Windows),
//! so programs such as `claude` or `codex` behave exactly as they do in Windows Terminal.
//!
//! The UI (xterm.js) draws the screen. This module only starts the shell in the project folder,
//! forwards what the user types, resizes the terminal, and hands everything the shell prints
//! back to the UI as raw bytes. It knows nothing about documents or Git.

use crate::error::{AppError, AppResult};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.child.kill(); // closing a terminal ends its shell
    }
}

/// All open terminals, shared by the commands through Tauri's managed state.
#[derive(Default)]
pub struct Terminals {
    next_id: AtomicU32,
    sessions: Mutex<HashMap<u32, Session>>,
}

/// Any failure while starting becomes one readable message.
fn io(error: impl std::fmt::Display) -> AppError {
    AppError::Io(format!("could not start the terminal: {error}"))
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows: rows.max(2), cols: cols.max(2), pixel_width: 0, pixel_height: 0 }
}

/// The shell to run: PowerShell on Windows, the user's `$SHELL` elsewhere.
fn shell() -> CommandBuilder {
    #[cfg(windows)]
    {
        let mut command = CommandBuilder::new("powershell.exe");
        command.arg("-NoLogo");
        command
    }
    #[cfg(not(windows))]
    {
        CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| "sh".into()))
    }
}

impl Terminals {
    /// Start a shell in `cwd`. `on_output` receives every chunk the shell prints; `on_exit` is called once when it ends.
    pub fn start(
        &self,
        cwd: &str,
        cols: u16,
        rows: u16,
        on_output: impl Fn(Vec<u8>) + Send + 'static,
        on_exit: impl FnOnce() + Send + 'static,
    ) -> AppResult<u32> {
        if !std::path::Path::new(cwd).is_dir() {
            return Err(AppError::Invalid(format!("'{cwd}' is not a folder")));
        }
        let pair = native_pty_system().openpty(size(cols, rows)).map_err(io)?;
        let mut command = shell();
        command.cwd(cwd);
        command.env("TERM", "xterm-256color");
        let child = pair.slave.spawn_command(command).map_err(io)?;
        drop(pair.slave); // only the shell holds the slave end, so the reader sees the end when it exits
        let mut reader = pair.master.try_clone_reader().map_err(io)?;
        let writer = pair.master.take_writer().map_err(io)?;

        let id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        self.sessions.lock().expect("terminal lock").insert(id, Session { master: pair.master, writer, child });

        std::thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => on_output(buffer[..count].to_vec()),
                }
            }
            on_exit();
        });
        Ok(id)
    }

    fn with<T>(&self, id: u32, action: impl FnOnce(&mut Session) -> AppResult<T>) -> AppResult<T> {
        let mut sessions = self.sessions.lock().expect("terminal lock");
        let session = sessions.get_mut(&id).ok_or_else(|| AppError::Invalid("this terminal has ended".into()))?;
        action(session)
    }

    pub fn write(&self, id: u32, data: &[u8]) -> AppResult<()> {
        self.with(id, |s| Ok(s.writer.write_all(data).and_then(|_| s.writer.flush())?))
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> AppResult<()> {
        self.with(id, |s| s.master.resize(size(cols, rows)).map_err(|e| AppError::Io(e.to_string())))
    }

    /// Stop the shell and forget the terminal.
    pub fn close(&self, id: u32) {
        self.sessions.lock().expect("terminal lock").remove(&id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn a_shell_runs_in_the_folder_and_answers_what_is_typed() {
        let terminals = Terminals::default();
        let folder = std::env::temp_dir().join("inkdelta-terminal-test");
        std::fs::create_dir_all(&folder).unwrap();
        let (sender, receiver) = mpsc::channel();
        let id = terminals.start(folder.to_str().unwrap(), 100, 30, move |bytes| { let _ = sender.send(bytes); }, || {}).unwrap();

        terminals.write(id, b"echo inkdelta-ok-$((6*7))\r\necho inkdelta-ok-%CD%\r\n").unwrap();
        let mut seen = String::new();
        let deadline = std::time::Instant::now() + Duration::from_secs(15);
        while std::time::Instant::now() < deadline && !(seen.contains("inkdelta-terminal-test") && seen.contains("inkdelta-ok")) {
            if let Ok(chunk) = receiver.recv_timeout(Duration::from_millis(300)) {
                let text = String::from_utf8_lossy(&chunk);
                if text.contains("\x1b[6n") {
                    // Windows' pseudo-console asks "where is the cursor?" and waits; xterm.js answers this in the app.
                    terminals.write(id, b"\x1b[1;1R").unwrap();
                }
                seen.push_str(&text);
            }
        }
        terminals.resize(id, 80, 24).unwrap();
        terminals.close(id);
        assert!(terminals.write(id, b"x").is_err(), "a closed terminal refuses input");
        assert!(seen.contains("inkdelta-ok"), "the shell echoed what was typed; got: {seen}");
        assert!(Terminals::default().start("D:/definitely/not/here", 80, 24, |_| {}, || {}).is_err());
    }
}
