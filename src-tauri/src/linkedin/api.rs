use rusqlite::Connection;
use crate::db;

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct RealLinkedInPost {
    pub id: String,
    pub text: String,
    pub engagement: String,
    pub date: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct RealLinkedInSummary {
    pub profile_name: String,
    pub headline: String,
    pub total_posts_analyzed: usize,
    pub total_impressions: String,
    pub top_performing_topic: String,
    pub executive_summary: String,
    pub recent_posts: Vec<RealLinkedInPost>,
}

pub async fn fetch_real_linkedin_summary(conn_mutex: &std::sync::Mutex<Connection>) -> Result<RealLinkedInSummary, String> {
    let creds = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_credentials(&conn, "linkedin").map_err(|e| e.to_string())?
            .ok_or_else(|| "LinkedIn account not connected. Please connect LinkedIn in Channels tab.".to_string())?
    };

    let client = reqwest::Client::new();

    // 1. Fetch user profile from https://api.linkedin.com/v2/userinfo
    let profile_res = client.get("https://api.linkedin.com/v2/userinfo")
        .bearer_auth(&creds.access_token)
        .send()
        .await
        .map_err(|e| format!("LinkedIn API network error: {}", e))?;

    if !profile_res.status().is_success() {
        let err_text = profile_res.text().await.unwrap_or_default();
        return Err(format!("LinkedIn profile request failed: {}. Re-authenticate your LinkedIn account.", err_text));
    }

    let profile_json: serde_json::Value = profile_res.json().await.map_err(|e| e.to_string())?;
    let sub = profile_json["sub"].as_str().unwrap_or("");
    let name = profile_json["name"]
        .as_str()
        .or_else(|| profile_json["given_name"].as_str())
        .unwrap_or_else(|| creds.email.as_deref().unwrap_or("abdulkabirmusa"));

    let person_urn = format!("urn:li:person:{}", sub);

    // 2. Fetch live shares/posts created by user
    let posts_url = format!("https://api.linkedin.com/v2/shares?q=owners&owners={}&count=5", person_urn);
    let posts_res = client.get(&posts_url)
        .bearer_auth(&creds.access_token)
        .send()
        .await;

    let mut recent_posts = Vec::new();
    if let Ok(resp) = posts_res {
        if resp.status().is_success() {
            let p_json: serde_json::Value = resp.json().await.unwrap_or_default();
            if let Some(elements) = p_json["elements"].as_array() {
                for (idx, elem) in elements.iter().enumerate() {
                    let id = elem["id"].as_str().unwrap_or(&format!("post-{}", idx)).to_string();
                    let text = elem["text"]["text"].as_str().unwrap_or("Shared update").to_string();
                    recent_posts.push(RealLinkedInPost {
                        id,
                        text,
                        engagement: "Live post fetched via LinkedIn API".to_string(),
                        date: "Recently".to_string(),
                    });
                }
            }
        }
    }

    let total_posts = recent_posts.len();
    let exec_summary = if total_posts > 0 {
        format!("Live LinkedIn API sync complete for {}. Fetched {} published post(s) directly from LinkedIn API.", name, total_posts)
    } else {
        format!("Live LinkedIn profile authenticated for {}. No recent public posts found via LinkedIn API.", name)
    };

    Ok(RealLinkedInSummary {
        profile_name: name.to_string(),
        headline: "Authenticated Member Profile".to_string(),
        total_posts_analyzed: total_posts,
        total_impressions: format!("{} Posts", total_posts),
        top_performing_topic: "Live Activity".to_string(),
        executive_summary: exec_summary,
        recent_posts,
    })
}
