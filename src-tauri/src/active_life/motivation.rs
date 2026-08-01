use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use crate::db::now_iso;

fn today_date() -> String {
    now_iso().get(0..10).unwrap_or("2026-01-01").to_string()
}

const OLLAMA_BASE: &str = "http://localhost:11434";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyIntel {
    pub date: String,
    pub motivation_quote: Option<String>,
    pub quote_author: Option<String>,
    pub learning_topic: Option<String>,
    pub learning_summary: Option<String>,
    pub social_post_idea: Option<String>,
    pub social_format: Option<String>,
    pub social_platform: Option<String>,
    pub day_plan: Option<String>,
    pub generated_at: String,
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

pub fn get_daily_intel(conn: &Connection, date: &str) -> Result<Option<DailyIntel>> {
    match conn.query_row(
        "SELECT date, motivation_quote, quote_author, learning_topic, learning_summary,
                social_post_idea, social_format, social_platform, day_plan, generated_at
         FROM daily_intel WHERE date = ?1",
        params![date],
        |row| {
            Ok(DailyIntel {
                date: row.get(0)?,
                motivation_quote: row.get(1)?,
                quote_author: row.get(2)?,
                learning_topic: row.get(3)?,
                learning_summary: row.get(4)?,
                social_post_idea: row.get(5)?,
                social_format: row.get(6)?,
                social_platform: row.get(7)?,
                day_plan: row.get(8)?,
                generated_at: row.get(9)?,
            })
        },
    ) {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn save_daily_intel(conn: &Connection, intel: &DailyIntel) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO daily_intel
            (date, motivation_quote, quote_author, learning_topic, learning_summary,
             social_post_idea, social_format, social_platform, day_plan, generated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            intel.date,
            intel.motivation_quote,
            intel.quote_author,
            intel.learning_topic,
            intel.learning_summary,
            intel.social_post_idea,
            intel.social_format,
            intel.social_platform,
            intel.day_plan,
            intel.generated_at
        ],
    )?;
    Ok(())
}

// ─── AI Generation ───────────────────────────────────────────────────────────

/// Gets cached DailyIntel for today or generates fresh one via Ollama.
pub async fn get_or_generate_daily_intel(
    conn_mutex: &std::sync::Mutex<Connection>,
    force_refresh: bool,
) -> Result<DailyIntel, String> {
    let today = today_date();

    // Return cached if exists and not forcing refresh
    if !force_refresh {
        if let Ok(conn) = conn_mutex.lock() {
            if let Ok(Some(cached)) = get_daily_intel(&conn, &today) {
                return Ok(cached);
            }
        }
    }

    // Gather project names for context
    let project_names: Vec<String> = {
        if let Ok(conn) = conn_mutex.lock() {
            if let Ok(mut stmt) = conn.prepare(
                "SELECT name FROM active_projects WHERE status = 'active' ORDER BY last_worked_at DESC LIMIT 5"
            ) {
                if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                    rows.filter_map(|r| r.ok()).collect()
                } else {
                    vec![]
                }
            } else {
                vec![]
            }
        } else {
            vec![]
        }
    };

    let projects_ctx = if project_names.is_empty() {
        "No specific projects tracked yet.".to_string()
    } else {
        project_names.join(", ")
    };

    let date_info = format!(
        "Today is {}. Day of week: {}",
        today,
        day_of_week(&today)
    );

    let prompt = format!(
        r#"You are a personal life coach AI for a driven builder and creator.

{date_info}
Active projects: {projects}

Generate today's personal intelligence brief in EXACTLY this JSON format. No markdown, no preamble, just the JSON object:

{{
  "motivation_quote": "<an inspiring quote from a real legend — tech founders, athletes, philosophers, Islamic scholars, historical figures — varied each day>",
  "quote_author": "<Full name of the author>",
  "learning_topic": "<A specific, valuable topic to learn about today (2-5 words)>",
  "learning_summary": "<3 key points about this topic, separated by • bullet. Each point max 15 words.>",
  "social_post_idea": "<A compelling post idea based on the user's projects and journey. Include a suggested opening hook sentence.>",
  "social_format": "<one of: video | image_text | plain_text>",
  "social_platform": "<one of: linkedin | twitter>"
}}

Rules:
- Quotes must be real, attributed correctly. Mix sources: Kobe Bryant, Steve Jobs, Ibn Taymiyyah, Marcus Aurelius, Elon Musk, Oprah, Naval Ravikant, Ali ibn Abi Talib, etc.
- Learning topic should be practical and relevant to a builder/developer/entrepreneur
- Social post should feel personal and authentic, not generic
- Return ONLY valid JSON, nothing else"#,
        date_info = date_info,
        projects = projects_ctx
    );

    let raw = call_ollama(&prompt).await.unwrap_or_default();
    let parsed = parse_intel_json(&raw, &today);

    // Save to DB
    if let Ok(conn) = conn_mutex.lock() {
        save_daily_intel(&conn, &parsed).ok();
    }

    Ok(parsed)
}

async fn call_ollama(prompt: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    // Try models in order of preference
    let models = [
        "llama3:70b", "qwen2.5:32b", "mixtral:8x7b", "gemma2:27b",
        "qwen2.5", "llama3", "mistral", "gemma", "phi3",
    ];

    #[derive(Serialize)]
    struct OllamaReq<'a> {
        model: &'a str,
        prompt: &'a str,
        stream: bool,
    }

    #[derive(Deserialize)]
    struct OllamaResp {
        response: String,
    }

    for model in &models {
        let body = OllamaReq { model, prompt, stream: false };
        let res = client
            .post(format!("{}/api/generate", OLLAMA_BASE))
            .json(&body)
            .send()
            .await;

        if let Ok(resp) = res {
            if resp.status().is_success() {
                if let Ok(parsed) = resp.json::<OllamaResp>().await {
                    return Ok(parsed.response);
                }
            }
        }
    }

    Err("Ollama unavailable".into())
}

fn parse_intel_json(raw: &str, today: &str) -> DailyIntel {
    // Extract JSON from response (might have preamble text)
    let json_str = extract_json(raw);

    #[derive(Deserialize)]
    struct Parsed {
        motivation_quote: Option<String>,
        quote_author: Option<String>,
        learning_topic: Option<String>,
        learning_summary: Option<String>,
        social_post_idea: Option<String>,
        social_format: Option<String>,
        social_platform: Option<String>,
    }

    let fallback = DailyIntel {
        date: today.to_string(),
        motivation_quote: Some("The secret of getting ahead is getting started.".into()),
        quote_author: Some("Mark Twain".into()),
        learning_topic: Some("Building in public".into()),
        learning_summary: Some("• Share your process, not just results • Accountability builds consistency • Your audience grows as you grow".into()),
        social_post_idea: Some("Share one thing you learned while building today. Authenticity compounds.".into()),
        social_format: Some("plain_text".into()),
        social_platform: Some("linkedin".into()),
        day_plan: None,
        generated_at: now_iso(),
    };

    if let Ok(p) = serde_json::from_str::<Parsed>(&json_str) {
        DailyIntel {
            date: today.to_string(),
            motivation_quote: p.motivation_quote,
            quote_author: p.quote_author,
            learning_topic: p.learning_topic,
            learning_summary: p.learning_summary,
            social_post_idea: p.social_post_idea,
            social_format: p.social_format,
            social_platform: p.social_platform,
            day_plan: None,
            generated_at: now_iso(),
        }
    } else {
        fallback
    }
}

fn extract_json(text: &str) -> String {
    // Find the first '{' and last '}' to extract JSON block
    if let (Some(start), Some(end)) = (text.find('{'), text.rfind('}')) {
        if end > start {
            return text[start..=end].to_string();
        }
    }
    text.to_string()
}

fn day_of_week(date_str: &str) -> &'static str {
    use crate::db::iso_to_unix_secs;
    let iso = format!("{}T12:00:00Z", date_str);
    if let Some(secs) = iso_to_unix_secs(&iso) {
        // 1970-01-01 was a Thursday (day 4, 0=Sunday)
        let day = ((secs / 86400) + 4) % 7;
        return match day {
            0 => "Sunday", 1 => "Monday", 2 => "Tuesday",
            3 => "Wednesday", 4 => "Thursday", 5 => "Friday",
            _ => "Saturday",
        };
    }
    "Unknown"
}
