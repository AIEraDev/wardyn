use reqwest::Client;
use crate::db::{self, FeedItem};
use super::sources;

pub async fn run_feed_ingestion(conn_mutex: &std::sync::Mutex<rusqlite::Connection>) -> Result<usize, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // Fetch all sources concurrently
    let (hn, arxiv, github, devto) = tokio::join!(
        sources::fetch_hackernews(&client),
        sources::fetch_arxiv(&client),
        sources::fetch_github_trending(&client),
        sources::fetch_devto(&client),
    );

    let mut all_items: Vec<FeedItem> = Vec::new();
    all_items.extend(hn);
    all_items.extend(arxiv);
    all_items.extend(github);
    all_items.extend(devto);

    let total = all_items.len();

    // Persist to SQLite (deduplicated by id)
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        for item in &all_items {
            db::upsert_feed_item(&conn, item).ok();
        }
    }

    Ok(total)
}
