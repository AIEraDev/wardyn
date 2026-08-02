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

    let flagged_items: Vec<_> = items.into_iter().filter(|i| i.flagged).collect();

    if let Some(creds) = creds_opt {
        let client = reqwest::Client::new();

        // ── Refresh access token if expired ─────────────────────────────────
        let access_token = {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            if creds.expires_at <= now + 60 && !creds.refresh_token.is_empty()
                && creds.refresh_token != "[KEYCHAIN_ENCLAVE]"
            {
                let (client_id, client_secret) = {
                    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                    let id = db::get_app_setting(&conn, "oauth_google_client_id")
                        .ok().flatten().filter(|v| !v.is_empty())
                        .unwrap_or_else(|| std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default());
                    let secret = db::get_app_setting(&conn, "oauth_google_client_secret")
                        .ok().flatten().filter(|v| !v.is_empty())
                        .unwrap_or_else(|| std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default());
                    (id, secret)
                };
                let mut params = vec![
                    ("client_id",     client_id.as_str()),
                    ("refresh_token", creds.refresh_token.as_str()),
                    ("grant_type",    "refresh_token"),
                ];
                if !client_secret.is_empty() { params.push(("client_secret", client_secret.as_str())); }
                if let Ok(res) = client.post("https://oauth2.googleapis.com/token").form(&params).send().await {
                    if res.status().is_success() {
                        if let Ok(json) = res.json::<serde_json::Value>().await {
                            let new_token = json["access_token"].as_str()
                                .unwrap_or(&creds.access_token).to_string();
                            let expires_in = json["expires_in"].as_i64().unwrap_or(3600);
                            let updated = db::GmailCredentials {
                                service: creds.service.clone(),
                                access_token: new_token.clone(),
                                refresh_token: creds.refresh_token.clone(),
                                expires_at: now + expires_in,
                                email: creds.email.clone(),
                            };
                            let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                            db::save_credentials(&conn, &updated).ok();
                            new_token
                        } else { creds.access_token.clone() }
                    } else { creds.access_token.clone() }
                } else { creds.access_token.clone() }
            } else {
                creds.access_token.clone()
            }
        };

        // 1. Auto-create Google Calendar events for flagged emails
        for item in &flagged_items {
            let already_synced = {
                let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                db::is_calendar_event_synced(&conn, &item.id).unwrap_or(false)
            };
            if already_synced { continue; }

            let summary = format!("Deadline: {}", item.preview.chars().take(40).collect::<String>());
            let base = crate::db::now_iso();
            let start_time = format!("{}T17:00:00+01:00", &base[..10]);
            let end_time   = format!("{}T18:00:00+01:00", &base[..10]);

            let payload = serde_json::json!({
                "summary": summary,
                "description": format!("Auto-created by Wardyn from sender: {}\nPreview: {}", item.sender, item.preview),
                "start": { "dateTime": start_time, "timeZone": "Africa/Lagos" },
                "end":   { "dateTime": end_time,   "timeZone": "Africa/Lagos" }
            });

            let res = client.post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
                .bearer_auth(&access_token)
                .json(&payload)
                .send()
                .await;

            let event_id = match res {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        let json: serde_json::Value = resp.json().await.unwrap_or_default();
                        json["id"].as_str().unwrap_or("ext_evt").to_string()
                    } else if status.as_u16() == 403 {
                        // Calendar scope not granted — surface a clear error instead of silent fallback
                        return Err(
                            "Google Calendar access denied (403). The Gmail OAuth token does not have the \
                             'calendar.events' scope. Please disconnect and reconnect your Gmail account in Settings.".into()
                        );
                    } else {
                        eprintln!("[Calendar] Create event failed ({}): {}", status, resp.text().await.unwrap_or_default());
                        format!("local_evt_{}", item.id) // store locally, will retry next sync
                    }
                }
                Err(e) => {
                    eprintln!("[Calendar] Network error creating event: {}", e);
                    format!("local_evt_{}", item.id)
                }
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

        // 2. Fetch upcoming events from Google Calendar
        let now_iso = crate::db::now_iso();
        let list_url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=20&timeMin={}",
            urlencoding::encode(&now_iso)
        );

        match client.get(&list_url).bearer_auth(&access_token).send().await {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    let cal_json: serde_json::Value = resp.json().await.unwrap_or_default();
                    if let Some(events_list) = cal_json["items"].as_array() {
                        for evt in events_list {
                            if evt["status"].as_str().unwrap_or("confirmed") == "cancelled" {
                                continue;
                            }
                            let evt_id      = evt["id"].as_str().unwrap_or("").to_string();
                            let evt_summary = evt["summary"].as_str().unwrap_or("Upcoming Event").to_string();
                            let evt_date    = evt["start"]["dateTime"]
                                .as_str()
                                .or_else(|| evt["start"]["date"].as_str())
                                .unwrap_or("2026-08-01T10:00:00+01:00")
                                .to_string();

                            let record = SyncedCalendarEvent {
                                id:              format!("gcal_{}", evt_id),
                                queue_item_id:   format!("gcal_item_{}", evt_id),
                                event_id:        evt_id,
                                summary:         evt_summary,
                                event_date:      evt_date,
                                created_at:      crate::db::now_iso(),
                            };
                            let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                            db::record_calendar_event(&conn, &record).ok();
                        }
                    }
                } else if status.as_u16() == 403 {
                    return Err(
                        "Google Calendar access denied (403). The Gmail OAuth token does not have the \
                         'calendar.events' scope. Please disconnect and reconnect your Gmail account in Settings.".into()
                    );
                } else if status.as_u16() == 401 {
                    return Err(
                        "Google Calendar session expired (401). Please reconnect your Gmail account in Settings.".into()
                    );
                } else {
                    eprintln!("[Calendar] Fetch events failed ({})", status);
                }
            }
            Err(e) => {
                eprintln!("[Calendar] Network error fetching events: {}", e);
            }
        }
    }

    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::get_synced_calendar_events(&conn).map_err(|e| e.to_string())
}
