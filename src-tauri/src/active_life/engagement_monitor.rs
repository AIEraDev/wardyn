/// Engagement monitor: polls the frontmost macOS app every 30 seconds using osascript.
/// No Accessibility permissions required — just scripting additions.
/// Runs as a background thread in the Tauri app.

use std::sync::{Arc, Mutex};
use std::time::Duration;
use rusqlite::Connection;
use crate::db::now_iso;

fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    format!("{}_{:x}", prefix, t)
}

fn today_date() -> String {
    { let iso = now_iso(); iso.get(0..10).unwrap_or(&iso).to_string() }
}

/// Get the name of the frontmost application using osascript.
fn get_frontmost_app() -> Option<String> {
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to get name of first application process whose frontmost is true")
        .output()
        .ok()?;
    if output.status.success() {
        let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !name.is_empty() {
            return Some(name);
        }
    }
    None
}

/// Try to get the frontmost window title.
fn get_window_title(app_name: &str) -> Option<String> {
    let script = format!(
        "tell application \"System Events\" to tell process \"{}\" to get title of front window",
        app_name
    );
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .ok()?;
    if output.status.success() {
        let title = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !title.is_empty() {
            return Some(title);
        }
    }
    None
}

/// Match an app name or window title to a known project name (fuzzy).
fn match_project(conn: &Connection, app_name: &str, window_title: Option<&str>) -> Option<String> {
    let mut stmt = conn.prepare(
        "SELECT id, name FROM active_projects WHERE status = 'active'"
    ).ok()?;

    let projects: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .ok()?
        .filter_map(|r| r.ok())
        .collect();

    let haystack = format!(
        "{} {}",
        app_name.to_lowercase(),
        window_title.unwrap_or("").to_lowercase()
    );

    for (id, name) in &projects {
        if haystack.contains(&name.to_lowercase()) {
            return Some(id.clone());
        }
    }
    None
}

/// Starts the background engagement monitor thread.
/// Polls every 30s, logs sessions, and accumulates time per project per day.
pub fn start_engagement_monitor(conn_mutex: Arc<Mutex<Connection>>) {
    std::thread::spawn(move || {
        let mut current_app: Option<String> = None;
        let mut current_project: Option<String> = None;
        let mut session_start: Option<std::time::Instant> = None;
        let mut session_id: Option<String> = None;

        loop {
            std::thread::sleep(Duration::from_secs(30));

            let app = match get_frontmost_app() {
                Some(a) => a,
                None => continue,
            };

            let window = get_window_title(&app);

            let project_id = if let Ok(conn) = conn_mutex.lock() {
                match_project(&conn, &app, window.as_deref())
            } else {
                None
            };

            let app_changed = current_app.as_deref() != Some(&app);

            if app_changed {
                // Close previous session
                if let (Some(sid), Some(start)) = (session_id.take(), session_start.take()) {
                    let duration_secs = start.elapsed().as_secs() as i64;
                    if duration_secs > 5 {
                        if let Ok(conn) = conn_mutex.lock() {
                            let ended_at = now_iso();
                            conn.execute(
                                "UPDATE engagement_sessions SET ended_at = ?1, duration_seconds = ?2 WHERE id = ?3",
                                rusqlite::params![ended_at, duration_secs, sid],
                            ).ok();

                            // Log time to project if matched
                            if let Some(ref pid) = current_project {
                                let minutes = (duration_secs / 60).max(1);
                                let log_id = new_id("ptl");
                                let today = today_date();
                                conn.execute(
                                    "INSERT INTO project_time_logs (id, project_id, session_date, minutes_spent, notes, created_at)
                                     VALUES (?1, ?2, ?3, ?4, 'auto', ?5)",
                                    rusqlite::params![log_id, pid, today, minutes, now_iso()],
                                ).ok();
                                conn.execute(
                                    "UPDATE active_projects SET last_worked_at = ?1 WHERE id = ?2",
                                    rusqlite::params![now_iso(), pid],
                                ).ok();
                            }
                        }
                    }
                }

                // Open new session
                let new_sid = new_id("eng");
                if let Ok(conn) = conn_mutex.lock() {
                    conn.execute(
                        "INSERT INTO engagement_sessions (id, app_name, window_title, project_id, started_at)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![new_sid, app, window, project_id, now_iso()],
                    ).ok();
                }
                session_id = Some(new_sid);
                session_start = Some(std::time::Instant::now());
                current_app = Some(app);
                current_project = project_id;
            }
        }
    });
}

/// Returns today's total focused seconds per project (for the frontend).
pub fn get_today_engagement_summary(conn: &Connection) -> Vec<(String, i64)> {
    let today = today_date();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT ap.name, COALESCE(SUM(ptl.minutes_spent), 0) as total
         FROM active_projects ap
         LEFT JOIN project_time_logs ptl ON ptl.project_id = ap.id AND ptl.session_date = ?1
         WHERE ap.status = 'active'
         GROUP BY ap.id, ap.name
         ORDER BY total DESC"
    ) {
        if let Ok(rows) = stmt.query_map(rusqlite::params![today], |row| Ok((row.get(0)?, row.get(1)?))) {
            return rows.filter_map(|r| r.ok()).collect();
        }
    }
    vec![]
}
