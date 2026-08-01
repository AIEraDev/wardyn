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
    let pattern = format!("<{}", tag);
    let mut search_from = 0;

    while let Some(start_idx) = text[search_from..].find(&pattern) {
        let abs_start = search_from + start_idx;
        let rest = &text[abs_start..];

        // Ensure next char is space or '>' to avoid matching partial tag names (e.g. <title vs <title_ext)
        let next_char = rest.chars().nth(pattern.len());
        if next_char == Some(' ') || next_char == Some('>') || next_char == Some('\t') || next_char == Some('\n') {
            if let Some(tag_close_rel) = rest.find('>') {
                let content_start = abs_start + tag_close_rel + 1;
                let close_tag = format!("</{}>", tag);

                if let Some(end_rel) = text[content_start..].find(&close_tag) {
                    let raw_content = text[content_start..content_start + end_rel].trim();

                    // Unwrap CDATA if present
                    let clean = if raw_content.starts_with("<![CDATA[") {
                        if let Some(cdata_end) = raw_content.find("]]>") {
                            &raw_content[9..cdata_end]
                        } else {
                            raw_content
                        }
                    } else {
                        raw_content
                    };

                    return Some(clean.trim().to_string());
                }
            }
        }
        search_from = abs_start + pattern.len();
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
