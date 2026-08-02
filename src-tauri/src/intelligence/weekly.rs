use reqwest::Client;
use rusqlite::Connection;
use crate::db;

const OLLAMA_BASE: &str = "http://localhost:11434";

pub async fn get_or_generate_weekly_review(conn_mutex: &std::sync::Mutex<Connection>) -> Result<String, String> {
    let week_key = get_current_week_key();

    // Check cache
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        if let Ok(Some(cached)) = db::get_weekly_review(&conn, &week_key) {
            return Ok(cached);
        }
    }

    // Gather 7-day stats
    let (decisions, knowledge, queue_items, _interactions, tasks_completed,
         pomodoro_sessions, top_interest_tags, project_time) = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        let dec = db::get_decisions(&conn, 20).unwrap_or_default();
        let kn = db::get_knowledge_items(&conn, 20).unwrap_or_default();
        let qi = db::get_all_queue_items(&conn).unwrap_or_default();
        let inter = db::get_recent_interactions(&conn, 7).unwrap_or_default();

        // ── NEW: tasks completed this week ───────────────────────────────────
        let tasks_done: usize = {
            conn.query_row(
                "SELECT COUNT(*) FROM tasks WHERE status = 'completed'
                 AND datetime(completed_at) >= datetime('now', '-7 days')",
                [],
                |row| row.get::<_, i64>(0),
            ).unwrap_or(0) as usize
        };

        // ── NEW: pomodoro sessions this week ─────────────────────────────────
        let pomo: Vec<(i64, bool)> = {
            if let Ok(mut stmt) = conn.prepare(
                "SELECT duration_minutes, completed FROM pomodoro_sessions
                 WHERE datetime(started_at) >= datetime('now', '-7 days')",
            ) {
                if let Ok(rows) = stmt.query_map([], |row| Ok((row.get(0)?, row.get::<_, i32>(1)? != 0))) {
                    rows.filter_map(|r| r.ok()).collect()
                } else { vec![] }
            } else { vec![] }
        };

        // ── NEW: top interest tags from feed interactions ─────────────────────
        // Build tag frequency from actual interaction data — not just the count
        let mut tag_freq: std::collections::HashMap<String, (u32, f64)> = std::collections::HashMap::new();
        for inter_item in &inter {
            let weight = match inter_item.action.as_str() {
                "saved" => 3.0, "opened" => 2.0, "dismissed" => -1.0, _ => 1.0,
            };
            let tags: Vec<String> = serde_json::from_str(&inter_item.tags).unwrap_or_default();
            for tag in tags {
                let e = tag_freq.entry(tag).or_insert((0, 0.0));
                e.0 += 1;
                e.1 += weight;
            }
        }
        let mut top_tags: Vec<(String, f64)> = tag_freq.into_iter()
            .filter(|(_, (_, w))| *w > 0.0)
            .map(|(tag, (_, w))| (tag, w))
            .collect();
        top_tags.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let top_tags_str: Vec<String> = top_tags.iter().take(8)
            .map(|(tag, w)| format!("{} ({:.0})", tag, w))
            .collect();

        // ── NEW: project time this week ───────────────────────────────────────
        let proj_time: Vec<(String, i64)> = {
            if let Ok(mut stmt) = conn.prepare(
                "SELECT ap.name, COALESCE(SUM(ptl.minutes_spent), 0) as total
                 FROM active_projects ap
                 LEFT JOIN project_time_logs ptl ON ptl.project_id = ap.id
                     AND datetime(ptl.created_at) >= datetime('now', '-7 days')
                 WHERE ap.status = 'active'
                 GROUP BY ap.id ORDER BY total DESC LIMIT 5",
            ) {
                if let Ok(rows) = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))) {
                    rows.filter_map(|r| r.ok()).collect()
                } else { vec![] }
            } else { vec![] }
        };

        (dec, kn, qi, inter, tasks_done, pomo, top_tags_str, proj_time)
    };

    // ── Response analytics for the week ──────────────────────────────────────
    let response_analytics_line = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        let analytics = db::get_response_analytics(&conn, 7).unwrap_or_default();
        let responded: Vec<_> = analytics.iter()
            .filter(|a| a.response_time_seconds.is_some()).collect();
        if responded.is_empty() {
            "No responses sent this week.".to_string()
        } else {
            let avg_secs: f64 = responded.iter()
                .filter_map(|a| a.response_time_seconds)
                .map(|s| s as f64)
                .sum::<f64>() / responded.len() as f64;
            let avg_hours = avg_secs / 3600.0;
            // Per-category breakdown
            let mut by_cat: std::collections::HashMap<String, Vec<f64>> = std::collections::HashMap::new();
            for a in &responded {
                let cat = a.category.as_deref().unwrap_or("primary").to_string();
                if let Some(secs) = a.response_time_seconds {
                    by_cat.entry(cat).or_default().push(secs as f64);
                }
            }
            let cat_str: String = by_cat.iter()
                .map(|(cat, times)| {
                    let avg = times.iter().sum::<f64>() / times.len() as f64;
                    format!("{}: {:.1}h avg", cat, avg / 3600.0)
                })
                .collect::<Vec<_>>().join(" | ");
            format!("{} emails replied. Overall avg: {:.1}h. By category: {}",
                responded.len(), avg_hours, cat_str)
        }
    };

    let approved_count = queue_items.iter().filter(|i| i.status == "approved" || i.status == "sent").count();
    let skipped_count = queue_items.iter().filter(|i| i.status == "skipped").count();
    let pending_count = queue_items.iter().filter(|i| i.status == "pending").count();

    let mut decision_summary = String::new();
    for d in decisions.iter().take(5) {
        decision_summary.push_str(&format!("  ✓ {} (Why: {})\n", d.decision, d.rationale));
    }
    if decision_summary.is_empty() {
        decision_summary = "  No formal decisions logged this week.\n".into();
    }

    let mut knowledge_summary = String::new();
    for k in knowledge.iter().take(5) {
        let summary_text = k.summary.as_deref().unwrap_or(&k.content);
        knowledge_summary.push_str(&format!("  - [{}] {}\n", k.source, summary_text.chars().take(80).collect::<String>()));
    }
    if knowledge_summary.is_empty() {
        knowledge_summary = "  No knowledge items captured this week.\n".into();
    }

    // ── NEW: pomodoro summary ─────────────────────────────────────────────────
    let pomo_total = pomodoro_sessions.len();
    let pomo_completed = pomodoro_sessions.iter().filter(|(_, c)| *c).count();
    let pomo_minutes: i64 = pomodoro_sessions.iter().filter(|(_, c)| *c).map(|(d, _)| d).sum();
    let pomo_line = if pomo_total > 0 {
        format!("{} focus sessions ({} completed, ~{}h {}min of deep work)",
            pomo_total, pomo_completed, pomo_minutes / 60, pomo_minutes % 60)
    } else {
        "No Pomodoro sessions logged.".into()
    };

    // ── NEW: project time summary ─────────────────────────────────────────────
    let proj_summary = if project_time.is_empty() {
        "  No project time logged.\n".into()
    } else {
        project_time.iter().map(|(name, mins)| {
            format!("  - {}: {}h {}min\n", name, mins / 60, mins % 60)
        }).collect::<String>()
    };

    // ── NEW: interest topics ──────────────────────────────────────────────────
    let interest_line = if top_interest_tags.is_empty() {
        "No feed interactions this week.".into()
    } else {
        format!("Top topics engaged: {}", top_interest_tags.join(", "))
    };

    let system_prompt = format!(
        r#"You are Wardyn, a personal executive AI. Synthesize a concise, motivating Weekly Review for the user for ISO Week {}.

CONTEXT:
- Inbox Triaging: {} processed ({} approved/sent, {} skipped), {} currently pending.
- Response Performance: {}
- Tasks completed this week: {}
- Deep Work: {}
- Project Focus (this week):
{}
- Decisions Logged (past 7 days):
{}
- Knowledge Captures (past 7 days):
{}
- Feed Engagement: {}

OUTPUT FORMAT (use markdown formatting with emoji headers):
📊 WEEKLY EXECUTIVE SYNTHESIS — Week {}

🎯 DECISIONS & STRATEGY
(Summarise the key decisions made and strategic direction)

📚 KNOWLEDGE & HIGHLIGHTS
(Highlight key themes captured in notes and research — connect to interest topics)

📬 INBOX & OPERATIONS PULSE
(Summarise communication velocity and inbox throughput)

⏱️ FOCUS & EXECUTION
(Comment on deep work sessions, project progress, and execution quality)

💡 GROWTH OBSERVATION
(One sharp, high-level pattern observation linking all signals this week — decisions, focus, interests, communication)"#,
        week_key,
        approved_count + skipped_count, approved_count, skipped_count, pending_count,
        response_analytics_line,
        tasks_completed,
        pomo_line,
        proj_summary,
        decision_summary,
        knowledge_summary,
        interest_line,
        week_key
    );

    let review = call_ollama_for_weekly(&system_prompt).await
        .unwrap_or_else(|_| generate_fallback_weekly(&week_key, approved_count, skipped_count, pending_count, &decisions, &knowledge));

    // Cache in SQLite
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::save_weekly_review(&conn, &week_key, &review).ok();
    }

    Ok(review)
}

pub fn get_current_week_key() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let days_since_epoch = secs / 86400;
    // ISO week number (Thursday-based; 1970-01-01 was a Thursday = day 4)
    let iso_week = (days_since_epoch + 3) / 7;
    // Correct year using days_to_ymd (O(1) Gregorian, avoids 365-day drift)
    let (year, _, _) = crate::db::days_to_ymd(days_since_epoch);
    let week_of_year = (iso_week % 52) + 1;
    format!("{}-W{:02}", year, week_of_year)
}

async fn call_ollama_for_weekly(prompt: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let models = ["llama3:70b", "qwen2.5:32b", "mixtral:8x7b", "llama3", "qwen2.5", "mistral", "gemma", "phi3"];

    for model in models {
        let payload = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
            "options": { "num_predict": 900, "temperature": 0.4 }
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

fn generate_fallback_weekly(
    week: &str,
    approved: usize,
    skipped: usize,
    pending: usize,
    decisions: &[crate::db::Decision],
    knowledge: &[crate::db::KnowledgeItem],
) -> String {
    let dec_str: String = decisions.iter().take(3).map(|d| format!("- {} ({})\n", d.decision, d.rationale)).collect();
    let kn_str: String = knowledge.iter().take(3).map(|k| format!("- {}\n", k.summary.as_deref().unwrap_or(&k.content))).collect();

    format!(
        "📊 WEEKLY EXECUTIVE SYNTHESIS — Week {}\n\n🎯 DECISIONS & STRATEGY\n{}\n\n📚 KNOWLEDGE & HIGHLIGHTS\n{}\n\n📬 INBOX & OPERATIONS PULSE\nProcessed {} items ({} approved, {} skipped). {} pending.\n\n💡 GROWTH OBSERVATION\nOllama local model offline — connect Ollama for full AI synthesis.",
        week,
        if dec_str.is_empty() { "No decisions logged.\n".to_string() } else { dec_str },
        if kn_str.is_empty() { "No notes captured.\n".to_string() } else { kn_str },
        approved + skipped, approved, skipped, pending
    )
}
