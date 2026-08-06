use rusqlite::Connection;
use std::collections::HashMap;
use crate::db;

const OLLAMA_BASE: &str = "http://localhost:11434";

/// Fetches an embedding vector from Ollama's /api/embeddings endpoint.
/// Returns None if Ollama is unavailable or the model doesn't support embeddings.
async fn get_embedding(text: &str) -> Option<Vec<f32>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build().ok()?;

    // Use a lightweight model for embeddings — nomic-embed-text is ideal but
    // we fall back to any available chat model which also supports embeddings
    let embedding_models = ["nomic-embed-text", "mxbai-embed-large", "llama3", "qwen2.5", "mistral"];

    for model in &embedding_models {
        let body = serde_json::json!({ "model": model, "prompt": text });
        if let Ok(resp) = client.post(format!("{}/api/embeddings", OLLAMA_BASE))
            .json(&body).send().await
        {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(arr) = json["embedding"].as_array() {
                        let vec: Vec<f32> = arr.iter()
                            .filter_map(|v| v.as_f64().map(|f| f as f32))
                            .collect();
                        if !vec.is_empty() {
                            return Some(vec);
                        }
                    }
                }
            } else if resp.status().as_u16() == 404 {
                continue; // model not installed, try next
            }
        }
    }
    None
}

/// Cosine similarity between two vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() { return 0.0; }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 { return 0.0; }
    dot / (norm_a * norm_b)
}

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
    // Use blocking text-match reweight synchronously; semantic reweight runs async elsewhere
    reweight_feed_items(&conn).ok();
    Ok(())
}

/// Async entry point that tries semantic reweighting first, falls back to text matching.
/// Called from background tasks where async is available.
pub async fn reweight_feed_items_semantic(conn_mutex: &std::sync::Mutex<Connection>) {
    // Collect all data while holding the lock, then drop it BEFORE any await
    let (items, top_interests) = {
        let Ok(conn) = conn_mutex.lock() else { return; };
        let items = db::get_recent_feed_items(&conn, 72, 100).unwrap_or_default();
        let profile = compute_interest_profile(&conn);
        let mut sorted: Vec<(String, f64)> = profile.into_iter().collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let top: Vec<String> = sorted.into_iter().take(8).map(|(t, _)| t).collect();
        (items, top)
        // conn guard dropped here
    };

    if top_interests.is_empty() || items.is_empty() { return; }

    let profile_text = format!("Topics I care about: {}", top_interests.join(", "));

    // Async work — no lock held
    let profile_embedding = get_embedding(&profile_text).await;

    // Compute scores for all items (async, no lock held)
    let mut scores: Vec<(String, f64)> = Vec::with_capacity(items.len());
    for item in &items {
        let item_text = format!("{} {}", item.title, item.summary.as_deref().unwrap_or(""));
        let score = if let Some(ref prof_emb) = profile_embedding {
            if let Some(item_emb) = get_embedding(&item_text).await {
                cosine_similarity(prof_emb, &item_emb) as f64 * 10.0
            } else {
                // Fallback: keyword text matching score
                let text_lower = item_text.to_lowercase();
                top_interests.iter().filter(|t| text_lower.contains(t.as_str())).count() as f64
            }
        } else {
            // No embeddings — keyword fallback
            let text_lower = item_text.to_lowercase();
            top_interests.iter().filter(|t| text_lower.contains(t.as_str())).count() as f64
        };
        scores.push((item.id.clone(), score));
    }

    // Re-acquire lock only for the batch DB write — brief hold, no await inside
    if let Ok(conn) = conn_mutex.lock() {
        conn.execute("BEGIN", []).ok();
        for (id, score) in &scores {
            conn.execute(
                "UPDATE feed_items SET relevance_score = ?1 WHERE id = ?2",
                rusqlite::params![score, id],
            ).ok();
        }
        conn.execute("COMMIT", []).ok();
    }
}

pub fn compute_interest_profile(conn: &Connection) -> HashMap<String, f64> {
    let mut profile = HashMap::new();
    let interactions = db::get_recent_interactions(conn, 30).unwrap_or_default();

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as f64;

    // Half-life of 7 days — interactions from 7 days ago count half as much
    // as interactions from today. Formula: weight * 2^(-age_days / 7)
    const HALF_LIFE_DAYS: f64 = 7.0;

    for inter in interactions {
        let base_weight = match inter.action.as_str() {
            "opened" => 2.0,
            "saved"  => 3.0,
            "dismissed" => -1.5,
            _ => 1.0,
        };

        // Parse interaction timestamp for decay calculation
        let age_days = if let Some(secs) = db::iso_to_unix_secs(&inter.created_at) {
            ((now_secs - secs as f64) / 86400.0).max(0.0)
        } else {
            0.0 // unknown age — no decay
        };

        // Exponential decay: recent = 1.0, 7 days ago = 0.5, 14 days ago = 0.25
        let decay = (2.0_f64).powf(-age_days / HALF_LIFE_DAYS);
        let weighted = base_weight * decay;

        let tags: Vec<String> = serde_json::from_str(&inter.tags).unwrap_or_default();
        for tag in tags {
            let tag_clean = tag.trim().to_lowercase();
            if !tag_clean.is_empty() {
                *profile.entry(tag_clean).or_insert(0.0) += weighted;
            }
        }
    }

    profile
}

pub fn reweight_feed_items(conn: &Connection) -> Result<(), String> {
    let profile = compute_interest_profile(conn);
    let user_profile = db::get_user_behavior_profile(conn);
    
    let items = db::get_recent_feed_items(conn, 72, 100).map_err(|e| e.to_string())?;

    conn.execute("BEGIN", []).ok();
    for item in items {
        let mut relevance: f64 = 0.0;
        let text_lower = format!("{} {}", item.title, item.summary.as_deref().unwrap_or("")).to_lowercase();

        for (tag, weight) in &profile {
            if text_lower.contains(tag) {
                relevance += weight;
            }
        }

        // Apply dynamic behavior profile bonus
        if user_profile.morning_routine_type == "executive_strategy" {
            let is_news_or_brief = item.source == "hackernews" || item.source == "arxiv" || item.source == "devto" || item.source.contains("rss");
            if is_news_or_brief {
                relevance += 1.5;
            }
        }

        conn.execute(
            "UPDATE feed_items SET relevance_score = ?1 WHERE id = ?2",
            rusqlite::params![relevance, item.id],
        ).ok();
    }
    conn.execute("COMMIT", []).ok();

    Ok(())
}
