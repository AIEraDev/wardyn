use std::process::{Command, Child};
use std::sync::Mutex;
use lazy_static::lazy_static;

lazy_static! {
    static ref AUDIO_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
}

// ─── Speech-to-Text via Ollama Whisper ───────────────────────────────────────

/// Transcribes raw audio bytes (WebM/Opus or WAV) using Ollama's OpenAI-compatible
/// /v1/audio/transcriptions endpoint, which wraps a local Whisper model.
pub async fn transcribe_audio_bytes(audio_bytes: Vec<u8>, mime_type: &str) -> Result<String, String> {
    use reqwest::multipart;

    let ext = if mime_type.contains("wav") { "wav" } else { "webm" };
    let filename = format!("recording.{}", ext);
    let content_type = mime_type.to_string();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    // Try whisper models in preference order
    let models = ["whisper", "whisper:latest", "openai/whisper", "ollama/whisper"];

    // First check which models are actually installed
    let tags_resp = client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .map_err(|_| "Ollama is not running. Please start Ollama and install a Whisper model.".to_string())?;

    let tags_body = tags_resp.text().await.unwrap_or_default();

    // Find the first available whisper model from installed list
    let available_model = models.iter().find(|&&m| {
        tags_body.to_lowercase().contains(&m.to_lowercase().replace("/", "").replace(":", "").replace("whisper", "whisper"))
            || tags_body.contains(m)
    }).copied();

    // If none found by exact match, check if anything with "whisper" is installed
    let model_name = if let Some(m) = available_model {
        m.to_string()
    } else if tags_body.to_lowercase().contains("whisper") {
        // Extract the exact model name from tags response
        tags_body
            .split('"')
            .find(|s| s.to_lowercase().contains("whisper"))
            .unwrap_or("whisper")
            .to_string()
    } else {
        return Err("No Whisper model found. Run: ollama pull whisper".to_string());
    };

    let file_part = multipart::Part::bytes(audio_bytes)
        .file_name(filename)
        .mime_str(&content_type)
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
        return Err(format!("Whisper transcription error {}: {}", status, body));
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
