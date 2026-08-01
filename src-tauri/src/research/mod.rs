use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub query: String,
    pub source_used: String,
}

/// Main entry point — tries DuckDuckGo HTML scrape first, then Wikipedia API.
pub async fn web_search(query: &str) -> Result<SearchResponse, String> {
    let ddg = search_duckduckgo(query).await;
    if let Ok(results) = ddg {
        if !results.is_empty() {
            return Ok(SearchResponse {
                results,
                query: query.to_string(),
                source_used: "DuckDuckGo".to_string(),
            });
        }
    }

    // Fallback: Wikipedia search API (always free, no scraping needed)
    let wiki = search_wikipedia(query).await?;
    Ok(SearchResponse {
        results: wiki,
        query: query.to_string(),
        source_used: "Wikipedia".to_string(),
    })
}

/// Scrapes DuckDuckGo's HTML endpoint — no API key, no rate limit for personal use.
async fn search_duckduckgo(query: &str) -> Result<Vec<SearchResult>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://html.duckduckgo.com/html/?q={}&kl=us-en",
        urlencoding::encode(query)
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("DDG request failed: {}", e))?;

    let html = resp.text().await.map_err(|e| e.to_string())?;
    let results = parse_ddg_html(&html);
    Ok(results)
}

/// Parses DuckDuckGo HTML response to extract result titles, URLs, and snippets.
fn parse_ddg_html(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();

    // DDG HTML structure: results are in <div class="result"> blocks
    // Each has <a class="result__a"> for title/URL and <a class="result__snippet"> for snippet
    let mut remaining = html;

    while let Some(result_start) = remaining.find("result__a") {
        remaining = &remaining[result_start..];

        // Extract URL from href
        let url = extract_attr(remaining, "href=\"", "\"")
            .unwrap_or_default()
            .trim()
            .to_string();

        // Skip DDG internal links and ads
        if url.is_empty() || url.starts_with("//duckduckgo") || url.contains("duckduckgo.com") {
            remaining = &remaining[10..];
            continue;
        }

        // Extract title (text between > and </a>)
        let title = extract_between(remaining, ">", "</a>")
            .map(|t| strip_html_tags(t).trim().to_string())
            .unwrap_or_default();

        // Find snippet for this result
        let snippet = if let Some(snip_pos) = remaining.find("result__snippet") {
            let snip_section = &remaining[snip_pos..];
            extract_between(snip_section, ">", "</a>")
                .map(|s| strip_html_tags(s).trim().to_string())
                .unwrap_or_default()
        } else {
            String::new()
        };

        if !title.is_empty() && !url.is_empty() {
            // Clean up DDG redirect URLs
            let clean_url = if url.starts_with("/l/?uddg=") {
                urlencoding::decode(url.trim_start_matches("/l/?uddg="))
                    .unwrap_or_default()
                    .to_string()
            } else {
                url
            };

            results.push(SearchResult {
                title,
                url: clean_url,
                snippet,
                source: "DuckDuckGo".to_string(),
            });
        }

        if results.len() >= 8 {
            break;
        }

        if remaining.len() > 10 {
            remaining = &remaining[10..];
        } else {
            break;
        }
    }

    results
}

/// Searches Wikipedia's free REST API — great for factual/research queries.
async fn search_wikipedia(query: &str) -> Result<Vec<SearchResult>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Wardyn/1.0 (personal research tool)")
        .build()
        .map_err(|e| e.to_string())?;

    // Wikipedia search API
    let search_url = format!(
        "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={}&format=json&srlimit=6&srprop=snippet",
        urlencoding::encode(query)
    );

    let resp = client
        .get(&search_url)
        .send()
        .await
        .map_err(|e| format!("Wikipedia request failed: {}", e))?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let search_results = json["query"]["search"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let results = search_results
        .iter()
        .map(|item| {
            let title = item["title"].as_str().unwrap_or("").to_string();
            let snippet = strip_html_tags(item["snippet"].as_str().unwrap_or(""));
            let page_id = item["pageid"].as_u64().unwrap_or(0);
            let url = format!("https://en.wikipedia.org/?curid={}", page_id);
            SearchResult {
                title,
                url,
                snippet,
                source: "Wikipedia".to_string(),
            }
        })
        .collect();

    Ok(results)
}

/// Uses Ollama to synthesize a research summary from the search results.
pub async fn summarize_results(query: &str, results: &[SearchResult]) -> Result<String, String> {
    if results.is_empty() {
        return Err("No results to summarize".to_string());
    }

    let context = results
        .iter()
        .enumerate()
        .map(|(i, r)| format!("[{}] {}\n{}\n{}", i + 1, r.title, r.url, r.snippet))
        .collect::<Vec<_>>()
        .join("\n\n");

    let prompt = format!(
        "You are a research assistant. Based on these search results for the query \"{}\", \
        provide a concise, factual 3-4 sentence summary of the key findings. \
        Include the most important points and note any trends or consensus. \
        Be direct and informative.\n\nSearch results:\n{}\n\nSummary:",
        query, context
    );

    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    let models = ["qwen2.5", "llama3", "mistral", "phi3", "gemma"];

    for model in models {
        let body = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false
        });

        if let Ok(resp) = client
            .post("http://localhost:11434/api/generate")
            .json(&body)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(text) = json["response"].as_str() {
                        let trimmed = text.trim().to_string();
                        if !trimmed.is_empty() {
                            return Ok(trimmed);
                        }
                    }
                }
            }
        }
    }

    Err("Ollama unavailable — install a model to get AI summaries".to_string())
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

fn extract_attr<'a>(html: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let start_pos = html.find(start)? + start.len();
    let end_pos = html[start_pos..].find(end)?;
    Some(&html[start_pos..start_pos + end_pos])
}

fn extract_between<'a>(html: &'a str, open_tag_end: &str, close_tag: &str) -> Option<&'a str> {
    let start = html.find(open_tag_end)? + open_tag_end.len();
    let end = html[start..].find(close_tag)?;
    Some(&html[start..start + end])
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ")
        .replace("&#39;", "'")
        .trim()
        .to_string()
}
