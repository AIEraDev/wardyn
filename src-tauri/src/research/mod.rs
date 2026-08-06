use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub source: String,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub query: String,
    pub source_used: String,
}

/// Main entry point — queries multiple sources concurrently and reranks results.
pub async fn web_search(
    query: &str,
    category: Option<&str>,
    sort_by: Option<&str>,
) -> Result<SearchResponse, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Query cannot be empty".to_string());
    }

    let category_str = category.unwrap_or("all");

    let (ddg_results, wiki_results, hn_results, arxiv_results) = match category_str {
        "web" => (
            search_duckduckgo(trimmed).await.unwrap_or_default(),
            vec![],
            vec![],
            vec![],
        ),
        "tech" => (
            search_duckduckgo(trimmed).await.unwrap_or_default(),
            vec![],
            search_hackernews(trimmed).await.unwrap_or_default(),
            vec![],
        ),
        "wiki" => (
            vec![],
            search_wikipedia(trimmed).await.unwrap_or_default(),
            vec![],
            vec![],
        ),
        "academic" => (
            vec![],
            search_wikipedia(trimmed).await.unwrap_or_default(),
            vec![],
            search_arxiv(trimmed).await.unwrap_or_default(),
        ),
        _ => {
            // "all" — query all 4 sources in parallel for maximum rich coverage
            let (ddg, wiki, hn, arxiv) = tokio::join!(
                search_duckduckgo(trimmed),
                search_wikipedia(trimmed),
                search_hackernews(trimmed),
                search_arxiv(trimmed)
            );
            (
                ddg.unwrap_or_default(),
                wiki.unwrap_or_default(),
                hn.unwrap_or_default(),
                arxiv.unwrap_or_default(),
            )
        }
    };

    let mut raw_results = Vec::new();
    let mut sources_used = Vec::new();

    if !ddg_results.is_empty() {
        sources_used.push("DuckDuckGo");
        raw_results.extend(ddg_results);
    }
    if !wiki_results.is_empty() {
        sources_used.push("Wikipedia");
        raw_results.extend(wiki_results);
    }
    if !hn_results.is_empty() {
        sources_used.push("HackerNews");
        raw_results.extend(hn_results);
    }
    if !arxiv_results.is_empty() {
        sources_used.push("ArXiv");
        raw_results.extend(arxiv_results);
    }

    if raw_results.is_empty() {
        // Fallback: single attempt to Wikipedia if everything else returned empty
        if let Ok(results) = search_wikipedia(trimmed).await {
            raw_results.extend(results);
            sources_used.push("Wikipedia Fallback");
        }
    }

    let processed = process_and_rerank_results(raw_results, trimmed, sort_by);
    let source_label = if sources_used.is_empty() {
        "Web Search".to_string()
    } else {
        sources_used.join(" + ")
    };

    Ok(SearchResponse {
        results: processed,
        query: trimmed.to_string(),
        source_used: source_label,
    })
}

/// Reranks search results based on term matching or publication date.
fn process_and_rerank_results(
    results: Vec<SearchResult>,
    query: &str,
    sort_by: Option<&str>,
) -> Vec<SearchResult> {
    let query_lower = query.to_lowercase();
    let stop_words: HashSet<&str> = [
        "the", "a", "an", "is", "are", "for", "in", "of", "to", "and", "or", "on", "at", "by",
        "with", "from", "how", "what", "where", "why", "which", "vs", "best", "latest",
    ]
    .iter()
    .cloned()
    .collect();

    let keywords: Vec<String> = query_lower
        .split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()).to_string())
        .filter(|w| w.len() > 1 && !stop_words.contains(w.as_str()))
        .collect();

    let mut seen_urls: HashSet<String> = HashSet::new();
    let mut scored: Vec<(f64, SearchResult)> = Vec::new();

    for item in results {
        let norm_url = normalize_url(&item.url);
        if seen_urls.contains(&norm_url) {
            continue;
        }
        seen_urls.insert(norm_url);

        let title_lower = item.title.to_lowercase();
        let snippet_lower = item.snippet.to_lowercase();

        let mut score = 1.0;

        for kw in &keywords {
            if title_lower.contains(kw) {
                score += 4.0;
            }
            if snippet_lower.contains(kw) {
                score += 1.5;
            }
        }

        if !item.snippet.trim().is_empty() {
            score += 2.0;
        } else {
            score -= 2.0;
        }

        if item.source == "Wikipedia" {
            score += 1.5;
        } else if item.source == "HackerNews" {
            score += 1.2;
        } else if item.source == "ArXiv" {
            score += 1.5;
        }

        if score > 0.0 {
            scored.push((score, item));
        }
    }

    if sort_by == Some("date") {
        // Sort primarily by date descending (newest dates first), with relevance as secondary
        scored.sort_by(|a, b| {
            let date_a = a.1.date.as_deref().unwrap_or("");
            let date_b = b.1.date.as_deref().unwrap_or("");
            match date_b.cmp(date_a) {
                std::cmp::Ordering::Equal => {
                    b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal)
                }
                other => other,
            }
        });
    } else {
        // Sort by relevance score
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    }

    scored.into_iter().map(|(_, item)| item).take(15).collect()
}

fn normalize_url(url: &str) -> String {
    let lower = url.to_lowercase();
    let trimmed = lower
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("www.");
    trimmed.trim_end_matches('/').to_string()
}

/// Scrapes DuckDuckGo's HTML endpoint + Instant Answer fallback.
async fn search_duckduckgo(query: &str) -> Result<Vec<SearchResult>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://html.duckduckgo.com/html/?q={}&kl=us-en",
        urlencoding::encode(query)
    );

    let resp = client
        .get(&url)
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| format!("DDG request failed: {}", e))?;

    let html = resp.text().await.map_err(|e| e.to_string())?;
    let mut results = parse_ddg_html(&html);

    if results.len() < 2 {
        if let Ok(ia_results) = search_ddg_instant_answer(&client, query).await {
            results.extend(ia_results);
        }
    }

    Ok(results)
}

async fn search_ddg_instant_answer(
    client: &Client,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
    let ia_url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1",
        urlencoding::encode(query)
    );

    let resp = client.get(&ia_url).send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    if let Some(abstract_text) = json["AbstractText"].as_str() {
        if !abstract_text.is_empty() {
            let title = json["Heading"].as_str().unwrap_or(query).to_string();
            let url = json["AbstractURL"]
                .as_str()
                .unwrap_or("https://duckduckgo.com")
                .to_string();
            results.push(SearchResult {
                title,
                url,
                snippet: abstract_text.to_string(),
                source: "DuckDuckGo".to_string(),
                date: None,
            });
        }
    }

    if let Some(related) = json["RelatedTopics"].as_array() {
        for topic in related.iter().take(4) {
            if let (Some(text), Some(first_url)) =
                (topic["Text"].as_str(), topic["FirstURL"].as_str())
            {
                let parts: Vec<&str> = text.splitn(2, " - ").collect();
                let (title, snippet) = if parts.len() == 2 {
                    (parts[0].to_string(), parts[1].to_string())
                } else {
                    (text.to_string(), text.to_string())
                };

                results.push(SearchResult {
                    title,
                    url: first_url.to_string(),
                    snippet,
                    source: "DuckDuckGo".to_string(),
                    date: None,
                });
            }
        }
    }

    Ok(results)
}

/// Parses DuckDuckGo HTML response.
fn parse_ddg_html(html: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();
    let mut remaining = html;

    while let Some(result_start) = remaining.find("result__a") {
        remaining = &remaining[result_start..];

        let raw_url = extract_attr(remaining, "href=\"", "\"")
            .unwrap_or_default()
            .trim()
            .to_string();

        if raw_url.is_empty()
            || raw_url.starts_with("//duckduckgo")
            || raw_url.contains("duckduckgo.com")
        {
            if remaining.len() > 10 {
                remaining = &remaining[10..];
            } else {
                break;
            }
            continue;
        }

        let title = extract_between(remaining, ">", "</a>")
            .map(strip_html_tags)
            .unwrap_or_default();

        let snippet = if let Some(snip_pos) = remaining.find("result__snippet") {
            let snip_section = &remaining[snip_pos..];
            extract_between(snip_section, ">", "</a>")
                .map(strip_html_tags)
                .unwrap_or_default()
        } else {
            String::new()
        };

        let clean_url = decode_ddg_url(&raw_url);

        if !title.is_empty() && !clean_url.is_empty() {
            results.push(SearchResult {
                title,
                url: clean_url,
                snippet,
                source: "DuckDuckGo".to_string(),
                date: None,
            });
        }

        if results.len() >= 10 {
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

fn decode_ddg_url(url: &str) -> String {
    if url.starts_with("/l/?uddg=") {
        let encoded = url.trim_start_matches("/l/?uddg=");
        let decoded = urlencoding::decode(encoded).unwrap_or_default().to_string();
        if let Some(amp_pos) = decoded.find('&') {
            decoded[..amp_pos].to_string()
        } else {
            decoded
        }
    } else {
        url.to_string()
    }
}

/// Searches Wikipedia's REST API.
async fn search_wikipedia(query: &str) -> Result<Vec<SearchResult>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Wardyn/1.0 (personal research tool)")
        .build()
        .map_err(|e| e.to_string())?;

    let search_url = format!(
        "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={}&format=json&srlimit=6&srprop=snippet|timestamp",
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
            let date = item["timestamp"]
                .as_str()
                .map(|t| if t.len() >= 10 { t[..10].to_string() } else { t.to_string() });
            SearchResult {
                title,
                url,
                snippet,
                source: "Wikipedia".to_string(),
                date,
            }
        })
        .filter(|r| !r.title.is_empty())
        .collect();

    Ok(results)
}

/// Searches HackerNews via Algolia API — includes created_at timestamps.
async fn search_hackernews(query: &str) -> Result<Vec<SearchResult>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Wardyn/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://hn.algolia.com/api/v1/search?query={}&hitsPerPage=6",
        urlencoding::encode(query)
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HackerNews request failed: {}", e))?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let hits = json["hits"].as_array().cloned().unwrap_or_default();
    let mut results = Vec::new();

    for hit in hits {
        let title = hit["title"]
            .as_str()
            .or_else(|| hit["story_title"].as_str())
            .unwrap_or("")
            .to_string();

        if title.is_empty() {
            continue;
        }

        let object_id = hit["objectID"].as_str().unwrap_or("");
        let hn_url = format!("https://news.ycombinator.com/item?id={}", object_id);

        let target_url = hit["url"]
            .as_str()
            .or_else(|| hit["story_url"].as_str())
            .unwrap_or(&hn_url)
            .to_string();

        let points = hit["points"].as_u64().unwrap_or(0);
        let comments = hit["num_comments"].as_u64().unwrap_or(0);

        let date = hit["created_at"].as_str().map(|d| {
            if d.len() >= 10 {
                d[..10].to_string()
            } else {
                d.to_string()
            }
        });

        let date_str = date.as_deref().unwrap_or("recent");
        let snippet = format!(
            "Discussion on HackerNews ({}) — {} points, {} comments.",
            date_str, points, comments
        );

        results.push(SearchResult {
            title,
            url: target_url,
            snippet,
            source: "HackerNews".to_string(),
            date,
        });
    }

    Ok(results)
}

/// Searches ArXiv API for scientific and technical papers.
async fn search_arxiv(query: &str) -> Result<Vec<SearchResult>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Wardyn/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "http://export.arxiv.org/api/query?search_query=all:{}&start=0&max_results=6",
        urlencoding::encode(query)
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("ArXiv request failed: {}", e))?;

    let xml = resp.text().await.map_err(|e| e.to_string())?;
    let results = parse_arxiv_xml(&xml);
    Ok(results)
}

fn parse_arxiv_xml(xml: &str) -> Vec<SearchResult> {
    let mut results = Vec::new();
    let mut remaining = xml;

    while let Some(entry_pos) = remaining.find("<entry>") {
        remaining = &remaining[entry_pos..];
        let entry_end = match remaining.find("</entry>") {
            Some(pos) => pos,
            None => break,
        };
        let entry = &remaining[..entry_end];

        let title = extract_between(entry, "<title>", "</title>")
            .map(|t| strip_html_tags(t).replace('\n', " "))
            .unwrap_or_default();

        let id = extract_between(entry, "<id>", "</id>")
            .map(|i| i.trim().to_string())
            .unwrap_or_default();

        let summary = extract_between(entry, "<summary>", "</summary>")
            .map(|s| strip_html_tags(s).replace('\n', " "))
            .unwrap_or_default();

        let published = extract_between(entry, "<published>", "</published>")
            .map(|p| p.trim().to_string());

        let date = published.as_ref().map(|p| {
            if p.len() >= 10 {
                p[..10].to_string()
            } else {
                p.clone()
            }
        });

        if !title.is_empty() && !id.is_empty() {
            // Keep full summary up to 1200 chars without pre-truncating with '...'
            let clean_summary = if summary.len() > 1200 {
                summary[..1200].to_string()
            } else {
                summary
            };

            results.push(SearchResult {
                title: title.trim().to_string(),
                url: id,
                snippet: clean_summary.trim().to_string(),
                source: "ArXiv".to_string(),
                date,
            });
        }

        remaining = &remaining[entry_end..];
    }

    results
}

/// Uses Ollama to synthesize a research summary from search results.
pub async fn summarize_results(
    query: &str,
    results: &[SearchResult],
    conn_mutex: &std::sync::Mutex<rusqlite::Connection>,
) -> Result<String, String> {
    if results.is_empty() {
        return Err("No results to summarize".to_string());
    }

    let context = results
        .iter()
        .take(8)
        .enumerate()
        .map(|(i, r)| {
            let date_str = r.date.as_deref().unwrap_or("N/A");
            format!(
                "[{}] {}\nSource: {}\nDate: {}\nURL: {}\nSnippet: {}",
                i + 1,
                r.title,
                r.source,
                date_str,
                r.url,
                r.snippet
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let related_knowledge = {
        if let Ok(conn) = conn_mutex.lock() {
            let query_lower = query.to_lowercase();
            let keywords: Vec<&str> = query_lower
                .split_whitespace()
                .filter(|w| w.len() > 3)
                .take(5)
                .collect();

            if let Ok(mut stmt) = conn.prepare(
                "SELECT summary, tags FROM knowledge_items ORDER BY created_at DESC LIMIT 50",
            ) {
                if let Ok(rows) = stmt.query_map([], |row| {
                    Ok((row.get::<_, Option<String>>(0)?, row.get::<_, String>(1)?))
                }) {
                    let matches: Vec<String> = rows
                        .filter_map(|r| r.ok())
                        .filter(|(summary, tags)| {
                            let text = format!(
                                "{} {}",
                                summary.as_deref().unwrap_or("").to_lowercase(),
                                tags.to_lowercase()
                            );
                            keywords.iter().any(|kw| text.contains(kw))
                        })
                        .take(3)
                        .map(|(s, _)| format!("• {}", s.unwrap_or_default()))
                        .collect();
                    matches
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

    let knowledge_note = if related_knowledge.is_empty() {
        String::new()
    } else {
        format!(
            "\n\nYou've previously saved related notes:\n{}\nConnect these to your summary where relevant.\n",
            related_knowledge.join("\n")
        )
    };

    let prompt = format!(
        "You are an expert research analyst. Based on these search results for the query \"{}\", \
        provide a concise, factual 3-4 sentence synthesis of key insights and findings. \
        Highlight main consensus, key statistics or tools mentioned, and cite specific sources where appropriate.{}\n\nSearch results:\n{}\n\nSummary:",
        query, knowledge_note, context
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

// ─── Helpers ─────────────────────────────────────────────────────────────

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
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .replace("&#x2F;", "/")
        .replace("&#x26;", "&")
        .replace("&emsp;", " ")
        .replace("&ensp;", " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
