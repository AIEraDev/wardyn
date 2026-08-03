use reqwest::Client;
use crate::db::{self, KnowledgeItem};
use crate::db::now_iso;

const OLLAMA_BASE: &str = "http://localhost:11434";

pub async fn capture_and_tag(
    conn_mutex: &std::sync::Mutex<rusqlite::Connection>,
    content: String,
    url: Option<String>,
    source: String,
) -> Result<KnowledgeItem, String> {
    // ── Input length validation ───────────────────────────────────────────────
    const MAX_CONTENT_BYTES: usize = 50 * 1024; // 50 KB
    if content.len() > MAX_CONTENT_BYTES {
        return Err(format!(
            "Content is too large ({} KB). Maximum is 50 KB. Please paste a shorter excerpt.",
            content.len() / 1024
        ));
    }
    if content.trim().is_empty() {
        return Err("Content cannot be empty.".into());
    }
    let id = format!("ki_{}", uuid_simple());
    let item = KnowledgeItem {
        id: id.clone(),
        content: content.clone(),
        url: url.clone(),
        tags: "[]".into(),
        summary: None,
        source,
        created_at: now_iso(),
    };

    // Save immediately so UI shows it instantly
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::save_knowledge_item(&conn, &item).map_err(|e| e.to_string())?;
    }

    // Auto-tag async via Ollama (best-effort — doesn't block save)
    let (tags, summary) = auto_tag_with_ollama(&content, url.as_deref()).await;
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::update_knowledge_item_tags(&conn, &id, &tags, &summary).ok();
    }

    // Return updated item and sync to Markdown vault if path is configured
    let updated = KnowledgeItem {
        id,
        content: item.content,
        url: item.url,
        tags,
        summary: Some(summary),
        source: item.source,
        created_at: item.created_at,
    };
    crate::vault::sync_knowledge_to_vault(conn_mutex, &updated).ok();
    Ok(updated)
}


async fn auto_tag_with_ollama(content: &str, url: Option<&str>) -> (String, String) {
    let url_line = url.map(|u| format!("URL: {}", u)).unwrap_or_default();
    let prompt = format!(
        r#"Analyse this note/URL and respond with ONLY a JSON object (no markdown, no explanation):
{{
  "tags": ["tag1", "tag2"],
  "summary": "one sentence summary"
}}

Rules:
- 2-5 tags, lowercase, single words or hyphenated (e.g. "machine-learning", "rust", "decision", "startup")
- summary max 15 words, plain text

CONTENT:
{}
{}"#,
        content.chars().take(400).collect::<String>(),
        url_line
    );

    let client = match Client::builder().timeout(std::time::Duration::from_secs(20)).build() {
        Ok(c) => c,
        Err(_) => return (r#"["general"]"#.into(), "Personal note".into()),
    };

    let models = ["llama3", "qwen2.5", "mistral", "gemma", "phi3", "llama3:70b"];
    for model in models {
        let payload = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
            "options": { "num_predict": 80, "temperature": 0.2 }
        });
        let Ok(resp) = client.post(format!("{}/api/generate", OLLAMA_BASE)).json(&payload).send().await else { continue };
        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await.unwrap_or_default();
            if let Some(text) = json["response"].as_str() {
                // Extract JSON from response
                if let Some(start) = text.find('{') {
                    if let Some(end) = text.rfind('}') {
                        let json_str = &text[start..=end];
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
                            let tags = parsed["tags"].as_array()
                                .map(|arr| serde_json::to_string(arr).unwrap_or_else(|_| r#"["general"]"#.into()))
                                .unwrap_or_else(|| r#"["general"]"#.into());
                            let summary = parsed["summary"].as_str().unwrap_or("Personal note").to_string();
                            return (tags, summary);
                        }
                    }
                }
            }
        }
    }

    // Fallback: basic keyword tagging without Ollama
    let fallback_tags = rule_based_tags(content);
    (serde_json::to_string(&fallback_tags).unwrap_or_else(|_| r#"["general"]"#.into()), "Personal note".into())
}

fn rule_based_tags(content: &str) -> Vec<&'static str> {
    let lower = content.to_lowercase();
    let mut tags = Vec::new();
    if lower.contains("rust") || lower.contains("cargo") { tags.push("rust"); }
    if lower.contains("ai") || lower.contains("llm") || lower.contains("model") { tags.push("ai"); }
    if lower.contains("decision") || lower.contains("chose") || lower.contains("decided") { tags.push("decision"); }
    if lower.contains("http") || lower.contains("www") || lower.contains(".com") { tags.push("link"); }
    if lower.contains("paper") || lower.contains("arxiv") || lower.contains("research") { tags.push("research"); }
    if lower.contains("startup") || lower.contains("product") || lower.contains("build") { tags.push("startup"); }
    if tags.is_empty() { tags.push("general"); }
    tags
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    format!("{:x}", t)
}
