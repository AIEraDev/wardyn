use rusqlite::Connection;
use std::collections::HashMap;
use crate::db;

pub fn record_user_interaction(
    conn_mutex: &std::sync::Mutex<Connection>,
    item_id: String,
    item_source: String,
    tags: String,
    action: String,
) -> Result<(), String> {
    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::record_feed_interaction(&conn, &item_id, &item_source, &tags, &action).map_err(|e| e.to_string())?;
    // Immediately reweight feed items based on updated interest profile
    reweight_feed_items(&conn).ok();
    Ok(())
}

pub fn compute_interest_profile(conn: &Connection) -> HashMap<String, f64> {
    let mut profile = HashMap::new();
    let interactions = db::get_recent_interactions(conn, 30).unwrap_or_default();

    for inter in interactions {
        let weight = match inter.action.as_str() {
            "opened" => 2.0,
            "saved" => 3.0,
            "dismissed" => -1.5,
            _ => 1.0,
        };

        let tags: Vec<String> = serde_json::from_str(&inter.tags).unwrap_or_default();
        for tag in tags {
            let tag_clean = tag.trim().to_lowercase();
            if !tag_clean.is_empty() {
                *profile.entry(tag_clean).or_insert(0.0) += weight;
            }
        }
    }

    profile
}

pub fn reweight_feed_items(conn: &Connection) -> Result<(), String> {
    let profile = compute_interest_profile(conn);
    if profile.is_empty() {
        return Ok(());
    }

    let items = db::get_recent_feed_items(conn, 72, 100).map_err(|e| e.to_string())?;

    for item in items {
        let mut relevance: f64 = 0.0;
        let text_lower = format!("{} {}", item.title, item.summary.as_deref().unwrap_or("")).to_lowercase();

        for (tag, weight) in &profile {
            if text_lower.contains(tag) {
                relevance += weight;
            }
        }

        conn.execute(
            "UPDATE feed_items SET relevance_score = ?1 WHERE id = ?2",
            rusqlite::params![relevance, item.id],
        ).ok();
    }

    Ok(())
}
