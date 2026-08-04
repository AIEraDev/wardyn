/// Wardyn Morning Helper — runs as a LaunchAgent at 8 AM daily.
///
/// Does NOT require the main Tauri app to be open.
/// Does NOT require app signing.
/// Notifications delivered via `osascript` — works on all macOS builds.
///
/// What it does:
///   1. Locates the Wardyn SQLite database
///   2. Fires any pending reminders whose time has passed
///   3. Checks for today's Daily Intel — generates via Ollama if missing
///   4. Sends a "Good morning" notification with the quote + learning topic
///   5. Exits cleanly

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

// ─── DB Path Resolution ───────────────────────────────────────────────────────

fn db_path() -> PathBuf {
    // macOS: ~/Library/Application Support/com.wardyn.desktop/wardyn.db
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("com.wardyn.desktop")
        .join("wardyn.db")
}

// ─── Notification via osascript (no signing required) ────────────────────────

fn notify(title: &str, body: &str) {
    // Escape double quotes in strings to prevent osascript injection
    let safe_title = title.replace('"', "'");
    let safe_body  = body.replace('"', "'");

    let script = format!(
        r#"display notification "{}" with title "{}" sound name "Blow""#,
        safe_body, safe_title
    );

    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .ok();
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn now_iso() -> String {
    let secs = now_secs();
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    let (y, mo, d) = days_to_ymd(days as u64);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

fn today_str() -> String {
    now_iso()[..10].to_string()
}

fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as u64, m, d)
}

// ─── Pending Reminders ────────────────────────────────────────────────────────

#[derive(Debug)]
struct PendingReminder {
    id:           String,
    message:      String,
    recurrence:   String,
}

fn fire_pending_reminders(conn: &Connection) {
    let now = now_iso();
    let reminders: Vec<PendingReminder> = conn
        .prepare(
            "SELECT id, message, COALESCE(recurrence_rule,'none')
             FROM reminders
             WHERE status = 'pending'
               AND datetime(reminder_date) <= datetime(?1)
             ORDER BY reminder_date
             LIMIT 20",
        )
        .and_then(|mut s| {
            s.query_map(params![now], |row| {
                Ok(PendingReminder {
                    id:         row.get(0)?,
                    message:    row.get(1)?,
                    recurrence: row.get(2)?,
                })
            })
            .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
        })
        .unwrap_or_default();

    for r in &reminders {
        // Fire notification
        notify("⏰ Wardyn Reminder", &r.message);

        let now_s = now_secs();
        let triggered_at = now_iso();

        // Mark triggered
        conn.execute(
            "UPDATE reminders SET status='triggered', triggered_at=?1 WHERE id=?2",
            params![triggered_at, r.id],
        ).ok();

        // Reschedule recurring reminders
        if r.recurrence != "none" && !r.recurrence.is_empty() {
            let delta: i64 = match r.recurrence.as_str() {
                "daily"        => 86400,
                "every_2_days" => 2 * 86400,
                "weekly"       => 7 * 86400,
                "weekdays" => {
                    let dow = ((now_s / 86400) + 3) % 7;
                    match dow { 4 => 3 * 86400, 5 => 2 * 86400, _ => 86400 }
                }
                _ => 0,
            };
            if delta > 0 {
                let next_secs = now_s + delta;
                let s = next_secs % 60;
                let m = (next_secs / 60) % 60;
                let h = (next_secs / 3600) % 24;
                let days = (next_secs / 86400) as u64;
                let (yr, mo, dy) = days_to_ymd(days);
                let next_date = format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", yr, mo, dy, h, m, s);
                let next_id = format!("{}_r{}", r.id, now_s);
                conn.execute(
                    "INSERT OR IGNORE INTO reminders
                         (id, item_id, reminder_date, message, status, created_at, recurrence_rule)
                     SELECT ?1, item_id, ?2, message, 'pending', ?3, ?4
                     FROM reminders WHERE id = ?5",
                    params![next_id, next_date, triggered_at, r.recurrence, r.id],
                ).ok();
            }
        }
    }

    if !reminders.is_empty() {
        eprintln!("[MorningHelper] Fired {} reminder(s)", reminders.len());
    }
}

// ─── Daily Intel ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct DailyIntel {
    motivation_quote: Option<String>,
    quote_author:     Option<String>,
    learning_topic:   Option<String>,
    learning_summary: Option<String>,
}

fn get_cached_intel(conn: &Connection, today: &str) -> Option<DailyIntel> {
    conn.query_row(
        "SELECT motivation_quote, quote_author, learning_topic, learning_summary
         FROM daily_intel WHERE date = ?1",
        params![today],
        |row| {
            Ok(DailyIntel {
                motivation_quote: row.get(0)?,
                quote_author:     row.get(1)?,
                learning_topic:   row.get(2)?,
                learning_summary: row.get(3)?,
            })
        },
    ).ok()
}

fn save_intel(conn: &Connection, today: &str, intel: &DailyIntel) {
    conn.execute(
        "INSERT OR REPLACE INTO daily_intel
             (date, motivation_quote, quote_author, learning_topic, learning_summary, generated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            today,
            intel.motivation_quote,
            intel.quote_author,
            intel.learning_topic,
            intel.learning_summary,
            now_iso(),
        ],
    ).ok();
}

// ─── Ollama call (sync, tokio-free) ──────────────────────────────────────────

fn call_ollama_sync(prompt: &str) -> Option<String> {
    // Use curl — available on all macOS without any runtime dependency
    let payload = serde_json::json!({
        "model": "qwen2.5",
        "prompt": prompt,
        "stream": false
    });

    let payload_str = serde_json::to_string(&payload).ok()?;

    let out = Command::new("curl")
        .args([
            "-s", "--max-time", "120",
            "-X", "POST",
            "http://localhost:11434/api/generate",
            "-H", "Content-Type: application/json",
            "-d", &payload_str,
        ])
        .output()
        .ok()?;

    if !out.status.success() { return None; }

    let resp: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    resp["response"].as_str().map(|s| s.to_string())
}

fn generate_intel_ollama(conn: &Connection, today: &str) -> Option<DailyIntel> {
    // Build minimal context from DB (projects + tasks)
    let projects: Vec<String> = conn
        .prepare("SELECT name FROM active_projects WHERE status='active' LIMIT 5")
        .and_then(|mut s| s.query_map([], |r| r.get(0))
            .map(|rows| rows.filter_map(|r| r.ok()).collect()))
        .unwrap_or_default();

    let tasks: Vec<String> = conn
        .prepare("SELECT title FROM tasks WHERE status='pending' AND priority='high' LIMIT 3")
        .and_then(|mut s| s.query_map([], |r| r.get(0))
            .map(|rows| rows.filter_map(|r| r.ok()).collect()))
        .unwrap_or_default();

    let ctx = if projects.is_empty() && tasks.is_empty() {
        String::new()
    } else {
        format!(
            "Active projects: {}\nUrgent tasks: {}",
            projects.join(", "),
            tasks.join(", ")
        )
    };

    let prompt = format!(
        r#"You are a personal AI assistant. Generate a morning brief. {}

Return ONLY this JSON object, no markdown:
{{
  "motivation_quote": "<short inspiring quote from a real person>",
  "quote_author": "<full name>",
  "learning_topic": "<2-4 word topic connected to the user's work>",
  "learning_summary": "<one sentence summary>"
}}"#,
        ctx
    );

    let raw = call_ollama_sync(&prompt)?;

    // Extract JSON from response
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start { return None; }
    let json_str = &raw[start..=end];

    #[derive(Deserialize)]
    struct Parsed {
        motivation_quote: Option<String>,
        quote_author:     Option<String>,
        learning_topic:   Option<String>,
        learning_summary: Option<String>,
    }

    let p: Parsed = serde_json::from_str(json_str).ok()?;
    let intel = DailyIntel {
        motivation_quote: p.motivation_quote,
        quote_author:     p.quote_author,
        learning_topic:   p.learning_topic,
        learning_summary: p.learning_summary,
    };
    save_intel(conn, today, &intel);
    Some(intel)
}

// ─── Morning Notification ─────────────────────────────────────────────────────

fn send_morning_brief(conn: &Connection, today: &str) {
    // Check if we already sent this morning's brief
    let already_sent: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_settings WHERE key='morning_notif_sent_date' AND value=?1",
        params![today],
        |r| r.get(0),
    ).unwrap_or(0);

    if already_sent > 0 {
        eprintln!("[MorningHelper] Brief already sent today — skipping.");
        return;
    }

    // Get or generate intel
    let intel = get_cached_intel(conn, today)
        .or_else(|| generate_intel_ollama(conn, today));

    let (title, body) = match &intel {
        Some(i) => {
            let quote_part = match (&i.motivation_quote, &i.quote_author) {
                (Some(q), Some(a)) => format!("\"{}\" \u{2014} {}", q.chars().take(80).collect::<String>(), a),
                (Some(q), None)    => format!("\"{}\"", q.chars().take(80).collect::<String>()),
                _                  => "Good morning! Open Wardyn to see your daily brief.".to_string(),
            };
            let topic_part = i.learning_topic.as_deref().unwrap_or("your projects");
            (
                "🌅 Good Morning — Wardyn".to_string(),
                format!("{} | Today's focus: {}", quote_part, topic_part),
            )
        }
        None => (
            "🌅 Good Morning — Wardyn".to_string(),
            "Open Wardyn to see your daily brief and reminders.".to_string(),
        ),
    };

    notify(&title, &body);

    // Record that we sent today's brief
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('morning_notif_sent_date', ?1)",
        params![today],
    ).ok();

    eprintln!("[MorningHelper] Morning brief sent for {}", today);
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

fn main() {
    let path = db_path();
    if !path.exists() {
        eprintln!("[MorningHelper] DB not found at {:?} — app not set up yet", path);
        std::process::exit(0);
    }

    let conn = match Connection::open(&path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[MorningHelper] Cannot open DB: {}", e);
            std::process::exit(1);
        }
    };

    // WAL mode for safe concurrent access with the main app
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;").ok();

    let today = today_str();

    // 1. Fire any pending reminders
    fire_pending_reminders(&conn);

    // 2. Send morning brief (quote + learning topic)
    send_morning_brief(&conn, &today);
}
