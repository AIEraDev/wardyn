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
pub struct DailyHabit {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub category: String,
    pub sort_order: i64,
    pub created_at: String,
    // Computed
    pub completed_today: bool,
    pub current_streak: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HabitCompletion {
    pub id: String,
    pub habit_id: String,
    pub completed_date: String,
    pub completed_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewHabit {
    pub name: String,
    pub icon: Option<String>,
    pub category: Option<String>,
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

pub fn create_habit(conn: &Connection, req: &NewHabit) -> Result<DailyHabit> {
    let id = new_id("habit");
    let now = now_iso();
    // Put new habits at bottom
    let max_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) FROM daily_habits",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    conn.execute(
        "INSERT INTO daily_habits (id, name, icon, category, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            req.name,
            req.icon.as_deref().unwrap_or("✅"),
            req.category.as_deref().unwrap_or("general"),
            max_order + 1,
            now
        ],
    )?;

    Ok(DailyHabit {
        id,
        name: req.name.clone(),
        icon: req.icon.clone().unwrap_or_else(|| "✅".into()),
        category: req.category.clone().unwrap_or_else(|| "general".into()),
        sort_order: max_order + 1,
        created_at: now,
        completed_today: false,
        current_streak: 0,
    })
}

pub fn get_habits(conn: &Connection) -> Result<Vec<DailyHabit>> {
    let today = today_date();

    // Single query: join habits with today's completions and 60-day streak data
    // This avoids N+1 queries (one per habit for completion + one per habit for streak)
    let mut stmt = conn.prepare(
        "SELECT h.id, h.name, h.icon, h.category, h.sort_order, h.created_at,
                COUNT(c.id) as done_today
         FROM daily_habits h
         LEFT JOIN habit_completions c
             ON c.habit_id = h.id AND c.completed_date = ?1
         GROUP BY h.id
         ORDER BY h.sort_order ASC, h.created_at ASC",
    )?;

    let rows = stmt.query_map(params![today], |row| {
        Ok(DailyHabit {
            id: row.get(0)?,
            name: row.get(1)?,
            icon: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "✅".into()),
            category: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "general".into()),
            sort_order: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
            created_at: row.get(5)?,
            completed_today: row.get::<_, i64>(6)? > 0,
            current_streak: 0, // filled below in a single batch query
        })
    })?;

    let mut habits: Vec<DailyHabit> = rows.filter_map(|r| r.ok()).collect();

    // Batch-load streaks: fetch last 60 days of completions for all habits in one query,
    // then compute streaks in Rust — avoids one query per habit.
    use std::collections::{HashMap, HashSet};
    let mut completions_by_habit: HashMap<String, HashSet<String>> = HashMap::new();
    {
        let mut cstmt = conn.prepare(
            "SELECT habit_id, completed_date FROM habit_completions
             WHERE completed_date >= date(?1, '-60 days')
             ORDER BY completed_date DESC",
        )?;
        let rows = cstmt.query_map(params![today], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for r in rows.flatten() {
            completions_by_habit.entry(r.0).or_default().insert(r.1);
        }
    }

    for h in &mut habits {
        let dates = completions_by_habit.get(&h.id);
        h.current_streak = compute_streak_from_set(dates, &today);
    }

    Ok(habits)
}

pub fn delete_habit(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM habit_completions WHERE habit_id = ?1", params![id])?;
    conn.execute("DELETE FROM daily_habits WHERE id = ?1", params![id])?;
    Ok(())
}

// ─── Completions ──────────────────────────────────────────────────────────────

pub fn toggle_habit_completion(conn: &Connection, habit_id: &str) -> Result<bool> {
    let today = today_date();
    let existing: i64 = conn.query_row(
        "SELECT COUNT(*) FROM habit_completions WHERE habit_id = ?1 AND completed_date = ?2",
        params![habit_id, today],
        |row| row.get(0),
    ).unwrap_or(0);

    if existing > 0 {
        // Un-complete
        conn.execute(
            "DELETE FROM habit_completions WHERE habit_id = ?1 AND completed_date = ?2",
            params![habit_id, today],
        )?;
        Ok(false)
    } else {
        // Complete
        let id = new_id("hc");
        conn.execute(
            "INSERT INTO habit_completions (id, habit_id, completed_date, completed_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, habit_id, today, now_iso()],
        )?;
        Ok(true)
    }
}

pub fn get_habit_completions_range(conn: &Connection, days: i64) -> Result<Vec<HabitCompletion>> {
    let offset = format!("-{} days", days);
    let mut stmt = conn.prepare(
        "SELECT id, habit_id, completed_date, completed_at
         FROM habit_completions
         WHERE datetime(completed_at) >= datetime('now', ?1)
         ORDER BY completed_date DESC",
    )?;
    let rows = stmt.query_map(params![offset], |row| {
        Ok(HabitCompletion {
            id: row.get(0)?,
            habit_id: row.get(1)?,
            completed_date: row.get(2)?,
            completed_at: row.get(3)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

// ─── Streak Computation ───────────────────────────────────────────────────────

/// Computes streak from a pre-loaded HashSet of completed dates — O(60) with no DB queries.
fn compute_streak_from_set(dates: Option<&std::collections::HashSet<String>>, today: &str) -> i64 {
    let dates = match dates {
        Some(d) if !d.is_empty() => d,
        _ => return 0,
    };
    let mut streak = 0i64;
    for i in 0..60i64 {
        let check_date = offset_date(today, -i);
        if dates.contains(&check_date) {
            streak += 1;
        } else if i == 0 {
            continue; // today not done yet — check yesterday
        } else {
            break;
        }
    }
    streak
}

/// Computes the current streak in days — kept for any direct callers outside get_habits.
#[allow(dead_code)]
fn compute_streak(conn: &Connection, habit_id: &str) -> i64 {
    // Get all unique completed dates, most recent first
    let dates: Vec<String> = if let Ok(mut stmt) = conn.prepare(
        "SELECT DISTINCT completed_date FROM habit_completions WHERE habit_id = ?1 ORDER BY completed_date DESC LIMIT 60",
    ) {
        if let Ok(rows) = stmt.query_map(params![habit_id], |row| row.get(0)) {
            rows.filter_map(|r| r.ok()).collect()
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    if dates.is_empty() {
        return 0;
    }

    let today = today_date();
    let mut streak = 0i64;

    // Walk backwards day by day from today
    for i in 0..60i64 {
        let check_date = offset_date(&today, -i);
        if dates.contains(&check_date) {
            streak += 1;
        } else if i == 0 {
            // Today not completed yet — streak still valid from yesterday
            continue;
        } else {
            break;
        }
    }

    streak
}

/// Returns a date string offset by `days` from the given YYYY-MM-DD date.
fn offset_date(date: &str, days: i64) -> String {
    use crate::db::iso_to_unix_secs;
    let iso = format!("{}T12:00:00Z", date);
    if let Some(secs) = iso_to_unix_secs(&iso) {
        let new_secs = secs + days * 86400;
        if new_secs >= 0 {
            let total_days = (new_secs / 86400) as u64;
            let (y, m, d) = crate::db::days_to_ymd(total_days);
            return format!("{:04}-{:02}-{:02}", y, m, d);
        }
    }
    date.to_string()
}
