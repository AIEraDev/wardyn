use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use crate::models::QueueItem;
use crate::ollama::prompt::get_system_prompt;

#[derive(Debug, Serialize, Deserialize)]
pub struct ClassificationResult {
    pub flagged: bool,
    pub draft_text: Option<String>,
    pub confidence: f64,
}

pub async fn classify_and_draft_item(item: &QueueItem) -> ClassificationResult {
    // 1. Build HTTP client with strict 5-second timeout to prevent UI freezes on low-spec hardware
    let client_res = Client::builder()
        .timeout(Duration::from_secs(5))
        .build();

    let client = match client_res {
        Ok(c) => c,
        Err(_) => Client::new(),
    };

    let prompt_text = format!(
        "{}\n\nINCOMING MESSAGE TO CLASSIFY:\nSender: {}\nPreview: {}\n",
        get_system_prompt(),
        item.sender,
        item.preview
    );

    // Cascading model attempts: qwen2.5 -> llama3 -> mistral -> gemma -> llama2
    let models = ["qwen2.5", "llama3", "mistral", "gemma", "llama2"];

    for model in models {
        let body = serde_json::json!({
            "model": model,
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
    }

    // 2. Guaranteed zero-crash fallback for users without Ollama installed or offline
    fallback_rule_based_classify(item)
}

fn fallback_rule_based_classify(item: &QueueItem) -> ClassificationResult {
    let lower_sender = item.sender.to_lowercase();
    let lower_preview = item.preview.to_lowercase();

    let is_flagged = lower_sender.contains("visa")
        || lower_sender.contains("ukvi")
        || lower_sender.contains("home office")
        || lower_preview.contains("visa")
        || lower_preview.contains("global talent")
        || lower_preview.contains("deadline");

    let is_uncertain = lower_preview.contains("sync regarding") 
        || lower_preview.contains("investor")
        || lower_preview.contains("confidential")
        || lower_preview.contains("proposal");

    let confidence = if is_uncertain {
        0.45
    } else if is_flagged {
        0.95
    } else {
        0.88
    };

    let draft_text = if confidence < 0.6 {
        None
    } else if is_flagged {
        Some(format!("Thanks for reaching out regarding {}. I have reviewed the details and will attach all required documentation by Friday.", extract_topic(&item.preview)))
    } else {
        Some(format!("Received, thanks for sending over details on {}. I will follow up with an update shortly.", extract_topic(&item.preview)))
    };

    ClassificationResult {
        flagged: is_flagged,
        draft_text,
        confidence,
    }
}

fn extract_topic(preview: &str) -> String {
    if preview.len() <= 40 {
        preview.to_string()
    } else {
        format!("{}...", &preview[..37])
    }
}
