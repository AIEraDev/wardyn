/// Social Advisor — generates a detailed social post draft from the daily intel idea.
/// Used when the user taps "Generate full post" on the Social Advisor card.

use rusqlite::Connection;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use crate::db::now_iso;

const OLLAMA_BASE: &str = "http://localhost:11434";

#[derive(Debug, Serialize, Deserialize)]
pub struct GeneratedPost {
    pub platform: String,
    pub format: String,
    pub hook: String,
    pub body: String,
    pub hashtags: Vec<String>,
    pub media_cue: Option<String>,
}

pub async fn generate_full_post(
    conn_mutex: &std::sync::Mutex<Connection>,
    platform: &str,
    idea: &str,
    format: &str,
) -> Result<GeneratedPost, String> {
    let _today = { let iso = now_iso(); iso.get(0..10).unwrap_or(&iso).to_string() };

    // Get rich user context for personalized post generation
    let user_context = if let Ok(conn) = conn_mutex.lock() {
        crate::db::build_user_context(&conn)
    } else {
        String::new()
    };

    let format_guidance = match format {
        "video" => "This will be a video post. Write a strong hook sentence for the voiceover/caption. The body should be a short script outline (3-5 talking points). Include what to show on camera.",
        "image_text" => "This will accompany an image. Write a punchy caption that works with a visual. First line must stop the scroll.",
        _ => "Plain text post. Write the full post text. Use line breaks for readability. No emojis overdose — keep it authentic.",
    };

    let platform_guidance = "LinkedIn style: professional but personal, first-person voice, value-driven.";

    let prompt = format!(
        r#"You are a personal brand copywriter for a builder/developer/entrepreneur.

Post idea: {idea}
Platform: {platform}
Format: {format}

{user_context}

{format_guidance}
{platform_guidance}

Return ONLY valid JSON in this exact format:
{{
  "hook": "<first 1-2 sentences that stop the scroll>",
  "body": "<full post body>",
  "hashtags": ["<tag1>", "<tag2>", "<tag3>"],
  "media_cue": "<optional: what image/thumbnail to use, or null>"
}}"#,
        idea = idea,
        platform = platform,
        format = format,
        user_context = user_context,
        format_guidance = format_guidance,
        platform_guidance = platform_guidance
    );

    let raw = call_ollama(&prompt).await.unwrap_or_default();
    let json_str = extract_json(&raw);

    #[derive(Deserialize)]
    struct Parsed {
        hook: Option<String>,
        body: Option<String>,
        hashtags: Option<Vec<String>>,
        media_cue: Option<String>,
    }

    if let Ok(p) = serde_json::from_str::<Parsed>(&json_str) {
        Ok(GeneratedPost {
            platform: platform.to_string(),
            format: format.to_string(),
            hook: p.hook.unwrap_or_else(|| idea.chars().take(100).collect()),
            body: p.body.unwrap_or_else(|| idea.to_string()),
            hashtags: p.hashtags.unwrap_or_else(|| vec!["buildinpublic".into(), "devlife".into()]),
            media_cue: p.media_cue,
        })
    } else {
        Ok(GeneratedPost {
            platform: platform.to_string(),
            format: format.to_string(),
            hook: idea.chars().take(120).collect(),
            body: idea.to_string(),
            hashtags: vec!["buildinpublic".into(), "indie".into()],
            media_cue: None,
        })
    }
}

async fn call_ollama(prompt: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    let models = ["qwen2.5", "llama3", "mistral", "gemma", "phi3"];

    #[derive(Serialize)]
    struct OllamaReq<'a> { model: &'a str, prompt: &'a str, stream: bool }
    #[derive(Deserialize)]
    struct OllamaResp { response: String }

    for model in &models {
        let body = OllamaReq { model, prompt, stream: false };
        if let Ok(resp) = client.post(format!("{}/api/generate", OLLAMA_BASE)).json(&body).send().await {
            if resp.status().is_success() {
                if let Ok(parsed) = resp.json::<OllamaResp>().await {
                    return Ok(parsed.response);
                }
            }
        }
    }
    Err("Ollama unavailable".into())
}

fn extract_json(text: &str) -> String {
    if let (Some(start), Some(end)) = (text.find('{'), text.rfind('}')) {
        if end > start { return text[start..=end].to_string(); }
    }
    text.to_string()
}
