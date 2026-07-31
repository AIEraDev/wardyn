use reqwest::Client;
use crate::db::FeedItem;
use crate::db::now_iso;

// ─── Hacker News (Algolia API — no auth) ─────────────────────────────────────

pub async fn fetch_hackernews(client: &Client) -> Vec<FeedItem> {
    let url = "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=30&numericFilters=points>50";
    let Ok(resp) = client.get(url).send().await else { return Vec::new() };
    let Ok(json) = resp.json::<serde_json::Value>().await else { return Vec::new() };

    json["hits"].as_array().unwrap_or(&vec![]).iter().map(|hit| {
        let title = hit["title"].as_str().unwrap_or("Untitled").to_string();
        let url_str = hit["url"].as_str()
            .or_else(|| hit["story_url"].as_str())
            .unwrap_or("https://news.ycombinator.com")
            .to_string();
        let score = hit["points"].as_i64().unwrap_or(0);
        let obj_id = hit["objectID"].as_str().unwrap_or("hn").to_string();
        FeedItem {
            id: format!("hn_{}", obj_id),
            source: "hackernews".into(),
            title,
            url: url_str,
            summary: hit["story_text"].as_str().map(|s| s.chars().take(200).collect()),
            score,
            relevance_score: 0.0,
            fetched_at: now_iso(),
        }
    }).collect()
}

// ─── arXiv (open API — cs.AI, cs.LG, cs.DC, cs.PL) ─────────────────────────

pub async fn fetch_arxiv(client: &Client) -> Vec<FeedItem> {
    let categories = ["cs.AI", "cs.LG", "cs.DC", "cs.PL", "cs.CL", "cs.CR"];
    let query = categories.iter().map(|c| format!("cat:{}", c)).collect::<Vec<_>>().join("+OR+");
    let url = format!(
        "http://export.arxiv.org/api/query?search_query={}&sortBy=submittedDate&sortOrder=descending&max_results=20",
        query
    );

    let Ok(resp) = client.get(&url).send().await else { return Vec::new() };
    let Ok(text) = resp.text().await else { return Vec::new() };

    let mut items = Vec::new();
    for entry in text.split("<entry>").skip(1) {
        let title = extract_xml_tag(entry, "title").unwrap_or_default();
        let arxiv_id = extract_xml_tag(entry, "id").unwrap_or_default();
        let summary = extract_xml_tag(entry, "summary").map(|s| s.chars().take(250).collect());
        let arxiv_url = arxiv_id.trim().to_string();
        let id = arxiv_url.split('/').last().unwrap_or("arxiv").to_string();
        items.push(FeedItem {
            id: format!("arxiv_{}", id),
            source: "arxiv".into(),
            title: title.trim().replace('\n', " "),
            url: arxiv_url,
            summary,
            score: 100,
            relevance_score: 0.0,
            fetched_at: now_iso(),
        });
    }
    items
}

fn extract_xml_tag(text: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = text.find(&open)? + open.len();
    let end = text[start..].find(&close)?;
    Some(text[start..start + end].trim().to_string())
}

// ─── GitHub (Search API — no auth, 60 req/hour unauthenticated) ──────────────

pub async fn fetch_github_trending(client: &Client) -> Vec<FeedItem> {
    // Search repos created in the last 3 days with high stars growth
    let query = "language:rust+language:python+language:go+stars:>100+created:>2026-07-28";
    let url = format!(
        "https://api.github.com/search/repositories?q={}&sort=stars&order=desc&per_page=10",
        urlencoding::encode(query)
    );

    let Ok(resp) = client.get(&url)
        .header("User-Agent", "Wardyn-Intelligence/1.0")
        .send().await else { return Vec::new() };
    let Ok(json) = resp.json::<serde_json::Value>().await else { return Vec::new() };

    json["items"].as_array().unwrap_or(&vec![]).iter().map(|repo| {
        let name = repo["full_name"].as_str().unwrap_or("unknown/repo").to_string();
        let desc = repo["description"].as_str().map(|s| s.to_string());
        let repo_url = repo["html_url"].as_str().unwrap_or("https://github.com").to_string();
        let stars = repo["stargazers_count"].as_i64().unwrap_or(0);
        let repo_id = repo["id"].as_i64().unwrap_or(0);
        FeedItem {
            id: format!("gh_{}", repo_id),
            source: "github".into(),
            title: format!("⭐ {} — {}", name, desc.as_deref().unwrap_or("No description")),
            url: repo_url,
            summary: desc,
            score: stars,
            relevance_score: 0.0,
            fetched_at: now_iso(),
        }
    }).collect()
}

// ─── Dev.to (public API — no auth) ───────────────────────────────────────────

pub async fn fetch_devto(client: &Client) -> Vec<FeedItem> {
    let tags = ["ai", "rust", "systems", "devops", "productivity", "webdev", "indiehacker"];
    let mut all: Vec<FeedItem> = Vec::new();

    for tag in tags {
        let url = format!("https://dev.to/api/articles?per_page=5&tag={}&top=1", tag);
        let Ok(resp) = client.get(&url).send().await else { continue };
        let Ok(articles) = resp.json::<serde_json::Value>().await else { continue };
        let items = articles.as_array().unwrap_or(&vec![]).iter().map(|a| {
            let title = a["title"].as_str().unwrap_or("Untitled").to_string();
            let article_url = a["url"].as_str().unwrap_or("https://dev.to").to_string();
            let desc = a["description"].as_str().map(|s| s.to_string());
            let reactions = a["positive_reactions_count"].as_i64().unwrap_or(0);
            let id_val = a["id"].as_i64().unwrap_or(0);
            FeedItem {
                id: format!("devto_{}_{}", tag, id_val),
                source: "devto".into(),
                title,
                url: article_url,
                summary: desc,
                score: reactions,
                relevance_score: 0.0,
                fetched_at: now_iso(),
            }
        }).collect::<Vec<_>>();
        all.extend(items);
    }
    all
}
