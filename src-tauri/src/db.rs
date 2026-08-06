use rusqlite::{params, Connection, Result};
use crate::models::QueueItem;

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct GmailCredentials {
    pub service: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub email: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct SyncedCalendarEvent {
    pub id: String,
    pub queue_item_id: String,
    pub event_id: String,
    pub summary: String,
    pub event_date: String,        // start datetime (RFC3339)
    pub end_time: Option<String>,  // end datetime (RFC3339)
    pub description: Option<String>,
    pub location: Option<String>,
    pub is_all_day: bool,
    pub source: String,            // "gcal" | "custom" | "email"
    pub created_at: String,
}

/// Returns the current UTC time as an ISO-8601 string (e.g. "2026-07-31T03:15:00Z").
pub fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Format: YYYY-MM-DDTHH:MM:SSZ from unix timestamp
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400; // days since epoch
    // Zeller-ish date from days since 1970-01-01
    let (year, month, day) = days_to_ymd(days);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, h, m, s)
}

pub fn iso_to_unix_secs(iso: &str) -> Option<i64> {
    let trimmed = iso.trim();
    if trimmed.len() < 19 {
        return None;
    }
    let year: i64 = trimmed.get(0..4)?.parse().ok()?;
    let month: i64 = trimmed.get(5..7)?.parse().ok()?;
    let day: i64 = trimmed.get(8..10)?.parse().ok()?;
    let hour: i64 = trimmed.get(11..13)?.parse().ok()?;
    let minute: i64 = trimmed.get(14..16)?.parse().ok()?;
    let second: i64 = trimmed.get(17..19)?.parse().ok()?;

    let mut y = year;
    let mut m = month;
    if m <= 2 {
        y -= 1;
        m += 12;
    }
    let era = y / 400;
    let yoe = y - era * 400;
    let doy = (153 * (m - 3) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    let utc_secs = days * 86400 + hour * 3600 + minute * 60 + second;

    // Parse optional timezone offset: Z, +HH:MM, -HH:MM
    // Chars 19+ may contain timezone info
    let tz_offset_secs: i64 = if trimmed.len() > 19 {
        let tz = &trimmed[19..];
        if tz.starts_with('Z') || tz.starts_with('z') {
            0
        } else if tz.len() >= 6 && (tz.starts_with('+') || tz.starts_with('-')) {
            let sign: i64 = if tz.starts_with('-') { -1 } else { 1 };
            let tz_h: i64 = tz.get(1..3).and_then(|s| s.parse().ok()).unwrap_or(0);
            let tz_m: i64 = tz.get(4..6).and_then(|s| s.parse().ok()).unwrap_or(0);
            sign * (tz_h * 3600 + tz_m * 60)
        } else {
            0
        }
    } else {
        0
    };

    Some(utc_secs - tz_offset_secs)
}

pub fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    // Proleptic Gregorian calendar — direct computation, O(1)
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

/// Returns true if `column_name` exists in `table_name`.
pub fn has_column(conn: &Connection, table_name: &str, column_name: &str) -> bool {
    let pragma_sql = format!("PRAGMA table_info({})", table_name);
    let mut stmt = match conn.prepare(&pragma_sql) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let mut rows = match stmt.query([]) {
        Ok(r) => r,
        Err(_) => return false,
    };
    while let Ok(Some(row)) = rows.next() {
        if let Ok(name) = row.get::<_, String>(1) {
            if name.eq_ignore_ascii_case(column_name) {
                return true;
            }
        }
    }
    false
}

/// Safely adds a column to a table only if it does not already exist.
pub fn ensure_column(conn: &Connection, table_name: &str, column_name: &str, column_def: &str) -> Result<()> {
    if !has_column(conn, table_name, column_name) {
        let alter_sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table_name, column_name, column_def);
        conn.execute(&alter_sql, [])?;
    }
    Ok(())
}

pub fn init_db(conn: &Connection) -> Result<()> {
    // ── Security & performance PRAGMAs — must run before any other statement ──
    conn.execute_batch("
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
    ")?;

    // ── Schema version tracking ───────────────────────────────────────────────
    conn.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        applied_at  TEXT NOT NULL
    );")?;

    let current_version: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations", [], |r| r.get(0)
    ).unwrap_or(0);

    // ── Migration 1: full baseline schema ────────────────────────────────────
    if current_version < 1 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch("
        CREATE TABLE IF NOT EXISTS queue_items (
            id TEXT PRIMARY KEY, source TEXT NOT NULL, kind TEXT NOT NULL,
            sender TEXT NOT NULL, preview TEXT NOT NULL, draft_text TEXT,
            status TEXT NOT NULL, flagged INTEGER NOT NULL, confidence REAL NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            thread_id TEXT, message_id TEXT,
            urgency TEXT DEFAULT 'high', draft_generation_time_ms INTEGER,
            draft_edit_distance INTEGER
        );
        CREATE TABLE IF NOT EXISTS credentials (
            service TEXT PRIMARY KEY, access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL, expires_at INTEGER NOT NULL, email TEXT
        );
        CREATE TABLE IF NOT EXISTS calendar_events (
            id TEXT PRIMARY KEY, queue_item_id TEXT NOT NULL,
            event_id TEXT NOT NULL, summary TEXT NOT NULL,
            event_date TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS voice_edits (
            id TEXT PRIMARY KEY, queue_item_id TEXT NOT NULL,
            original_draft TEXT NOT NULL, edited_draft TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feed_items (
            id TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT NOT NULL,
            url TEXT NOT NULL, summary TEXT, score INTEGER DEFAULT 0,
            relevance_score REAL DEFAULT 0.0, fetched_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS morning_briefs (
            date TEXT PRIMARY KEY, brief_text TEXT NOT NULL, generated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS knowledge_items (
            id TEXT PRIMARY KEY, content TEXT NOT NULL, url TEXT,
            tags TEXT DEFAULT '[]', summary TEXT,
            source TEXT DEFAULT 'manual', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS decisions (
            id TEXT PRIMARY KEY, decision TEXT NOT NULL, rationale TEXT NOT NULL,
            alternatives TEXT, outcome TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feed_interactions (
            id TEXT PRIMARY KEY, item_id TEXT NOT NULL, item_source TEXT NOT NULL,
            tags TEXT DEFAULT '[]', action TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS weekly_reviews (
            week TEXT PRIMARY KEY, review_text TEXT NOT NULL, generated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY, value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS custom_feeds (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
            category TEXT DEFAULT 'custom', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS response_analytics (
            id TEXT PRIMARY KEY, queue_item_id TEXT NOT NULL, sender TEXT NOT NULL,
            category TEXT, received_at TEXT NOT NULL, responded_at TEXT,
            response_time_seconds INTEGER, draft_generation_time_ms INTEGER
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
            source_item_id TEXT, due_date TEXT, priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'pending', created_at TEXT NOT NULL,
            completed_at TEXT, life_event_id TEXT
        );
        CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY, item_id TEXT NOT NULL, reminder_date TEXT NOT NULL,
            message TEXT NOT NULL, status TEXT DEFAULT 'pending',
            created_at TEXT NOT NULL, triggered_at TEXT
        );
        CREATE TABLE IF NOT EXISTS pomodoro_sessions (
            id TEXT PRIMARY KEY, task_id TEXT, duration_minutes INTEGER NOT NULL,
            completed INTEGER NOT NULL, started_at TEXT NOT NULL, ended_at TEXT
        );
        CREATE TABLE IF NOT EXISTS life_events (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, raw_input TEXT NOT NULL,
            intent TEXT NOT NULL, event_date TEXT,
            status TEXT DEFAULT 'active', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS active_projects (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
            status TEXT NOT NULL DEFAULT 'active', daily_target_minutes INTEGER DEFAULT 60,
            last_worked_at TEXT, color TEXT DEFAULT '#4A8FC2', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS project_time_logs (
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, session_date TEXT NOT NULL,
            minutes_spent INTEGER DEFAULT 0, notes TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS daily_habits (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT '✅',
            category TEXT DEFAULT 'general', sort_order INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS habit_completions (
            id TEXT PRIMARY KEY, habit_id TEXT NOT NULL,
            completed_date TEXT NOT NULL, completed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS daily_intel (
            date TEXT PRIMARY KEY, motivation_quote TEXT, quote_author TEXT,
            learning_topic TEXT, learning_summary TEXT, social_post_idea TEXT,
            social_format TEXT, social_platform TEXT, day_plan TEXT,
            generated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS engagement_sessions (
            id TEXT PRIMARY KEY, app_name TEXT NOT NULL, window_title TEXT,
            project_id TEXT, started_at TEXT NOT NULL, ended_at TEXT,
            duration_seconds INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS habit_reminders (
            id TEXT PRIMARY KEY, habit_id TEXT NOT NULL UNIQUE,
            remind_time TEXT NOT NULL, enabled INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS social_posts (
            id TEXT PRIMARY KEY, platform TEXT NOT NULL, topic TEXT NOT NULL,
            content TEXT NOT NULL, hashtags TEXT NOT NULL DEFAULT '[]',
            media_cue TEXT, status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        ")?;
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
            rusqlite::params![now_iso()],
        )?;
        tx.commit()?;
    }

    // ── Migration 2: safe transactional column backfill for pre-migration installs ──────────
    if current_version < 2 {
        let tx = conn.unchecked_transaction()?;
        ensure_column(&tx, "queue_items", "urgency", "TEXT DEFAULT 'high'")?;
        ensure_column(&tx, "queue_items", "draft_generation_time_ms", "INTEGER")?;
        ensure_column(&tx, "queue_items", "draft_edit_distance", "INTEGER")?;
        ensure_column(&tx, "tasks", "life_event_id", "TEXT")?;
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, ?1)",
            rusqlite::params![now_iso()],
        )?;
        tx.commit()?;
    }

    // ── Migration 3: smart triage fields ──────────────────────────────────────
    if current_version < 3 {
        let tx = conn.unchecked_transaction()?;
        // needs_reply defaults 1 (true) — conservative: existing emails stay visible
        ensure_column(&tx, "queue_items", "needs_reply", "INTEGER NOT NULL DEFAULT 1")?;
        // triage_status defaults 'active' — existing rows are treated as active
        ensure_column(&tx, "queue_items", "triage_status", "TEXT NOT NULL DEFAULT 'active'")?;
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, ?1)",
            rusqlite::params![now_iso()],
        )?;
        tx.commit()?;
    }

    // ── Migration 4: credential fallback columns ────────────────────────────
    // Adds plaintext fallback columns so tokens survive even if the macOS
    // keychain is unavailable (dev sandbox, permission reset, cold boot race).
    // These are separate from the keychain — keychain is always preferred.
    if current_version < 4 {
        let tx = conn.unchecked_transaction()?;
        ensure_column(&tx, "credentials", "refresh_token_fallback", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(&tx, "credentials", "access_token_fallback", "TEXT NOT NULL DEFAULT ''")?;
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (4, ?1)",
            rusqlite::params![now_iso()],
        )?;
        tx.commit()?;
    }

    // ── Migration 5: consolidate tokens — migrate fallback columns → direct columns ──
    // Previously tokens were stored as [KEYCHAIN_ENCLAVE] sentinel in access_token/
    // refresh_token with real values in *_fallback columns. Now the main columns
    // hold the encrypted tokens directly. Migrate any existing data.
    if current_version < 5 {
        let tx = conn.unchecked_transaction()?;
        // Ensure old fallback columns exist (may not on fresh installs)
        let has_ref_fallback = has_column(&tx, "credentials", "refresh_token_fallback");
        let has_acc_fallback = has_column(&tx, "credentials", "access_token_fallback");

        if has_ref_fallback || has_acc_fallback {
            let rows: Vec<(String, String, String, String, String)> = {
                let fallback_ref_col = if has_ref_fallback { "COALESCE(refresh_token_fallback,'')" } else { "''" };
                let fallback_acc_col = if has_acc_fallback { "COALESCE(access_token_fallback,'')" } else { "''" };
                let sql = format!(
                    "SELECT service, COALESCE(access_token,''), COALESCE(refresh_token,''), {}, {} FROM credentials",
                    fallback_acc_col, fallback_ref_col
                );
                let mut stmt = tx.prepare(&sql)?;
                let mapped = stmt.query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                    ))
                })?;
                mapped.filter_map(|r| r.ok()).collect()
            };
            for (svc, enc_acc, enc_ref, fallback_acc, fallback_ref) in &rows {
                // Decode whatever is currently in the main columns
                let cur_access  = crate::security::decrypt_token(enc_acc);
                let cur_refresh = crate::security::decrypt_token(enc_ref);
                // Prefer main column if non-empty, else fall back to the *_fallback column
                let real_access  = if !cur_access.is_empty()  { cur_access  } else { crate::security::decrypt_token(fallback_acc) };
                let real_refresh = if !cur_refresh.is_empty() { cur_refresh } else { crate::security::decrypt_token(fallback_ref) };
                // Skip sentinel values that were never real tokens
                let real_access  = if real_access.starts_with('[')  { String::new() } else { real_access };
                let real_refresh = if real_refresh.starts_with('[') { String::new() } else { real_refresh };
                if real_access.is_empty() && real_refresh.is_empty() { continue; }
                let new_enc_access  = crate::security::encrypt_token(&real_access);
                let new_enc_refresh = crate::security::encrypt_token(&real_refresh);
                tx.execute(
                    "UPDATE credentials SET access_token=?1, refresh_token=?2 WHERE service=?3",
                    rusqlite::params![new_enc_access, new_enc_refresh, svc],
                ).ok();
            }
        }
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (5, ?1)",
            rusqlite::params![now_iso()],
        )?;
        tx.commit()?;
    }

    // ── Migration 6: extend calendar_events with richer fields ──────────────
    if current_version < 6 {
        let tx = conn.unchecked_transaction()?;
        ensure_column(&tx, "calendar_events", "end_time",    "TEXT")?;
        ensure_column(&tx, "calendar_events", "description", "TEXT")?;
        ensure_column(&tx, "calendar_events", "location",    "TEXT")?;
        ensure_column(&tx, "calendar_events", "is_all_day",  "INTEGER NOT NULL DEFAULT 0")?;
        ensure_column(&tx, "calendar_events", "source",      "TEXT NOT NULL DEFAULT 'gcal'")?;
        // Backfill source for events that were already custom_ or cal_ prefix
        tx.execute(
            "UPDATE calendar_events SET source='custom' WHERE id LIKE 'custom_%'", []
        ).ok();
        tx.execute(
            "UPDATE calendar_events SET source='email' WHERE id LIKE 'cal_%'", []
        ).ok();
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (6, ?1)",
            rusqlite::params![now_iso()],
        )?;
        tx.commit()?;
    }

    // ── Migration 7: add recurrence_rule to reminders ───────────────────────
    if current_version < 7 {
        let tx = conn.unchecked_transaction()?;
        ensure_column(&tx, "reminders", "recurrence_rule", "TEXT NOT NULL DEFAULT 'none'")?;
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (7, ?1)",
            rusqlite::params![now_iso()],
        )?;
        tx.commit()?;
    }

    // ── Migration 10: unique index on reminders to prevent exact duplicates ──
    // Prevents two reminders for the same item firing at the exact same time,
    // which could happen if sync runs overlap or user saves a reminder twice.
    if current_version < 10 {
        let tx = conn.unchecked_transaction()?;
        // Deduplicate any existing exact duplicates before adding the index
        tx.execute_batch("
            DELETE FROM reminders
            WHERE rowid NOT IN (
                SELECT MIN(rowid)
                FROM reminders
                GROUP BY item_id, reminder_date
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_item_date
                ON reminders(item_id, reminder_date);
        ")?;
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (10, ?1)",
            rusqlite::params![now_iso()],
        )?;
        tx.commit()?;
    }

    // ── Migration 8: UNIQUE constraint on habit_completions ──────────────────
    // Prevents duplicate completions from double-taps / race conditions.
    // Uses CREATE UNIQUE INDEX instead of ALTER TABLE so it is safe to run
    // even if the table already has data (duplicates would have been caught
    // by INSERT OR IGNORE added to the insert handler).
    if current_version < 8 {
        let tx = conn.unchecked_transaction()?;
        // Remove any existing duplicates first (keep the earliest row per pair)
        tx.execute_batch("
            DELETE FROM habit_completions
            WHERE rowid NOT IN (
                SELECT MIN(rowid)
                FROM habit_completions
                GROUP BY habit_id, completed_date
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_completions_unique
                ON habit_completions(habit_id, completed_date);
        ")?;
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (8, ?1)",
            rusqlite::params![now_iso()],
        )?;
        tx.commit()?;
    }

    // ── Migration 9: source_item_id column on reminders ──────────────────────
    // Allows dedup check: is there already a reminder for this event at this time?
    if current_version < 9 {
        let tx = conn.unchecked_transaction()?;
        ensure_column(&tx, "reminders", "source_item_id", "TEXT NOT NULL DEFAULT ''")?;
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (9, ?1)",
            rusqlite::params![now_iso()],
        )?;
        tx.commit()?;
    }

    // ── Future migrations: add a new `if current_version < N` block here ─────

    Ok(())
}


// ─── Custom RSS Feeds ────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct CustomFeed {
    pub id: String,
    pub title: String,
    pub url: String,
    pub category: String,
    pub created_at: String,
}

pub fn save_custom_feed(conn: &Connection, title: &str, url: &str, category: &str) -> Result<CustomFeed> {
    let id = format!("feed_{}", uuid_simple_db());
    let now = now_iso();
    let feed = CustomFeed {
        id: id.clone(),
        title: title.to_string(),
        url: url.to_string(),
        category: category.to_string(),
        created_at: now.clone(),
    };
    conn.execute(
        "INSERT INTO custom_feeds (id, title, url, category, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, title, url, category, now],
    )?;
    Ok(feed)
}

pub fn get_custom_feeds(conn: &Connection) -> Result<Vec<CustomFeed>> {
    let mut stmt = conn.prepare("SELECT id, title, url, category, created_at FROM custom_feeds ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], |row| {
        Ok(CustomFeed {
            id: row.get(0)?,
            title: row.get(1)?,
            url: row.get(2)?,
            category: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "custom".into()),
            created_at: row.get(4)?,
        })
    })?;
    let mut list = Vec::new();
    for r in rows { list.push(r?); }
    Ok(list)
}

pub fn delete_custom_feed(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM custom_feeds WHERE id = ?1", params![id])?;
    Ok(())
}


pub fn get_app_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_app_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct UserBehaviorProfile {
    pub morning_routine_type: String, // "executive_strategy" (default) or "deep_coding"
    pub peak_focus_hours: String,     // "afternoon" (default), "morning", "evening"
    pub interest_priority: String,    // "industry_and_market" (default), "pure_tech"
    pub work_start_hour: String,      // "09:30" (default)
}

pub fn get_user_behavior_profile(conn: &Connection) -> UserBehaviorProfile {
    let morning_routine_type = get_app_setting(conn, "morning_routine_type")
        .ok()
        .flatten()
        .unwrap_or_else(|| "executive_strategy".to_string());
    let peak_focus_hours = get_app_setting(conn, "peak_focus_hours")
        .ok()
        .flatten()
        .unwrap_or_else(|| "afternoon".to_string());
    let interest_priority = get_app_setting(conn, "interest_priority")
        .ok()
        .flatten()
        .unwrap_or_else(|| "industry_and_market".to_string());
    let work_start_hour = get_app_setting(conn, "work_start_hour")
        .ok()
        .flatten()
        .unwrap_or_else(|| "09:30".to_string());

    UserBehaviorProfile {
        morning_routine_type,
        peak_focus_hours,
        interest_priority,
        work_start_hour,
    }
}


// ─── Feed Interactions & Weekly Reviews ─────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct FeedInteraction {
    pub id: String,
    pub item_id: String,
    pub item_source: String,
    pub tags: String,
    pub action: String,
    pub created_at: String,
}

pub fn record_feed_interaction(conn: &Connection, item_id: &str, item_source: &str, tags: &str, action: &str) -> Result<()> {
    let id = format!("fi_{}", uuid_simple_db());
    conn.execute(
        "INSERT INTO feed_interactions (id, item_id, item_source, tags, action, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, item_id, item_source, tags, action, now_iso()],
    )?;
    Ok(())
}

pub fn get_recent_interactions(conn: &Connection, days: i64) -> Result<Vec<FeedInteraction>> {
    let offset = format!("-{} days", days);
    let mut stmt = conn.prepare(
        "SELECT id, item_id, item_source, tags, action, created_at
         FROM feed_interactions
         WHERE datetime(created_at) >= datetime('now', ?1)"
    )?;
    let rows = stmt.query_map(params![offset], |row| {
        Ok(FeedInteraction {
            id: row.get(0)?,
            item_id: row.get(1)?,
            item_source: row.get(2)?,
            tags: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "[]".into()),
            action: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    let mut list = Vec::new();
    for r in rows { list.push(r?); }
    Ok(list)
}

pub fn get_weekly_review(conn: &Connection, week: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT review_text FROM weekly_reviews WHERE week = ?1")?;
    let mut rows = stmt.query(params![week])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn save_weekly_review(conn: &Connection, week: &str, review_text: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO weekly_reviews (week, review_text, generated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(week) DO UPDATE SET review_text=excluded.review_text, generated_at=excluded.generated_at",
        params![week, review_text, now_iso()],
    )?;
    Ok(())
}

fn uuid_simple_db() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    format!("{:x}", t)
}


// ─── Knowledge Items ─────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct KnowledgeItem {
    pub id: String,
    pub content: String,
    pub url: Option<String>,
    pub tags: String,   // JSON array string e.g. '["ai","rust"]'
    pub summary: Option<String>,
    pub source: String,
    pub created_at: String,
}

pub fn save_knowledge_item(conn: &Connection, item: &KnowledgeItem) -> Result<()> {
    conn.execute(
        "INSERT INTO knowledge_items (id, content, url, tags, summary, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![item.id, item.content, item.url, item.tags, item.summary, item.source, item.created_at],
    )?;
    Ok(())
}

pub fn update_knowledge_item_tags(conn: &Connection, id: &str, tags: &str, summary: &str) -> Result<()> {
    conn.execute(
        "UPDATE knowledge_items SET tags = ?1, summary = ?2 WHERE id = ?3",
        params![tags, summary, id],
    )?;
    Ok(())
}

pub fn get_knowledge_items(conn: &Connection, limit: usize) -> Result<Vec<KnowledgeItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, url, tags, summary, source, created_at
         FROM knowledge_items ORDER BY created_at DESC LIMIT ?1"
    )?;
    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(KnowledgeItem {
            id: row.get(0)?,
            content: row.get(1)?,
            url: row.get(2)?,
            tags: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "[]".into()),
            summary: row.get(4)?,
            source: row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "manual".into()),
            created_at: row.get(6)?,
        })
    })?;
    let mut list = Vec::new();
    for r in rows { list.push(r?); }
    Ok(list)
}

// ─── Decisions ───────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct Decision {
    pub id: String,
    pub decision: String,
    pub rationale: String,
    pub alternatives: Option<String>,
    pub outcome: Option<String>,
    pub created_at: String,
}

pub fn save_decision(conn: &Connection, item: &Decision) -> Result<()> {
    conn.execute(
        "INSERT INTO decisions (id, decision, rationale, alternatives, outcome, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![item.id, item.decision, item.rationale, item.alternatives, item.outcome, item.created_at],
    )?;
    Ok(())
}

pub fn get_decisions(conn: &Connection, limit: usize) -> Result<Vec<Decision>> {
    let mut stmt = conn.prepare(
        "SELECT id, decision, rationale, alternatives, outcome, created_at
         FROM decisions ORDER BY created_at DESC LIMIT ?1"
    )?;
    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(Decision {
            id: row.get(0)?,
            decision: row.get(1)?,
            rationale: row.get(2)?,
            alternatives: row.get(3)?,
            outcome: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    let mut list = Vec::new();
    for r in rows { list.push(r?); }
    Ok(list)
}



#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct FeedItem {
    pub id: String,
    pub source: String,
    pub title: String,
    pub url: String,
    pub summary: Option<String>,
    pub score: i64,
    pub relevance_score: f64,
    pub fetched_at: String,
}

pub fn upsert_feed_item(conn: &Connection, item: &FeedItem) -> Result<()> {
    conn.execute(
        "INSERT INTO feed_items (id, source, title, url, summary, score, relevance_score, fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
            score=excluded.score,
            relevance_score=excluded.relevance_score,
            fetched_at=excluded.fetched_at",
        params![item.id, item.source, item.title, item.url, item.summary, item.score, item.relevance_score, item.fetched_at],
    )?;
    Ok(())
}

pub fn get_recent_feed_items(conn: &Connection, since_hours: i64, limit: usize) -> Result<Vec<FeedItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, source, title, url, summary, score, relevance_score, fetched_at
         FROM feed_items
         WHERE datetime(fetched_at) >= datetime('now', ?1)
         ORDER BY score DESC, relevance_score DESC LIMIT ?2"
    )?;
    let offset = format!("-{} hours", since_hours);
    let rows = stmt.query_map(params![offset, limit as i64], |row| {
        Ok(FeedItem {
            id: row.get(0)?,
            source: row.get(1)?,
            title: row.get(2)?,
            url: row.get(3)?,
            summary: row.get(4)?,
            score: row.get(5)?,
            relevance_score: row.get(6)?,
            fetched_at: row.get(7)?,
        })
    })?;
    let mut list = Vec::new();
    for r in rows { list.push(r?); }
    Ok(list)
}

pub fn get_morning_brief(conn: &Connection, date: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT brief_text FROM morning_briefs WHERE date = ?1")?;
    let mut rows = stmt.query(params![date])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn save_morning_brief(conn: &Connection, date: &str, brief_text: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO morning_briefs (date, brief_text, generated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(date) DO UPDATE SET brief_text=excluded.brief_text, generated_at=excluded.generated_at",
        params![date, brief_text, now_iso()],
    )?;
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct VoiceEdit {

    pub id: String,
    pub queue_item_id: String,
    pub original_draft: String,
    pub edited_draft: String,
    pub created_at: String,
}

pub fn record_voice_edit(conn: &Connection, queue_item_id: &str, original_draft: &str, edited_draft: &str) -> Result<()> {
    let id = format!("ve_{}", now_iso().replace(':', "-"));
    conn.execute(
        "INSERT INTO voice_edits (id, queue_item_id, original_draft, edited_draft, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, queue_item_id, original_draft, edited_draft, now_iso()],
    )?;
    Ok(())
}

pub fn get_recent_voice_edits(conn: &Connection, limit: usize) -> Result<Vec<VoiceEdit>> {
    let mut stmt = conn.prepare("SELECT id, queue_item_id, original_draft, edited_draft, created_at FROM voice_edits ORDER BY created_at DESC LIMIT ?1")?;
    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(VoiceEdit {
            id: row.get(0)?,
            queue_item_id: row.get(1)?,
            original_draft: row.get(2)?,
            edited_draft: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}


pub fn get_queue_item_by_id(conn: &Connection, id: &str) -> Result<Option<QueueItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, source, kind, sender, preview, draft_text, status, flagged, confidence, created_at, updated_at, thread_id, message_id, urgency,
                COALESCE(needs_reply, 1), COALESCE(triage_status, 'active')
         FROM queue_items WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        let flagged_int: i32 = row.get(7)?;
        let needs_reply_int: i32 = row.get(14)?;
        Ok(QueueItem {
            id: row.get(0)?,
            source: row.get(1)?,
            kind: row.get(2)?,
            sender: row.get(3)?,
            preview: row.get(4)?,
            draft_text: row.get(5)?,
            status: row.get(6)?,
            flagged: flagged_int != 0,
            confidence: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            thread_id: row.get(11)?,
            message_id: row.get(12)?,
            urgency: row.get(13)?,
            needs_reply: needs_reply_int != 0,
            triage_status: row.get(15)?,
        })
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn get_all_queue_items(conn: &Connection) -> Result<Vec<QueueItem>> {
    // Emails older than 90 days that are already handled (sent/skipped/approved)
    // are auto-pruned here to prevent unbounded growth.
    conn.execute(
        "DELETE FROM queue_items
         WHERE source = 'gmail'
           AND status IN ('sent','skipped','approved','edited')
           AND datetime(created_at) < datetime('now','-90 days')",
        [],
    ).ok();

    let mut stmt = conn.prepare(
        "SELECT id, source, kind, sender, preview, draft_text, status, flagged, confidence, created_at, updated_at, thread_id, message_id, urgency,
                COALESCE(needs_reply, 1), COALESCE(triage_status, 'active')
         FROM queue_items ORDER BY created_at DESC",
    )?;
    let items_iter = stmt.query_map([], |row| {
        let flagged_int: i32 = row.get(7)?;
        let needs_reply_int: i32 = row.get(14)?;
        Ok(QueueItem {
            id: row.get(0)?,
            source: row.get(1)?,
            kind: row.get(2)?,
            sender: row.get(3)?,
            preview: row.get(4)?,
            draft_text: row.get(5)?,
            status: row.get(6)?,
            flagged: flagged_int != 0,
            confidence: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            thread_id: row.get(11)?,
            message_id: row.get(12)?,
            urgency: row.get(13)?,
            needs_reply: needs_reply_int != 0,
            triage_status: row.get(15)?,
        })
    })?;

    let mut items = Vec::new();
    for item in items_iter {
        items.push(item?);
    }
    Ok(items)
}

pub fn insert_queue_item(conn: &Connection, item: &QueueItem) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO queue_items
             (id, source, kind, sender, preview, draft_text, status, flagged, confidence,
              created_at, updated_at, thread_id, message_id, urgency, needs_reply, triage_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            item.id,
            item.source,
            item.kind,
            item.sender,
            item.preview,
            item.draft_text,
            item.status,
            if item.flagged { 1 } else { 0 },
            item.confidence,
            item.created_at,
            item.updated_at,
            item.thread_id,
            item.message_id,
            item.urgency.as_deref().unwrap_or("high"),
            if item.needs_reply { 1 } else { 0 },
            item.triage_status
        ],
    )?;
    Ok(())
}



pub fn update_status_and_draft(conn: &Connection, id: &str, status: &str, draft: Option<&str>) -> Result<()> {
    let now = now_iso();
    conn.execute(
        "UPDATE queue_items SET status = ?1, draft_text = ?2, updated_at = ?3 WHERE id = ?4",
        params![status, draft, now, id],
    )?;
    Ok(())
}

pub fn save_credentials(conn: &Connection, creds: &GmailCredentials) -> Result<()> {
    // Resolve real tokens — incoming value may be a sentinel if the caller
    // reconstructed a GmailCredentials from a half-read DB row.
    let real_refresh = if creds.refresh_token.starts_with('[') || creds.refresh_token.is_empty() {
        // Recover from existing encrypted DB column
        let stored: String = conn.query_row(
            "SELECT COALESCE(refresh_token,'') FROM credentials WHERE service=?1",
            rusqlite::params![&creds.service],
            |r| r.get(0),
        ).unwrap_or_default();
        crate::security::decrypt_token(&stored)
    } else {
        creds.refresh_token.clone()
    };

    let real_access = if creds.access_token.starts_with('[') || creds.access_token.is_empty() {
        let stored: String = conn.query_row(
            "SELECT COALESCE(access_token,'') FROM credentials WHERE service=?1",
            rusqlite::params![&creds.service],
            |r| r.get(0),
        ).unwrap_or_default();
        crate::security::decrypt_token(&stored)
    } else {
        creds.access_token.clone()
    };

    // Encrypt before writing to DB
    let enc_refresh = crate::security::encrypt_token(&real_refresh);
    let enc_access  = crate::security::encrypt_token(&real_access);

    conn.execute(
        "INSERT INTO credentials (service, access_token, refresh_token, expires_at, email)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(service) DO UPDATE SET
            access_token  = excluded.access_token,
            refresh_token = excluded.refresh_token,
            expires_at    = excluded.expires_at,
            email         = excluded.email",
        params![creds.service, enc_access, enc_refresh, creds.expires_at, creds.email],
    )?;
    Ok(())
}

pub fn get_credentials(conn: &Connection, service: &str) -> Result<Option<GmailCredentials>> {
    let mut stmt = conn.prepare(
        "SELECT service, access_token, refresh_token, expires_at, email
         FROM credentials WHERE service = ?1"
    )?;
    let mut rows = stmt.query(params![service])?;
    if let Some(row) = rows.next()? {
        let service_key: String = row.get(0)?;
        let enc_access:  String = row.get(1)?;
        let enc_refresh: String = row.get(2)?;
        let access  = crate::security::decrypt_token(&enc_access);
        let refresh = crate::security::decrypt_token(&enc_refresh);
        if refresh.is_empty() {
            eprintln!("[Credentials] WARNING: refresh token for {} empty after decrypt — needs re-auth", service_key);
        }
        Ok(Some(GmailCredentials {
            service: service_key,
            access_token: access,
            refresh_token: refresh,
            expires_at: row.get(3)?,
            email: row.get(4)?,
        }))
    } else if service == "gmail" {
        // Try the first gmail:email@... entry
        let all = get_all_gmail_credentials(conn)?;
        Ok(all.into_iter().next())
    } else {
        Ok(None)
    }
}

pub fn get_all_gmail_credentials(conn: &Connection) -> Result<Vec<GmailCredentials>> {
    let mut stmt = conn.prepare(
        "SELECT service, access_token, refresh_token, expires_at, email
         FROM credentials WHERE service = 'gmail' OR service LIKE 'gmail:%'"
    )?;
    let rows = stmt.query_map([], |row| {
        let service_key: String = row.get(0)?;
        let enc_access:  String = row.get(1)?;
        let enc_refresh: String = row.get(2)?;
        let access  = crate::security::decrypt_token(&enc_access);
        let refresh = crate::security::decrypt_token(&enc_refresh);
        Ok(GmailCredentials {
            service: service_key,
            access_token: access,
            refresh_token: refresh,
            expires_at: row.get(3)?,
            email: row.get(4)?,
        })
    })?;

    let mut list = Vec::new();
    for r in rows { list.push(r?); }

    // Drop rows with empty refresh tokens — they cause invalid_grant and can't be used
    let valid: Vec<_> = list.into_iter().filter(|c| !c.refresh_token.is_empty()).collect();
    if valid.is_empty() {
        eprintln!("[Credentials] No valid Gmail credentials — user needs to re-authenticate.");
    }
    Ok(valid)
}

pub fn delete_credentials(conn: &Connection, service: &str) -> Result<()> {
    conn.execute("DELETE FROM credentials WHERE service = ?1", params![service])?;
    Ok(())
}

pub fn delete_gmail_credentials(conn: &Connection, email: Option<&str>) -> Result<()> {
    match email {
        Some(e) => {
            let key = format!("gmail:{}", e);
            conn.execute(
                "DELETE FROM credentials WHERE service = ?1 OR email = ?2",
                params![key, e],
            )?;
        }
        None => {
            conn.execute(
                "DELETE FROM credentials WHERE service = 'gmail' OR service LIKE 'gmail:%'",
                [],
            )?;
        }
    }
    Ok(())
}

pub fn get_sender_history(conn: &Connection, sender: &str, limit: usize) -> Result<Vec<QueueItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, source, kind, sender, preview, draft_text, status, flagged, confidence, created_at, updated_at, thread_id, message_id, urgency,
                COALESCE(needs_reply, 1), COALESCE(triage_status, 'active')
         FROM queue_items
         WHERE sender = ?1 OR sender LIKE ?2
         ORDER BY created_at DESC LIMIT ?3"
    )?;
    let pattern = format!("%{}%", sender);
    let rows = stmt.query_map(params![sender, pattern, limit as i64], |row| {
        let flagged_int: i32 = row.get(7)?;
        let needs_reply_int: i32 = row.get(14)?;
        Ok(QueueItem {
            id: row.get(0)?,
            source: row.get(1)?,
            kind: row.get(2)?,
            sender: row.get(3)?,
            preview: row.get(4)?,
            draft_text: row.get(5)?,
            status: row.get(6)?,
            flagged: flagged_int != 0,
            confidence: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            thread_id: row.get(11)?,
            message_id: row.get(12)?,
            urgency: row.get(13)?,
            needs_reply: needs_reply_int != 0,
            triage_status: row.get(15)?,
        })
    })?;


    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}




pub fn get_synced_calendar_events(conn: &Connection) -> Result<Vec<SyncedCalendarEvent>> {
    // Fetch upcoming + recent events; prune anything more than 30 days in the past
    let mut stmt = conn.prepare(
        "SELECT id, queue_item_id, event_id, summary, event_date,
                end_time, description, location,
                COALESCE(is_all_day, 0), COALESCE(source, 'gcal'), created_at
         FROM calendar_events
         WHERE event_date >= datetime('now', '-30 days')
            OR source = 'custom'
         ORDER BY event_date ASC"
    )?;
    let event_iter = stmt.query_map([], |row| {
        let is_all_day_int: i32 = row.get(8)?;
        Ok(SyncedCalendarEvent {
            id:            row.get(0)?,
            queue_item_id: row.get(1)?,
            event_id:      row.get(2)?,
            summary:       row.get(3)?,
            event_date:    row.get(4)?,
            end_time:      row.get(5)?,
            description:   row.get(6)?,
            location:      row.get(7)?,
            is_all_day:    is_all_day_int != 0,
            source:        row.get(9)?,
            created_at:    row.get(10)?,
        })
    })?;
    let mut events = Vec::new();
    for event in event_iter { events.push(event?); }
    Ok(events)
}

/// Upsert a calendar event — updates title/time/description if the event already exists
/// (replaces the old INSERT OR IGNORE which left stale data forever).
pub fn record_calendar_event(conn: &Connection, evt: &SyncedCalendarEvent) -> Result<()> {
    conn.execute(
        "INSERT INTO calendar_events
             (id, queue_item_id, event_id, summary, event_date, end_time,
              description, location, is_all_day, source, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
         ON CONFLICT(id) DO UPDATE SET
             summary     = excluded.summary,
             event_date  = excluded.event_date,
             end_time    = excluded.end_time,
             description = excluded.description,
             location    = excluded.location,
             is_all_day  = excluded.is_all_day,
             source      = excluded.source",
        params![
            evt.id, evt.queue_item_id, evt.event_id, evt.summary,
            evt.event_date, evt.end_time, evt.description, evt.location,
            if evt.is_all_day { 1 } else { 0 }, evt.source, evt.created_at
        ],
    )?;
    Ok(())
}

/// Persist a custom (manually-added) calendar event created from the frontend.
/// Custom events are kept permanently (never pruned by the 30-day window).
pub fn record_custom_calendar_event(conn: &Connection, evt: &SyncedCalendarEvent) -> Result<()> {
    conn.execute(
        "INSERT INTO calendar_events
             (id, queue_item_id, event_id, summary, event_date, end_time,
              description, location, is_all_day, source, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'custom',?10)
         ON CONFLICT(id) DO UPDATE SET
             summary    = excluded.summary,
             event_date = excluded.event_date,
             end_time   = excluded.end_time,
             description= excluded.description,
             location   = excluded.location",
        params![
            evt.id, evt.queue_item_id, evt.event_id, evt.summary,
            evt.event_date, evt.end_time, evt.description, evt.location,
            if evt.is_all_day { 1 } else { 0 }, evt.created_at
        ],
    )?;
    Ok(())
}

/// Delete a custom event by ID (only custom events can be deleted from the frontend).
pub fn delete_custom_calendar_event(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM calendar_events WHERE id = ?1 AND source = 'custom'",
        params![id],
    )?;
    Ok(())
}

// ─── Analytics: Response Time Tracking ──────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct ResponseAnalytics {
    pub id: String,
    pub queue_item_id: String,
    pub sender: String,
    pub category: Option<String>,
    pub received_at: String,
    pub responded_at: Option<String>,
    pub response_time_seconds: Option<i64>,
    pub draft_generation_time_ms: Option<i64>,
}

pub fn record_response_analytics(
    conn: &Connection,
    queue_item_id: &str,
    sender: &str,
    category: Option<&str>,
    received_at: &str,
    responded_at: Option<&str>,
    response_time_seconds: Option<i64>,
    draft_generation_time_ms: Option<i64>,
) -> Result<()> {
    let id = format!("ra_{}", uuid_simple_db());
    conn.execute(
        "INSERT INTO response_analytics (id, queue_item_id, sender, category, received_at, responded_at, response_time_seconds, draft_generation_time_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, queue_item_id, sender, category, received_at, responded_at, response_time_seconds, draft_generation_time_ms],
    )?;
    Ok(())
}

pub fn get_response_analytics(conn: &Connection, days: i64) -> Result<Vec<ResponseAnalytics>> {
    let offset = format!("-{} days", days);
    let mut stmt = conn.prepare(
        "SELECT id, queue_item_id, sender, category, received_at, responded_at, response_time_seconds, draft_generation_time_ms
         FROM response_analytics
         WHERE datetime(received_at) >= datetime('now', ?1)
         ORDER BY received_at DESC"
    )?;
    let rows = stmt.query_map(params![offset], |row| {
        Ok(ResponseAnalytics {
            id: row.get(0)?,
            queue_item_id: row.get(1)?,
            sender: row.get(2)?,
            category: row.get(3)?,
            received_at: row.get(4)?,
            responded_at: row.get(5)?,
            response_time_seconds: row.get(6)?,
            draft_generation_time_ms: row.get(7)?,
        })
    })?;
    let mut list = Vec::new();
    for r in rows { list.push(r?); }
    Ok(list)
}

pub fn get_avg_response_time_by_category(conn: &Connection, days: i64) -> Result<Vec<(String, f64)>> {
    let offset = format!("-{} days", days);
    let mut stmt = conn.prepare(
        "SELECT category, AVG(response_time_seconds) as avg_time
         FROM response_analytics
         WHERE datetime(received_at) >= datetime('now', ?1) AND response_time_seconds IS NOT NULL
         GROUP BY category
         ORDER BY avg_time"
    )?;
    let rows = stmt.query_map(params![offset], |row| {
        Ok((
            row.get::<_, Option<String>>(0)?.unwrap_or_else(|| "uncategorized".into()),
            row.get::<_, f64>(1)?,
        ))
    })?;
    let mut list = Vec::new();
    for r in rows { list.push(r?); }
    Ok(list)
}

// ─── Productivity: Tasks ─────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub source_item_id: Option<String>,
    pub due_date: Option<String>,
    pub priority: String,
    pub status: String,
    pub created_at: String,
    pub completed_at: Option<String>,
}

pub fn create_task(conn: &Connection, task: &Task) -> Result<()> {
    conn.execute(
        "INSERT INTO tasks (id, title, description, source_item_id, due_date, priority, status, created_at, completed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![task.id, task.title, task.description, task.source_item_id, task.due_date, task.priority, task.status, task.created_at, task.completed_at],
    )?;
    Ok(())
}

pub fn get_tasks(conn: &Connection, status_filter: Option<&str>) -> Result<Vec<Task>> {
    fn map_task_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
        Ok(Task {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            source_item_id: row.get(3)?,
            due_date: row.get(4)?,
            priority: row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "medium".into()),
            status: row.get::<_, Option<String>>(6)?.unwrap_or_else(|| "pending".into()),
            created_at: row.get(7)?,
            completed_at: row.get(8)?,
        })
    }

    let mut list = Vec::new();

    if let Some(status) = status_filter {
        let mut stmt = conn.prepare(
            "SELECT id, title, description, source_item_id, due_date, priority, status, created_at, completed_at FROM tasks WHERE status = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![status], map_task_row)?;
        for r in rows {
            list.push(r?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, title, description, source_item_id, due_date, priority, status, created_at, completed_at FROM tasks ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], map_task_row)?;
        for r in rows {
            list.push(r?);
        }
    }

    Ok(list)
}

pub fn update_task_status(conn: &Connection, id: &str, status: &str) -> Result<()> {
    let completed_at = if status == "completed" { Some(now_iso()) } else { None };
    conn.execute(
        "UPDATE tasks SET status = ?1, completed_at = ?2 WHERE id = ?3",
        params![status, completed_at, id],
    )?;
    Ok(())
}

pub fn update_task(
    conn: &Connection,
    id: &str,
    title: &str,
    description: Option<&str>,
    due_date: Option<&str>,
    priority: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE tasks SET title = ?1, description = ?2, due_date = ?3, priority = ?4 WHERE id = ?5",
        params![title, description, due_date, priority, id],
    )?;
    Ok(())
}


pub fn delete_task(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    Ok(())
}

// ─── Productivity: Reminders ─────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct Reminder {
    pub id: String,
    pub item_id: String,
    pub reminder_date: String,
    pub message: String,
    pub status: String,
    pub created_at: String,
    pub triggered_at: Option<String>,
    /// How often to re-fire: "none" | "daily" | "every_2_days" | "weekly" | "weekdays"
    #[serde(default = "default_recurrence")]
    pub recurrence_rule: String,
}

fn default_recurrence() -> String { "none".to_string() }

pub fn create_reminder(conn: &Connection, reminder: &Reminder) -> Result<()> {
    conn.execute(
        // INSERT OR IGNORE: the UNIQUE index on (item_id, reminder_date) means
        // an identical reminder is silently dropped rather than causing an error.
        "INSERT OR IGNORE INTO reminders (id, item_id, reminder_date, message, status, created_at, triggered_at, recurrence_rule)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![reminder.id, reminder.item_id, reminder.reminder_date, reminder.message,
                reminder.status, reminder.created_at, reminder.triggered_at,
                reminder.recurrence_rule],
    )?;
    Ok(())
}

pub fn get_pending_reminders(conn: &Connection) -> Result<Vec<Reminder>> {
    let mut stmt = conn.prepare(
        "SELECT id, item_id, reminder_date, message, status, created_at, triggered_at,
                COALESCE(recurrence_rule,'none')
         FROM reminders
         WHERE status = 'pending' AND datetime(reminder_date) <= datetime('now')
         ORDER BY reminder_date"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Reminder {
            id:               row.get(0)?,
            item_id:          row.get(1)?,
            reminder_date:    row.get(2)?,
            message:          row.get(3)?,
            status:           row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "pending".into()),
            created_at:       row.get(5)?,
            triggered_at:     row.get(6)?,
            recurrence_rule:  row.get(7)?,
        })
    })?;
    let mut list = Vec::new();
    for r in rows { list.push(r?); }
    Ok(list)
}

pub fn set_draft_generation_time_ms(conn: &Connection, id: &str, ms: i64) -> Result<()> {
    conn.execute(
        "UPDATE queue_items SET draft_generation_time_ms = ?1 WHERE id = ?2",
        params![ms, id],
    )?;
    Ok(())
}

/// Records how many characters the user changed from the AI draft to what was sent.
/// 0 = approved as-is (AI nailed it), higher = more rewriting.
/// This is a quality signal that accumulates over time to improve the voice corpus selection.
pub fn record_draft_edit_distance(conn: &Connection, id: &str, original: &str, sent: &str) -> Result<()> {
    // Simple edit distance approximation: character-level difference count
    // Good enough for ranking "approved as-is" vs "completely rewritten"
    let distance = levenshtein_approx(original, sent) as i64;
    conn.execute(
        "UPDATE queue_items SET draft_edit_distance = ?1 WHERE id = ?2",
        params![distance, id],
    )?;
    Ok(())
}

/// Approximate character-level edit distance (fast, not full Levenshtein).
/// Counts characters in common to estimate distance without O(n²) memory.
fn levenshtein_approx(a: &str, b: &str) -> usize {
    let a_len = a.chars().count();
    let b_len = b.chars().count();
    // Quick wins: identical or empty
    if a == b { return 0; }
    if a_len == 0 { return b_len; }
    if b_len == 0 { return a_len; }
    // Estimate: max possible distance minus matching bigrams
    let a_lower = a.to_lowercase();
    let b_lower = b.to_lowercase();
    let matching: usize = a_lower.chars().zip(b_lower.chars()).filter(|(c1, c2)| c1 == c2).count();
    (a_len.max(b_len)).saturating_sub(matching)
}

pub fn get_draft_generation_time_ms(conn: &Connection, id: &str) -> Result<Option<i64>> {
    match conn.query_row(
        "SELECT draft_generation_time_ms FROM queue_items WHERE id = ?1",
        params![id],
        |row| row.get::<_, Option<i64>>(0),
    ) {
        Ok(val) => Ok(val),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn task_exists_for_source(conn: &Connection, source_item_id: &str) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE source_item_id = ?1",
        params![source_item_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn delete_reminder(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM reminders WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn snooze_reminder(conn: &Connection, id: &str, new_date: &str) -> Result<()> {
    conn.execute(
        "UPDATE reminders SET reminder_date = ?1, status = 'pending', triggered_at = NULL WHERE id = ?2",
        params![new_date, id],
    )?;
    Ok(())
}

pub fn mark_reminder_triggered(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE reminders SET status = 'triggered', triggered_at = ?1 WHERE id = ?2",
        params![now_iso(), id],
    )?;
    Ok(())
}

pub fn get_reminders(conn: &Connection) -> Result<Vec<Reminder>> {
    let mut stmt = conn.prepare(
        "SELECT id, item_id, reminder_date, message, status, created_at, triggered_at,
                COALESCE(recurrence_rule,'none')
         FROM reminders
         WHERE status = 'pending'
         ORDER BY reminder_date",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Reminder {
            id:              row.get(0)?,
            item_id:         row.get(1)?,
            reminder_date:   row.get(2)?,
            message:         row.get(3)?,
            status:          row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "pending".into()),
            created_at:      row.get(5)?,
            triggered_at:    row.get(6)?,
            recurrence_rule: row.get(7)?,
        })
    })?;
    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}

// ─── Productivity: Pomodoro Sessions ─────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct PomodoroSession {
    pub id: String,
    pub task_id: Option<String>,
    pub duration_minutes: i64,
    pub completed: bool,
    pub started_at: String,
    pub ended_at: Option<String>,
}

pub fn create_pomodoro_session(conn: &Connection, session: &PomodoroSession) -> Result<()> {
    conn.execute(
        "INSERT INTO pomodoro_sessions (id, task_id, duration_minutes, completed, started_at, ended_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![session.id, session.task_id, session.duration_minutes, if session.completed { 1 } else { 0 }, session.started_at, session.ended_at],
    )?;
    Ok(())
}

pub fn get_pomodoro_sessions(conn: &Connection, days: i64) -> Result<Vec<PomodoroSession>> {
    let offset = format!("-{} days", days);
    let mut stmt = conn.prepare(
        "SELECT id, task_id, duration_minutes, completed, started_at, ended_at
         FROM pomodoro_sessions
         WHERE datetime(started_at) >= datetime('now', ?1)
         ORDER BY started_at DESC"
    )?;
    let rows = stmt.query_map(params![offset], |row| {
        Ok(PomodoroSession {
            id: row.get(0)?,
            task_id: row.get(1)?,
            duration_minutes: row.get(2)?,
            completed: row.get::<_, i32>(3)? != 0,
            started_at: row.get(4)?,
            ended_at: row.get(5)?,
        })
    })?;
    let mut list = Vec::new();
    for r in rows { list.push(r?); }
    Ok(list)
}

pub fn complete_pomodoro_session(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE pomodoro_sessions SET completed = 1, ended_at = ?1 WHERE id = ?2",
        params![now_iso(), id],
    )?;
    Ok(())
}

// ─── Life Intelligence: Life Events ──────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct LifeEvent {
    pub id: String,
    pub title: String,
    pub raw_input: String,
    pub intent: String,
    pub event_date: Option<String>,
    pub status: String,
    pub created_at: String,
    pub tasks: Vec<LifeTask>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct LifeTask {
    pub id: String,
    pub life_event_id: String,
    pub title: String,
    pub description: Option<String>,
    pub due_date: Option<String>,
    pub priority: String,
    pub status: String,
    pub created_at: String,
}

pub fn insert_life_event(conn: &Connection, id: &str, title: &str, raw_input: &str, intent: &str, event_date: Option<&str>) -> Result<()> {
    conn.execute(
        "INSERT INTO life_events (id, title, raw_input, intent, event_date, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6)",
        params![id, title, raw_input, intent, event_date, now_iso()],
    )?;
    Ok(())
}

pub fn insert_life_task(conn: &Connection, id: &str, life_event_id: &str, title: &str, description: Option<&str>, due_date: Option<&str>, priority: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO tasks (id, title, description, source_item_id, due_date, priority, status, created_at, life_event_id)
         VALUES (?1, ?2, ?3, NULL, ?4, ?5, 'pending', ?6, ?7)",
        params![id, title, description, due_date, priority, now_iso(), life_event_id],
    )?;
    Ok(())
}

pub fn get_life_events(conn: &Connection) -> Result<Vec<LifeEvent>> {
    // Load all life events
    let mut stmt = conn.prepare(
        "SELECT id, title, raw_input, intent, event_date, status, created_at
         FROM life_events WHERE status != 'cancelled'
         ORDER BY created_at DESC LIMIT 50"
    )?;
    let events: Vec<LifeEvent> = stmt.query_map([], |row| {
        Ok(LifeEvent {
            id: row.get(0)?,
            title: row.get(1)?,
            raw_input: row.get(2)?,
            intent: row.get(3)?,
            event_date: row.get(4)?,
            status: row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "active".into()),
            created_at: row.get(6)?,
            tasks: vec![],
        })
    })?.filter_map(|r| r.ok()).collect();

    // Load tasks for each event
    let mut result = Vec::new();
    for mut evt in events {
        let mut tstmt = conn.prepare(
            "SELECT id, life_event_id, title, description, due_date, priority, status, created_at
             FROM tasks WHERE life_event_id = ?1 ORDER BY due_date ASC"
        )?;
        let tasks: Vec<LifeTask> = tstmt.query_map(params![evt.id], |row| {
            Ok(LifeTask {
                id: row.get(0)?,
                life_event_id: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                title: row.get(2)?,
                description: row.get(3)?,
                due_date: row.get(4)?,
                priority: row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "medium".into()),
                status: row.get::<_, Option<String>>(6)?.unwrap_or_else(|| "pending".into()),
                created_at: row.get(7)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        evt.tasks = tasks;
        result.push(evt);
    }
    Ok(result)
}

pub fn update_life_event_status(conn: &Connection, id: &str, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE life_events SET status = ?1 WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}



// ─── Shared User Context Builder ─────────────────────────────────────────────
//
// Single function that assembles a rich, structured snapshot of the user's
// current state. Every AI feature should call this and inject the result into
// its prompt rather than each feature querying the DB independently.
//
// Returns a formatted string block ready for direct insertion into any prompt.

pub fn build_user_context(conn: &Connection) -> String {
    let today = now_iso();
    let today_str = &today[..10];

    let mut ctx = String::new();
    ctx.push_str("═══ USER CONTEXT ═══\n");

    // ── 1. Active projects + today's focus time ───────────────────────────────
    let projects: Vec<(String, i64, i64)> = {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT ap.name, ap.daily_target_minutes,
                    COALESCE(SUM(ptl.minutes_spent), 0) as today_mins
             FROM active_projects ap
             LEFT JOIN project_time_logs ptl ON ptl.project_id = ap.id AND ptl.session_date = ?1
             WHERE ap.status = 'active'
             GROUP BY ap.id
             ORDER BY ap.last_worked_at DESC LIMIT 6",
        ) {
            if let Ok(rows) = stmt.query_map(params![today_str], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
            }) {
                rows.filter_map(|r| r.ok()).collect()
            } else { vec![] }
        } else { vec![] }
    };
    if !projects.is_empty() {
        ctx.push_str("ACTIVE PROJECTS (name | target min/day | done today):\n");
        for (name, target, done) in &projects {
            let pct = if *target > 0 { (done * 100) / target } else { 0 };
            ctx.push_str(&format!("  • {} | {}min target | {}min done ({}%)\n", name, target, done, pct));
        }
    }

    // ── 2. Habit completion status ────────────────────────────────────────────
    let (habits_done, habits_total): (usize, usize) = {
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM daily_habits", [], |r| r.get(0)
        ).unwrap_or(0);
        let done: i64 = conn.query_row(
            "SELECT COUNT(*) FROM habit_completions WHERE completed_date = ?1",
            params![today_str], |r| r.get(0),
        ).unwrap_or(0);
        (done as usize, total as usize)
    };
    if habits_total > 0 {
        ctx.push_str(&format!("HABITS: {}/{} completed today\n", habits_done, habits_total));
    }

    // ── 3. Pending high-priority tasks ────────────────────────────────────────
    let urgent_tasks: Vec<String> = {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT title FROM tasks WHERE status = 'pending' AND priority = 'high'
             ORDER BY due_date ASC NULLS LAST LIMIT 5",
        ) {
            if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                rows.filter_map(|r| r.ok()).collect()
            } else { vec![] }
        } else { vec![] }
    };
    if !urgent_tasks.is_empty() {
        ctx.push_str("HIGH-PRIORITY TASKS:\n");
        for t in &urgent_tasks {
            ctx.push_str(&format!("  • {}\n", t));
        }
    }

    // ── 4. Upcoming life events (next 7 days) ─────────────────────────────────
    let upcoming_events: Vec<(String, String)> = {
        let cutoff = {
            let secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
            let d = ((secs + 7 * 86400) / 86400) as u64;
            let (y, m, dd) = days_to_ymd(d);
            format!("{:04}-{:02}-{:02}", y, m, dd)
        };
        if let Ok(mut stmt) = conn.prepare(
            "SELECT title, event_date FROM life_events
             WHERE status = 'active' AND event_date IS NOT NULL
             AND event_date >= ?1 AND event_date <= ?2
             ORDER BY event_date ASC LIMIT 5",
        ) {
            if let Ok(rows) = stmt.query_map(params![today_str, cutoff], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            }) {
                rows.filter_map(|r| r.ok()).collect()
            } else { vec![] }
        } else { vec![] }
    };
    if !upcoming_events.is_empty() {
        ctx.push_str("UPCOMING EVENTS (7 days):\n");
        for (title, date) in &upcoming_events {
            ctx.push_str(&format!("  • {} — {}\n", title, &date[..10.min(date.len())]));
        }
    }

    // ── 5. Recent decisions ───────────────────────────────────────────────────
    let recent_decisions: Vec<String> = {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT decision, rationale FROM decisions
             ORDER BY created_at DESC LIMIT 3",
        ) {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok(format!("{} ({})", row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            }) {
                rows.filter_map(|r| r.ok()).collect()
            } else { vec![] }
        } else { vec![] }
    };
    if !recent_decisions.is_empty() {
        ctx.push_str("RECENT DECISIONS:\n");
        for d in &recent_decisions {
            ctx.push_str(&format!("  • {}\n", d));
        }
    }

    // ── 6. Top interest topics (last 14 days) ─────────────────────────────────
    let top_interests: Vec<String> = {
        let mut tag_scores: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT tags, action FROM feed_interactions
             WHERE datetime(created_at) >= datetime('now', '-14 days')",
        ) {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            }) {
                for r in rows.flatten() {
                    let weight = match r.1.as_str() {
                        "saved" => 3.0, "opened" => 2.0, "dismissed" => -1.0, _ => 1.0,
                    };
                    let tags: Vec<String> = serde_json::from_str(&r.0).unwrap_or_default();
                    for tag in tags {
                        *tag_scores.entry(tag).or_insert(0.0) += weight;
                    }
                }
            }
        }
        let mut sorted: Vec<(String, f64)> = tag_scores.into_iter()
            .filter(|(_, w)| *w > 0.0).collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        sorted.iter().take(6).map(|(t, _)| t.clone()).collect()
    };
    if !top_interests.is_empty() {
        ctx.push_str(&format!("CURRENT INTERESTS: {}\n", top_interests.join(", ")));
    }

    // ── 7. Recent knowledge captures ─────────────────────────────────────────
    let knowledge_snippets: Vec<String> = {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT summary, tags FROM knowledge_items
             WHERE datetime(created_at) >= datetime('now', '-7 days')
             ORDER BY created_at DESC LIMIT 4",
        ) {
            if let Ok(rows) = stmt.query_map([], |row| {
                let summary: Option<String> = row.get(0)?;
                let tags_raw: Option<String> = row.get(1)?;
                let tags: Vec<String> = serde_json::from_str(
                    tags_raw.as_deref().unwrap_or("[]")
                ).unwrap_or_default();
                Ok(format!("[{}] {}", tags.join("/"), summary.unwrap_or_default()))
            }) {
                rows.filter_map(|r| r.ok())
                    .filter(|s| !s.trim_start_matches('[').trim().is_empty())
                    .collect()
            } else { vec![] }
        } else { vec![] }
    };
    if !knowledge_snippets.is_empty() {
        ctx.push_str("RECENT LEARNING CAPTURES:\n");
        for k in &knowledge_snippets {
            ctx.push_str(&format!("  • {}\n", k));
        }
    }

    // ── 8. Focus streak (consecutive days with logged time) ───────────────────
    let focus_streak: i64 = {
        let mut streak = 0i64;
        for i in 0..30i64 {
            let secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
            let d = ((secs - i * 86400) / 86400) as u64;
            let (y, m, dd) = days_to_ymd(d);
            let check_date = format!("{:04}-{:02}-{:02}", y, m, dd);
            let mins: i64 = conn.query_row(
                "SELECT COALESCE(SUM(minutes_spent), 0) FROM project_time_logs WHERE session_date = ?1",
                params![check_date], |r| r.get(0),
            ).unwrap_or(0);
            if mins > 0 { streak += 1; } else { break; }
        }
        streak
    };
    if focus_streak > 0 {
        ctx.push_str(&format!("FOCUS STREAK: {} consecutive day(s) with logged work\n", focus_streak));
    }

    ctx.push_str("═══════════════════\n");
    ctx
}

// ─── Social Posts ─────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct SocialPostRecord {
    pub id: String,
    pub platform: String,
    pub topic: String,
    pub content: String,
    pub hashtags: String, // JSON array string
    pub media_cue: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn upsert_social_post(conn: &Connection, post: &SocialPostRecord) -> Result<()> {
    conn.execute(
        "INSERT INTO social_posts (id, platform, topic, content, hashtags, media_cue, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            content=excluded.content,
            hashtags=excluded.hashtags,
            media_cue=excluded.media_cue,
            status=excluded.status,
            updated_at=excluded.updated_at",
        params![
            post.id, post.platform, post.topic, post.content,
            post.hashtags, post.media_cue, post.status,
            post.created_at, post.updated_at
        ],
    )?;
    Ok(())
}

pub fn get_social_posts(conn: &Connection) -> Result<Vec<SocialPostRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, platform, topic, content, hashtags, media_cue, status, created_at, updated_at
         FROM social_posts
         WHERE status != 'skipped'
         ORDER BY created_at DESC LIMIT 50"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(SocialPostRecord {
            id: row.get(0)?,
            platform: row.get(1)?,
            topic: row.get(2)?,
            content: row.get(3)?,
            hashtags: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "[]".into()),
            media_cue: row.get(5)?,
            status: row.get::<_, Option<String>>(6)?.unwrap_or_else(|| "pending".into()),
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn update_social_post_status(conn: &Connection, id: &str, status: &str, content: Option<&str>) -> Result<()> {
    let now = now_iso();
    if let Some(c) = content {
        conn.execute(
            "UPDATE social_posts SET status=?1, content=?2, updated_at=?3 WHERE id=?4",
            params![status, c, now, id],
        )?;
    } else {
        conn.execute(
            "UPDATE social_posts SET status=?1, updated_at=?2 WHERE id=?3",
            params![status, now, id],
        )?;
    }
    Ok(())
}

pub fn delete_social_post(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM social_posts WHERE id=?1", params![id])?;
    Ok(())
}
