use crate::db::{self, Decision};
use crate::db::now_iso;

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    format!("{:x}", t)
}

pub fn log_decision(
    conn_mutex: &std::sync::Mutex<rusqlite::Connection>,
    decision: String,
    rationale: String,
    alternatives: Option<String>,
) -> Result<Decision, String> {
    const MAX_INPUT_BYTES: usize = 50 * 1024; // 50 KB
    let total_len = decision.len() + rationale.len() + alternatives.as_deref().map_or(0, |a| a.len());
    if total_len > MAX_INPUT_BYTES {
        return Err(format!(
            "Decision content is too large ({} KB). Maximum allowed is 50 KB.",
            total_len / 1024
        ));
    }

    let item = Decision {
        id: format!("dec_{}", uuid_simple()),
        decision,
        rationale,
        alternatives,
        outcome: None,
        created_at: now_iso(),
    };
    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::save_decision(&conn, &item).map_err(|e| e.to_string())?;
    crate::vault::sync_decision_to_vault(conn_mutex, &item).ok();
    Ok(item)
}


pub fn fetch_decisions(
    conn_mutex: &std::sync::Mutex<rusqlite::Connection>,
    limit: usize,
) -> Result<Vec<Decision>, String> {
    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::get_decisions(&conn, limit).map_err(|e| e.to_string())
}

pub fn update_decision_outcome(
    conn_mutex: &std::sync::Mutex<rusqlite::Connection>,
    id: String,
    outcome: String,
) -> Result<(), String> {
    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE decisions SET outcome = ?1 WHERE id = ?2",
        rusqlite::params![outcome, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
