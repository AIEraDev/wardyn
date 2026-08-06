use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use crate::db::now_iso;
use crate::ollama::client::fetch_installed_ollama_models;

fn today_date() -> String {
    let iso = now_iso();
    iso.get(0..10).unwrap_or(&iso).to_string()
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

#[derive(Debug, Clone)]
pub struct WebQuote {
    pub quote: String,
    pub author: String,
    pub topic: String,
    pub summary: String,
}

// ─── Auto-Start Ollama Process (Lightning Fast) ─────────────────────────────

pub async fn ensure_ollama_started() {
    let client = Client::builder()
        .timeout(Duration::from_millis(400))
        .build()
        .unwrap_or_default();

    // Fast 400ms Health Check Probe
    if client.get(format!("{}/api/tags", OLLAMA_BASE)).send().await.is_ok() {
        return;
    }

    // Probing candidate paths to start `ollama serve` silently in background
    let home = std::env::var("HOME").unwrap_or_default();
    let candidate_paths = [
        "ollama".to_string(),
        "/usr/local/bin/ollama".to_string(),
        "/opt/homebrew/bin/ollama".to_string(),
        "/usr/bin/ollama".to_string(),
        format!("{}/.local/bin/ollama", home),
    ];

    let ollama_bin = candidate_paths.iter().find(|p| {
        if p.is_empty() { return false; }
        if !p.contains('/') {
            std::process::Command::new(p)
                .arg("--version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        } else {
            std::path::Path::new(p.as_str()).exists()
        }
    }).cloned();

    if let Some(bin) = ollama_bin {
        let _ = std::process::Command::new(&bin).arg("serve").spawn();
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
}

// ─── Parallel Web Search Integration ─────────────────────────────────────────

pub async fn fetch_web_quote() -> Option<WebQuote> {
    tokio::time::timeout(Duration::from_millis(1500), fetch_web_quote_inner())
        .await
        .ok()
        .flatten()
}

async fn fetch_web_quote_inner() -> Option<WebQuote> {
    let client = Client::builder()
        .timeout(Duration::from_millis(1200))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .build()
        .ok()?;

    let zen_fut = client.get("https://zenquotes.io/api/random").send();
    let quotable_fut = client.get("https://api.quotable.io/random").send();

    let (zen_res, quotable_res) = tokio::join!(zen_fut, quotable_fut);

    if let Ok(resp) = zen_res {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(arr) = json.as_array() {
                    if let Some(item) = arr.first() {
                        let q = item["q"].as_str().unwrap_or("").trim().to_string();
                        let a = item["a"].as_str().unwrap_or("Unknown").trim().to_string();
                        if !q.is_empty() {
                            return Some(WebQuote {
                                quote: q,
                                author: a,
                                topic: "Personal Growth & Mastery".to_string(),
                                summary: "• Reflect on daily learnings • Apply wisdom to ongoing projects • Build continuous momentum".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    if let Ok(resp) = quotable_res {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                let q = json["content"].as_str().unwrap_or("").trim().to_string();
                let a = json["author"].as_str().unwrap_or("Unknown").trim().to_string();
                if !q.is_empty() {
                    return Some(WebQuote {
                        quote: q,
                        author: a,
                        topic: "Productivity & Focus".to_string(),
                        summary: "• Prioritize high-impact work • Eliminate distractions • Stay consistent with daily habits".to_string(),
                    });
                }
            }
        }
    }

    None
}

// ─── Fallback Quote Pool ─────────────────────────────────────────────────────

struct FallbackSpark {
    quote: &'static str,
    author: &'static str,
    topic: &'static str,
    summary: &'static str,
    social_idea: &'static str,
}

fn get_fallback_pool() -> &'static [FallbackSpark] {
    &[
        FallbackSpark {
            quote: "The secret of getting ahead is getting started.",
            author: "Mark Twain",
            topic: "Building in public",
            summary: "• Share your process, not just results • Accountability builds consistency • Your audience grows as you grow",
            social_idea: "Share one thing you learned while building today. Authenticity compounds.",
        },
        FallbackSpark {
            quote: "The future belongs to those who believe in the beauty of their dreams.",
            author: "Eleanor Roosevelt",
            topic: "Productivity System Design",
            summary: "• Focus on high-leverage tasks • Reduce cognitive friction • Review progress daily",
            social_idea: "Reflect on your current workflow systems. Small optimizations yield massive returns.",
        },
        FallbackSpark {
            quote: "The only way to do great work is to love what you do.",
            author: "Steve Jobs",
            topic: "User-Centric Product Thinking",
            summary: "• Solve real human problems • Prioritize clarity over complexity • Iterate based on feedback",
            social_idea: "What feature or detail in your current project brings you the most joy to refine?",
        },
        FallbackSpark {
            quote: "What we do now echoes in eternity.",
            author: "Marcus Aurelius",
            topic: "Stoic Work Ethic",
            summary: "• Focus on what is in your control • Embrace challenges as growth • Practice deep focus",
            social_idea: "Share how you handle unexpected setbacks during deep work blocks.",
        },
        FallbackSpark {
            quote: "Dedication sees dreams come true.",
            author: "Kobe Bryant",
            topic: "Mamba Mentalist Focus",
            summary: "• Master the fundamental details • Outwork yesterday's standard • Consistency beats intensity",
            social_idea: "Share one small habit you do every single day to stay ahead.",
        },
        FallbackSpark {
            quote: "What can my enemies do to me? My paradise is in my heart.",
            author: "Ibn Taymiyyah",
            topic: "Internal Resilience & Purpose",
            summary: "• Protect your mental clarity • Anchor ambition in true principles • Seek peace through purpose",
            social_idea: "How keeping a clear mind and purpose fuels long-term project success.",
        },
        FallbackSpark {
            quote: "Impatience with actions, patience with results.",
            author: "Naval Ravikant",
            topic: "Leverage & High-Value Execution",
            summary: "• Build assets, not just hourly output • Apply code & media leverage • Work with long-term compounders",
            social_idea: "Identify the highest-leverage task in your queue today and execute immediately.",
        },
        FallbackSpark {
            quote: "When something is important enough, you do it even if the odds are not in your favor.",
            author: "Elon Musk",
            topic: "First-Principles Thinking",
            summary: "• Deconstruct problems to fundamental truths • Challenge baseline assumptions • Reason from physics, not analogy",
            social_idea: "Share a bold assumption you re-examined while building your latest feature.",
        },
        FallbackSpark {
            quote: "You can't use up creativity. The more you use, the more you have.",
            author: "Maya Angelou",
            topic: "Creative Momentum",
            summary: "• Expression fuels new insights • Action cures creative blocks • Ship small drafts frequently",
            social_idea: "Post a quick behind-the-scenes look at what you're creating today.",
        },
        FallbackSpark {
            quote: "He who has a thousand friends has not one friend to spare.",
            author: "Ali ibn Abi Talib",
            topic: "Deep Professional Relationships",
            summary: "• Value quality connections over network quantity • Give genuine value first • Support fellow builders",
            social_idea: "Shout out a fellow creator or builder whose work inspires your daily workflow.",
        },
        FallbackSpark {
            quote: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
            author: "Aristotle",
            topic: "Habit Stacking for Peak Performance",
            summary: "• Anchor new habits to existing triggers • Track daily execution visual chains • Focus on identity over goals",
            social_idea: "What daily habit has had the biggest compound effect on your productivity?",
        },
        FallbackSpark {
            quote: "Simplicity is the ultimate sophistication.",
            author: "Leonardo da Vinci",
            topic: "Minimalist System Architecture",
            summary: "• Remove unnecessary moving parts • Keep data flows clean and clear • Refactor before scaling",
            social_idea: "Share how simplifying your code or workflow saved hours of debugging.",
        },
        FallbackSpark {
            quote: "In the middle of difficulty lies opportunity.",
            author: "Albert Einstein",
            topic: "Reframing Complex Bugs",
            summary: "• Bugs reveal edge cases in mental models • Systematic isolation beats guessing • Learn from root causes",
            social_idea: "What was the toughest bug you solved recently, and what did it teach you?",
        },
        FallbackSpark {
            quote: "It always seems impossible until it's done.",
            author: "Nelson Mandela",
            topic: "Breakthrough Persistence",
            summary: "• Break massive goals into bite-sized milestones • Celebrate micro-victories • Keep momentum moving forward",
            social_idea: "Document a milestone that once felt impossible but is now part of your routine.",
        },
        FallbackSpark {
            quote: "Do what you can, with what you have, where you are.",
            author: "Theodore Roosevelt",
            topic: "Resourceful Execution",
            summary: "• Avoid waiting for perfect conditions • Utilize current tools to maximum capacity • Action generates momentum",
            social_idea: "Share a project milestone achieved despite limited resources or time constraints.",
        },
    ]
}

fn get_fallback_intel(today: &str, seed_offset: usize, web_quote: Option<&WebQuote>) -> DailyIntel {
    if let Some(wq) = web_quote {
        return DailyIntel {
            date: today.to_string(),
            motivation_quote: Some(wq.quote.clone()),
            quote_author: Some(wq.author.clone()),
            learning_topic: Some(wq.topic.clone()),
            learning_summary: Some(wq.summary.clone()),
            social_post_idea: Some("Share how this insight connects to your recent project milestones.".to_string()),
            social_format: Some("plain_text".to_string()),
            social_platform: Some("linkedin".to_string()),
            day_plan: None,
            generated_at: now_iso(),
        };
    }

    let pool = get_fallback_pool();
    let hash: usize = today.bytes().fold(0usize, |acc, b| acc.wrapping_add(b as usize));
    let idx = (hash + seed_offset) % pool.len();
    let spark = &pool[idx];

    DailyIntel {
        date: today.to_string(),
        motivation_quote: Some(spark.quote.to_string()),
        quote_author: Some(spark.author.to_string()),
        learning_topic: Some(spark.topic.to_string()),
        learning_summary: Some(spark.summary.to_string()),
        social_post_idea: Some(spark.social_idea.to_string()),
        social_format: Some("plain_text".to_string()),
        social_platform: Some("linkedin".to_string()),
        day_plan: None,
        generated_at: now_iso(),
    }
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

/// Gets cached DailyIntel for today or generates fresh one via Ollama / Web Search.
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

    let seed_offset = if force_refresh {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as usize)
            .unwrap_or(1)
    } else {
        0
    };

    // Hard 3.5 second deadline for the entire generation process
    let result = tokio::time::timeout(
        Duration::from_millis(3500),
        generate_intel_inner(conn_mutex, &today, seed_offset),
    ).await;

    match result {
        Ok(Ok(intel)) => Ok(intel),
        _ => {
            let fallback = get_fallback_intel(&today, seed_offset, None);
            if let Ok(conn) = conn_mutex.lock() {
                save_daily_intel(&conn, &fallback).ok();
            }
            Ok(fallback)
        }
    }
}

async fn generate_intel_inner(
    conn_mutex: &std::sync::Mutex<Connection>,
    today: &str,
    seed_offset: usize,
) -> Result<DailyIntel, String> {
    // 1. Ensure Ollama is started in background
    ensure_ollama_started().await;

    // 2. Fetch live web search quotes in parallel (max 1.5s)
    let web_quote = fetch_web_quote().await;

    // Gather rich user context
    let user_context = {
        if let Ok(conn) = conn_mutex.lock() {
            crate::db::build_user_context(&conn)
        } else {
            String::new()
        }
    };

    let date_info = format!(
        "Today is {}. Day of week: {}",
        today,
        day_of_week(today)
    );

    let web_search_context = if let Some(ref wq) = web_quote {
        format!(
            "\nLIVE WEB SEARCH RESULTS:\n- Quote: \"{}\" — {}\n- Suggested Learning Topic: {}\n",
            wq.quote, wq.author, wq.topic
        )
    } else {
        String::new()
    };

    let prompt = format!(
        r#"You are a personal life coach AI for a driven builder.

{date_info}

{user_context}
{web_search_context}

Generate today's personal intelligence brief in EXACTLY this JSON format (no preamble, no markdown):

{{
  "motivation_quote": "<an inspiring quote from a legend>",
  "quote_author": "<author name>",
  "learning_topic": "<specific topic (2-4 words)>",
  "learning_summary": "<3 points separated by • bullet>",
  "social_post_idea": "<short post idea>",
  "social_format": "plain_text",
  "social_platform": "linkedin"
}}"#,
        date_info = date_info,
        user_context = user_context,
        web_search_context = web_search_context
    );

    let raw = call_ollama(&prompt).await.unwrap_or_default();
    let parsed = parse_intel_json(&raw, today, seed_offset, web_quote.as_ref());

    if let Ok(conn) = conn_mutex.lock() {
        save_daily_intel(&conn, &parsed).ok();
    }

    Ok(parsed)
}

fn sort_models_by_speed(models: &mut [String]) {
    models.sort_by_key(|m| {
        let lower = m.to_lowercase();
        if lower.contains("70b") || lower.contains("32b") || lower.contains("8x7b") || lower.contains("65b") {
            3 // Slowest
        } else if lower.contains("1b") || lower.contains("3b") || lower.contains("0.5b") || lower.contains("1.5b") || lower.contains("2b") || lower.contains("mini") {
            0 // Fastest
        } else {
            1 // Standard (7b, 8b)
        }
    });
}

async fn call_ollama(prompt: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    // Dynamically fetch installed models from Ollama first
    let installed_models = fetch_installed_ollama_models().await;
    let mut candidate_models: Vec<String> = installed_models.into_iter().map(|m| m.name).collect();

    // Sort installed models so lightweight/fast models are tried first
    sort_models_by_speed(&mut candidate_models);

    // Standard fast fallback tag formats used by Ollama
    let fast_default_models = [
        "llama3.2:latest", "llama3.2:1b", "llama3.2:3b", "llama3.2",
        "qwen2.5:1.5b", "qwen2.5:3b", "qwen2.5:0.5b", "qwen2.5:latest", "qwen2.5",
        "llama3:latest", "llama3", "mistral:latest", "mistral", "phi3:mini", "phi3", "gemma2:2b", "gemma:2b", "gemma:latest"
    ];

    for m in &fast_default_models {
        let name = m.to_string();
        if !candidate_models.contains(&name) {
            candidate_models.push(name);
        }
    }

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

    // Try top 2 lightweight models only
    for model in candidate_models.iter().take(2) {
        let body = OllamaReq { model, prompt, stream: false };
        let res = client
            .post(format!("{}/api/generate", OLLAMA_BASE))
            .json(&body)
            .send()
            .await;

        if let Ok(resp) = res {
            if resp.status().is_success() {
                if let Ok(parsed) = resp.json::<OllamaResp>().await {
                    if !parsed.response.trim().is_empty() {
                        return Ok(parsed.response);
                    }
                }
            }
        }
    }

    Err("Ollama unavailable".into())
}

fn parse_intel_json(raw: &str, today: &str, seed_offset: usize, web_quote: Option<&WebQuote>) -> DailyIntel {
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

    if let Ok(p) = serde_json::from_str::<Parsed>(&json_str) {
        if let Some(quote) = &p.motivation_quote {
            if !quote.trim().is_empty() {
                return DailyIntel {
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
                };
            }
        }
    }

    get_fallback_intel(today, seed_offset, web_quote)
}

fn extract_json(text: &str) -> String {
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
        let day = ((secs / 86400) + 4) % 7;
        return match day {
            0 => "Sunday", 1 => "Monday", 2 => "Tuesday",
            3 => "Wednesday", 4 => "Thursday", 5 => "Friday",
            _ => "Saturday",
        };
    }
    "Unknown"
}
