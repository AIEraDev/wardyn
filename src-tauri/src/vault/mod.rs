use std::fs;
use std::path::Path;
use crate::db::{self, KnowledgeItem, Decision};

pub fn sync_knowledge_to_vault(
    conn_mutex: &std::sync::Mutex<rusqlite::Connection>,
    item: &KnowledgeItem,
) -> Result<(), String> {
    let vault_path = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_app_setting(&conn, "vault_path").ok().flatten()
    };

    let Some(vault) = vault_path else { return Ok(()) };
    if vault.trim().is_empty() { return Ok(()); }

    let dir = Path::new(&vault);
    if !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }

    let date = if item.created_at.len() >= 10 {
        item.created_at[..10].to_string()
    } else {
        db::now_iso()[..10].to_string()
    };
    let slug = slugify(&item.summary.as_deref().unwrap_or(&item.content));
    let filename = format!("{}-note-{}.md", date, slug);
    let file_path = dir.join(filename);

    let tags: Vec<String> = serde_json::from_str(&item.tags).unwrap_or_default();
    let tags_yaml: String = tags.iter().map(|t| format!("  - {}", t)).collect::<Vec<_>>().join("\n");

    let content = format!(
        r#"---
title: "{}"
date: {}
type: knowledge
source: "{}"
url: "{}"
tags:
{}
---

# {}

**Summary**: {}

{}

---
*Captured via Wardyn Personal Intelligence OS*
"#,
        escape_yaml(&item.summary.as_deref().unwrap_or("Untitled Capture")),
        item.created_at,
        item.source,
        item.url.as_deref().unwrap_or(""),
        tags_yaml,
        item.summary.as_deref().unwrap_or("Knowledge Capture"),
        item.summary.as_deref().unwrap_or("N/A"),
        item.content
    );

    fs::write(file_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn sync_decision_to_vault(
    conn_mutex: &std::sync::Mutex<rusqlite::Connection>,
    item: &Decision,
) -> Result<(), String> {
    let vault_path = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_app_setting(&conn, "vault_path").ok().flatten()
    };

    let Some(vault) = vault_path else { return Ok(()) };
    if vault.trim().is_empty() { return Ok(()); }

    let dir = Path::new(&vault);
    if !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }

    let date = if item.created_at.len() >= 10 {
        item.created_at[..10].to_string()
    } else {
        db::now_iso()[..10].to_string()
    };
    let slug = slugify(&item.decision);
    let filename = format!("{}-decision-{}.md", date, slug);
    let file_path = dir.join(filename);

    let content = format!(
        r#"---
title: "{}"
date: {}
type: decision
status: logged
tags:
  - decision
  - strategy
---

# Decision: {}

## 🎯 Choice
{}

## 💡 Rationale
{}

## ⚖️ Alternatives Considered
{}

---
*Logged via Wardyn Personal Intelligence OS*
"#,
        escape_yaml(&item.decision),
        item.created_at,
        item.decision,
        item.decision,
        item.rationale,
        item.alternatives.as_deref().unwrap_or("None documented")
    );

    fs::write(file_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn write_analytics_summary(
    conn_mutex: &std::sync::Mutex<rusqlite::Connection>,
    content: &str,
) -> Result<String, String> {
    let vault_path = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_app_setting(&conn, "vault_path").ok().flatten()
    };

    let Some(vault) = vault_path else {
        return Err("No vault path configured. Set one in Settings.".into());
    };
    if vault.trim().is_empty() {
        return Err("No vault path configured. Set one in Settings.".into());
    }

    let dir = Path::new(&vault).join("Wardyn").join("Analytics");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let date = db::now_iso();
    let day = if date.len() >= 10 { &date[..10] } else { "summary" };
    let file_path = dir.join(format!("{}-executive-summary.md", day));
    fs::write(&file_path, content).map_err(|e| e.to_string())?;
    Ok(file_path.to_string_lossy().into_owned())
}

fn slugify(text: &str) -> String {
    let slug = text.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .take(5)
        .collect::<Vec<_>>()
        .join("-");

    if slug.is_empty() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
        format!("note-{}", ts % 100_000)
    } else {
        slug
    }
}

fn escape_yaml(text: &str) -> String {
    text.replace('"', "\\\"").replace('\n', " ")
}
