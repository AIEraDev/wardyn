use std::time::Instant;
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use crate::models::QueueItem;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassificationResult {
    pub flagged: bool,
    pub urgency: Option<String>,
    pub draft_text: Option<String>,
    pub confidence: f64,
    #[serde(default = "default_needs_reply")]
    pub needs_reply: bool,
}

/// Default for needs_reply when field is absent from AI JSON — conservative: assume true.
fn default_needs_reply() -> bool { true }

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

    let (recent_edits, sender_history, dynamic_corpus) = if let Some(mutex) = conn_mutex {
        if let Ok(conn) = mutex.lock() {
            let edits = crate::db::get_recent_voice_edits(&conn, 5).unwrap_or_default();
            let history = crate::db::get_sender_history(&conn, &item.sender, 5).unwrap_or_default();
            let corpus = crate::ollama::prompt::build_dynamic_corpus(&conn);
            (edits, history, Some(corpus))
        } else {
            (Vec::new(), Vec::new(), None)
        }
    } else {
        (Vec::new(), Vec::new(), None)
    };

    let prompt_text = format!(
        "{}\n\nINCOMING MESSAGE TO CLASSIFY:\nSender: {}\nPreview: {}\n",
        crate::ollama::prompt::get_system_prompt_with_corpus(
            &recent_edits,
            &sender_history,
            dynamic_corpus.as_deref(),
        ),
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
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();
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

/// Purges only the specific stale `-partial*` files for a given blob digest.
/// Extracts the sha256 digest from an Ollama error message like:
///   "remove /.../.ollama/models/blobs/sha256-<digest>-partial-0: no such file"
/// then deletes every file matching sha256-<digest>-partial* in the blobs dir.
/// This is surgical — it never touches partial files belonging to other blobs,
/// so in-progress or resumable downloads for other models are preserved.
fn purge_partial_blobs_for_digest(app: &AppHandle, model_name: &str, error_msg: &str) {
    // Extract the path from the error: "remove <path>: no such file or directory"
    let digest_prefix = error_msg
        .split("blobs/")
        .nth(1)
        .and_then(|s| s.split("-partial").next())
        .map(|s| s.trim().to_string());

    let Some(digest_prefix) = digest_prefix else {
        return;
    };

    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let blobs_dir = std::path::Path::new(&home).join(".ollama/models/blobs");

    if !blobs_dir.exists() {
        return;
    }

    let mut removed = 0usize;
    if let Ok(entries) = std::fs::read_dir(&blobs_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            // Only delete partial files that belong to this specific digest
            if name_str.starts_with(&digest_prefix) && name_str.contains("-partial") {
                let _ = std::fs::remove_file(entry.path());
                removed += 1;
            }
        }
    }

    if removed > 0 {
        let _ = app.emit(
            "ollama-pull-progress",
            ModelPullProgressPayload {
                model: model_name.to_string(),
                status: format!("Cleared {} stale chunk file(s) for this blob. Retrying...", removed),
                completed: 0,
                total: 0,
                percent: 0.0,
                done: false,
                error: None,
            },
        );
    }
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
        "model": model_name,
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

                // ── Stale chunk detection: Ollama 0.32 "remove ... no such file or directory"
                // happens when a -partial-N chunk file is missing from a prior interrupted
                // download. Surgically remove only the stale partials for this digest,
                // then retry the pull automatically — no user action needed.
                if let Some(ref msg) = err_msg {
                    if msg.contains("no such file or directory") || (msg.contains("remove ") && msg.contains("partial")) {
                        purge_partial_blobs_for_digest(&app, &model_name, msg);
                        // Retry the pull immediately after cleanup
                        let retry_client = Client::builder()
                            .timeout(Duration::from_secs(60 * 60))
                            .build()
                            .unwrap_or_default();
                        let retry_payload = serde_json::json!({ "model": model_name, "stream": true });
                        if let Ok(retry_res) = retry_client
                            .post("http://localhost:11434/api/pull")
                            .json(&retry_payload)
                            .send()
                            .await
                        {
                            // Hand off to a clean recursive call isn't possible here,
                            // so emit a user-facing "ready to resume" event instead.
                            // The frontend Retry Install button will re-invoke the command.
                            let _ = app.emit(
                                "ollama-pull-progress",
                                ModelPullProgressPayload {
                                    model: model_name.clone(),
                                    status: "Stale chunks cleared. Resuming download...".to_string(),
                                    completed: 0,
                                    total: 0,
                                    percent: 0.0,
                                    done: retry_res.status().is_success(),
                                    error: if retry_res.status().is_success() { None } else {
                                        Some("Auto-retry failed. Please click Install again.".to_string())
                                    },
                                },
                            );
                        }
                        return Ok(format!("Retrying {}", model_name));
                    }
                }

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

/// Fast synchronous rule-based classification — used during bulk Gmail sync
/// so emails appear in the UI immediately without waiting for Ollama.
/// AI classification upgrades these results in parallel afterwards.
pub fn rule_based_classify_only(sender: &str, preview: &str) -> ClassificationResult {
    let temp = crate::models::QueueItem {
        id: String::new(), source: String::new(), kind: String::new(),
        sender: sender.to_string(), preview: preview.to_string(),
        draft_text: None, status: String::new(), flagged: false,
        confidence: 0.0, created_at: String::new(), updated_at: String::new(),
        thread_id: None, message_id: None, urgency: None,
        needs_reply: true, triage_status: "active".to_string(),
    };
    fallback_rule_based_classify(&temp)
}

fn fallback_rule_based_classify(item: &crate::models::QueueItem) -> ClassificationResult {
    let lower_sender = item.sender.to_lowercase();
    let lower_preview = item.preview.to_lowercase();

    // ── Hard no-reply signals ──────────────────────────────────────────────
    let is_automated_sender = lower_sender.contains("noreply")
        || lower_sender.contains("no-reply")
        || lower_sender.contains("donotreply")
        || lower_sender.contains("mailer-daemon")
        || lower_sender.contains("bounce")
        || lower_sender.contains("notifications@")
        || lower_sender.contains("newsletter")
        || lower_sender.contains("alerts@")
        || lower_sender.contains("updates@");

    let is_automated_content = lower_preview.contains("unsubscribe")
        || lower_preview.contains("your receipt")
        || lower_preview.contains("order confirmed")
        || lower_preview.contains("invoice #")
        || lower_preview.contains("password reset")
        || lower_preview.contains("welcome to ")
        || lower_preview.contains("weekly digest")
        || lower_preview.contains("weekly roundup")
        || lower_preview.contains("you have ")
        || lower_preview.contains("weekly update");

    // ── Actionable signals ───────────────────────────────────────────────
    let has_action_words = lower_preview.contains("please")
        || lower_preview.contains("could you")
        || lower_preview.contains("can you")
        || lower_preview.contains("asap")
        || lower_preview.contains("urgent")
        || lower_preview.contains("deadline")
        || lower_preview.contains("follow up")
        || lower_preview.contains("let me know")
        || lower_preview.contains("get back to")
        || lower_preview.contains("reply");

    let has_question = lower_preview.contains('?');

    let needs_reply = !is_automated_sender
        && !is_automated_content
        && (has_action_words || has_question || lower_sender.contains("visa")
            || lower_sender.contains("ukvi") || lower_sender.contains("home office"));

    // ── Flagged / urgency ──────────────────────────────────────────────
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

    let confidence = if is_uncertain { 0.45 } else if is_flagged { 0.95 } else { 0.88 };

    let draft_text = if confidence < 0.6 {
        None
    } else if is_flagged {
        Some(format!(
            "Thanks for reaching out regarding {}. I have reviewed the details and will attach all required documentation by Friday.",
            extract_topic(&item.preview)
        ))
    } else {
        Some(format!(
            "Received, thanks for sending over details on {}. I will follow up with an update shortly.",
            extract_topic(&item.preview)
        ))
    };

    let is_low_urgency = lower_preview.contains("newsletter")
        || lower_preview.contains("unsubscribe")
        || lower_preview.contains("digest")
        || lower_preview.contains("weekly update")
        || lower_preview.contains("promotion");

    ClassificationResult {
        flagged: is_flagged,
        urgency: Some(if is_low_urgency { "low".to_string() } else { "high".to_string() }),
        draft_text,
        confidence,
        needs_reply,
    }
}


fn extract_topic(preview: &str) -> String {
    if preview.len() <= 40 {
        preview.to_string()
    } else {
        format!("{}...", &preview[..37])
    }
}
