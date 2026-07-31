use reqwest::Client;
use rusqlite::Connection;
use crate::db;

const OLLAMA_BASE: &str = "http://localhost:11434";

pub async fn get_or_generate_weekly_review(conn_mutex: &std::sync::Mutex<Connection>) -> Result<String, String> {
    let week_key = get_current_iso_week();

    // Check cache
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        if let Ok(Some(cached)) = db::get_weekly_review(&conn, &week_key) {
            return Ok(cached);
        }
    }

    // Gather 7-day stats
    let (decisions, knowledge, queue_items, interactions) = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        let dec = db::get_decisions(&conn, 20).unwrap_or_default();
        let kn = db::get_knowledge_items(&conn, 20).unwrap_or_default();
        let qi = db::get_all_queue_items(&conn).unwrap_or_default();
        let inter = db::get_recent_interactions(&conn, 7).unwrap_or_default();
        (dec, kn, qi, inter)
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

    let system_prompt = format!(
        r#"You are Wardyn, a personal executive AI. Synthesize a concise, motivating Weekly Review for the user for ISO Week {}.

CONTEXT:
- Inbox Triaging: {} processed ({} approved/sent, {} skipped), {} currently pending.
- Decisions Logged (past 7 days):
{}
- Knowledge Captures (past 7 days):
{}
- Feed Interactions: {} engagements recorded this week.

OUTPUT FORMAT (use markdown formatting with emoji headers):
📊 WEEKLY EXECUTIVE SYNTHESIS — Week {}

🎯 DECISIONS & STRATEGY
(Summarise the key decisions made and strategic direction)

📚 KNOWLEDGE & HIGHLIGHTS
(Highlight key themes captured in notes and research)

📬 INBOX & OPERATIONS PULSE
(Summarise communication velocity and inbox throughput)

💡 GROWTH OBSERVATION
(One sharp, high-level pattern observation linking decision patterns and knowledge topics)"#,
        week_key,
        approved_count + skipped_count, approved_count, skipped_count, pending_count,
        decision_summary,
        knowledge_summary,
        interactions.len(),
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

fn get_current_iso_week() -> String {
    let now = db::now_iso();
    // E.g. "2026-07-31" -> "2026-W31" (approximation based on month/day for display)
    let year = &now[..4];
    let month: u32 = now[5..7].parse().unwrap_or(7);
    let day: u32 = now[8..10].parse().unwrap_or(31);
    let day_of_year = (month - 1) * 30 + day;
    let week_num = (day_of_year / 7) + 1;
    format!("{}-W{:02}", year, week_num)
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
            "options": { "num_predict": 700, "temperature": 0.4 }
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
