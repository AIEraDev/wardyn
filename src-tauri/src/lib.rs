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
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Offset from UTC to local: approximate via env TZ. For accuracy we use
    // a simple modulo — sufficient for minute-level scheduling.
    // Full local tz would require chrono crate; keeping dep-free:
    let total_mins = (secs / 60) % (24 * 60);
    let h = total_mins / 60;
    let m = total_mins % 60;
    format!("{:02}:{:02}", h, m)
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
        let items = db::get_all_queue_items(&conn).map_err(|e| e.to_string())?;
        items.into_iter().find(|i| i.id == id).ok_or_else(|| "Item not found".to_string())?
    };

    let outcome = ollama::client::classify_and_draft_item(&item, Some(&state.0)).await;
    let result = outcome.result;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    let urgency_val = result.urgency.as_deref().unwrap_or("high");
    conn.execute(
        "UPDATE queue_items SET flagged = ?1, draft_text = ?2, confidence = ?3, updated_at = ?4, urgency = ?5 WHERE id = ?6",
        rusqlite::params![
            if result.flagged { 1 } else { 0 },
            result.draft_text,
            result.confidence,
            now,
            urgency_val,
            id
        ],
    ).map_err(|e| e.to_string())?;

    db::set_draft_generation_time_ms(&conn, &id, outcome.generation_time_ms).map_err(|e| e.to_string())?;

    let updated_items = db::get_all_queue_items(&conn).map_err(|e| e.to_string())?;
    updated_items.into_iter().find(|i| i.id == id).ok_or_else(|| "Item not found".to_string())
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

#[tauri::command]
async fn sync_calendar_deadlines_command(state: State<'_, DbState>) -> Result<Vec<SyncedCalendarEvent>, String> {
    calendar::sync::sync_calendar_deadlines(&state.0).await
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open::that(&url).or_else(|_| {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
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
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM weekly_reviews", []).ok();
    }
    intelligence::weekly::get_or_generate_weekly_review(&state.0).await
}

#[tauri::command]
fn speak_text_command(text: String) -> Result<(), String> {
    speech::speak_text(&text)
}

#[tauri::command]
fn stop_speech_command() {
    speech::stop_speech();
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
async fn deep_read_url_command(url: String) -> Result<String, String> {
    reader::deep_read_url(&url).await
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
    let id = format!("task_{}", db::now_iso().replace(':', "-").replace('.', "-"));
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
    let id = format!("reminder_{}", db::now_iso().replace(':', "-").replace('.', "-"));
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
    let id = format!("task_{}", db::now_iso().replace(':', "-").replace('.', "-"));
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
    let id = format!("pomo_{}", db::now_iso().replace(':', "-").replace('.', "-"));
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

// ─── Life Intelligence Commands ───────────────────────────────────────────────

#[tauri::command]
async fn capture_life_event_command(text: String, state: State<'_, DbState>) -> Result<db::LifeEvent, String> {
    // Try Ollama first; fallback to heuristic plan if offline
    let plan = match planner::parse_life_event(&text).await {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok(); // Automatically load .env file

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
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

            let conn = Connection::open(&db_path).expect("failed to open sqlite db");
            db::init_db(&conn).expect("failed to initialize db schema");

            let conn_arc = Arc::new(Mutex::new(conn));

            // ── Background: engagement monitor (every 30s) ───────────────────
            active_life::engagement_monitor::start_engagement_monitor(Arc::clone(&conn_arc));

            // ── Background: habit reminder loop (every 60s) ──────────────────
            {
                let reminder_conn = Arc::clone(&conn_arc);
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(60));

                        // Get current HH:MM in local time
                        let now = chrono_hhmm();

                        let due = if let Ok(conn) = reminder_conn.lock() {
                            active_life::reminders::get_due_reminders(&conn, &now)
                        } else {
                            vec![]
                        };

                        for reminder in due {
                            // Fire a native notification for each due, not-yet-done habit
                            let title = format!("{} Time for your habit", reminder.habit_icon);
                            let body = format!("{} — tap to open Wardyn", reminder.habit_name);
                            fire_notification(&app_handle, &title, &body);
                        }
                    }
                });
            }

            // ── Extract inner connection for managed state ───────────────────
            let inner_conn = Arc::try_unwrap(conn_arc)
                .unwrap_or_else(|arc| Mutex::new({
                    let _c = arc.lock().unwrap();
                    let path = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")).join("wardyn.db");
                    Connection::open(&path).expect("failed to re-open db")
                }));

            app.manage(DbState(inner_conn));
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
            toggle_habit_reminder_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

