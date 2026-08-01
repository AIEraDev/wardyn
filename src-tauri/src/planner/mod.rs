use std::sync::Mutex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::db::{self, now_iso, iso_to_unix_secs};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParsedTask {
    pub title: String,
    pub description: Option<String>,
    pub due_offset_days: i64,
    pub priority: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParsedLifePlan {
    pub intent: String,
    pub title: String,
    pub event_date: Option<String>,
    pub tasks: Vec<ParsedTask>,
}

fn new_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    format!("{}_{:x}", prefix, t)
}

fn add_days_to_iso(base_iso: &str, days: i64) -> Option<String> {
    let base_secs = iso_to_unix_secs(&format!("{}T12:00:00Z", base_iso))?;
    let target_secs = base_secs + days * 86400;
    if target_secs < 0 { return None; }
    let (y, m, d) = db::days_to_ymd((target_secs / 86400) as u64);
    Some(format!("{:04}-{:02}-{:02}T08:00:00Z", y, m, d))
}

fn today_date() -> String {
    now_iso().get(0..10).unwrap_or("2026-01-01").to_string()
}

pub async fn parse_life_event(text: &str) -> Result<ParsedLifePlan, String> {
    let today = today_date();
    let prompt = format!(concat!(
        "Today is {}. Parse the following personal life input into a JSON plan.\n\n",
        "Input: \"{}\"\n\n",
        "Return ONLY valid JSON with this exact shape:\n",
        "{{\n",
        "  \"intent\": \"<event_prep|study_plan|project_kickoff|habit_goal|deadline|travel>\",\n",
        "  \"title\": \"<short title max 60 chars>\",\n",
        "  \"event_date\": \"<YYYY-MM-DD or null if no specific date>\",\n",
        "  \"tasks\": [\n",
        "    {{\n",
        "      \"title\": \"<task title>\",\n",
        "      \"description\": \"<one sentence or null>\",\n",
        "      \"due_offset_days\": 0,\n",
        "      \"priority\": \"<low|medium|high>\"\n",
        "    }}\n",
        "  ]\n",
        "}}\n\n",
        "Rules: Generate 3-7 actionable tasks. Space across the timeline. ",
        "Estimate event_date from today if not given. 0=event day, -7=one week before. ",
        "Higher priority for tasks closer to event. due_offset_days must be integers."
    ), today, text);

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "llama3.2",
        "prompt": prompt,
        "stream": false,
        "options": { "temperature": 0.3 }
    });

    let resp = client
        .post("http://127.0.0.1:11434/api/generate")
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("Ollama error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama status {}", resp.status()));
    }

    let raw: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let rt = raw["response"].as_str().unwrap_or("").trim().to_string();
    let js = rt.find('{').unwrap_or(0);
    let je = rt.rfind('}').map(|i| i + 1).unwrap_or(rt.len());
    serde_json::from_str::<ParsedLifePlan>(&rt[js..je])
        .map_err(|e| format!("JSON parse error: {e}\nRaw: {rt}"))
}

pub fn create_life_plan(
    conn_mutex: &Mutex<Connection>,
    raw_input: &str,
    plan: &ParsedLifePlan,
) -> Result<db::LifeEvent, String> {
    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    let event_id = new_id("life");

    db::insert_life_event(&conn, &event_id, &plan.title, raw_input, &plan.intent, plan.event_date.as_deref())
        .map_err(|e| e.to_string())?;

    for task in &plan.tasks {
        let task_id = new_id("lt");
        let due_date = plan.event_date.as_deref()
            .and_then(|b| add_days_to_iso(b, task.due_offset_days));

        db::insert_life_task(&conn, &task_id, &event_id, &task.title,
            task.description.as_deref(), due_date.as_deref(), &task.priority)
            .map_err(|e| e.to_string())?;

        if let Some(ref due) = due_date {
            if let Some(ds) = iso_to_unix_secs(due) {
                let rs = ds - 86400;
                if rs > 0 {
                    let rd = db::days_to_ymd((rs / 86400) as u64);
                    let rdate = format!("{:04}-{:02}-{:02}T08:00:00Z", rd.0, rd.1, rd.2);
                    let msg = format!("Reminder: due tomorrow — {}", task.title);
                    let rid = new_id("rem");
                    conn.execute(
                        "INSERT INTO reminders (id,item_id,reminder_date,message,status,created_at) VALUES (?1,?2,?3,?4,'pending',?5)",
                        rusqlite::params![rid, task_id, rdate, msg, now_iso()],
                    ).ok();
                }
            }
        }
    }

    if let Some(ref edate) = plan.event_date {
        let smart: &[(i64, &str)] = &[
            (-7, "Your event is 1 week away: {}"),
            (-3, "3 days left: {}"),
            (-1, "Tomorrow is the day: {}"),
            (0,  "Today is the day: {}"),
        ];
        for &(offset, tpl) in smart {
            if let Some(rdate) = add_days_to_iso(edate, offset) {
                let msg = tpl.replace("{}", &plan.title);
                let rid = new_id("rem");
                conn.execute(
                    "INSERT INTO reminders (id,item_id,reminder_date,message,status,created_at) VALUES (?1,?2,?3,?4,'pending',?5)",
                    rusqlite::params![rid, event_id, rdate, msg, now_iso()],
                ).ok();
            }
        }
    }

    db::get_life_events(&conn)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|e| e.id == event_id)
        .ok_or_else(|| "Event not found after insert".to_string())
}

pub fn fallback_plan(text: &str) -> ParsedLifePlan {
    let today = today_date();
    let tl = text.to_lowercase();
    let event_date = if tl.contains("next week") {
        add_days_to_iso(&today, 7)
    } else if tl.contains("next month") {
        add_days_to_iso(&today, 30)
    } else if tl.contains("tomorrow") {
        add_days_to_iso(&today, 1)
    } else {
        add_days_to_iso(&today, 14)
    }.and_then(|d| d.get(0..10).map(|s| s.to_string()));

    ParsedLifePlan {
        intent: "event_prep".to_string(),
        title: text.get(..text.len().min(60)).unwrap_or(text).trim().to_string(),
        event_date,
        tasks: vec![
            ParsedTask {
                title: "Prepare and plan".to_string(),
                description: Some(format!("Prepare for: {}", &text[..text.len().min(80)])),
                due_offset_days: -3,
                priority: "high".to_string(),
            },
            ParsedTask {
                title: "Final review".to_string(),
                description: Some("Review all details are in order".to_string()),
                due_offset_days: -1,
                priority: "high".to_string(),
            },
        ],
    }
}
