use rusqlite::Connection;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use crate::db::now_iso;

fn today_date() -> String {
    now_iso().get(0..10).unwrap_or("2026-01-01").to_string()
}

const OLLAMA_BASE: &str = "http://localhost:11434";

/// Generates a time-boxed day plan and saves it into daily_intel.day_plan.
pub async fn generate_day_plan(conn_mutex: &std::sync::Mutex<Connection>) -> Result<String, String> {
    let today = today_date();

    // Gather context
    let (projects, habits_pending, calendar_events) = {
        if let Ok(conn) = conn_mutex.lock() {
            // Active projects with today's time
            let projs: Vec<(String, i64, i64)> = if let Ok(mut pstmt) = conn.prepare(
                "SELECT name, daily_target_minutes,
                    COALESCE((SELECT SUM(minutes_spent) FROM project_time_logs WHERE project_id = ap.id AND session_date = ?1), 0) as today_mins
                 FROM active_projects ap WHERE status = 'active' ORDER BY last_worked_at DESC LIMIT 6"
            ) {
                if let Ok(rows) = pstmt.query_map([&today], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))) {
                    rows.filter_map(|r| r.ok()).collect()
                } else { vec![] }
            } else { vec![] };

            // Habits not yet done today
            let habits: Vec<String> = if let Ok(mut hstmt) = conn.prepare(
                "SELECT name FROM daily_habits WHERE id NOT IN
                    (SELECT habit_id FROM habit_completions WHERE completed_date = ?1)"
            ) {
                if let Ok(rows) = hstmt.query_map([&today], |row| row.get(0)) {
                    rows.filter_map(|r| r.ok()).collect()
                } else { vec![] }
            } else { vec![] };

            // Calendar events for today
            let cal: Vec<String> = if let Ok(mut cstmt) = conn.prepare(
                "SELECT summary FROM calendar_events WHERE event_date LIKE ?1 LIMIT 5"
            ) {
                if let Ok(rows) = cstmt.query_map([format!("{}%", today)], |row| row.get(0)) {
                    rows.filter_map(|r| r.ok()).collect()
                } else { vec![] }
            } else { vec![] };

            (projs, habits, cal)
        } else {
            (vec![], vec![], vec![])
        }
    };

    let mut ctx = String::new();
    ctx.push_str("ACTIVE PROJECTS (name | daily target mins | already done today):\n");
    for (name, target, done) in &projects {
        ctx.push_str(&format!("- {} | target: {}min | done: {}min\n", name, target, done));
    }
    if !habits_pending.is_empty() {
        ctx.push_str("\nPENDING DAILY HABITS:\n");
        for h in &habits_pending {
            ctx.push_str(&format!("- {}\n", h));
        }
    }
    if !calendar_events.is_empty() {
        ctx.push_str("\nCALENDAR EVENTS TODAY:\n");
        for e in &calendar_events {
            ctx.push_str(&format!("- {}\n", e));
        }
    }

    let prompt = format!(
        r#"You are a personal productivity coach. Generate a motivating, realistic time-boxed day plan for today.

{}

Create a clear schedule for today. Use time blocks like "9:00 AM – 10:30 AM: Deep work on [Project]".
Include breaks. Put habits at sensible times (morning habits early, evening habits late).
Be specific and energizing. Format as clean plain text with time blocks on separate lines.
Keep it under 15 lines total. Do NOT use markdown headers, just plain text schedule."#,
        ctx
    );

    let plan = call_ollama_text(&prompt).await.unwrap_or_else(|_| generate_fallback_plan(&projects, &habits_pending));

    // Save into daily_intel
    if let Ok(conn) = conn_mutex.lock() {
        conn.execute(
            "INSERT OR REPLACE INTO daily_intel (date, generated_at, day_plan,
                motivation_quote, quote_author, learning_topic, learning_summary,
                social_post_idea, social_format, social_platform)
             VALUES (
                ?1, ?2, ?3,
                COALESCE((SELECT motivation_quote FROM daily_intel WHERE date = ?1), NULL),
                COALESCE((SELECT quote_author FROM daily_intel WHERE date = ?1), NULL),
                COALESCE((SELECT learning_topic FROM daily_intel WHERE date = ?1), NULL),
                COALESCE((SELECT learning_summary FROM daily_intel WHERE date = ?1), NULL),
                COALESCE((SELECT social_post_idea FROM daily_intel WHERE date = ?1), NULL),
                COALESCE((SELECT social_format FROM daily_intel WHERE date = ?1), NULL),
                COALESCE((SELECT social_platform FROM daily_intel WHERE date = ?1), NULL)
             )",
            rusqlite::params![today, now_iso(), plan],
        ).ok();
    }

    Ok(plan)
}

fn generate_fallback_plan(projects: &[(String, i64, i64)], habits: &[String]) -> String {
    let mut plan = String::from("📅 Today's Plan\n\n");
    plan.push_str("7:00 AM – 7:30 AM: Morning routine & intentions\n");
    for (i, (name, target, done)) in projects.iter().enumerate() {
        let remaining = (target - done).max(30);
        let start_h = 9 + i;
        plan.push_str(&format!("{}:00 AM – {}:30 AM: Deep work — {}\n", start_h, start_h + (remaining / 60) as usize, name));
    }
    if !habits.is_empty() {
        plan.push_str("12:30 PM – 1:00 PM: Lunch break\n");
        plan.push_str(&format!("Evening: Complete daily habits — {}\n", habits.join(", ")));
    }
    plan.push_str("10:00 PM: Review, reflect, prepare for tomorrow\n");
    plan
}

async fn call_ollama_text(prompt: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    let models = ["qwen2.5", "llama3", "mistral", "gemma", "phi3", "llama3:70b"];

    #[derive(Serialize)]
    struct OllamaReq<'a> { model: &'a str, prompt: &'a str, stream: bool }
    #[derive(Deserialize)]
    struct OllamaResp { response: String }

    for model in &models {
        let body = OllamaReq { model, prompt, stream: false };
        if let Ok(resp) = client.post(format!("{}/api/generate", OLLAMA_BASE)).json(&body).send().await {
            if resp.status().is_success() {
                if let Ok(parsed) = resp.json::<OllamaResp>().await {
                    return Ok(parsed.response.trim().to_string());
                }
            }
        }
    }
    Err("Ollama unavailable".into())
}
