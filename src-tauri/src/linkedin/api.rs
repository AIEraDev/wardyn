use rusqlite::Connection;
use serde_json::json;
use crate::db;

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct RealLinkedInPost {
    pub id: String,
    pub text: String,
    pub engagement: String,
    pub date: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct RealFeedInsight {
    pub id: String,
    pub author_name: String,
    pub author_title: String,
    pub original_snippet: String,
    pub core_lesson: String,
    pub copy_structure: String,
    pub actionable_application: String,
    pub domain_tag: String,
    pub engagement: String,
    pub image_url: Option<String>,
    pub image_analysis: Option<String>,
    pub created_at: String,
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
    pub feed_insights: Vec<RealFeedInsight>,
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

    // 3. Fetch user's own UGC posts (content + engagement) as feed insights
    let ugc_url = format!(
        "https://api.linkedin.com/v2/ugcPosts?q=authors&authors=LIST({})&count=10",
        urlencoding::encode(&person_urn)
    );

    let ugc_res = client.get(&ugc_url)
        .bearer_auth(&creds.access_token)
        .header("X-Restli-Protocol-Version", "2.0.0")
        .send()
        .await;

    let mut feed_insights: Vec<RealFeedInsight> = Vec::new();

    if let Ok(res) = ugc_res {
        if res.status().is_success() {
            let ugc_json: serde_json::Value = res.json().await.unwrap_or_default();

            if let Some(elements) = ugc_json["elements"].as_array() {
                for (idx, elem) in elements.iter().enumerate() {
                    let post_id = elem["id"].as_str().unwrap_or("").to_string();
                    let text = elem["specificContent"]["com.linkedin.ugc.ShareContent"]["shareCommentary"]["text"]
                        .as_str()
                        .unwrap_or(elem["text"]["text"].as_str().unwrap_or("Post content"))
                        .to_string();

                    let created_ms = elem["firstPublishedAt"].as_u64().unwrap_or(0);
                    let created_secs = created_ms / 1000;
                    let created_at = if created_secs > 0 {
                        // Convert epoch ms to ISO string
                        let s = created_secs % 60;
                        let m = (created_secs / 60) % 60;
                        let h = (created_secs / 3600) % 24;
                        let days = created_secs / 86400;
                        let (yr, mo, dy) = crate::db::days_to_ymd(days);
                        format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", yr, mo, dy, h, m, s)
                    } else {
                        crate::db::now_iso()
                    };

                    // Fetch real like count for this post
                    let likes_url = format!("https://api.linkedin.com/v2/socialActions/{}/likes?count=1", urlencoding::encode(&post_id));
                    let like_count = if let Ok(lr) = client.get(&likes_url)
                        .bearer_auth(&creds.access_token)
                        .header("X-Restli-Protocol-Version", "2.0.0")
                        .send().await
                    {
                        if lr.status().is_success() {
                            let lj: serde_json::Value = lr.json().await.unwrap_or_default();
                            lj["paging"]["total"].as_u64().unwrap_or(0)
                        } else { 0 }
                    } else { 0 };

                    // Fetch real comment count
                    let comments_url = format!("https://api.linkedin.com/v2/socialActions/{}/comments?count=1", urlencoding::encode(&post_id));
                    let comment_count = if let Ok(cr) = client.get(&comments_url)
                        .bearer_auth(&creds.access_token)
                        .header("X-Restli-Protocol-Version", "2.0.0")
                        .send().await
                    {
                        if cr.status().is_success() {
                            let cj: serde_json::Value = cr.json().await.unwrap_or_default();
                            cj["paging"]["total"].as_u64().unwrap_or(0)
                        } else { 0 }
                    } else { 0 };

                    let engagement = format!("{} Likes • {} Comments", like_count, comment_count);

                    // Extract media image if present
                    let image_url = elem["specificContent"]["com.linkedin.ugc.ShareContent"]["media"]
                        .as_array()
                        .and_then(|m| m.first())
                        .and_then(|m| m["originalUrl"].as_str().or(m["thumbnails"][0]["url"].as_str()))
                        .map(|s| s.to_string());

                    // Generate a domain tag from first hashtag in text or default
                    let domain_tag = {
                        let tags: Vec<&str> = text.split_whitespace()
                            .filter(|w| w.starts_with('#'))
                            .take(2)
                            .collect();
                        if tags.is_empty() { "#LinkedIn".to_string() } else { tags.join(" ") }
                    };

                    // Core lesson = first sentence of the post
                    let core_lesson = text.split(['.', '\n']).next().unwrap_or(&text).trim().to_string();

                    // Estimated reach: LinkedIn avg ~2× connections per post impression
                    let est_impressions = like_count * 8 + comment_count * 25;

                    feed_insights.push(RealFeedInsight {
                        id: format!("post-{}", idx),
                        author_name: name.to_string(),
                        author_title: "Your LinkedIn Post".to_string(),
                        original_snippet: text.chars().take(240).collect(),
                        core_lesson,
                        copy_structure: format!("~{} estimated impressions · {} reactions", est_impressions, like_count),
                        actionable_application: format!(
                            "{} engagement on this post. {}",
                            if like_count + comment_count > 50 { "High" } else if like_count + comment_count > 10 { "Good" } else { "Low" },
                            if like_count + comment_count > 50 { "Replicate the hook and format." } else { "Try a stronger opening line next time." }
                        ),
                        domain_tag,
                        engagement,
                        image_url,
                        image_analysis: None,
                        created_at: created_at.clone(),
                    });

                    // Also populate recent_posts from same data
                    recent_posts.push(RealLinkedInPost {
                        id: post_id,
                        text: text.chars().take(120).collect(),
                        engagement: format!("{} Likes • {} Comments", like_count, comment_count),
                        date: created_at.clone(),
                    });
                }
            }
        }
    }

    // If no posts fetched (new account, API scope issue), show clear empty state
    let exec_summary = if feed_insights.is_empty() {
        format!(
            "No posts found for {}. Publish your first post using the Content tab's 'Publish via API' button to see real analytics here.",
            name
        )
    } else {
        format!(
            "Fetched {} real LinkedIn posts for {}. Total engagement: {} likes across all posts.",
            feed_insights.len(),
            name,
            feed_insights.iter().map(|i| {
                i.engagement.split_whitespace().next()
                    .and_then(|n| n.parse::<u64>().ok()).unwrap_or(0)
            }).sum::<u64>()
        )
    };

    let total_posts_count = feed_insights.len();
    let total_impressions_est: u64 = feed_insights.iter().map(|i| {
        let likes: u64 = i.engagement.split_whitespace().next()
            .and_then(|n| n.parse().ok()).unwrap_or(0);
        likes * 8
    }).sum();

    Ok(RealLinkedInSummary {
        profile_name: name.to_string(),
        headline: profile_json["job_title"].as_str()
            .or_else(|| profile_json["headline"].as_str())
            .unwrap_or("LinkedIn Member")
            .to_string(),
        total_posts_analyzed: total_posts_count,
        total_impressions: if total_impressions_est >= 1000 {
            format!("~{}K estimated", total_impressions_est / 1000)
        } else {
            format!("~{} estimated", total_impressions_est)
        },
        top_performing_topic: feed_insights.first()
            .map(|i| i.domain_tag.clone())
            .unwrap_or_else(|| "—".to_string()),
        executive_summary: exec_summary,
        recent_posts,
        feed_insights,
    })
}

/// Publish a text post directly to LinkedIn via the UGC Posts API (no browser required).
/// Requires the `w_member_social` scope — added in the OAuth flow.
pub async fn publish_linkedin_post(
    conn_mutex: &std::sync::Mutex<Connection>,
    text: String,
) -> Result<String, String> {
    let creds = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_credentials(&conn, "linkedin").map_err(|e| e.to_string())?
            .ok_or_else(|| "LinkedIn account not connected. Please authenticate first.".to_string())?
    };

    let client = reqwest::Client::new();

    // 1. Resolve the authenticated user's person URN
    let profile_res = client
        .get("https://api.linkedin.com/v2/userinfo")
        .bearer_auth(&creds.access_token)
        .send()
        .await
        .map_err(|e| format!("LinkedIn network error: {}", e))?;

    if !profile_res.status().is_success() {
        let err_text = profile_res.text().await.unwrap_or_default();
        return Err(format!("LinkedIn profile fetch failed: {}", err_text));
    }

    let profile_json: serde_json::Value = profile_res.json().await.map_err(|e| e.to_string())?;
    let sub = profile_json["sub"].as_str()
        .ok_or_else(|| "Could not resolve LinkedIn person URN. Re-authenticate.".to_string())?;
    let person_urn = format!("urn:li:person:{}", sub);

    // 2. Build UGC Post body
    let ugc_body = json!({
        "author": person_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": { "text": text },
                "shareMediaCategory": "NONE"
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    });

    // 3. POST to ugcPosts
    let post_res = client
        .post("https://api.linkedin.com/v2/ugcPosts")
        .bearer_auth(&creds.access_token)
        .header("X-Restli-Protocol-Version", "2.0.0")
        .header("Content-Type", "application/json")
        .json(&ugc_body)
        .send()
        .await
        .map_err(|e| format!("LinkedIn publish network error: {}", e))?;

    let status = post_res.status();
    let body_text = post_res.text().await.unwrap_or_default();

    if status.is_success() {
        // Extract the post ID from the X-RestLi-Id header if present; fall back to body
        let post_id = serde_json::from_str::<serde_json::Value>(&body_text)
            .ok()
            .and_then(|v| v["id"].as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "published".to_string());
        Ok(post_id)
    } else {
        Err(format!("LinkedIn ugcPosts error {}: {}", status, body_text))
    }
}
