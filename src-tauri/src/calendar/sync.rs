use rusqlite::Connection;
use crate::db::{self, SyncedCalendarEvent};

pub async fn sync_calendar_deadlines(conn_mutex: &std::sync::Mutex<Connection>) -> Result<Vec<SyncedCalendarEvent>, String> {
    let creds_opt = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_credentials(&conn, "gmail").map_err(|e| e.to_string())?
    };

    let items = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_all_queue_items(&conn).map_err(|e| e.to_string())?
    };

    // Filter flagged items for additive auto-creation
    let flagged_items: Vec<_> = items.into_iter().filter(|i| i.flagged).collect();

    if let Some(creds) = creds_opt {
        let client = reqwest::Client::new();

        for item in &flagged_items {
            let already_synced = {
                let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                db::is_calendar_event_synced(&conn, &item.id).unwrap_or(false)
            };

            if already_synced {
                continue;
            }

            // Construct Google Calendar Event payload
            let summary = format!("Deadline: {}", item.preview.chars().take(40).collect::<String>());
            let start_time = "2026-08-01T17:00:00Z";
            let end_time = "2026-08-01T18:00:00Z";

            let payload = serde_json::json!({
                "summary": summary,
                "description": format!("Auto-created by Wardyn from sender: {}\nPreview: {}", item.sender, item.preview),
                "start": { "dateTime": start_time },
                "end": { "dateTime": end_time }
            });

            let res = client.post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
                .bearer_auth(&creds.access_token)
                .json(&payload)
                .send()
                .await;

            let event_id = if let Ok(resp) = res {
                if resp.status().is_success() {
                    let json: serde_json::Value = resp.json().await.unwrap_or_default();
                    json["id"].as_str().unwrap_or("ext_evt").to_string()
                } else {
                    format!("local_evt_{}", item.id)
                }
            } else {
                format!("local_evt_{}", item.id)
            };

            let record = SyncedCalendarEvent {
                id: format!("cal_{}", item.id),
                queue_item_id: item.id.clone(),
                event_id,
                summary,
                event_date: start_time.into(),
                created_at: "2026-07-30T23:50:00Z".into(),
            };

            let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
            db::record_calendar_event(&conn, &record).ok();
        }
    }

    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::get_synced_calendar_events(&conn).map_err(|e| e.to_string())
}
