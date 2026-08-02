use reqwest::Client;
use rusqlite::Connection;
use crate::db;
use crate::feeds::ingest::run_feed_ingestion;

const OLLAMA_BASE: &str = "http://localhost:11434";

pub async fn get_or_generate_brief(conn_mutex: &std::sync::Mutex<Connection>) -> Result<String, String> {
    // Use system local date so users in any timezone get the correct daily brief.
    // 'date +%Y-%m-%d' reads local time; falls back to UTC if unavailable.
    let today_owned = std::process::Command::new("date")
        .arg("+%Y-%m-%d")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| s.len() == 10)
        .unwrap_or_else(|| db::now_iso()[..10].to_string());
    let today = today_owned.as_str();

    // Check cache first
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        if let Ok(Some(cached)) = db::get_morning_brief(&conn, today) {
            return Ok(cached);
        }
    }

    // No cached brief — run feed ingestion first
    run_feed_ingestion(conn_mutex).await.ok();

    // Gather context: top feed items + pending email count + flagged items + calendar + personal memory
    let (feed_items, pending_count, flagged_count, calendar_count, knowledge_items, recent_decisions,
         pending_tasks, life_events_upcoming, engagement_today_mins) = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        let feeds = db::get_recent_feed_items(&conn, 24, 10).unwrap_or_default();
        let items = db::get_all_queue_items(&conn).unwrap_or_default();
        let pending = items.iter().filter(|i| i.status == "pending").count();
        let flagged = items.iter().filter(|i| i.flagged && i.status == "pending").count();
        let cal = db::get_synced_calendar_events(&conn).unwrap_or_default().len();
        let knowledge = db::get_knowledge_items(&conn, 5).unwrap_or_default();
        let decisions = db::get_decisions(&conn, 3).unwrap_or_default();

        // ── NEW: pending tasks (overdue + due today/tomorrow) ────────────────
        let tasks: Vec<(String, String, String)> = {
            let _today_str = today.to_string();
            let tomorrow_str = {
                use crate::db::days_to_ymd;
                let secs = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
                let d = ((secs + 86400) / 86400) as u64;
                let (y, m, dd) = days_to_ymd(d);
                format!("{:04}-{:02}-{:02}", y, m, dd)
            };
            if let Ok(mut stmt) = conn.prepare(
                "SELECT title, priority, due_date FROM tasks
                 WHERE status = 'pending' AND (due_date IS NULL OR due_date <= ?)
                 ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                          due_date ASC NULLS LAST
                 LIMIT 8",
            ) {
                if let Ok(rows) = stmt.query_map(rusqlite::params![format!("{}T23:59:59Z", tomorrow_str)], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "medium".into()),
                        row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "no deadline".into()),
                    ))
                }) {
                    rows.filter_map(|r| r.ok()).collect()
                } else { vec![] }
            } else { vec![] }
        };

        // ── NEW: upcoming life events (next 14 days) ─────────────────────────
        let life_events: Vec<(String, String, String)> = {
            let in_14_days = {
                use crate::db::days_to_ymd;
                let secs = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
                let d = ((secs + 14 * 86400) / 86400) as u64;
                let (y, m, dd) = days_to_ymd(d);
                format!("{:04}-{:02}-{:02}", y, m, dd)
            };
            if let Ok(mut stmt) = conn.prepare(
                "SELECT title, intent, event_date FROM life_events
                 WHERE status = 'active' AND event_date IS NOT NULL AND event_date >= ? AND event_date <= ?
                 ORDER BY event_date ASC LIMIT 5",
            ) {
                if let Ok(rows) = stmt.query_map(rusqlite::params![today, in_14_days], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                }) {
                    rows.filter_map(|r| r.ok()).collect()
                } else { vec![] }
            } else { vec![] }
        };

        // ── NEW: today's actual focus time per project ────────────────────────
        let eng_mins: i64 = conn.query_row(
            "SELECT COALESCE(SUM(minutes_spent), 0) FROM project_time_logs WHERE session_date = ?1",
            rusqlite::params![today],
            |row| row.get(0),
        ).unwrap_or(0);

        (feeds, pending, flagged, cal, knowledge, decisions, tasks, life_events, eng_mins)
    };


    // Build context prompt for Ollama
    let mut feed_section = String::new();
    for (i, item) in feed_items.iter().enumerate() {
        feed_section.push_str(&format!(
            "{}. [{}] {} (score: {})\n   URL: {}\n",
            i + 1, item.source.to_uppercase(), item.title, item.score, item.url
        ));
    }

    let mut personal_section = String::new();
    if !knowledge_items.is_empty() || !recent_decisions.is_empty() {
        personal_section.push_str("\nYOUR PERSONAL CONTEXT (recent captures & decisions):\n");
        for ki in &knowledge_items {
            let tags: Vec<String> = serde_json::from_str(&ki.tags).unwrap_or_default();
            personal_section.push_str(&format!(
                "- [{}] {} {}\n",
                tags.join(", "),
                ki.summary.as_deref().unwrap_or(&ki.content.chars().take(80).collect::<String>()),
                ki.url.as_deref().map(|u| format!("({})", u)).unwrap_or_default()
            ));
        }
        for dec in &recent_decisions {
            personal_section.push_str(&format!(
                "- [decision] Chose: {} — Because: {}\n",
                dec.decision, dec.rationale
            ));
        }
    }

    // ── NEW: tasks section ───────────────────────────────────────────────────
    let mut tasks_section = String::new();
    if !pending_tasks.is_empty() {
        tasks_section.push_str("\nACTION ITEMS DUE (pending tasks — overdue or due today/tomorrow):\n");
        for (title, priority, due) in &pending_tasks {
            tasks_section.push_str(&format!("- [{}] {} (due: {})\n", priority.to_uppercase(), title, due));
        }
    }

    // ── NEW: life events section ─────────────────────────────────────────────
    let mut life_section = String::new();
    if !life_events_upcoming.is_empty() {
        life_section.push_str("\nUPCOMING LIFE EVENTS (next 14 days):\n");
        for (title, intent, date) in &life_events_upcoming {
            life_section.push_str(&format!("- [{}] {} on {}\n", intent.replace('_', " "), title, &date[..10]));
        }
    }

    // ── NEW: focus context ───────────────────────────────────────────────────
    let focus_line = if engagement_today_mins > 0 {
        format!("- Focus time logged today: {} minutes across projects.", engagement_today_mins)
    } else {
        "- No focus time logged yet today.".into()
    };

    let flagged_notice = if flagged_count > 0 {
        format!("⚠️ {} URGENT item(s) flagged (Visa/UKVI/Deadline) require immediate attention.", flagged_count)
    } else {
        "No urgent flagged items.".into()
    };

    let system_prompt = format!(
        r#"You are Wardyn, a personal intelligence assistant synthesizing a morning executive brief.

Generate a structured, concise Morning Intelligence Brief using the context below. Use markdown-like formatting with emoji section headers. Be specific and actionable — no generic filler. Reference the user's personal context, tasks, and life events where relevant.

CONTEXT:
- Pending messages awaiting your reply: {}
- {}
- Calendar events synced: {}
{}{}{}
{}
TECHNICAL FEED (last 24h — ranked by signal):

{}

OUTPUT FORMAT (use exactly these sections):
⚡ PRIORITY ACTIONS (include any overdue tasks and urgent emails)
📅 CALENDAR & DEADLINES (include life events and calendar)
📚 TECHNICAL PULSE (top 3-5 items worth reading, with one-line "why it matters")
💡 PATTERN / INSIGHT (one sharp observation synthesizing today's signal and the user's current work)"#,
        pending_count, flagged_notice, calendar_count,
        personal_section, tasks_section, life_section,
        focus_line, feed_section
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
            "options": { "num_predict": 800, "temperature": 0.4 }
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
