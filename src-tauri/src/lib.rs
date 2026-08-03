pub mod models;
pub mod db;
pub mod gmail;
pub mod linkedin;
pub mod ollama;
pub mod calendar;
pub mod security;
pub mod feeds;
pub mod brief;
pub mod memory;
pub mod intelligence;
pub mod speech;
pub mod vault;
pub mod reader;
pub mod productivity;
pub mod planner;
pub mod active_life;
pub mod tray;
pub mod research;






use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use tauri::{State, Manager, AppHandle};
use models::QueueItem;
use db::SyncedCalendarEvent;
use gmail::send::SendEmailRequest;
use linkedin::api::RealLinkedInSummary;
use ollama::client::InstalledModelInfo;

pub struct DbState(pub Mutex<Connection>);

/// Returns current local time as "HH:MM" string for reminder matching.
fn chrono_hhmm() -> String {
    // Use `date +%H:%M` which respects local timezone on macOS/Linux
    if let Ok(output) = std::process::Command::new("date").arg("+%H:%M").output() {
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if s.len() == 5 { return s; }
        }
    }
    // Fallback: UTC
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let total_mins = (secs / 60) % (24 * 60);
    format!("{:02}:{:02}", total_mins / 60, total_mins % 60)
}

/// Fires a macOS notification using tauri-plugin-notification.
fn fire_notification(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

#[tauri::command]
fn get_queue_items(state: State<'_, DbState>) -> Result<Vec<QueueItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_all_queue_items(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
async fn send_gmail_reply_command(req: SendEmailRequest, state: State<'_, DbState>) -> Result<String, String> {
    gmail::send::send_gmail_reply(&state.0, req).await
}

#[tauri::command]
fn skip_queue_item(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::update_status_and_draft(&conn, &id, "skipped", None).map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_gmail_auth(state: State<'_, DbState>) -> Result<String, String> {
    gmail::oauth::start_oauth_flow(&state.0).await
}

#[tauri::command]
fn get_gmail_auth_status(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let all = db::get_all_gmail_credentials(&conn).map_err(|e| e.to_string())?;
    let emails: Vec<String> = all.into_iter().filter_map(|c| c.email).collect();
    Ok(emails)
}

#[tauri::command]
fn disconnect_gmail(email: Option<String>, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_gmail_credentials(&conn, email.as_deref()).map_err(|e| e.to_string())
}


#[tauri::command]
async fn start_linkedin_auth(state: State<'_, DbState>) -> Result<String, String> {
    linkedin::oauth::start_linkedin_oauth_flow(&state.0).await
}

#[tauri::command]
fn get_linkedin_auth_status(state: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let creds = db::get_credentials(&conn, "linkedin").map_err(|e| e.to_string())?;
    Ok(creds.and_then(|c| c.email))
}

#[tauri::command]
async fn fetch_linkedin_timeline_command(state: State<'_, DbState>) -> Result<RealLinkedInSummary, String> {
    linkedin::api::fetch_real_linkedin_summary(&state.0).await
}

#[tauri::command]
async fn sync_gmail_messages(state: State<'_, DbState>) -> Result<usize, String> {
    gmail::sync::sync_gmail_messages(&state.0).await
}




#[tauri::command]
async fn process_item_with_ollama(id: String, state: State<'_, DbState>) -> Result<QueueItem, String> {
    let item = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::get_queue_item_by_id(&conn, &id).map_err(|e| e.to_string())?
            .ok_or_else(|| "Item not found".to_string())?
    };

    let outcome = ollama::client::classify_and_draft_item(&item, Some(&state.0)).await;
    let result = outcome.result;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    let urgency_val = result.urgency.as_deref().unwrap_or("high");
    conn.execute(
        "UPDATE queue_items SET flagged = ?1, draft_text = ?2, confidence = ?3, updated_at = ?4, urgency = ?5,
         needs_reply = ?6, triage_status = CASE
           WHEN triage_status = 'suppressed'    THEN 'suppressed'
           WHEN triage_status = 'informational' THEN 'informational'
           ELSE 'active'
         END
         WHERE id = ?7",
        rusqlite::params![
            if result.flagged { 1 } else { 0 },
            result.draft_text,
            result.confidence,
            now,
            urgency_val,
            if result.needs_reply { 1 } else { 0 },
            id
        ],
    ).map_err(|e| e.to_string())?;

    db::set_draft_generation_time_ms(&conn, &id, outcome.generation_time_ms).map_err(|e| e.to_string())?;

    db::get_queue_item_by_id(&conn, &id).map_err(|e| e.to_string())?
        .ok_or_else(|| "Item not found after update".to_string())
}

#[tauri::command]
fn record_voice_edit_command(item_id: String, original: String, edited: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::record_voice_edit(&conn, &item_id, &original, &edited).map_err(|e| e.to_string())
}

pub struct CancelRegistry(pub Mutex<std::collections::HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>>);

#[tauri::command]
async fn get_installed_ollama_models_command() -> Result<Vec<InstalledModelInfo>, String> {
    Ok(ollama::client::fetch_installed_ollama_models().await)
}

#[tauri::command]
async fn install_ollama_model_command(
    app: tauri::AppHandle,
    model_name: String,
    state: State<'_, CancelRegistry>,
) -> Result<String, String> {
    let cancel_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.insert(model_name.clone(), cancel_flag.clone());
    }

    let app_handle = app.clone();
    let name = model_name.clone();
    tokio::spawn(async move {
        let _ = ollama::client::stream_ollama_model_install(app_handle, name, cancel_flag).await;
    });

    Ok(format!("Started download for {}", model_name))
}

#[tauri::command]
async fn cancel_model_install_command(
    model_name: String,
    state: State<'_, CancelRegistry>,
) -> Result<String, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = map.remove(&model_name) {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
        Ok(format!("Cancelled download for {}", model_name))
    } else {
        Err(format!("No active download found for {}", model_name))
    }
}

#[tauri::command]
async fn delete_ollama_model_command(model_name: String) -> Result<String, String> {
    ollama::client::delete_ollama_model(model_name).await
}

/// Full status of the local Ollama installation.
#[derive(Debug, Clone, serde::Serialize)]
struct OllamaStatus {
    installed: bool,
    running: bool,
    version: Option<String>,
}

#[tauri::command]
async fn check_ollama_status_command() -> Result<OllamaStatus, String> {
    // 1. Check if the `ollama` binary exists.
    //
    // macOS .app bundles launch with a stripped PATH (/usr/bin:/bin:/usr/sbin:/sbin),
    // so `ollama` — which installs to /usr/local/bin — is not found via a plain
    // Command::new("ollama") lookup. We probe known install locations explicitly
    // as a fallback.
    let candidate_paths = [
        // Resolve via PATH first (works in terminal / dev mode)
        "ollama".to_string(),
        // Homebrew / official macOS installer default
        "/usr/local/bin/ollama".to_string(),
        // Apple Silicon Homebrew prefix
        "/opt/homebrew/bin/ollama".to_string(),
        // Linux / custom installs
        "/usr/bin/ollama".to_string(),
        // User-local install
        format!("{}/.local/bin/ollama", std::env::var("HOME").unwrap_or_default()),
    ];

    let mut installed = false;
    let mut version: Option<String> = None;

    for path in &candidate_paths {
        if path.is_empty() { continue; }
        if let Ok(out) = std::process::Command::new(path).arg("--version").output() {
            if out.status.success() {
                installed = true;
                version = Some(String::from_utf8_lossy(&out.stdout).trim().to_string());
                break;
            }
        }
    }

    // 2. Check if the Ollama daemon is accepting connections
    let running = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_default()
        .get("http://localhost:11434")
        .send()
        .await
        .is_ok();

    // If the HTTP endpoint responds, Ollama is definitely installed & running —
    // even if we couldn't find the binary on PATH.
    let installed = installed || running;

    Ok(OllamaStatus { installed, running, version })
}

#[tauri::command]
async fn start_ollama_command() -> Result<String, String> {
    // Probe known install locations — macOS .app bundles have a stripped PATH
    let candidate_paths = [
        "ollama".to_string(),
        "/usr/local/bin/ollama".to_string(),
        "/opt/homebrew/bin/ollama".to_string(),
        "/usr/bin/ollama".to_string(),
        format!("{}/.local/bin/ollama", std::env::var("HOME").unwrap_or_default()),
    ];

    let ollama_bin = candidate_paths
        .iter()
        .find(|p| {
            if p.is_empty() { return false; }
            // For bare names like "ollama", try a quick which-style check
            if !p.contains('/') {
                std::process::Command::new(p).arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
            } else {
                std::path::Path::new(p.as_str()).exists()
            }
        })
        .cloned()
        .unwrap_or_else(|| "ollama".to_string());

    std::process::Command::new(&ollama_bin)
        .arg("serve")
        .spawn()
        .map(|_| "Ollama started".to_string())
        .map_err(|e| format!("Could not start Ollama (tried '{}'): {}", ollama_bin, e))
}

#[tauri::command]
async fn sync_calendar_deadlines_command(state: State<'_, DbState>) -> Result<Vec<SyncedCalendarEvent>, String> {
    calendar::sync::sync_calendar_deadlines(&state.0).await
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    // Only allow http and https schemes to prevent file:// and app bundle opens
    let lower = url.trim().to_lowercase();
    if !lower.starts_with("https://") && !lower.starts_with("http://") {
        return Err(format!("Blocked: only http/https URLs are allowed (got: {})", &url[..url.len().min(40)]));
    }
    let opened = std::process::Command::new("/usr/bin/open")
        .arg(&url)
        .spawn()
        .is_ok();
    if !opened {
        open::that(&url).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn publish_linkedin_post_command(text: String, state: State<'_, DbState>) -> Result<String, String> {
    linkedin::api::publish_linkedin_post(&state.0, text).await
}

#[tauri::command]
async fn get_morning_brief_command(state: State<'_, DbState>) -> Result<String, String> {
    brief::generator::get_or_generate_brief(&state.0).await
}

#[tauri::command]
async fn refresh_morning_brief_command(state: State<'_, DbState>) -> Result<String, String> {
    // Force-clear today's cached brief then regenerate
    {
        let now = db::now_iso();
        let today = &now[..10];
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM morning_briefs WHERE date = ?1", rusqlite::params![today]).ok();
    }
    brief::generator::get_or_generate_brief(&state.0).await
}

#[tauri::command]
async fn save_knowledge_item_command(
    content: String,
    url: Option<String>,
    source: Option<String>,
    state: State<'_, DbState>
) -> Result<db::KnowledgeItem, String> {
    memory::knowledge::capture_and_tag(
        &state.0,
        content,
        url,
        source.unwrap_or_else(|| "manual".into()),
    ).await
}

#[tauri::command]
fn get_knowledge_items_command(state: State<'_, DbState>) -> Result<Vec<db::KnowledgeItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_knowledge_items(&conn, 50).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_decision_command(
    decision: String,
    rationale: String,
    alternatives: Option<String>,
    state: State<'_, DbState>
) -> Result<db::Decision, String> {
    memory::decisions::log_decision(&state.0, decision, rationale, alternatives)
}

#[tauri::command]
fn get_decisions_command(state: State<'_, DbState>) -> Result<Vec<db::Decision>, String> {
    memory::decisions::fetch_decisions(&state.0, 50)
}

#[tauri::command]
fn update_decision_outcome_command(
    id: String,
    outcome: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    memory::decisions::update_decision_outcome(&state.0, id, outcome)
}

#[tauri::command]
fn record_feed_interaction_command(
    item_id: String,
    item_source: String,
    tags: String,
    action: String,
    state: State<'_, DbState>
) -> Result<(), String> {
    intelligence::interest::record_user_interaction(&state.0, item_id, item_source, tags, action)
}

#[tauri::command]
async fn get_weekly_review_command(state: State<'_, DbState>) -> Result<String, String> {
    intelligence::weekly::get_or_generate_weekly_review(&state.0).await
}

#[tauri::command]
async fn refresh_weekly_review_command(state: State<'_, DbState>) -> Result<String, String> {
    // Clear current week's review cache then regenerate
    {
        let week_key = intelligence::weekly::get_current_week_key();
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM weekly_reviews WHERE week = ?1", rusqlite::params![week_key]).ok();
    }
    intelligence::weekly::get_or_generate_weekly_review(&state.0).await
}

#[tauri::command]
fn speak_text_command(text: String, app: tauri::AppHandle) -> Result<(), String> {
    speech::speak_text(&text)?;
    // Start background watcher — emits "speech-ended" when macOS `say` process finishes
    speech::watch_speech_completion(app);
    Ok(())
}

#[tauri::command]
fn stop_speech_command() {
    speech::stop_speech();
}

// ─── Research / Web Search Commands ──────────────────────────────────────────

#[tauri::command]
async fn web_search_command(query: String) -> Result<research::SearchResponse, String> {
    research::web_search(&query).await
}

#[tauri::command]
async fn summarize_search_command(query: String, results: Vec<research::SearchResult>, state: State<'_, DbState>) -> Result<String, String> {
    research::summarize_results(&query, &results, &state.0).await
}

#[tauri::command]
fn get_vault_path_command(state: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_app_setting(&conn, "vault_path").map_err(|e| e.to_string())
}

#[tauri::command]
fn set_vault_path_command(path: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::set_app_setting(&conn, "vault_path", &path).map_err(|e| e.to_string())
}

// ─── User-provided OAuth Credentials ─────────────────────────────────────────
// Users bring their own Google / LinkedIn OAuth app credentials.
// Stored locally in SQLite app_settings — never sent anywhere.

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct OAuthCredentials {
    google_client_id: Option<String>,
    google_client_secret: Option<String>,
    linkedin_client_id: Option<String>,
    linkedin_client_secret: Option<String>,
}

#[tauri::command]
fn get_oauth_credentials_command(state: State<'_, DbState>) -> Result<OAuthCredentials, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let get = |key: &str| -> Option<String> {
        db::get_app_setting(&conn, key).ok().flatten().filter(|v| !v.is_empty())
    };
    Ok(OAuthCredentials {
        google_client_id:      get("oauth_google_client_id"),
        google_client_secret:  get("oauth_google_client_secret"),
        linkedin_client_id:    get("oauth_linkedin_client_id"),
        linkedin_client_secret: get("oauth_linkedin_client_secret"),
    })
}

#[tauri::command]
fn save_oauth_credentials_command(
    google_client_id: Option<String>,
    google_client_secret: Option<String>,
    linkedin_client_id: Option<String>,
    linkedin_client_secret: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // For each field: Some("value") → save it, Some("") → delete it, None → leave unchanged
    let upsert = |key: &str, val: &Option<String>| -> Result<(), String> {
        match val {
            Some(v) if !v.trim().is_empty() => {
                db::set_app_setting(&conn, key, v.trim()).map_err(|e| e.to_string())
            }
            Some(_) => {
                // Explicit empty string — remove the setting so get_ returns None
                conn.execute(
                    "DELETE FROM app_settings WHERE key = ?1",
                    rusqlite::params![key],
                ).map(|_| ()).map_err(|e| e.to_string())
            }
            None => Ok(()), // field not included in request — leave DB unchanged
        }
    };

    upsert("oauth_google_client_id",     &google_client_id)?;
    upsert("oauth_google_client_secret", &google_client_secret)?;
    upsert("oauth_linkedin_client_id",   &linkedin_client_id)?;
    upsert("oauth_linkedin_client_secret", &linkedin_client_secret)?;

    Ok(())
}

#[tauri::command]
fn clear_oauth_credentials_command(service: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    match service.as_str() {
        "google" => {
            conn.execute(
                "DELETE FROM app_settings WHERE key IN ('oauth_google_client_id', 'oauth_google_client_secret')",
                [],
            ).map_err(|e| e.to_string())?;
        }
        "linkedin" => {
            conn.execute(
                "DELETE FROM app_settings WHERE key IN ('oauth_linkedin_client_id', 'oauth_linkedin_client_secret')",
                [],
            ).map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
fn add_custom_feed_command(
    title: String,
    url: String,
    category: Option<String>,
    state: State<'_, DbState>
) -> Result<db::CustomFeed, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::save_custom_feed(&conn, &title, &url, category.as_deref().unwrap_or("custom")).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_custom_feeds_command(state: State<'_, DbState>) -> Result<Vec<db::CustomFeed>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_custom_feeds(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_custom_feed_command(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_custom_feed(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn deep_read_url_command(url: String, state: State<'_, DbState>) -> Result<String, String> {
    reader::deep_read_url(&url, &state.0).await
}

// ─── Analytics Commands ──────────────────────────────────────────────────────

#[tauri::command]
fn get_response_analytics_command(days: i64, state: State<'_, DbState>) -> Result<Vec<db::ResponseAnalytics>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_response_analytics(&conn, days).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_avg_response_time_by_category_command(days: i64, state: State<'_, DbState>) -> Result<Vec<(String, f64)>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_avg_response_time_by_category(&conn, days).map_err(|e| e.to_string())
}

// ─── Productivity: Tasks Commands ────────────────────────────────────────────

#[tauri::command]
fn create_task_command(
    title: String,
    description: Option<String>,
    source_item_id: Option<String>,
    due_date: Option<String>,
    priority: Option<String>,
    state: State<'_, DbState>
) -> Result<db::Task, String> {
    let id = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let ns = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        format!("task_{:x}", ns)
    };
    let task = db::Task {
        id: id.clone(),
        title,
        description,
        source_item_id,
        due_date,
        priority: priority.unwrap_or_else(|| "medium".into()),
        status: "pending".into(),
        created_at: db::now_iso(),
        completed_at: None,
    };
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::create_task(&conn, &task).map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
fn get_tasks_command(status_filter: Option<String>, state: State<'_, DbState>) -> Result<Vec<db::Task>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_tasks(&conn, status_filter.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_task_status_command(id: String, status: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::update_task_status(&conn, &id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_task_command(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_task(&conn, &id).map_err(|e| e.to_string())
}

// ─── Productivity: Reminders Commands ────────────────────────────────────────

#[tauri::command]
fn create_reminder_command(
    item_id: String,
    reminder_date: String,
    message: String,
    state: State<'_, DbState>
) -> Result<db::Reminder, String> {
    let id = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let ns = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        format!("reminder_{:x}", ns)
    };
    let reminder = db::Reminder {
        id: id.clone(),
        item_id,
        reminder_date,
        message,
        status: "pending".into(),
        created_at: db::now_iso(),
        triggered_at: None,
    };
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::create_reminder(&conn, &reminder).map_err(|e| e.to_string())?;
    Ok(reminder)
}

#[tauri::command]
fn get_pending_reminders_command(state: State<'_, DbState>) -> Result<Vec<db::Reminder>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_pending_reminders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_reminders_command(state: State<'_, DbState>) -> Result<Vec<db::Reminder>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_reminders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn mark_reminder_triggered_command(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::mark_reminder_triggered(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_reminder_command(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_reminder(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn snooze_reminder_command(id: String, new_date: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::snooze_reminder(&conn, &id, &new_date).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_task_from_item_command(
    item_id: String,
    title: String,
    description: Option<String>,
    priority: Option<String>,
    state: State<'_, DbState>,
) -> Result<db::Task, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if db::task_exists_for_source(&conn, &item_id).unwrap_or(false) {
        return Err("A task already exists for this email.".into());
    }
    let id = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let ns = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        format!("task_{:x}", ns)
    };
    let task = db::Task {
        id: id.clone(),
        title,
        description,
        source_item_id: Some(item_id),
        due_date: None,
        priority: priority.unwrap_or_else(|| "medium".into()),
        status: "pending".into(),
        created_at: db::now_iso(),
        completed_at: None,
    };
    db::create_task(&conn, &task).map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
fn export_analytics_summary_command(content: String, state: State<'_, DbState>) -> Result<String, String> {
    vault::write_analytics_summary(&state.0, &content)
}

// ─── Productivity: Pomodoro Commands ─────────────────────────────────────────

#[tauri::command]
fn start_pomodoro_command(
    task_id: Option<String>,
    duration_minutes: i64,
    state: State<'_, DbState>
) -> Result<db::PomodoroSession, String> {
    let id = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let ns = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        format!("pomo_{:x}", ns)
    };
    let session = db::PomodoroSession {
        id: id.clone(),
        task_id,
        duration_minutes,
        completed: false,
        started_at: db::now_iso(),
        ended_at: None,
    };
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::create_pomodoro_session(&conn, &session).map_err(|e| e.to_string())?;
    Ok(session)
}

#[tauri::command]
fn complete_pomodoro_command(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::complete_pomodoro_session(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_pomodoro_sessions_command(days: i64, state: State<'_, DbState>) -> Result<Vec<db::PomodoroSession>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_pomodoro_sessions(&conn, days).map_err(|e| e.to_string())
}

// ─── Data Management Commands ─────────────────────────────────────────────────

/// Returns row counts for each cleanable data category so the UI can show
/// what will be affected before the user confirms.
#[derive(Debug, serde::Serialize)]
struct DataStats {
    gmail_messages: i64,
    gmail_handled: i64,    // sent/skipped/approved — safe to purge first
    gmail_suppressed: i64, // triage_status=suppressed
    gmail_informational: i64,
    voice_edits: i64,
    response_analytics: i64,
    morning_briefs: i64,
    weekly_reviews: i64,
    feed_items: i64,
    feed_interactions: i64,
    knowledge_items: i64,
    decisions: i64,
    life_events: i64,
    tasks: i64,
    social_posts: i64,
    reminders: i64,
    pomodoro_sessions: i64,
}

#[tauri::command]
fn get_data_stats_command(state: State<'_, DbState>) -> Result<DataStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let q = |sql: &str| -> i64 {
        conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap_or(0)
    };
    Ok(DataStats {
        gmail_messages:      q("SELECT COUNT(*) FROM queue_items WHERE source='gmail'"),
        gmail_handled:       q("SELECT COUNT(*) FROM queue_items WHERE source='gmail' AND status IN ('sent','skipped','approved','edited')"),
        gmail_suppressed:    q("SELECT COUNT(*) FROM queue_items WHERE source='gmail' AND triage_status='suppressed'"),
        gmail_informational: q("SELECT COUNT(*) FROM queue_items WHERE source='gmail' AND triage_status='informational'"),
        voice_edits:         q("SELECT COUNT(*) FROM voice_edits"),
        response_analytics:  q("SELECT COUNT(*) FROM response_analytics"),
        morning_briefs:      q("SELECT COUNT(*) FROM morning_briefs"),
        weekly_reviews:      q("SELECT COUNT(*) FROM weekly_reviews"),
        feed_items:          q("SELECT COUNT(*) FROM feed_items"),
        feed_interactions:   q("SELECT COUNT(*) FROM feed_interactions"),
        knowledge_items:     q("SELECT COUNT(*) FROM knowledge_items"),
        decisions:           q("SELECT COUNT(*) FROM decisions"),
        life_events:         q("SELECT COUNT(*) FROM life_events"),
        tasks:               q("SELECT COUNT(*) FROM tasks"),
        social_posts:        q("SELECT COUNT(*) FROM social_posts"),
        reminders:           q("SELECT COUNT(*) FROM reminders"),
        pomodoro_sessions:   q("SELECT COUNT(*) FROM pomodoro_sessions"),
    })
}

/// Clear only cached Gmail messages (queue_items where source='gmail').
/// Preserves: credentials, OAuth tokens, app_settings, knowledge, decisions,
/// life events, tasks — everything that is "about you".
#[tauri::command]
fn clear_gmail_cache_command(
    handled_only: bool,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sql = if handled_only {
        "DELETE FROM queue_items WHERE source='gmail' AND status IN ('sent','skipped','approved','edited')"
    } else {
        "DELETE FROM queue_items WHERE source='gmail'"
    };
    let rows = conn.execute(sql, []).map_err(|e| e.to_string())? as i64;
    // Also clean up orphaned analytics/reminders for deleted items
    conn.execute(
        "DELETE FROM response_analytics WHERE queue_item_id NOT IN (SELECT id FROM queue_items)",
        [],
    ).ok();
    conn.execute(
        "DELETE FROM reminders WHERE item_id NOT IN (SELECT id FROM queue_items)
         AND item_id NOT LIKE 'life:%'",
        [],
    ).ok();
    Ok(rows)
}

/// Reset only AI-generated caches (briefs, feed items, analytics).
/// Preserves all user data: emails, knowledge, decisions, life events.
#[tauri::command]
fn clear_ai_cache_command(state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM morning_briefs",    []).ok();
    conn.execute("DELETE FROM weekly_reviews",    []).ok();
    conn.execute("DELETE FROM feed_items",        []).ok();
    conn.execute("DELETE FROM feed_interactions", []).ok();
    conn.execute("DELETE FROM voice_edits",       []).ok();
    conn.execute("DELETE FROM response_analytics",[]).ok();
    conn.execute("DELETE FROM social_posts WHERE status='skipped'", []).ok();
    Ok(())
}

/// Full system reset — wipes all app data EXCEPT:
///   - OAuth credentials (Gmail + LinkedIn tokens)
///   - App settings (OAuth client IDs, vault path, sync interval)
/// Ollama models are stored on disk by Ollama, not in this DB, so they are
/// never touched regardless.
#[tauri::command]
fn reset_all_data_command(state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // Operational data
    conn.execute("DELETE FROM queue_items",        []).ok();
    conn.execute("DELETE FROM calendar_events",    []).ok();
    conn.execute("DELETE FROM response_analytics", []).ok();
    conn.execute("DELETE FROM voice_edits",        []).ok();
    // AI caches
    conn.execute("DELETE FROM morning_briefs",     []).ok();
    conn.execute("DELETE FROM weekly_reviews",     []).ok();
    conn.execute("DELETE FROM feed_items",         []).ok();
    conn.execute("DELETE FROM feed_interactions",  []).ok();
    // Personal memory — intentionally cleared in full reset
    conn.execute("DELETE FROM knowledge_items",    []).ok();
    conn.execute("DELETE FROM decisions",          []).ok();
    conn.execute("DELETE FROM life_events",        []).ok();
    conn.execute("DELETE FROM tasks",              []).ok();
    conn.execute("DELETE FROM reminders",          []).ok();
    conn.execute("DELETE FROM social_posts",       []).ok();
    conn.execute("DELETE FROM pomodoro_sessions",  []).ok();
    conn.execute("DELETE FROM daily_habits",       []).ok();
    conn.execute("DELETE FROM habit_completions",  []).ok();
    conn.execute("DELETE FROM habit_reminders",    []).ok();
    conn.execute("DELETE FROM active_projects",    []).ok();
    conn.execute("DELETE FROM project_time_logs",  []).ok();
    conn.execute("DELETE FROM daily_intel",        []).ok();
    conn.execute("DELETE FROM custom_feeds",       []).ok();
    // Preserve: credentials, app_settings (OAuth keys, vault path, etc.)
    Ok(())
}



/// Ask Ollama whether the raw user input needs clarification before processing.
/// Returns a list of 1–2 focused follow-up questions, or an empty Vec if the
/// input is already complete enough to act on.
/// Fails fast (8 s timeout) — callers should skip straight to save on error.
#[tauri::command]
async fn ask_clarification_command(text: String) -> Result<Vec<String>, String> {
    let prompt = format!(
        r#"You are a smart personal assistant. A user just told you something about their life, plans, or goals.

Decide whether you need 1–2 focused follow-up questions to make their input more actionable.

USER INPUT: "{}"

RULES:
- If the input already has enough detail (who, what, when, why), return an empty array: []
- If genuinely unclear or missing key context, return 1–2 SHORT, specific questions
- Questions must be direct and easy to answer in one sentence
- Do NOT ask about things that don't matter for planning or storing the information
- NEVER ask more than 2 questions
- Return ONLY valid JSON — an array of strings: ["question 1", "question 2"] or []
- No explanation, no markdown, no wrapper object"#,
        text
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap_or_default();

    let models = ["llama3", "qwen2.5", "mistral", "gemma", "phi3", "llama3:70b"];

    for model in &models {
        let body = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
            "options": { "num_predict": 120, "temperature": 0.3 }
        });
        let Ok(resp) = client
            .post("http://127.0.0.1:11434/api/generate")
            .json(&body)
            .send()
            .await
        else {
            return Err("Ollama unreachable".into());
        };
        if resp.status().as_u16() == 404 {
            continue; // model not installed
        }
        if !resp.status().is_success() {
            continue;
        }
        let Ok(json) = resp.json::<serde_json::Value>().await else {
            continue;
        };
        let raw = json["response"].as_str().unwrap_or("").trim().to_string();

        // Extract JSON array from the response
        let start = raw.find('[').unwrap_or(0);
        let end = raw.rfind(']').map(|i| i + 1).unwrap_or(raw.len());
        let slice = &raw[start..end];

        if let Ok(questions) = serde_json::from_str::<Vec<String>>(slice) {
            // Clamp to max 2, filter empty strings
            let clean: Vec<String> = questions
                .into_iter()
                .filter(|q| !q.trim().is_empty())
                .take(2)
                .collect();
            return Ok(clean);
        }
    }

    // If Ollama is offline or all models failed — return empty (skip clarification)
    Ok(vec![])
}

#[tauri::command]
async fn capture_life_event_command(text: String, state: State<'_, DbState>) -> Result<db::LifeEvent, String> {
    // Try Ollama first; fallback to heuristic plan if offline
    let plan = match planner::parse_life_event(&text, Some(&state.0)).await {
        Ok(p) => p,
        Err(_) => planner::fallback_plan(&text),
    };
    planner::create_life_plan(&state.0, &text, &plan)
}

#[tauri::command]
fn get_life_events_command(state: State<'_, DbState>) -> Result<Vec<db::LifeEvent>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_life_events(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_life_event_status_command(id: String, status: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::update_life_event_status(&conn, &id, &status).map_err(|e| e.to_string())
}

// ─── Active Life: Projects ────────────────────────────────────────────────────

#[tauri::command]
fn get_active_projects_command(state: State<'_, DbState>) -> Result<Vec<active_life::projects::ActiveProject>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::projects::get_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_active_project_command(req: active_life::projects::NewProject, state: State<'_, DbState>) -> Result<active_life::projects::ActiveProject, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::projects::create_project(&conn, &req).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_active_project_command(
    id: String,
    name: Option<String>,
    description: Option<String>,
    status: Option<String>,
    daily_target_minutes: Option<i64>,
    color: Option<String>,
    state: State<'_, DbState>
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::projects::update_project(
        &conn, &id,
        name.as_deref(),
        description.as_ref().map(|d| Some(d.as_str())),
        status.as_deref(),
        daily_target_minutes,
        color.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_active_project_command(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::projects::delete_project(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn log_project_session_command(
    project_id: String,
    minutes: i64,
    notes: Option<String>,
    state: State<'_, DbState>
) -> Result<active_life::projects::ProjectTimeLog, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::projects::log_project_session(&conn, &project_id, minutes, notes.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_project_time_logs_command(project_id: String, days: i64, state: State<'_, DbState>) -> Result<Vec<active_life::projects::ProjectTimeLog>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::projects::get_project_time_logs(&conn, &project_id, days).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_time_logs_command(days: i64, state: State<'_, DbState>) -> Result<Vec<active_life::projects::ProjectTimeLog>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::projects::get_all_time_logs_recent(&conn, days).map_err(|e| e.to_string())
}

// ─── Active Life: Habits ──────────────────────────────────────────────────────

#[tauri::command]
fn get_daily_habits_command(state: State<'_, DbState>) -> Result<Vec<active_life::habits::DailyHabit>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::habits::get_habits(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_daily_habit_command(req: active_life::habits::NewHabit, state: State<'_, DbState>) -> Result<active_life::habits::DailyHabit, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::habits::create_habit(&conn, &req).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_daily_habit_command(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::habits::delete_habit(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_habit_completion_command(habit_id: String, state: State<'_, DbState>) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::habits::toggle_habit_completion(&conn, &habit_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_habit_completions_command(days: i64, state: State<'_, DbState>) -> Result<Vec<active_life::habits::HabitCompletion>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::habits::get_habit_completions_range(&conn, days).map_err(|e| e.to_string())
}

// ─── Active Life: Daily Intel ─────────────────────────────────────────────────

#[tauri::command]
async fn get_daily_intel_command(force_refresh: bool, state: State<'_, DbState>) -> Result<active_life::motivation::DailyIntel, String> {
    active_life::motivation::get_or_generate_daily_intel(&state.0, force_refresh).await
}

#[tauri::command]
async fn generate_day_plan_command(state: State<'_, DbState>) -> Result<String, String> {
    active_life::day_planner::generate_day_plan(&state.0).await
}

#[tauri::command]
async fn generate_social_post_command(
    platform: String,
    idea: String,
    format: String,
    state: State<'_, DbState>
) -> Result<active_life::social_advisor::GeneratedPost, String> {
    active_life::social_advisor::generate_full_post(&state.0, &platform, &idea, &format).await
}

// ─── Tray / Window Commands ───────────────────────────────────────────────────

#[tauri::command]
fn show_main_window_command(app: tauri::AppHandle) -> Result<(), String> {
    tray::show_window(&app);
    Ok(())
}

// ─── Active Life: Habit Reminders ────────────────────────────────────────────

#[tauri::command]
fn get_habit_reminders_command(state: State<'_, DbState>) -> Result<Vec<active_life::reminders::HabitReminder>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::reminders::get_reminders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_habit_reminder_command(
    req: active_life::reminders::NewHabitReminder,
    state: State<'_, DbState>
) -> Result<active_life::reminders::HabitReminder, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::reminders::create_reminder(&conn, &req).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_habit_reminder_command(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::reminders::delete_reminder(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_habit_reminder_command(id: String, enabled: bool, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    active_life::reminders::toggle_reminder(&conn, &id, enabled).map_err(|e| e.to_string())
}

// ─── AI Tone Refinement ───────────────────────────────────────────────────────

#[tauri::command]
async fn regenerate_draft_command(
    original_draft: String,
    sender_name: String,
    tone: String,
) -> Result<String, String> {
    let tone_instruction = match tone.as_str() {
        "shorter"      => "Rewrite this email reply to be much shorter — 1-2 sentences max. Preserve the core message.",
        "formal"       => "Rewrite this email reply in a formal, professional business tone. Use complete sentences and polished language.",
        "availability" => "Rewrite this email reply to politely indicate you need to check your schedule and ask the sender to propose a few time slots.",
        _              => "Rewrite this email reply to be clearer and more professional.",
    };
    let prompt = format!(
        "{}\n\nSender: {}\nOriginal draft:\n{}\n\nReturn ONLY the rewritten reply text. No subject line, no explanation.",
        tone_instruction, sender_name, original_draft
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .unwrap_or_default();
    let models = ["qwen2.5", "llama3", "mistral", "gemma", "phi3", "llama3:70b"];
    for model in &models {
        let body = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
            "options": { "temperature": 0.4 }
        });
        if let Ok(resp) = client.post("http://localhost:11434/api/generate").json(&body).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(text) = json["response"].as_str() {
                        let trimmed = text.trim().to_string();
                        if !trimmed.is_empty() {
                            return Ok(trimmed);
                        }
                    }
                }
            } else if resp.status().as_u16() == 404 {
                continue; // model not installed, try next
            }
        }
    }
    Err("Ollama unavailable — no model responded for tone refinement".into())
}

// ─── AI Social Content Generation ────────────────────────────────────────────

#[tauri::command]
async fn generate_social_content_command(
    _platform: String,
    topic: String,
    tone: String,
) -> Result<String, String> {
    let platform_context = "LinkedIn (professional, 150-300 words, 3-5 relevant hashtags)";

    let tone_instruction = match tone.as_str() {
        "punchy"     => "Write in a bold, direct, high-energy tone. Lead with a strong hook.",
        "detailed"   => "Write in a thorough, analytical tone with concrete specifics.",
        "thread"     => "Write as a numbered thread (1/, 2/, 3/ etc). 4-6 parts.",
        "leadership" => "Write from an executive/builder perspective with strategic insights.",
        "story"      => "Tell a short story arc: problem → journey → outcome/lesson.",
        _            => "Write in a professional, authentic voice.",
    };

    let prompt = format!(
        "You are a professional social media ghostwriter. {}\n\nPlatform: {}\nTopic: {}\n\nWrite a single, complete, ready-to-post social media post. Return ONLY the post text, no explanation, no quotes around it.",
        tone_instruction, platform_context, topic
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .unwrap_or_default();

    let models = ["qwen2.5", "llama3", "mistral", "gemma", "phi3", "llama3:70b"];
    for model in &models {
        let body = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
            "options": { "temperature": 0.7 }
        });
        if let Ok(resp) = client.post("http://localhost:11434/api/generate").json(&body).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(text) = json["response"].as_str() {
                        let trimmed = text.trim().to_string();
                        if !trimmed.is_empty() {
                            return Ok(trimmed);
                        }
                    }
                }
            } else if resp.status().as_u16() == 404 {
                continue;
            }
        }
    }
    Err("Ollama unavailable for social content generation".into())
}

// ─── Social Posts Persistence ─────────────────────────────────────────────────

#[tauri::command]
fn upsert_social_post_command(
    id: String,
    platform: String,
    topic: String,
    content: String,
    hashtags: String,
    media_cue: Option<String>,
    status: String,
    created_at: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let post = db::SocialPostRecord {
        id, platform, topic, content, hashtags, media_cue, status,
        created_at, updated_at: db::now_iso(),
    };
    db::upsert_social_post(&conn, &post).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_social_posts_command(state: State<'_, DbState>) -> Result<Vec<db::SocialPostRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_social_posts(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_social_post_status_command(
    id: String,
    status: String,
    content: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::update_social_post_status(&conn, &id, &status, content.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_social_post_command(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_social_post(&conn, &id).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok(); // Automatically load .env file


    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            Some(vec!["--autostart"])
        ))
        .setup(|app| {
            // ── macOS: hide Dock icon, become menu-bar-only app ──────────────
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let app_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("wardyn.db");

            // Open main connection for DbState (owned directly, no Arc wrapping)
            let conn = Connection::open(&db_path).expect("failed to open sqlite db");
            db::init_db(&conn).expect("failed to initialize db schema");
            // Enable WAL mode so background threads can read without blocking writes
            conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;").ok();

            // ── Background: engagement monitor (every 30s) ───────────────────
            // Opens its own dedicated connection — no sharing with DbState
            {
                let bg_path = db_path.clone();
                if let Ok(bg_conn) = Connection::open(&bg_path) {
                    bg_conn.execute_batch("PRAGMA journal_mode=WAL;").ok();
                    let bg_arc = Arc::new(Mutex::new(bg_conn));
                    active_life::engagement_monitor::start_engagement_monitor(Arc::clone(&bg_arc));
                }
            }

            // ── Background: habit reminder loop (every 60s) ──────────────────
            {
                let bg_path = db_path.clone();
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    let Ok(reminder_conn) = Connection::open(&bg_path) else { return; };
                    reminder_conn.execute_batch("PRAGMA journal_mode=WAL;").ok();
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(60));
                        let now = chrono_hhmm();
                        let due = active_life::reminders::get_due_reminders(&reminder_conn, &now);
                        for reminder in due {
                            let title = format!("{} Time for your habit", reminder.habit_icon);
                            let body = format!("{} — tap to open Wardyn", reminder.habit_name);
                            fire_notification(&app_handle, &title, &body);
                        }
                    }
                });
            }

            // Manage DbState directly — no Arc, no try_unwrap race
            app.manage(DbState(Mutex::new(conn)));
            app.manage(CancelRegistry(Mutex::new(std::collections::HashMap::new())));

            // ── Setup tray icon ──────────────────────────────────────────────
            tray::setup_tray(app)?;

            // ── Register window focus-loss handler (hide on blur) ────────────
            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        // Only auto-hide if the window is not pinned
                        // For now hide on blur — user can use tray to re-open
                        let _ = win.hide();
                    }
                });
            }

            // ── Auto-start Ollama if installed but not running ───────────────
            // Runs on a plain OS thread so it doesn't need a Tokio runtime
            // (setup() runs before Tauri's async executor is active).
            std::thread::spawn(|| {
                // Small delay so the window finishes rendering first
                std::thread::sleep(std::time::Duration::from_secs(2));

                // Check if Ollama is already accepting connections (blocking)
                let already_running = std::net::TcpStream::connect_timeout(
                    &"127.0.0.1:11434".parse().unwrap(),
                    std::time::Duration::from_secs(2),
                ).is_ok();

                if already_running {
                    return;
                }

                // Not running — find the binary and start it silently
                let home = std::env::var("HOME").unwrap_or_default();
                let candidate_paths = [
                    "ollama".to_string(),
                    "/usr/local/bin/ollama".to_string(),
                    "/opt/homebrew/bin/ollama".to_string(),
                    "/usr/bin/ollama".to_string(),
                    format!("{}/.local/bin/ollama", home),
                ];

                let ollama_bin = candidate_paths.iter().find(|p| {
                    if p.is_empty() { return false; }
                    if !p.contains('/') {
                        std::process::Command::new(p).arg("--version").output()
                            .map(|o| o.status.success()).unwrap_or(false)
                    } else {
                        std::path::Path::new(p.as_str()).exists()
                    }
                }).cloned();

                if let Some(bin) = ollama_bin {
                    let _ = std::process::Command::new(&bin)
                        .arg("serve")
                        .spawn();
                    // If not installed, do nothing — the UI banner guides the user.
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_queue_items,
            send_gmail_reply_command,
            skip_queue_item,
            start_gmail_auth,
            get_gmail_auth_status,
            start_linkedin_auth,
            get_linkedin_auth_status,
            fetch_linkedin_timeline_command,
            sync_gmail_messages,
            disconnect_gmail,
            process_item_with_ollama,
            record_voice_edit_command,
            get_installed_ollama_models_command,
            install_ollama_model_command,
            cancel_model_install_command,
            delete_ollama_model_command,
            sync_calendar_deadlines_command,
            open_external_url,
            publish_linkedin_post_command,
            get_morning_brief_command,
            refresh_morning_brief_command,
            save_knowledge_item_command,
            get_knowledge_items_command,
            save_decision_command,
            get_decisions_command,
            record_feed_interaction_command,
            get_weekly_review_command,
            refresh_weekly_review_command,
            speak_text_command,
            stop_speech_command,
            get_vault_path_command,
            set_vault_path_command,
            get_oauth_credentials_command,
            save_oauth_credentials_command,
            clear_oauth_credentials_command,
            add_custom_feed_command,
            get_custom_feeds_command,
            delete_custom_feed_command,
            deep_read_url_command,
            get_response_analytics_command,
            get_avg_response_time_by_category_command,
            export_analytics_summary_command,
            create_task_command,
            get_tasks_command,
            update_task_status_command,
            delete_task_command,
            create_reminder_command,
            get_pending_reminders_command,
            get_reminders_command,
            mark_reminder_triggered_command,
            delete_reminder_command,
            snooze_reminder_command,
            create_task_from_item_command,
            start_pomodoro_command,
            complete_pomodoro_command,
            get_pomodoro_sessions_command,
            capture_life_event_command,
            ask_clarification_command,
            get_data_stats_command,
            clear_gmail_cache_command,
            clear_ai_cache_command,
            reset_all_data_command,
            get_life_events_command,
            update_life_event_status_command,
            // Active Life
            get_active_projects_command,
            create_active_project_command,
            update_active_project_command,
            delete_active_project_command,
            log_project_session_command,
            get_project_time_logs_command,
            get_all_time_logs_command,
            get_daily_habits_command,
            create_daily_habit_command,
            delete_daily_habit_command,
            toggle_habit_completion_command,
            get_habit_completions_command,
            get_daily_intel_command,
            generate_day_plan_command,
            generate_social_post_command,
            // Tray
            show_main_window_command,
            // Habit Reminders
            get_habit_reminders_command,
            create_habit_reminder_command,
            delete_habit_reminder_command,
            toggle_habit_reminder_command,
            check_ollama_status_command,
            start_ollama_command,
            web_search_command,
            summarize_search_command,
            regenerate_draft_command,
            generate_social_content_command,
            update_decision_outcome_command,
            upsert_social_post_command,
            get_social_posts_command,
            update_social_post_status_command,
            delete_social_post_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

