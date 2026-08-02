use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use crate::db::now_iso;

fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    format!("{}_{:x}", prefix, t)
}

fn today_date() -> String {
    { let iso = now_iso(); iso.get(0..10).unwrap_or(&iso).to_string() }
}

// ─── Models ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActiveProject {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub daily_target_minutes: i64,
    pub last_worked_at: Option<String>,
    pub color: String,
    pub created_at: String,
    // Computed fields (not stored)
    pub today_minutes: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectTimeLog {
    pub id: String,
    pub project_id: String,
    pub session_date: String,
    pub minutes_spent: i64,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewProject {
    pub name: String,
    pub description: Option<String>,
    pub daily_target_minutes: Option<i64>,
    pub color: Option<String>,
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

pub fn create_project(conn: &Connection, req: &NewProject) -> Result<ActiveProject> {
    let id = new_id("proj");
    let now = now_iso();
    conn.execute(
        "INSERT INTO active_projects (id, name, description, status, daily_target_minutes, color, created_at)
         VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6)",
        params![
            id,
            req.name,
            req.description,
            req.daily_target_minutes.unwrap_or(60),
            req.color.as_deref().unwrap_or("#4A8FC2"),
            now
        ],
    )?;
    Ok(ActiveProject {
        id,
        name: req.name.clone(),
        description: req.description.clone(),
        status: "active".into(),
        daily_target_minutes: req.daily_target_minutes.unwrap_or(60),
        last_worked_at: None,
        color: req.color.clone().unwrap_or_else(|| "#4A8FC2".into()),
        created_at: now_iso(),
        today_minutes: 0,
    })
}

pub fn get_projects(conn: &Connection) -> Result<Vec<ActiveProject>> {
    let today = today_date();

    // Single query with LEFT JOIN to get today_minutes — avoids N+1 per project
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.description, p.status, p.daily_target_minutes,
                p.last_worked_at, p.color, p.created_at,
                COALESCE(SUM(t.minutes_spent), 0) as today_minutes
         FROM active_projects p
         LEFT JOIN project_time_logs t ON t.project_id = p.id AND t.session_date = ?1
         WHERE p.status != 'completed'
         GROUP BY p.id
         ORDER BY p.created_at DESC",
    )?;

    let rows = stmt.query_map(params![today], |row| {
        Ok(ActiveProject {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            status: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "active".into()),
            daily_target_minutes: row.get::<_, Option<i64>>(4)?.unwrap_or(60),
            last_worked_at: row.get(5)?,
            color: row.get::<_, Option<String>>(6)?.unwrap_or_else(|| "#4A8FC2".into()),
            created_at: row.get(7)?,
            today_minutes: row.get::<_, Option<i64>>(8)?.unwrap_or(0),
        })
    })?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn update_project(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    description: Option<Option<&str>>,
    status: Option<&str>,
    daily_target_minutes: Option<i64>,
    color: Option<&str>,
) -> Result<()> {
    if let Some(n) = name {
        conn.execute("UPDATE active_projects SET name = ?1 WHERE id = ?2", params![n, id])?;
    }
    if let Some(d) = description {
        conn.execute("UPDATE active_projects SET description = ?1 WHERE id = ?2", params![d, id])?;
    }
    if let Some(s) = status {
        conn.execute("UPDATE active_projects SET status = ?1 WHERE id = ?2", params![s, id])?;
    }
    if let Some(t) = daily_target_minutes {
        conn.execute("UPDATE active_projects SET daily_target_minutes = ?1 WHERE id = ?2", params![t, id])?;
    }
    if let Some(c) = color {
        conn.execute("UPDATE active_projects SET color = ?1 WHERE id = ?2", params![c, id])?;
    }
    Ok(())
}

pub fn delete_project(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM active_projects WHERE id = ?1", params![id])?;
    Ok(())
}

// ─── Time Logging ─────────────────────────────────────────────────────────────

pub fn log_project_session(conn: &Connection, project_id: &str, minutes: i64, notes: Option<&str>) -> Result<ProjectTimeLog> {
    let id = new_id("ptl");
    let now = now_iso();
    let today = today_date();
    conn.execute(
        "INSERT INTO project_time_logs (id, project_id, session_date, minutes_spent, notes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, project_id, today, minutes, notes, now],
    )?;
    // Update last_worked_at
    conn.execute(
        "UPDATE active_projects SET last_worked_at = ?1 WHERE id = ?2",
        params![now, project_id],
    )?;
    Ok(ProjectTimeLog {
        id,
        project_id: project_id.into(),
        session_date: today,
        minutes_spent: minutes,
        notes: notes.map(|s| s.to_string()),
        created_at: now,
    })
}

pub fn get_project_time_logs(conn: &Connection, project_id: &str, days: i64) -> Result<Vec<ProjectTimeLog>> {
    let offset = format!("-{} days", days);
    let mut stmt = conn.prepare(
        "SELECT id, project_id, session_date, minutes_spent, notes, created_at
         FROM project_time_logs
         WHERE project_id = ?1 AND datetime(created_at) >= datetime('now', ?2)
         ORDER BY session_date DESC",
    )?;
    let rows = stmt.query_map(params![project_id, offset], |row| {
        Ok(ProjectTimeLog {
            id: row.get(0)?,
            project_id: row.get(1)?,
            session_date: row.get(2)?,
            minutes_spent: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
            notes: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Returns a map of date → total minutes for all projects in last N days
pub fn get_all_time_logs_recent(conn: &Connection, days: i64) -> Result<Vec<ProjectTimeLog>> {
    let offset = format!("-{} days", days);
    let mut stmt = conn.prepare(
        "SELECT id, project_id, session_date, minutes_spent, notes, created_at
         FROM project_time_logs
         WHERE datetime(created_at) >= datetime('now', ?1)
         ORDER BY session_date DESC",
    )?;
    let rows = stmt.query_map(params![offset], |row| {
        Ok(ProjectTimeLog {
            id: row.get(0)?,
            project_id: row.get(1)?,
            session_date: row.get(2)?,
            minutes_spent: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
            notes: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}
