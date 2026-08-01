use std::time::Instant;
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use crate::models::QueueItem;
use crate::ollama::prompt::get_system_prompt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassificationResult {
    pub flagged: bool,
    pub urgency: Option<String>,
    pub draft_text: Option<String>,
    pub confidence: f64,
}

#[derive(Debug, Clone)]
pub struct ClassifyOutcome {
    pub result: ClassificationResult,
    pub generation_time_ms: i64,
}

pub async fn classify_and_draft_item(
    item: &QueueItem,
    conn_mutex: Option<&std::sync::Mutex<rusqlite::Connection>>,
) -> ClassifyOutcome {
    let started = Instant::now();
    let result = classify_and_draft_item_inner(item, conn_mutex).await;
    ClassifyOutcome {
        result,
        generation_time_ms: started.elapsed().as_millis() as i64,
    }
}

async fn classify_and_draft_item_inner(
    item: &QueueItem,
    conn_mutex: Option<&std::sync::Mutex<rusqlite::Connection>>,
) -> ClassificationResult {
    let client_res = Client::builder()
        .timeout(Duration::from_secs(8)) // Increased timeout for larger 32B/70B models
        .build();

    let client = match client_res {
        Ok(c) => c,
        Err(_) => Client::new(),
    };

    let (recent_edits, sender_history) = if let Some(mutex) = conn_mutex {
        if let Ok(conn) = mutex.lock() {
            let edits = crate::db::get_recent_voice_edits(&conn, 5).unwrap_or_default();
            let history = crate::db::get_sender_history(&conn, &item.sender, 5).unwrap_or_default();
            (edits, history)
        } else {
            (Vec::new(), Vec::new())
        }
    } else {
        (Vec::new(), Vec::new())
    };

    let prompt_text = format!(
        "{}\n\nINCOMING MESSAGE TO CLASSIFY:\nSender: {}\nPreview: {}\n",
        get_system_prompt(&recent_edits, &sender_history),
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstalledModelInfo {
    pub name: String,
    pub size_gb: String,
    pub status: String,
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

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPullProgressPayload {
    pub model: String,
    pub status: String,
    pub completed: u64,
    pub total: u64,
    pub percent: f64,
    pub done: bool,
    pub error: Option<String>,
}

pub async fn stream_ollama_model_install(
    app: AppHandle,
    model_name: String,
    cancel_flag: Arc<AtomicBool>,
) -> Result<String, String> {
    // Helper: emit a terminal error event so the frontend always gets notified
    let emit_error = |app: &AppHandle, model: &str, msg: &str| {
        let _ = app.emit(
            "ollama-pull-progress",
            ModelPullProgressPayload {
                model: model.to_string(),
                status: format!("Error: {}", msg),
                completed: 0,
                total: 0,
                percent: 0.0,
                done: true,
                error: Some(msg.to_string()),
            },
        );
    };

    // ── 1. Pre-flight: verify Ollama is reachable before attempting pull ──────
    let probe = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    if probe.get("http://localhost:11434").send().await.is_err() {
        let msg = "Ollama is not running. Please start Ollama (run: ollama serve) and try again.";
        emit_error(&app, &model_name, msg);
        return Err(msg.to_string());
    }

    // ── 2. Start streaming pull ───────────────────────────────────────────────
    let client = Client::builder()
        .timeout(Duration::from_secs(60 * 60)) // 1 h — large models take a while
        .build()
        .unwrap_or_default();

    let payload = serde_json::json!({
        "name": model_name,
        "stream": true
    });

    let res = match client
        .post("http://localhost:11434/api/pull")
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("Failed to start download: {}", e);
            emit_error(&app, &model_name, &msg);
            return Err(msg);
        }
    };

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        let msg = format!("Ollama returned an error: {}", err_text);
        emit_error(&app, &model_name, &msg);
        return Err(msg);
    }

    // ── 3. Stream response chunks ─────────────────────────────────────────────
    let mut stream = res.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        if cancel_flag.load(Ordering::Relaxed) {
            let _ = app.emit(
                "ollama-pull-progress",
                ModelPullProgressPayload {
                    model: model_name.clone(),
                    status: "Cancelled".to_string(),
                    completed: 0,
                    total: 0,
                    percent: 0.0,
                    done: true,
                    error: Some("Download cancelled by user".to_string()),
                },
            );
            return Err("Cancelled by user".to_string());
        }

        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let msg = format!("Download stream interrupted: {}", e);
                emit_error(&app, &model_name, &msg);
                return Err(msg);
            }
        };

        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                let status = v.get("status").and_then(|s| s.as_str()).unwrap_or("Downloading...").to_string();
                let completed = v.get("completed").and_then(|c| c.as_u64()).unwrap_or(0);
                let total = v.get("total").and_then(|t| t.as_u64()).unwrap_or(0);
                let percent = if total > 0 {
                    ((completed as f64) / (total as f64) * 100.0).min(100.0)
                } else {
                    0.0
                };
                let is_error = v.get("error").is_some();
                let err_msg = v.get("error").and_then(|e| e.as_str()).map(|s| s.to_string());

                let _ = app.emit(
                    "ollama-pull-progress",
                    ModelPullProgressPayload {
                        model: model_name.clone(),
                        status: status.clone(),
                        completed,
                        total,
                        percent,
                        done: is_error,
                        error: err_msg.clone(),
                    },
                );

                if is_error {
                    return Err(err_msg.unwrap_or_else(|| "Download failed".to_string()));
                }
            }
        }
    }

    // ── 4. Success ────────────────────────────────────────────────────────────
    let _ = app.emit(
        "ollama-pull-progress",
        ModelPullProgressPayload {
            model: model_name.clone(),
            status: "Successfully installed!".to_string(),
            completed: 100,
            total: 100,
            percent: 100.0,
            done: true,
            error: None,
        },
    );

    Ok(format!("Successfully pulled local model {}", model_name))
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

    let is_low_urgency = lower_preview.contains("newsletter")
        || lower_preview.contains("unsubscribe")
        || lower_preview.contains("digest")
        || lower_preview.contains("weekly update")
        || lower_preview.contains("promotion");

    let urgency = if is_low_urgency { "low".to_string() } else { "high".to_string() };

    ClassificationResult {
        flagged: is_flagged,
        urgency: Some(urgency),
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
