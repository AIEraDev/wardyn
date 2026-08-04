use rusqlite::Connection;
use crate::db::{self, SyncedCalendarEvent};
use crate::calendar::intelligence;

// ─── Token refresh (shared logic, DB-only credential store) ──────────────────

async fn get_calendar_access_token(
    client: &reqwest::Client,
    conn_mutex: &std::sync::Mutex<Connection>,
) -> Result<String, String> {
    let creds = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_credentials(&conn, "gmail").map_err(|e| e.to_string())?
    };

    let creds = match creds {
        Some(c) => c,
        None => return Err("Gmail not connected — calendar sync requires a connected Gmail account.".into()),
    };

    if creds.refresh_token.is_empty() {
        return Err("Gmail session invalid — please reconnect your Gmail account in Channels.".into());
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Token still valid
    if creds.expires_at > now + 60 {
        return Ok(creds.access_token.clone());
    }

    // Refresh
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

    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh network error: {}", e))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "Calendar token refresh failed: {}. Please reconnect Gmail in Channels.",
            body
        ));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let new_token = json["access_token"].as_str()
        .ok_or("Missing access_token in refresh response")?
        .to_string();
    let expires_in = json["expires_in"].as_i64().unwrap_or(3600);

    let updated = db::GmailCredentials {
        service:       creds.service.clone(),
        access_token:  new_token.clone(),
        refresh_token: creds.refresh_token.clone(),
        expires_at:    now + expires_in,
        email:         creds.email.clone(),
    };
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::save_credentials(&conn, &updated).ok();
    }
    Ok(new_token)
}

// ─── System timezone helper ───────────────────────────────────────────────────

fn system_tz_offset() -> String {
    // Returns e.g. "+01:00" or "-05:00"
    let raw = std::process::Command::new("date")
        .arg("+%z")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| s.len() >= 5)
        .unwrap_or_else(|| "+01:00".to_string());
    if raw.len() == 5 {
        format!("{}:{}", &raw[..3], &raw[3..])
    } else {
        raw
    }
}

// ─── Auto-schedule a DB reminder for an upcoming event ───────────────────────

/// Creates a DB reminder for a calendar event.
/// `recurrence_rule`: "none" | "daily" | "every_2_days" | "weekly" | "weekdays"
/// `lead_minutes`: how many minutes before the event to fire (0 = at reminder_date directly)
fn schedule_event_reminder(
    conn: &std::sync::MutexGuard<Connection>,
    evt: &SyncedCalendarEvent,
    recurrence_rule: &str,
    lead_minutes: i64,
) {
    let event_secs = match db::iso_to_unix_secs(&evt.event_date) {
        Some(s) => s,
        None => return,
    };
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // For all-day events with no time, set the reminder at 09:00 on the event day
    let remind_secs = if evt.is_all_day {
        // Start of day (midnight UTC) + 9h
        let day_start = (event_secs / 86400) * 86400;
        let morning = day_start + 9 * 3600;
        if morning > now_secs { morning } else { return; }
    } else {
        let candidate = event_secs - lead_minutes * 60;
        if candidate > now_secs { candidate } else if event_secs > now_secs { now_secs + 5 } else { return; }
    };

    let reminder_id = format!("calrem_{}", evt.id);

    // If a reminder already exists, update recurrence and date if changed
    let existing: i64 = conn.query_row(
        "SELECT COUNT(*) FROM reminders WHERE id = ?1",
        rusqlite::params![reminder_id],
        |r| r.get(0),
    ).unwrap_or(0);

    if existing > 0 {
        // Update recurrence rule in case it changed
        conn.execute(
            "UPDATE reminders SET recurrence_rule = ?1 WHERE id = ?2 AND status = 'pending'",
            rusqlite::params![recurrence_rule, reminder_id],
        ).ok();
        return;
    }

    let remind_iso = unix_secs_to_iso(remind_secs);
    let message = if evt.is_all_day {
        format!("📅 Today: {} — check details", evt.summary)
    } else {
        let lead_label = match lead_minutes {
            0    => "now".to_string(),
            1..=59  => format!("in {} min", lead_minutes),
            60   => "in 1 hour".to_string(),
            1440 => "tomorrow".to_string(),
            _    => format!("in {} min", lead_minutes),
        };
        format!("⏰ {} — {}", evt.summary, lead_label)
    };

    let reminder = db::Reminder {
        id:              reminder_id,
        item_id:         evt.id.clone(),
        reminder_date:   remind_iso,
        message,
        status:          "pending".into(),
        created_at:      db::now_iso(),
        triggered_at:    None,
        recurrence_rule: recurrence_rule.to_string(),
    };
    db::create_reminder(conn, &reminder).ok();
}

fn unix_secs_to_iso(secs: i64) -> String {
    // Simple UTC ISO formatter
    let s  = secs % 60;
    let m  = (secs / 60) % 60;
    let h  = (secs / 3600) % 24;
    let days = secs / 86400;
    let (yr, mo, dy) = db::days_to_ymd(days as u64);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", yr, mo, dy, h, m, s)
}

// ─── Main sync function ───────────────────────────────────────────────────────

pub async fn sync_calendar_deadlines(
    conn_mutex: &std::sync::Mutex<Connection>,
) -> Result<Vec<SyncedCalendarEvent>, String> {
    let client = reqwest::Client::new();

    // Get a valid access token (handles refresh automatically)
    let access_token = match get_calendar_access_token(&client, conn_mutex).await {
        Ok(t) => t,
        Err(e) => {
            eprintln!("[Calendar] {}", e);
            // Return whatever is cached in DB without failing the whole sync
            let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
            return db::get_synced_calendar_events(&conn).map_err(|e| e.to_string());
        }
    };

    let tz = system_tz_offset();

    // ── 1. Smart email → calendar push ───────────────────────────────────────
    // Run intelligence analysis on all actionable queue items (needs_reply or flagged),
    // not just visa-flagged ones. The intelligence layer decides what actually warrants
    // a calendar entry and what recurrence/lead-time to use.
    let actionable_items = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_all_queue_items(&conn)
            .unwrap_or_default()
            .into_iter()
            .filter(|i| i.flagged || i.needs_reply || i.triage_status == "active")
            .collect::<Vec<_>>()
    };

    for item in &actionable_items {
        // Already has a calendar entry → skip push, but update reminder recurrence
        let already_synced = {
            let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT COUNT(*) FROM calendar_events WHERE queue_item_id = ?1",
                rusqlite::params![&item.id],
                |r| r.get::<_, i64>(0),
            ).unwrap_or(0) > 0
        };

        let intent = intelligence::analyse_email(item);

        if !intent.should_add_to_calendar {
            continue;
        }

        // Resolve event date: use extracted date or fall back to today + 1 day
        let base_date = intent.event_date.clone().unwrap_or_else(|| {
            let tomorrow = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64 + 86400;
            let days = (tomorrow / 86400) as u64;
            let (y, m, d) = db::days_to_ymd(days);
            format!("{:04}-{:02}-{:02}", y, m, d)
        });

        let start_time = format!("{}T09:00:00{}", &base_date[..10], tz);
        let end_time   = format!("{}T10:00:00{}", &base_date[..10], tz);

        if !already_synced {
            // Push to Google Calendar with smart reminders
            let gcal_reminder_minutes = intent.reminder_lead_minutes.min(1440) as u64;
            let payload = serde_json::json!({
                "summary":     intent.event_title,
                "description": format!("From: {}\n\n{}\n\n— Wardyn: {}", item.sender, item.preview, intent.reason),
                "start": { "dateTime": start_time, "timeZone": tz },
                "end":   { "dateTime": end_time,   "timeZone": tz },
                "reminders": {
                    "useDefault": false,
                    "overrides": [
                        { "method": "popup", "minutes": gcal_reminder_minutes },
                        { "method": "email", "minutes": gcal_reminder_minutes }
                    ]
                }
            });

            let event_id = match client
                .post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
                .bearer_auth(&access_token)
                .json(&payload)
                .send()
                .await
            {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        let json: serde_json::Value = resp.json().await.unwrap_or_default();
                        json["id"].as_str().unwrap_or("local_evt").to_string()
                    } else if status.as_u16() == 403 {
                        return Err(
                            "Google Calendar access denied (403). Please disconnect and \
                             reconnect Gmail in Channels to grant calendar.events scope.".into()
                        );
                    } else {
                        eprintln!("[Calendar] Create event failed ({})", status);
                        format!("local_evt_{}", item.id)
                    }
                }
                Err(e) => {
                    eprintln!("[Calendar] Network error creating event: {}", e);
                    format!("local_evt_{}", item.id)
                }
            };

            let record = SyncedCalendarEvent {
                id:            format!("cal_{}", item.id),
                queue_item_id: item.id.clone(),
                event_id,
                summary:       intent.event_title.clone(),
                event_date:    start_time.clone(),
                end_time:      Some(end_time),
                description:   Some(intent.reason.clone()),
                location:      None,
                is_all_day:    false,
                source:        "email".into(),
                created_at:    db::now_iso(),
            };
            let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
            db::record_calendar_event(&conn, &record).ok();
            schedule_event_reminder(
                &conn,
                &record,
                &intent.recurrence_rule,
                intent.reminder_lead_minutes,
            );
        } else {
            // Entry exists — update the reminder recurrence rule if the intelligence
            // determined a different one (e.g. item was re-classified by AI)
            let event_id_str = format!("cal_{}", item.id);
            if let Ok(conn) = conn_mutex.lock() {
                conn.execute(
                    "UPDATE reminders SET recurrence_rule = ?1
                     WHERE item_id = ?2 AND status = 'pending'",
                    rusqlite::params![intent.recurrence_rule, event_id_str],
                ).ok();
            }
        }
    }

    // ── 2. Fetch upcoming events from Google Calendar (next 14 days) ──────────
    let time_min = db::now_iso();
    // timeMax = now + 14 days in seconds
    let time_max_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64 + 14 * 86400;
    let time_max = unix_secs_to_iso(time_max_secs);

    let list_url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events\
         ?singleEvents=true&orderBy=startTime&maxResults=50\
         &timeMin={}&timeMax={}",
        urlencoding::encode(&time_min),
        urlencoding::encode(&time_max),
    );

    match client.get(&list_url).bearer_auth(&access_token).send().await {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                let cal_json: serde_json::Value = resp.json().await.unwrap_or_default();

                // Collect cancelled event IDs to prune from DB
                let mut cancelled_ids: Vec<String> = Vec::new();

                if let Some(events_list) = cal_json["items"].as_array() {
                    for evt in events_list {
                        let evt_status = evt["status"].as_str().unwrap_or("confirmed");
                        let evt_id = evt["id"].as_str().unwrap_or("").to_string();

                        if evt_status == "cancelled" {
                            cancelled_ids.push(format!("gcal_{}", evt_id));
                            continue;
                        }

                        // Determine if all-day (date only, no time)
                        let is_all_day = evt["start"]["dateTime"].as_str().is_none()
                            && evt["start"]["date"].as_str().is_some();

                        let start_str = evt["start"]["dateTime"]
                            .as_str()
                            .or_else(|| evt["start"]["date"].as_str())
                            .unwrap_or("")
                            .to_string();

                        // Skip events with no date
                        if start_str.is_empty() { continue; }

                        // Normalize all-day dates to a full datetime for consistent sorting
                        let event_date = if is_all_day && start_str.len() == 10 {
                            format!("{}T00:00:00Z", start_str)
                        } else {
                            start_str
                        };

                        let end_str = evt["end"]["dateTime"]
                            .as_str()
                            .or_else(|| evt["end"]["date"].as_str())
                            .map(|s| {
                                if is_all_day && s.len() == 10 {
                                    format!("{}T00:00:00Z", s)
                                } else {
                                    s.to_string()
                                }
                            });

                        let record = SyncedCalendarEvent {
                            id:            format!("gcal_{}", evt_id),
                            queue_item_id: format!("gcal_item_{}", evt_id),
                            event_id:      evt_id,
                            summary:       evt["summary"].as_str()
                                             .unwrap_or("Untitled Event").to_string(),
                            event_date,
                            end_time:      end_str,
                            description:   evt["description"].as_str().map(|s| s.to_string()),
                            location:      evt["location"].as_str().map(|s| s.to_string()),
                            is_all_day,
                            source:        "gcal".into(),
                            created_at:    db::now_iso(),
                        };

                        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                        db::record_calendar_event(&conn, &record).ok();
                        // Auto-schedule a smart reminder for timed events
                        let lead = if record.is_all_day { 0 } else { 60 };
                        schedule_event_reminder(&conn, &record, "none", lead);
                    }
                }

                // Prune cancelled events from DB
                if !cancelled_ids.is_empty() {
                    if let Ok(conn) = conn_mutex.lock() {
                        for cid in &cancelled_ids {
                            conn.execute(
                                "DELETE FROM calendar_events WHERE id = ?1",
                                rusqlite::params![cid],
                            ).ok();
                            // Also clean up any pending reminder for this event
                            conn.execute(
                                "DELETE FROM reminders WHERE item_id = ?1 AND status = 'pending'",
                                rusqlite::params![cid],
                            ).ok();
                        }
                    }
                }
            } else if status.as_u16() == 403 {
                return Err(
                    "Google Calendar access denied (403). Please disconnect and \
                     reconnect Gmail in Channels to grant calendar.events scope.".into()
                );
            } else if status.as_u16() == 401 {
                return Err(
                    "Google Calendar session expired (401). Please reconnect Gmail in Channels.".into()
                );
            } else {
                eprintln!("[Calendar] Fetch events failed ({})", status);
            }
        }
        Err(e) => {
            eprintln!("[Calendar] Network error fetching events: {}", e);
        }
    }

    // ── 3. Prune stale calendar entries ──────────────────────────────────────
    {
        if let Ok(conn) = conn_mutex.lock() {
            // Remove gcal events older than 30 days
            conn.execute(
                "DELETE FROM calendar_events
                 WHERE source = 'gcal'
                   AND event_date < datetime('now', '-30 days')",
                [],
            ).ok();

            // Remove email-sourced calendar events whose parent email was deleted
            // (e.g. after clear_gmail_cache). The queue_item_id for email events
            // is the original queue_items.id — if it's gone, the event is orphaned.
            conn.execute(
                "DELETE FROM calendar_events
                 WHERE source = 'email'
                   AND queue_item_id NOT LIKE 'life_%'
                   AND queue_item_id NOT LIKE 'task_%'
                   AND queue_item_id NOT LIKE 'mem_%'
                   AND queue_item_id NOT LIKE 'dec_%'
                   AND queue_item_id NOT IN (SELECT id FROM queue_items)",
                [],
            ).ok();

            // Remove pending reminders for orphaned calendar events
            conn.execute(
                "DELETE FROM reminders
                 WHERE status = 'pending'
                   AND item_id LIKE 'calrem_%'
                   AND REPLACE(item_id, 'calrem_mem_', '')
                       NOT IN (SELECT id FROM calendar_events)
                   AND item_id NOT IN (
                       SELECT 'calrem_' || id FROM calendar_events
                   )",
                [],
            ).ok();

            // Remove triggered reminders older than 30 days (log-only, no value)
            conn.execute(
                "DELETE FROM reminders
                 WHERE status = 'triggered'
                   AND datetime(triggered_at) < datetime('now', '-30 days')",
                [],
            ).ok();
        }
    }

    // Return all events (upcoming + custom)
    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::get_synced_calendar_events(&conn).map_err(|e| e.to_string())
}

// ─── Memory & Project → Calendar sync ────────────────────────────────────────

/// Scans the user's memories, life events, tasks, decisions, and active projects
/// and auto-creates calendar events + reminders for anything with a future date
/// or an ongoing daily focus target.
///
/// This runs independently of the Gmail sync — it doesn't need a Google OAuth
/// token and works entirely from local DB data.
pub fn sync_memories_and_projects(conn_mutex: &std::sync::Mutex<Connection>) -> Result<usize, String> {
    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    let today = db::now_iso();
    let today_str = &today[..10];
    let tz = system_tz_offset();
    let mut created = 0usize;

    // ── 1. Life Events ────────────────────────────────────────────────────────
    let life_events: Vec<(String, String, String, Option<String>)> = conn
        .prepare(
            "SELECT id, title, intent, event_date
             FROM life_events
             WHERE status = 'active'
             ORDER BY created_at DESC LIMIT 20",
        )
        .and_then(|mut s| {
            s.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
        })
        .unwrap_or_default();

    for (id, title, intent, event_date) in &life_events {
        if let Some(intent_val) = intelligence::analyse_life_event(
            id, title, intent, event_date.as_deref()
        ) {
            let already = conn.query_row(
                "SELECT COUNT(*) FROM calendar_events WHERE queue_item_id = ?1",
                rusqlite::params![intent_val.source_id],
                |r| r.get::<_, i64>(0),
            ).unwrap_or(0);
            if already > 0 { continue; }

            let date_str = intent_val.event_date.as_deref()
                .unwrap_or(today_str);
            let start_time = format!("{}T09:00:00{}", &date_str[..10.min(date_str.len())], tz);
            let end_time   = format!("{}T10:00:00{}", &date_str[..10.min(date_str.len())], tz);

            let record = SyncedCalendarEvent {
                id:            format!("mem_{}", intent_val.source_id),
                queue_item_id: intent_val.source_id.clone(),
                event_id:      format!("local_mem_{}", id),
                summary:       intent_val.event_title.clone(),
                event_date:    start_time.clone(),
                end_time:      Some(end_time),
                description:   Some(intent_val.reason.clone()),
                location:      None,
                is_all_day:    false,
                source:        "email".into(), // treated as a local non-gcal event
                created_at:    db::now_iso(),
            };
            db::record_calendar_event(&conn, &record).ok();
            schedule_event_reminder(
                &conn,
                &record,
                &intent_val.recurrence_rule,
                intent_val.reminder_lead_minutes,
            );
            created += 1;
        }
    }

    // ── 2. Tasks with due dates ───────────────────────────────────────────────
    let tasks: Vec<(String, String, String, Option<String>)> = conn
        .prepare(
            "SELECT id, title, priority, due_date
             FROM tasks
             WHERE status IN ('pending','in_progress')
               AND due_date IS NOT NULL
               AND due_date >= ?1
             ORDER BY due_date ASC LIMIT 30",
        )
        .and_then(|mut s| {
            s.query_map(rusqlite::params![today_str], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "medium".into()),
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
        })
        .unwrap_or_default();

    for (id, title, priority, due_date) in &tasks {
        if let Some(intent_val) = intelligence::analyse_task(
            id, title, priority, due_date.as_deref()
        ) {
            let already = conn.query_row(
                "SELECT COUNT(*) FROM calendar_events WHERE queue_item_id = ?1",
                rusqlite::params![intent_val.source_id],
                |r| r.get::<_, i64>(0),
            ).unwrap_or(0);
            if already > 0 { continue; }

            let date_str = intent_val.event_date.as_deref().unwrap_or(today_str);
            let start_time = format!("{}T09:00:00{}", &date_str[..10.min(date_str.len())], tz);
            let end_time   = format!("{}T10:00:00{}", &date_str[..10.min(date_str.len())], tz);

            let record = SyncedCalendarEvent {
                id:            format!("mem_{}", intent_val.source_id),
                queue_item_id: intent_val.source_id.clone(),
                event_id:      format!("local_task_{}", id),
                summary:       intent_val.event_title.clone(),
                event_date:    start_time.clone(),
                end_time:      Some(end_time),
                description:   Some(intent_val.reason.clone()),
                location:      None,
                is_all_day:    false,
                source:        "email".into(),
                created_at:    db::now_iso(),
            };
            db::record_calendar_event(&conn, &record).ok();
            schedule_event_reminder(
                &conn,
                &record,
                &intent_val.recurrence_rule,
                intent_val.reminder_lead_minutes,
            );
            created += 1;
        }
    }

    // ── 3. Knowledge items with embedded dates ────────────────────────────────
    let knowledge: Vec<(String, String, Option<String>, Option<String>)> = conn
        .prepare(
            "SELECT id, content, summary, tags
             FROM knowledge_items
             ORDER BY created_at DESC LIMIT 50",
        )
        .and_then(|mut s| {
            s.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
        })
        .unwrap_or_default();

    for (id, content, summary, tags_raw) in &knowledge {
        let tags: Vec<String> = serde_json::from_str(
            tags_raw.as_deref().unwrap_or("[]")
        ).unwrap_or_default();

        if let Some(intent_val) = intelligence::analyse_knowledge_item(
            id, content, summary.as_deref(), &tags
        ) {
            let already = conn.query_row(
                "SELECT COUNT(*) FROM calendar_events WHERE queue_item_id = ?1",
                rusqlite::params![intent_val.source_id],
                |r| r.get::<_, i64>(0),
            ).unwrap_or(0);
            if already > 0 { continue; }

            let date_str = intent_val.event_date.as_deref().unwrap_or(today_str);
            let start_time = format!("{}T09:00:00{}", &date_str[..10.min(date_str.len())], tz);
            let end_time   = format!("{}T10:00:00{}", &date_str[..10.min(date_str.len())], tz);

            let record = SyncedCalendarEvent {
                id:            format!("mem_{}", intent_val.source_id),
                queue_item_id: intent_val.source_id.clone(),
                event_id:      format!("local_mem_{}", id),
                summary:       intent_val.event_title.clone(),
                event_date:    start_time.clone(),
                end_time:      Some(end_time),
                description:   Some(content.chars().take(200).collect::<String>()),
                location:      None,
                is_all_day:    false,
                source:        "email".into(),
                created_at:    db::now_iso(),
            };
            db::record_calendar_event(&conn, &record).ok();
            schedule_event_reminder(
                &conn,
                &record,
                &intent_val.recurrence_rule,
                intent_val.reminder_lead_minutes,
            );
            created += 1;
        }
    }

    // ── 4. Decisions with follow-up dates ─────────────────────────────────────
    let decisions: Vec<(String, String, String)> = conn
        .prepare(
            "SELECT id, decision, rationale
             FROM decisions
             ORDER BY created_at DESC LIMIT 20",
        )
        .and_then(|mut s| {
            s.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                ))
            })
            .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
        })
        .unwrap_or_default();

    for (id, decision, rationale) in &decisions {
        if let Some(intent_val) = intelligence::analyse_decision(id, decision, rationale) {
            let already = conn.query_row(
                "SELECT COUNT(*) FROM calendar_events WHERE queue_item_id = ?1",
                rusqlite::params![intent_val.source_id],
                |r| r.get::<_, i64>(0),
            ).unwrap_or(0);
            if already > 0 { continue; }

            let date_str = intent_val.event_date.as_deref().unwrap_or(today_str);
            let start_time = format!("{}T10:00:00{}", &date_str[..10.min(date_str.len())], tz);
            let end_time   = format!("{}T11:00:00{}", &date_str[..10.min(date_str.len())], tz);

            let record = SyncedCalendarEvent {
                id:            format!("mem_{}", intent_val.source_id),
                queue_item_id: intent_val.source_id.clone(),
                event_id:      format!("local_dec_{}", id),
                summary:       intent_val.event_title.clone(),
                event_date:    start_time.clone(),
                end_time:      Some(end_time),
                description:   Some(format!("{} — {}", decision, rationale)),
                location:      None,
                is_all_day:    false,
                source:        "email".into(),
                created_at:    db::now_iso(),
            };
            db::record_calendar_event(&conn, &record).ok();
            schedule_event_reminder(
                &conn,
                &record,
                &intent_val.recurrence_rule,
                intent_val.reminder_lead_minutes,
            );
            created += 1;
        }
    }

    // ── 5. Active projects — daily focus reminders ───────────────────────────
    let projects: Vec<(String, String, i64, i64)> = conn
        .prepare(
            "SELECT ap.id, ap.name, ap.daily_target_minutes,
                    COALESCE(SUM(ptl.minutes_spent), 0) as today_mins
             FROM active_projects ap
             LEFT JOIN project_time_logs ptl
               ON ptl.project_id = ap.id AND ptl.session_date = ?1
             WHERE ap.status = 'active'
             GROUP BY ap.id
             ORDER BY ap.last_worked_at DESC LIMIT 10",
        )
        .and_then(|mut s| {
            s.query_map(rusqlite::params![today_str], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
        })
        .unwrap_or_default();

    for (id, name, daily_target, today_mins) in &projects {
        if let Some(intent_val) = intelligence::analyse_project_daily_focus(
            id, name, *daily_target, *today_mins
        ) {
            // Project reminders use source_id that changes per day — check only
            // whether there's already a pending reminder for this project today
            let reminder_id = format!("projrem_{}_{}", id, today_str);
            let already = conn.query_row(
                "SELECT COUNT(*) FROM reminders WHERE id = ?1",
                rusqlite::params![reminder_id],
                |r| r.get::<_, i64>(0),
            ).unwrap_or(0);
            if already > 0 { continue; }

            // Schedule a 9 AM reminder for tomorrow morning (recurrence: weekdays)
            let date_str = intent_val.event_date.as_deref().unwrap_or(today_str);
            let remind_iso = format!("{}T09:00:00Z", &date_str[..10.min(date_str.len())]);

            let reminder = db::Reminder {
                id:              reminder_id,
                item_id:         format!("proj_{}", id),
                reminder_date:   remind_iso,
                message:         format!("🏗️ Focus on {} today — {} min target", name, daily_target),
                status:          "pending".into(),
                created_at:      db::now_iso(),
                triggered_at:    None,
                recurrence_rule: intent_val.recurrence_rule.clone(),
            };
            db::create_reminder(&conn, &reminder).ok();
            created += 1;
        }
    }

    eprintln!("[MemorySync] Created {} calendar entries/reminders from memories & projects", created);
    Ok(created)
}
