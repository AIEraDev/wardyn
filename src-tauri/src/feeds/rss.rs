use reqwest::Client;
use crate::db::{FeedItem, now_iso};

pub async fn fetch_custom_rss(client: &Client, feed_title: &str, feed_url: &str) -> Vec<FeedItem> {
    let Ok(resp) = client.get(feed_url).send().await else { return Vec::new() };
    let Ok(xml_text) = resp.text().await else { return Vec::new() };

    let mut items = Vec::new();

    // Check RSS format (<item>) vs Atom format (<entry>)
    if xml_text.contains("<item>") {
        for item_block in xml_text.split("<item>").skip(1) {
            let title = extract_tag(item_block, "title").unwrap_or_else(|| "Untitled Feed Item".into());
            let link = extract_tag(item_block, "link").unwrap_or_else(|| feed_url.to_string());
            let desc = extract_tag(item_block, "description")
                .or_else(|| extract_tag(item_block, "content:encoded"))
                .map(|d| strip_html_tags(&d).chars().take(200).collect());

            let id = format!("rss_{}_{}", sanitize_id(feed_title), sanitize_id(&link));
            items.push(FeedItem {
                id,
                source: feed_title.to_lowercase(),
                title: clean_xml_entities(&title),
                url: link.trim().to_string(),
                summary: desc,
                score: 80,
                relevance_score: 0.0,
                fetched_at: now_iso(),
            });
        }
    } else if xml_text.contains("<entry>") {
        for entry_block in xml_text.split("<entry>").skip(1) {
            let title = extract_tag(entry_block, "title").unwrap_or_else(|| "Untitled Entry".into());
            let link = extract_atom_link(entry_block).unwrap_or_else(|| feed_url.to_string());
            let summary = extract_tag(entry_block, "summary")
                .or_else(|| extract_tag(entry_block, "content"))
                .map(|s| strip_html_tags(&s).chars().take(200).collect());

            let id = format!("atom_{}_{}", sanitize_id(feed_title), sanitize_id(&link));
            items.push(FeedItem {
                id,
                source: feed_title.to_lowercase(),
                title: clean_xml_entities(&title),
                url: link.trim().to_string(),
                summary,
                score: 80,
                relevance_score: 0.0,
                fetched_at: now_iso(),
            });
        }
    }

    items.into_iter().take(10).collect()
}

fn extract_tag(text: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    if let Some(start_idx) = text.find(&open) {
        let content_start = start_idx + open.len();
        if let Some(end_idx) = text[content_start..].find(&close) {
            return Some(text[content_start..content_start + end_idx].trim().to_string());
        }
    }
    // Also try CDATA wrapper
    let cdata_open = format!("<{}><![CDATA[", tag);
    if let Some(start_idx) = text.find(&cdata_open) {
        let content_start = start_idx + cdata_open.len();
        if let Some(end_idx) = text[content_start..].find("]]>") {
            return Some(text[content_start..content_start + end_idx].trim().to_string());
        }
    }
    None
}

fn extract_atom_link(text: &str) -> Option<String> {
    if let Some(idx) = text.find("href=\"") {
        let start = idx + 6;
        if let Some(end) = text[start..].find('"') {
            return Some(text[start..start + end].to_string());
        }
    }
    extract_tag(text, "id")
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut inside = false;
    for c in html.chars() {
        if c == '<' {
            inside = true;
        } else if c == '>' {
            inside = false;
        } else if !inside {
            result.push(c);
        }
    }
    result.replace('\n', " ").replace("&nbsp;", " ").trim().to_string()
}

fn clean_xml_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .trim()
        .to_string()
}

fn sanitize_id(text: &str) -> String {
    text.chars().filter(|c| c.is_alphanumeric()).take(15).collect()
}
