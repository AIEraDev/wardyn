pub mod models;
pub mod db;
pub mod gmail;
pub mod ollama;
pub mod calendar;

use std::sync::Mutex;
use rusqlite::Connection;
use tauri::{State, Manager};
use models::QueueItem;
use db::SyncedCalendarEvent;
use gmail::send::SendEmailRequest;

pub struct DbState(pub Mutex<Connection>);

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
fn get_gmail_auth_status(state: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let creds = db::get_credentials(&conn, "gmail").map_err(|e| e.to_string())?;
    Ok(creds.and_then(|c| c.email))
}

#[tauri::command]
async fn sync_gmail_messages(state: State<'_, DbState>) -> Result<usize, String> {
    gmail::sync::sync_gmail_messages(&state.0).await
}

#[tauri::command]
fn disconnect_gmail(state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_credentials(&conn, "gmail").map_err(|e| e.to_string())
}

#[tauri::command]
async fn process_item_with_ollama(id: String, state: State<'_, DbState>) -> Result<QueueItem, String> {
    let item = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let items = db::get_all_queue_items(&conn).map_err(|e| e.to_string())?;
        items.into_iter().find(|i| i.id == id).ok_or_else(|| "Item not found".to_string())?
    };

    let result = ollama::client::classify_and_draft_item(&item).await;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE queue_items SET flagged = ?1, draft_text = ?2, confidence = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![
            if result.flagged { 1 } else { 0 },
            result.draft_text,
            result.confidence,
            "2026-07-30T23:38:00Z",
            id
        ],
    ).map_err(|e| e.to_string())?;

    let updated_items = db::get_all_queue_items(&conn).map_err(|e| e.to_string())?;
    updated_items.into_iter().find(|i| i.id == id).ok_or_else(|| "Item not found".to_string())
}

#[tauri::command]
async fn sync_calendar_deadlines_command(state: State<'_, DbState>) -> Result<Vec<SyncedCalendarEvent>, String> {
    calendar::sync::sync_calendar_deadlines(&state.0).await
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open::that(url).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok(); // Automatically load .env file

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            Some(vec!["--autostart"])
        ))
        .setup(|app| {
            let app_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("wardyn.db");
            
            let conn = Connection::open(&db_path).expect("failed to open sqlite db");
            db::init_db(&conn).expect("failed to initialize db schema");
            
            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_queue_items,
            send_gmail_reply_command,
            skip_queue_item,
            start_gmail_auth,
            get_gmail_auth_status,
            sync_gmail_messages,
            disconnect_gmail,
            process_item_with_ollama,
            sync_calendar_deadlines_command,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
