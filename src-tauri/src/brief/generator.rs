use reqwest::Client;
use rusqlite::Connection;
use crate::db;
use crate::feeds::ingest::run_feed_ingestion;

const OLLAMA_BASE: &str = "http://localhost:11434";

pub async fn get_or_generate_brief(conn_mutex: &std::sync::Mutex<Connection>) -> Result<String, String> {
    // Today's date key (WAT +01:00 — take first 10 chars of now_iso which is UTC, close enough for date boundary)
    let now = db::now_iso();
    let today = &now[..10];

    // Check cache first
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        if let Ok(Some(cached)) = db::get_morning_brief(&conn, today) {
            return Ok(cached);
        }
    }

    // No cached brief — run feed ingestion first
    run_feed_ingestion(conn_mutex).await.ok();

    // Gather context: top feed items + pending email count + flagged items + calendar
    let (feed_items, pending_count, flagged_count, calendar_count) = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        let feeds = db::get_recent_feed_items(&conn, 24, 10).unwrap_or_default();
        let items = db::get_all_queue_items(&conn).unwrap_or_default();
        let pending = items.iter().filter(|i| i.status == "pending").count();
        let flagged = items.iter().filter(|i| i.flagged && i.status == "pending").count();
        let cal = db::get_synced_calendar_events(&conn).unwrap_or_default().len();
        (feeds, pending, flagged, cal)
    };

    // Build context prompt for Ollama
    let mut feed_section = String::new();
    for (i, item) in feed_items.iter().enumerate() {
        feed_section.push_str(&format!(
            "{}. [{}] {} (score: {})\n   URL: {}\n",
            i + 1, item.source.to_uppercase(), item.title, item.score, item.url
        ));
    }

    let flagged_notice = if flagged_count > 0 {
        format!("⚠️ {} URGENT item(s) flagged (Visa/UKVI/Deadline) require immediate attention.", flagged_count)
    } else {
        "No urgent flagged items.".into()
    };

    let system_prompt = format!(
        r#"You are Wardyn, a personal intelligence assistant synthesizing a morning executive brief.

Generate a structured, concise Morning Intelligence Brief using the context below. Use markdown-like formatting with emoji section headers. Be specific and actionable — no generic filler.

CONTEXT:
- Pending messages awaiting your reply: {}
- {}
- Calendar events synced: {}

TECHNICAL FEED (last 24h — ranked by signal):
{}

OUTPUT FORMAT (use exactly these sections):
⚡ PRIORITY ACTIONS
📅 CALENDAR & DEADLINES
📚 TECHNICAL PULSE (top 3-5 items worth reading, with one-line "why it matters")
💡 PATTERN / INSIGHT (one sharp observation synthesizing today's signal)"#,
        pending_count, flagged_notice, calendar_count, feed_section
    );

    let brief = call_ollama_for_brief(&system_prompt).await
        .unwrap_or_else(|_| generate_fallback_brief(pending_count, flagged_count, calendar_count, &feed_items));

    // Cache in SQLite
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::save_morning_brief(&conn, today, &brief).ok();
    }

    Ok(brief)
}

async fn call_ollama_for_brief(prompt: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    // Try models from largest to smallest for best synthesis quality
    let models = ["llama3:70b", "qwen2.5:32b", "mixtral:8x7b", "llama3", "qwen2.5", "mistral", "gemma", "phi3"];

    for model in models {
        let payload = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
            "options": { "num_predict": 600, "temperature": 0.4 }
        });

        let res = client.post(format!("{}/api/generate", OLLAMA_BASE))
            .json(&payload)
            .send()
            .await;

        if let Ok(resp) = res {
            if resp.status().is_success() {
                let json: serde_json::Value = resp.json().await.unwrap_or_default();
                if let Some(text) = json["response"].as_str() {
                    if !text.trim().is_empty() {
                        return Ok(text.trim().to_string());
                    }
                }
            }
        }
    }

    Err("No Ollama model available".into())
}

fn generate_fallback_brief(
    pending: usize,
    flagged: usize,
    calendar: usize,
    feeds: &[crate::db::FeedItem],
) -> String {
    let urgency = if flagged > 0 {
        format!("⚠️ {} URGENT item(s) require immediate attention.", flagged)
    } else {
        "No urgent flagged items.".into()
    };

    let feed_lines: String = feeds.iter().take(5).enumerate().map(|(i, f)| {
        format!("{}. [{}] {}\n", i + 1, f.source.to_uppercase(), f.title)
    }).collect();

    format!(
        "⚡ PRIORITY ACTIONS\n{}\n{} message(s) awaiting your reply.\n\n📅 CALENDAR & DEADLINES\n{} event(s) synced.\n\n📚 TECHNICAL PULSE\n{}\n💡 PATTERN / INSIGHT\nOllama model unavailable — connect a local model in Settings for full AI synthesis.",
        urgency, pending, calendar, feed_lines
    )
}
