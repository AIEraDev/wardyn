/// Habit reminder scheduling — stores reminder times per habit and checks
/// which reminders are due each minute in the background loop.

use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use crate::db::now_iso;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HabitReminder {
    pub id: String,
    pub habit_id: String,
    pub habit_name: String,
    pub habit_icon: String,
    pub remind_time: String,   // "HH:MM" 24h
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewHabitReminder {
    pub habit_id: String,
    pub remind_time: String,
}

/// Returns all reminders, joined with habit name + icon.
pub fn get_reminders(conn: &Connection) -> Result<Vec<HabitReminder>> {
    let mut stmt = conn.prepare(
        "SELECT hr.id, hr.habit_id, dh.name, dh.icon, hr.remind_time, hr.enabled, hr.created_at
         FROM habit_reminders hr
         JOIN daily_habits dh ON dh.id = hr.habit_id
         ORDER BY hr.remind_time ASC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(HabitReminder {
            id: row.get(0)?,
            habit_id: row.get(1)?,
            habit_name: row.get(2)?,
            habit_icon: row.get(3)?,
            remind_time: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>>>()
}

/// Creates a habit reminder. Returns the created reminder.
pub fn create_reminder(conn: &Connection, req: &NewHabitReminder) -> Result<HabitReminder> {
    let id = format!("rem_{}", uuid_v4());
    let now = now_iso();

    // Upsert: if a reminder for this habit already exists, update the time
    conn.execute(
        "INSERT INTO habit_reminders (id, habit_id, remind_time, enabled, created_at)
         VALUES (?1, ?2, ?3, 1, ?4)
         ON CONFLICT(habit_id) DO UPDATE SET remind_time = excluded.remind_time, enabled = 1",
        params![id, req.habit_id, req.remind_time, now],
    )?;

    // Fetch back the actual row (id may differ if conflict updated)
    let mut stmt = conn.prepare(
        "SELECT hr.id, hr.habit_id, dh.name, dh.icon, hr.remind_time, hr.enabled, hr.created_at
         FROM habit_reminders hr
         JOIN daily_habits dh ON dh.id = hr.habit_id
         WHERE hr.habit_id = ?1"
    )?;
    let reminder = stmt.query_row(params![req.habit_id], |row| {
        Ok(HabitReminder {
            id: row.get(0)?,
            habit_id: row.get(1)?,
            habit_name: row.get(2)?,
            habit_icon: row.get(3)?,
            remind_time: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
        })
    })?;
    Ok(reminder)
}

/// Deletes a habit reminder by id.
pub fn delete_reminder(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM habit_reminders WHERE id = ?1", params![id])?;
    Ok(())
}

/// Enables or disables a reminder without deleting it.
pub fn toggle_reminder(conn: &Connection, id: &str, enabled: bool) -> Result<()> {
    conn.execute(
        "UPDATE habit_reminders SET enabled = ?1 WHERE id = ?2",
        params![enabled as i64, id],
    )?;
    Ok(())
}

/// Returns all enabled reminders whose remind_time matches the given HH:MM string,
/// filtering out habits already completed today.
pub fn get_due_reminders(conn: &Connection, hhmm: &str) -> Vec<HabitReminder> {
    let today = { let iso = now_iso(); iso.get(0..10).unwrap_or(&iso).to_string() };

    if let Ok(mut stmt) = conn.prepare(
        "SELECT hr.id, hr.habit_id, dh.name, dh.icon, hr.remind_time, hr.enabled, hr.created_at
         FROM habit_reminders hr
         JOIN daily_habits dh ON dh.id = hr.habit_id
         WHERE hr.enabled = 1
           AND hr.remind_time = ?1
           AND hr.habit_id NOT IN (
             SELECT habit_id FROM habit_completions WHERE completed_date = ?2
           )"
    ) {
        if let Ok(rows) = stmt.query_map(params![hhmm, today], |row| {
            Ok(HabitReminder {
                id: row.get(0)?,
                habit_id: row.get(1)?,
                habit_name: row.get(2)?,
                habit_icon: row.get(3)?,
                remind_time: row.get(4)?,
                enabled: row.get::<_, i64>(5)? != 0,
                created_at: row.get(6)?,
            })
        }) {
            return rows.filter_map(|r| r.ok()).collect();
        }
    }
    vec![]
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{:x}{:08x}", t.as_secs(), t.subsec_nanos())
}
