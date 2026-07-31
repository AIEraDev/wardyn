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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstalledModelInfo {
    pub name: String,
    pub size_gb: String,
    pub status: String,
}

pub async fn classify_and_draft_item(item: &QueueItem) -> ClassificationResult {
    let client_res = Client::builder()
        .timeout(Duration::from_secs(8)) // Increased timeout for larger 32B/70B models
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

    let models = [
        "llama3:70b",
        "qwen2.5:32b",
        "mixtral:8x7b",
        "gemma2:27b",
        "deepseek-coder:33b",
        "qwen2.5",
        "llama3",
        "mistral",
        "gemma",
        "phi3",
    ];

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

    fallback_rule_based_classify(item)
}

pub async fn fetch_installed_ollama_models() -> Vec<InstalledModelInfo> {
    let client = Client::new();
    let res = client.get("http://localhost:11434/api/tags").send().await;

    let mut installed = Vec::new();
    if let Ok(resp) = res {
        if resp.status().is_success() {
            if let Ok(json_val) = resp.json::<serde_json::Value>().await {
                if let Some(models_arr) = json_val["models"].as_array() {
                    for m in models_arr {
                        let name = m["name"].as_str().unwrap_or("unknown").to_string();
                        let size_bytes = m["size"].as_u64().unwrap_or(0);
                        let size_gb = format!("{:.2} GB", size_bytes as f64 / 1_073_741_824.0);
                        installed.push(InstalledModelInfo {
                            name,
                            size_gb,
                            status: "installed".to_string(),
                        });
                    }
                }
            }
        }
    }
    installed
}

pub async fn trigger_ollama_model_install(model_name: String) -> Result<String, String> {
    let client = Client::new();
    let payload = serde_json::json!({
        "name": model_name,
        "stream": false
    });

    let res = client.post("http://localhost:11434/api/pull")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to send pull request to Ollama: {}", e))?;

    if res.status().is_success() {
        Ok(format!("Successfully pulled local model {}", model_name))
    } else {
        let err_text = res.text().await.unwrap_or_default();
        Err(format!("Ollama model install failed: {}", err_text))
    }
}

pub async fn delete_ollama_model(model_name: String) -> Result<String, String> {
    let client = Client::new();
    let payload = serde_json::json!({
        "name": model_name
    });

    let res = client.delete("http://localhost:11434/api/delete")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to send delete request to Ollama: {}", e))?;

    if res.status().is_success() {
        Ok(format!("Successfully uninstalled local model {}", model_name))
    } else {
        let err_text = res.text().await.unwrap_or_default();
        Err(format!("Ollama model deletion failed: {}", err_text))
    }
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
