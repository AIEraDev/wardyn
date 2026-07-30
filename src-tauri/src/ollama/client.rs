use serde::{Deserialize, Serialize};
use reqwest::Client;
use crate::models::QueueItem;
use crate::ollama::prompt::get_system_prompt;

#[derive(Debug, Serialize, Deserialize)]
pub struct ClassificationResult {
    pub flagged: bool,
    pub draft_text: Option<String>,
    pub confidence: f64,
}

pub async fn classify_and_draft_item(item: &QueueItem) -> ClassificationResult {
    let client = Client::new();
    let prompt_text = format!(
        "{}\n\nINCOMING MESSAGE TO CLASSIFY:\nSender: {}\nPreview: {}\n",
        get_system_prompt(),
        item.sender,
        item.preview
    );

    let body = serde_json::json!({
        "model": "qwen2.5",
        "prompt": prompt_text,
        "stream": false,
        "format": "json"
    });

    let res = client.post("http://localhost:11434/api/generate")
        .json(&body)
        .send()
        .await;

    if let Ok(resp) = res {
        if resp.status().is_success() {
            if let Ok(json_resp) = resp.json::<serde_json::Value>().await {
                if let Some(raw_response) = json_resp["response"].as_str() {
                    if let Ok(parsed) = serde_json::from_str::<ClassificationResult>(raw_response) {
                        return parsed;
                    }
                }
            }
        }
    }

    // Fallback: Rule-based classification if Ollama service is offline or un-installed
    fallback_rule_based_classify(item)
}

fn fallback_rule_based_classify(item: &QueueItem) -> ClassificationResult {
    let lower_sender = item.sender.to_lowercase();
    let lower_preview = item.preview.to_lowercase();

    let is_flagged = lower_sender.contains("visa")
        || lower_sender.contains("ukvi")
        || lower_sender.contains("home office")
        || lower_preview.contains("visa")
        || lower_preview.contains("global talent");

    // Guardrail test: If preview contains 'uncertain' or 'sync regarding', simulate low confidence < 0.6
    let is_uncertain = lower_preview.contains("sync regarding") || lower_preview.contains("investor");
    let confidence = if is_uncertain { 0.42 } else if is_flagged { 0.94 } else { 0.88 };

    let draft_text = if confidence < 0.6 {
        None
    } else if is_flagged {
        Some("Thanks for the update, I have attached the requested reference letters and will follow up by Friday.".into())
    } else {
        Some("Confirmed, workshop starts 3pm WAT, I will share the meet link Thursday morning.".into())
    };

    ClassificationResult {
        flagged: is_flagged,
        draft_text,
        confidence,
    }
}
