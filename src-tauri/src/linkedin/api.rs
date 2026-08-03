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

pub async fn fetch_real_linkedin_summary(
    conn_mutex: &std::sync::Mutex<Connection>,
) -> Result<RealLinkedInSummary, String> {
    let creds = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_credentials(&conn, "linkedin")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| {
                "LinkedIn account not connected. Please connect LinkedIn in Channels tab."
                    .to_string()
            })?
    };

    let client = reqwest::Client::new();

    // ── 1. Fetch user profile ─────────────────────────────────────────────────
    let profile_res = client
        .get("https://api.linkedin.com/v2/userinfo")
        .bearer_auth(&creds.access_token)
        .send()
        .await
        .map_err(|e| format!("LinkedIn API network error: {}", e))?;

    if !profile_res.status().is_success() {
        let err_text = profile_res.text().await.unwrap_or_default();
        return Err(format!(
            "LinkedIn profile request failed: {}. Re-authenticate your LinkedIn account.",
            err_text
        ));
    }

    let profile_json: serde_json::Value =
        profile_res.json().await.map_err(|e| e.to_string())?;
    let sub = profile_json["sub"].as_str().unwrap_or("");
    let name = profile_json["name"]
        .as_str()
        .or_else(|| profile_json["given_name"].as_str())
        .unwrap_or_else(|| creds.email.as_deref().unwrap_or("LinkedIn User"));
    let person_urn = format!("urn:li:person:{}", sub);

    // ── 2. Fetch YOUR OWN recent posts to extract hashtag interests ───────────
    // This is used to personalise the trending feed query.
    let ugc_url = format!(
        "https://api.linkedin.com/v2/ugcPosts?q=authors&authors=LIST({})&count=5",
        urlencoding::encode(&person_urn)
    );
    let own_posts_res = client
        .get(&ugc_url)
        .bearer_auth(&creds.access_token)
        .header("X-Restli-Protocol-Version", "2.0.0")
        .send()
        .await;

    let mut own_posts: Vec<RealLinkedInPost> = Vec::new();
    let mut your_hashtags: Vec<String> = Vec::new();

    if let Ok(res) = own_posts_res {
        if res.status().is_success() {
            let json: serde_json::Value = res.json().await.unwrap_or_default();
            if let Some(elements) = json["elements"].as_array() {
                for (idx, elem) in elements.iter().take(5).enumerate() {
                    let post_id = elem["id"].as_str().unwrap_or("").to_string();
                    let text = elem["specificContent"]
                        ["com.linkedin.ugc.ShareContent"]["shareCommentary"]["text"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();

                    // Extract hashtags for feed personalisation
                    for word in text.split_whitespace() {
                        if word.starts_with('#') && word.len() > 1 {
                            let tag = word.trim_matches(|c: char| !c.is_alphanumeric()).to_string();
                            if !tag.is_empty() && !your_hashtags.contains(&tag) {
                                your_hashtags.push(tag);
                            }
                        }
                    }

                    let created_ms = elem["firstPublishedAt"].as_u64().unwrap_or(0);
                    let created_at = ms_to_iso(created_ms);

                    own_posts.push(RealLinkedInPost {
                        id: post_id,
                        text: text.chars().take(140).collect(),
                        engagement: "Your post".to_string(),
                        date: created_at,
                    });

                    let _ = idx; // suppress unused warning
                }
            }
        }
    }

    // ── 3. Fetch trending posts by hashtags you care about ────────────────────
    // LinkedIn's /v2/shares?q=trending&trendingHashtag=<tag> returns posts
    // currently trending for that hashtag — this is the closest public API
    // equivalent to "feed from your network's interests."
    //
    // NOTE: LinkedIn's home feed (network updates from connections) is NOT
    // available via the public API since 2018. Trending hashtag content is
    // the best available substitute for discovering relevant posts.
    let feed_hashtags = if your_hashtags.is_empty() {
        // Fallback to broad professional tags if user hasn't posted with hashtags
        vec!["AI", "Tech", "Product", "Leadership", "BuildInPublic"]
            .into_iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>()
    } else {
        your_hashtags.iter().take(3).cloned().collect()
    };

    let mut feed_insights: Vec<RealFeedInsight> = Vec::new();

    for hashtag in &feed_hashtags {
        if feed_insights.len() >= 10 {
            break;
        }
        let trending_url = format!(
            "https://api.linkedin.com/v2/shares?q=trending&trendingHashtag={}&count=3",
            urlencoding::encode(hashtag)
        );
        let trend_res = client
            .get(&trending_url)
            .bearer_auth(&creds.access_token)
            .header("X-Restli-Protocol-Version", "2.0.0")
            .send()
            .await;

        if let Ok(res) = trend_res {
            if res.status().is_success() {
                let t_json: serde_json::Value = res.json().await.unwrap_or_default();
                if let Some(elements) = t_json["elements"].as_array() {
                    for (idx, elem) in elements.iter().take(3).enumerate() {
                        let text = elem["text"]["text"]
                            .as_str()
                            .or_else(|| {
                                elem["specificContent"]["com.linkedin.ugc.ShareContent"]
                                    ["shareCommentary"]["text"]
                                    .as_str()
                            })
                            .unwrap_or("")
                            .to_string();

                        if text.trim().is_empty() {
                            continue;
                        }

                        // Author info from the activity owner
                        let author_urn = elem["owner"]
                            .as_str()
                            .or_else(|| elem["author"].as_str())
                            .unwrap_or("urn:li:person:unknown");

                        // Try to get author name from activity; fall back to URN short form
                        let author_name = {
                            let urn_short = author_urn
                                .split(':')
                                .last()
                                .unwrap_or("LinkedIn Member");
                            // If it looks like a person ID, display a generic label
                            if urn_short.len() > 15 {
                                "LinkedIn Member".to_string()
                            } else {
                                urn_short.to_string()
                            }
                        };

                        let like_count = elem["totalShareStatistics"]["likeCount"]
                            .as_u64()
                            .unwrap_or(0);
                        let comment_count = elem["totalShareStatistics"]["commentCount"]
                            .as_u64()
                            .unwrap_or(0);
                        let share_count = elem["totalShareStatistics"]["shareCount"]
                            .as_u64()
                            .unwrap_or(0);

                        let engagement = if like_count + comment_count + share_count > 0 {
                            format!(
                                "❤️ {} · 💬 {} · 🔁 {}",
                                like_count, comment_count, share_count
                            )
                        } else {
                            "Trending".to_string()
                        };

                        let created_ms = elem["created"]["time"].as_u64().unwrap_or(0);
                        let created_at = ms_to_iso(created_ms);

                        // First sentence as the core lesson
                        let core_lesson = text
                            .split(['.', '\n'])
                            .next()
                            .unwrap_or(&text)
                            .trim()
                            .chars()
                            .take(120)
                            .collect::<String>();

                        // Actionable prompt for creating a post inspired by this
                        let actionable = format!(
                            "This #{} post is trending. Remix the angle or respond with your take.",
                            hashtag
                        );

                        feed_insights.push(RealFeedInsight {
                            id: format!("trend-{}-{}", hashtag, idx),
                            author_name,
                            author_title: format!("Trending on #{}", hashtag),
                            original_snippet: text.chars().take(280).collect(),
                            core_lesson,
                            copy_structure: engagement.clone(),
                            actionable_application: actionable,
                            domain_tag: format!("#{}", hashtag),
                            engagement,
                            image_url: None,
                            image_analysis: None,
                            created_at,
                        });
                    }
                }
            }
        }
    }

    // ── 4. Build executive summary ────────────────────────────────────────────
    let exec_summary = if feed_insights.is_empty() {
        format!(
            "Feed sync complete for {}. No trending posts found for your interest hashtags yet — try posting with more specific hashtags to personalise your feed.",
            name
        )
    } else {
        format!(
            "{} trending posts fetched from your interest areas ({}{}). Use 'Create Post' to remix any insight into a new LinkedIn post.",
            feed_insights.len(),
            feed_hashtags.iter().take(3).map(|h| format!("#{}", h)).collect::<Vec<_>>().join(", "),
            if feed_hashtags.len() > 3 { "…" } else { "" },
        )
    };

    let top_topic = feed_insights
        .iter()
        .max_by_key(|i| {
            let l: u64 = i.engagement.split('·').next()
                .and_then(|s| s.chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse().ok())
                .unwrap_or(0);
            l
        })
        .map(|i| i.domain_tag.clone())
        .unwrap_or_else(|| feed_hashtags.first().map(|h| format!("#{}", h)).unwrap_or_default());

    Ok(RealLinkedInSummary {
        profile_name: name.to_string(),
        headline: profile_json["job_title"]
            .as_str()
            .or_else(|| profile_json["headline"].as_str())
            .unwrap_or("LinkedIn Member")
            .to_string(),
        total_posts_analyzed: feed_insights.len(),
        total_impressions: format!("{} trending posts", feed_insights.len()),
        top_performing_topic: top_topic,
        executive_summary: exec_summary,
        recent_posts: own_posts,  // Your own recent posts
        feed_insights,             // Trending content from your interest hashtags
    })
}

/// Convert LinkedIn millisecond timestamp to ISO-8601.
fn ms_to_iso(ms: u64) -> String {
    if ms == 0 {
        return crate::db::now_iso();
    }
    let secs = ms / 1000;
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    let (yr, mo, dy) = crate::db::days_to_ymd(days);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", yr, mo, dy, h, m, s)
}

/// Publish a text post directly to LinkedIn via the UGC Posts API.
pub async fn publish_linkedin_post(
    conn_mutex: &std::sync::Mutex<Connection>,
    text: String,
) -> Result<String, String> {
    let creds = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_credentials(&conn, "linkedin")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| {
                "LinkedIn account not connected. Please authenticate first.".to_string()
            })?
    };

    let client = reqwest::Client::new();

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

    let profile_json: serde_json::Value =
        profile_res.json().await.map_err(|e| e.to_string())?;
    let sub = profile_json["sub"]
        .as_str()
        .ok_or_else(|| "Could not resolve LinkedIn person URN. Re-authenticate.".to_string())?;
    let person_urn = format!("urn:li:person:{}", sub);

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
        let post_id = serde_json::from_str::<serde_json::Value>(&body_text)
            .ok()
            .and_then(|v| v["id"].as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "published".to_string());
        Ok(post_id)
    } else {
        Err(format!(
            "LinkedIn ugcPosts error {}: {}",
            status, body_text
        ))
    }
}
