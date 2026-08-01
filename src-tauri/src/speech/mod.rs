use std::process::{Command, Child};
use std::sync::Mutex;
use lazy_static::lazy_static;

lazy_static! {
    static ref AUDIO_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
}

// ─── Speech-to-Text via Ollama Whisper ───────────────────────────────────────

/// Known whisper model names on the Ollama registry, in preference order.
/// These are community models since Ollama has no first-party whisper in its library.
const WHISPER_INSTALL_MODEL: &str = "dimavz/whisper-tiny";
const WHISPER_CANDIDATES: &[&str] = &[
    "dimavz/whisper-tiny",
    "dimavz/whisper-base",
    "dimavz/whisper-small",
    "dimavz/whisper-medium",
    "dimavz/whisper-large",
];

/// Returns the name of an installed Whisper model, or None if none found.
pub async fn find_installed_whisper_model() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok()?;

    let resp = client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .ok()?;

    let json: serde_json::Value = resp.json().await.ok()?;
    let models = json["models"].as_array()?;

    // Check exact matches first (from our known candidate list)
    for candidate in WHISPER_CANDIDATES {
        for m in models {
            let name = m["name"].as_str().unwrap_or("");
            // Match "dimavz/whisper-tiny" or "dimavz/whisper-tiny:latest"
            if name == *candidate || name.starts_with(&format!("{}:", candidate)) {
                return Some(name.to_string());
            }
        }
    }

    // Fall back: any installed model whose name contains "whisper"
    for m in models {
        let name = m["name"].as_str().unwrap_or("");
        if name.to_lowercase().contains("whisper") {
            return Some(name.to_string());
        }
    }

    None
}

/// Transcribes raw audio bytes (WebM/Opus or WAV) using Ollama's OpenAI-compatible
/// /v1/audio/transcriptions endpoint backed by a local Whisper model.
pub async fn transcribe_audio_bytes(audio_bytes: Vec<u8>, mime_type: &str) -> Result<String, String> {
    use reqwest::multipart;

    let model_name = find_installed_whisper_model()
        .await
        .ok_or_else(|| format!(
            "No Whisper model installed. Go to Settings → Voice Capture and click Install Whisper."
        ))?;

    let ext = if mime_type.contains("wav") { "wav" } else { "webm" };
    let filename = format!("recording.{}", ext);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let file_part = multipart::Part::bytes(audio_bytes)
        .file_name(filename)
        .mime_str(mime_type)
        .map_err(|e| format!("MIME error: {}", e))?;

    let form = multipart::Form::new()
        .part("file", file_part)
        .text("model", model_name)
        .text("response_format", "json");

    #[derive(serde::Deserialize)]
    struct TranscriptionResponse {
        text: String,
    }

    let resp = client
        .post("http://localhost:11434/v1/audio/transcriptions")
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Transcription request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Whisper error {}: {}", status, body));
    }

    let result: TranscriptionResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse transcription response: {}", e))?;

    Ok(result.text.trim().to_string())
}

pub fn speak_text(text: &str) -> Result<(), String> {
    // Stop any currently playing audio
    stop_speech();

    // Clean text by stripping markdown symbols (hashtags, asterisks, emojis) for natural speech
    let clean_text = clean_text_for_speech(text);

    #[cfg(target_os = "macos")]
    {
        // Use macOS native 'say' synthesizer with natural voice rate
        match Command::new("say").arg("-r").arg("185").arg(&clean_text).spawn() {
            Ok(child) => {
                if let Ok(mut guard) = AUDIO_PROCESS.lock() {
                    *guard = Some(child);
                }
                Ok(())
            }
            Err(e) => Err(format!("Failed to launch speech process: {}", e)),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Native speech synthesis currently supported on macOS".into())
    }
}

pub fn stop_speech() {
    if let Ok(mut guard) = AUDIO_PROCESS.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
}

fn clean_text_for_speech(input: &str) -> String {
    input
        .replace("⚡", "")
        .replace("📅", "")
        .replace("📚", "")
        .replace("💡", "")
        .replace("📊", "")
        .replace("🎯", "")
        .replace("📬", "")
        .replace("⚠️", "Warning:")
        .replace("⭐", "")
        .replace('#', "")
        .replace('*', "")
        .replace('`', "")
        .trim()
        .to_string()
}
