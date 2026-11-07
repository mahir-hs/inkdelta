//! Talks to an AI service so a reviewer comment can be turned into proposed edits.
//!
//! Three ways in, all returning plain text:
//!   * `cli`       - a command-line tool already set up on this computer (Claude Code, Codex, ...).
//!                   The prompt goes to its standard input. No key is handled by Inkdelta.
//!   * `anthropic` - the Claude API with an API key.
//!   * `openai`    - any OpenAI-style service: OpenRouter, OpenAI, Ollama (local), and others.
//!
//! Nothing is sent unless the user confirms it in the app. The text, not the key, goes into logs: keys are never logged.

use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    /// "cli", "anthropic" or "openai"
    pub kind: String,
    pub model: String,
    pub base_url: String,
    pub api_key: String,
    /// For `cli`: the command line, for example `claude -p`.
    pub command: String,
}

const TIMEOUT: Duration = Duration::from_secs(300);

pub fn complete(config: &AiConfig, system: &str, user: &str) -> AppResult<String> {
    match config.kind.as_str() {
        "cli" => run_cli(config, system, user),
        "anthropic" => anthropic(config, system, user),
        "openai" => openai(config, system, user),
        other => Err(AppError::Invalid(format!("unknown AI provider '{other}'"))),
    }
}

// ------------------------------------------------------------ command-line tools

fn run_cli(config: &AiConfig, system: &str, user: &str) -> AppResult<String> {
    if config.command.trim().is_empty() {
        return Err(AppError::Invalid("enter the command to run, for example: claude -p".into()));
    }
    // Run through the shell so tools installed as .cmd shims (npm) are found on Windows.
    #[cfg(windows)]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut c = Command::new("cmd");
        c.args(["/C", &config.command]).creation_flags(0x0800_0000); // no console window
        c
    };
    #[cfg(not(windows))]
    let mut command = {
        let mut c = Command::new("sh");
        c.args(["-c", &config.command]);
        c
    };
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|e| AppError::Io(format!("could not start '{}': {e}", config.command)))?;
    let prompt = format!("{system}\n\n{user}");
    let mut stdin = child.stdin.take().expect("piped");
    let writer = std::thread::spawn(move || {
        let _ = stdin.write_all(prompt.as_bytes()); // closing stdin tells the tool the prompt is complete
    });
    let mut stdout = child.stdout.take().expect("piped");
    let mut stderr = child.stderr.take().expect("piped");
    let out_reader = std::thread::spawn(move || {
        let mut text = String::new();
        let _ = stdout.read_to_string(&mut text);
        text
    });
    let err_reader = std::thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text);
        text
    });

    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if started.elapsed() > TIMEOUT {
            let _ = child.kill();
            return Err(AppError::Io("The AI tool took longer than 5 minutes and was stopped.".into()));
        }
        std::thread::sleep(Duration::from_millis(150));
    };
    let _ = writer.join();
    let output = out_reader.join().unwrap_or_default();
    let errors = err_reader.join().unwrap_or_default();
    if !status.success() && output.trim().is_empty() {
        return Err(AppError::Io(format!("The AI tool failed: {}", errors.trim().chars().take(400).collect::<String>())));
    }
    Ok(output)
}

// ------------------------------------------------------------ HTTP services

fn http_error(error: ureq::Error) -> AppError {
    match error {
        ureq::Error::Status(code, response) => {
            let body = response.into_string().unwrap_or_default();
            let hint = if code == 401 || code == 403 { " Check the API key." } else { "" };
            AppError::Io(format!("The AI service answered {code}.{hint} {}", body.chars().take(300).collect::<String>()))
        }
        other => AppError::Io(format!("Could not reach the AI service: {other}")),
    }
}

fn anthropic(config: &AiConfig, system: &str, user: &str) -> AppResult<String> {
    let base = if config.base_url.trim().is_empty() { "https://api.anthropic.com" } else { config.base_url.trim_end_matches('/') };
    let body = serde_json::json!({
        "model": config.model,
        "max_tokens": 8000,
        "system": system,
        "messages": [{ "role": "user", "content": user }],
    });
    let reply: serde_json::Value = ureq::post(&format!("{base}/v1/messages"))
        .timeout(TIMEOUT)
        .set("x-api-key", &config.api_key)
        .set("anthropic-version", "2023-06-01")
        .send_json(body)
        .map_err(http_error)?
        .into_json()?;
    let text: String = reply["content"].as_array().into_iter().flatten().filter_map(|part| part["text"].as_str()).collect();
    if text.is_empty() { Err(AppError::Io("The AI service returned no text.".into())) } else { Ok(text) }
}

fn openai(config: &AiConfig, system: &str, user: &str) -> AppResult<String> {
    let base = config.base_url.trim_end_matches('/');
    if base.is_empty() {
        return Err(AppError::Invalid("enter the service address, for example https://openrouter.ai/api/v1".into()));
    }
    let body = serde_json::json!({
        "model": config.model,
        "messages": [{ "role": "system", "content": system }, { "role": "user", "content": user }],
    });
    let mut request = ureq::post(&format!("{base}/chat/completions")).timeout(TIMEOUT);
    if !config.api_key.trim().is_empty() {
        request = request.set("Authorization", &format!("Bearer {}", config.api_key.trim()));
    }
    let reply: serde_json::Value = request.send_json(body).map_err(http_error)?.into_json()?;
    reply["choices"][0]["message"]["content"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| AppError::Io("The AI service returned no text.".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn config(kind: &str) -> AiConfig {
        AiConfig { kind: kind.into(), model: "m".into(), base_url: String::new(), api_key: "k".into(), command: String::new() }
    }

    #[test]
    fn a_command_line_tool_receives_the_prompt_on_stdin() {
        let mut c = config("cli");
        c.command = if cfg!(windows) { "more".into() } else { "cat".into() }; // prints its input back
        let reply = complete(&c, "SYSTEM RULES", "USER QUESTION").unwrap();
        assert!(reply.contains("SYSTEM RULES") && reply.contains("USER QUESTION"), "got: {reply}");
        c.command = String::new();
        assert!(complete(&c, "s", "u").is_err());
    }

    /// A one-shot local web server that answers any request with `body`.
    fn serve_once(body: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                // Read the whole request (headers, then the announced body) before answering,
                // otherwise closing early can reset the client's connection mid-send.
                let mut received = Vec::new();
                let mut chunk = [0u8; 4096];
                loop {
                    let Ok(count) = stream.read(&mut chunk) else { break };
                    if count == 0 { break; }
                    received.extend_from_slice(&chunk[..count]);
                    let text = String::from_utf8_lossy(&received).to_string();
                    if let Some(end) = text.find("\r\n\r\n") {
                        let length = text[..end].to_ascii_lowercase().split("content-length:").nth(1)
                            .and_then(|v| v.lines().next()).and_then(|v| v.trim().parse::<usize>().ok()).unwrap_or(0);
                        if received.len() >= end + 4 + length { break; }
                    }
                }
                let reply = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                let _ = stream.write_all(reply.as_bytes());
            }
        });
        format!("http://{address}")
    }

    #[test]
    fn openai_style_and_claude_style_services_are_understood() {
        let mut c = config("openai");
        c.base_url = serve_once(r#"{"choices":[{"message":{"content":"hello from openrouter"}}]}"#);
        assert_eq!(complete(&c, "s", "u").unwrap(), "hello from openrouter");

        let mut c = config("anthropic");
        c.base_url = serve_once(r#"{"content":[{"type":"text","text":"hello from claude"}]}"#);
        assert_eq!(complete(&c, "s", "u").unwrap(), "hello from claude");
    }

    #[test]
    fn an_unreachable_service_gives_a_readable_error() {
        let mut c = config("openai");
        c.base_url = "http://127.0.0.1:9".into(); // nothing listens here
        let error = complete(&c, "s", "u").unwrap_err().to_string();
        assert!(error.contains("Could not reach"), "got: {error}");
    }
}
