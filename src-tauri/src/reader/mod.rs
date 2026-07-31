use reqwest::Client;

const OLLAMA_BASE: &str = "http://localhost:11434";

pub async fn deep_read_url(url: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    let html = resp.text().await.map_err(|e| format!("Failed to read page text: {}", e))?;
    let (title, body_text) = extract_article_content(&html);

    if body_text.trim().is_empty() {
        return Err("Unable to extract main text from web page.".into());
    }

    let prompt = format!(
        r#"Analyse this web article titled "{}" and synthesize a deep executive breakdown.

ARTICLE TEXT (first 3000 chars):
{}

OUTPUT FORMAT (use markdown formatting with emoji headers):
📖 DEEP READ — {}

🎯 EXECUTIVE SUMMARY
(2-3 clear sentences summarizing the core argument/topic)

🔑 KEY TAKEAWAYS
- Takeaway 1
- Takeaway 2
- Takeaway 3

💡 ACTIONABLE SIGNAL & RELEVANCE
(Why this matters for engineering, product, or technical strategy)"#,
        title,
        body_text.chars().take(3000).collect::<String>(),
        title
    );

    let models = ["llama3:70b", "qwen2.5:32b", "mixtral:8x7b", "llama3", "qwen2.5", "mistral", "gemma", "phi3"];

    for model in models {
        let payload = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
            "options": { "num_predict": 500, "temperature": 0.3 }
        });

        let res = client.post(format!("{}/api/generate", OLLAMA_BASE)).json(&payload).send().await;
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

    // Fallback if Ollama is not available
    Ok(format!(
        "📖 DEEP READ — {}\n\n🎯 EXECUTIVE SUMMARY\nExtracted {} chars of text from page. Ollama offline for AI breakdown.\n\nARTICLE SNIPPET:\n{}",
        title,
        body_text.len(),
        body_text.chars().take(500).collect::<String>()
    ))
}

fn extract_article_content(html: &str) -> (String, String) {
    let title = extract_title(html).unwrap_or_else(|| "Web Article".into());

    // Strip script & style blocks first
    let clean_html = remove_blocks(html, "<script", "</script>");
    let clean_html = remove_blocks(&clean_html, "<style", "</style>");
    let clean_html = remove_blocks(&clean_html, "<nav", "</nav>");
    let clean_html = remove_blocks(&clean_html, "<footer", "</footer>");

    // Strip all HTML tags
    let mut text = String::new();
    let mut inside_tag = false;
    for c in clean_html.chars() {
        if c == '<' {
            inside_tag = true;
        } else if c == '>' {
            inside_tag = false;
            text.push(' ');
        } else if !inside_tag {
            text.push(c);
        }
    }

    let cleaned_text = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && l.len() > 20)
        .collect::<Vec<_>>()
        .join("\n\n");

    (title, cleaned_text)
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title>")? + 7;
    let end = lower[start..].find("</title>")?;
    Some(html[start..start + end].replace('\n', " ").trim().to_string())
}

fn remove_blocks(html: &str, start_tag: &str, end_tag: &str) -> String {
    let mut result = String::new();
    let mut current = html;

    while let Some(start_idx) = current.to_lowercase().find(start_tag) {
        result.push_str(&current[..start_idx]);
        if let Some(end_idx) = current[start_idx..].to_lowercase().find(end_tag) {
            current = &current[start_idx + end_idx + end_tag.len()..];
        } else {
            break;
        }
    }
    result.push_str(current);
    result
}
