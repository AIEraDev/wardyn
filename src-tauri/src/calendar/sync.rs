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

        // 1. Auto-create Google Calendar events for flagged emails
        for item in &flagged_items {
            let already_synced = {
                let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                db::is_calendar_event_synced(&conn, &item.id).unwrap_or(false)
            };

            if already_synced {
                continue;
            }

            let summary = format!("Deadline: {}", item.preview.chars().take(40).collect::<String>());
            let base = crate::db::now_iso();
            let start_time = format!("{}T17:00:00Z", &base[..10]);
            let end_time = format!("{}T18:00:00Z", &base[..10]);

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
                event_date: start_time.clone(),
                created_at: crate::db::now_iso(),
            };

            let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
            db::record_calendar_event(&conn, &record).ok();
        }

        // 2. Fetch upcoming events from Google Calendar API (timeMin = now)
        let now_iso = crate::db::now_iso();
        let list_url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=20&timeMin={}",
            urlencoding::encode(&now_iso)
        );
        let cal_res = client.get(&list_url)
            .bearer_auth(&creds.access_token)
            .send()
            .await;

        if let Ok(resp) = cal_res {
            if resp.status().is_success() {
                let cal_json: serde_json::Value = resp.json().await.unwrap_or_default();
                if let Some(events_list) = cal_json["items"].as_array() {
                    for evt in events_list {
                        let evt_id = evt["id"].as_str().unwrap_or("").to_string();
                        let evt_summary = evt["summary"].as_str().unwrap_or("Upcoming Event").to_string();
                        let evt_date = evt["start"]["dateTime"]
                            .as_str()
                            .or_else(|| evt["start"]["date"].as_str())
                            .unwrap_or("2026-08-01T10:00:00Z")
                            .to_string();

                        let record = SyncedCalendarEvent {
                            id: format!("gcal_{}", evt_id),
                            queue_item_id: format!("gcal_item_{}", evt_id),
                            event_id: evt_id,
                            summary: evt_summary,
                            event_date: evt_date,
                            created_at: crate::db::now_iso(),
                        };

                        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                        db::record_calendar_event(&conn, &record).ok();
                    }
                }
            }
        }
    }

    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::get_synced_calendar_events(&conn).map_err(|e| e.to_string())
}
