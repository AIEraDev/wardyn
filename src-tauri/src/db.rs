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
    pub event_date: String,
    pub created_at: String,
}

pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS queue_items (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            kind TEXT NOT NULL,
            sender TEXT NOT NULL,
            preview TEXT NOT NULL,
            draft_text TEXT,
            status TEXT NOT NULL,
            flagged INTEGER NOT NULL,
            confidence REAL NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS credentials (
            service TEXT PRIMARY KEY,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            email TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS calendar_events (
            id TEXT PRIMARY KEY,
            queue_item_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            summary TEXT NOT NULL,
            event_date TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    Ok(())
}

pub fn get_all_queue_items(conn: &Connection) -> Result<Vec<QueueItem>> {
    let mut stmt = conn.prepare("SELECT id, source, kind, sender, preview, draft_text, status, flagged, confidence, created_at, updated_at FROM queue_items ORDER BY created_at DESC")?;
    let items_iter = stmt.query_map([], |row| {
        let flagged_int: i32 = row.get(7)?;
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
        "INSERT OR IGNORE INTO queue_items (id, source, kind, sender, preview, draft_text, status, flagged, confidence, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
            item.updated_at
        ],
    )?;
    Ok(())
}

pub fn update_status_and_draft(conn: &Connection, id: &str, status: &str, draft: Option<&str>) -> Result<()> {
    let now = "2026-07-31T01:50:00Z";
    conn.execute(
        "UPDATE queue_items SET status = ?1, draft_text = ?2, updated_at = ?3 WHERE id = ?4",
        params![status, draft, now, id],
    )?;
    Ok(())
}

pub fn save_credentials(conn: &Connection, creds: &GmailCredentials) -> Result<()> {
    conn.execute(
        "INSERT INTO credentials (service, access_token, refresh_token, expires_at, email)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(service) DO UPDATE SET
            access_token=excluded.access_token,
            refresh_token=excluded.refresh_token,
            expires_at=excluded.expires_at,
            email=excluded.email",
        params![creds.service, creds.access_token, creds.refresh_token, creds.expires_at, creds.email],
    )?;
    Ok(())
}

pub fn get_credentials(conn: &Connection, service: &str) -> Result<Option<GmailCredentials>> {
    let mut stmt = conn.prepare("SELECT service, access_token, refresh_token, expires_at, email FROM credentials WHERE service = ?1")?;
    let mut rows = stmt.query(params![service])?;
    if let Some(row) = rows.next()? {
        Ok(Some(GmailCredentials {
            service: row.get(0)?,
            access_token: row.get(1)?,
            refresh_token: row.get(2)?,
            expires_at: row.get(3)?,
            email: row.get(4)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_credentials(conn: &Connection, service: &str) -> Result<()> {
    conn.execute("DELETE FROM credentials WHERE service = ?1", params![service])?;
    Ok(())
}

pub fn get_synced_calendar_events(conn: &Connection) -> Result<Vec<SyncedCalendarEvent>> {
    let mut stmt = conn.prepare("SELECT id, queue_item_id, event_id, summary, event_date, created_at FROM calendar_events ORDER BY created_at DESC")?;
    let event_iter = stmt.query_map([], |row| {
        Ok(SyncedCalendarEvent {
            id: row.get(0)?,
            queue_item_id: row.get(1)?,
            event_id: row.get(2)?,
            summary: row.get(3)?,
            event_date: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;

    let mut events = Vec::new();
    for event in event_iter {
        events.push(event?);
    }
    Ok(events)
}

pub fn record_calendar_event(conn: &Connection, evt: &SyncedCalendarEvent) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO calendar_events (id, queue_item_id, event_id, summary, event_date, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![evt.id, evt.queue_item_id, evt.event_id, evt.summary, evt.event_date, evt.created_at],
    )?;
    Ok(())
}

pub fn is_calendar_event_synced(conn: &Connection, queue_item_id: &str) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM calendar_events WHERE queue_item_id = ?1",
        params![queue_item_id],
        |r| r.get(0),
    )?;
    Ok(count > 0)
}
