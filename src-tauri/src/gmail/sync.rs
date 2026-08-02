use rusqlite::Connection;
use crate::db::{self, GmailCredentials};
use crate::models::QueueItem;
use crate::ollama;
use crate::productivity;

// No compile-time credentials — users supply their own via Settings → OAuth Credentials.

pub async fn sync_gmail_messages(conn_mutex: &std::sync::Mutex<Connection>) -> Result<usize, String> {
    let all_creds = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_all_gmail_credentials(&conn).map_err(|e| e.to_string())?
    };

    if all_creds.is_empty() {
        return Err("No Gmail accounts connected. Please authenticate first.".into());
    }

    let client = reqwest::Client::new();
    let categories: Vec<(&str, &str)> = vec![
        ("INBOX -category:promotions -category:social -category:updates -category:forums", "primary"),
        ("category:updates", "updates"),
        ("category:promotions", "promotions"),
        ("category:social", "social"),
        ("category:forums", "forums"),
    ];

    let mut imported_count = 0;
    let total_accounts = all_creds.len();

    // Collect all new items first (fast Gmail API calls), classify in parallel after
    let mut new_items: Vec<QueueItem> = Vec::new();

    for creds in &all_creds {
        let account_email = creds.email.as_deref().unwrap_or("account");
        let access_token = match get_valid_access_token(&client, creds, conn_mutex).await {
            Ok(tok) => tok,
            Err(e) => {
                eprintln!("[Gmail Sync] Token refresh error for {}: {}", account_email, e);
                continue;
            }
        };

        for (query, category_label) in &categories {
            let list_url = format!(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q={}",
                urlencoding::encode(query)
            );

            let list_res = client.get(&list_url)
                .bearer_auth(&access_token)
                .send()
                .await;

            let list_res = match list_res {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[Gmail Sync] Network error for account {} category {}: {}", account_email, category_label, e);
                    continue;
                }
            };

            if list_res.status().as_u16() == 401 {
                let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                db::delete_gmail_credentials(&conn, creds.email.as_deref()).ok();
                eprintln!("[Gmail Sync] Session revoked for {}", account_email);
                continue;
            }

            if !list_res.status().is_success() {
                eprintln!("[Gmail Sync] Account {} category {} returned status: {}", account_email, category_label, list_res.status());
                continue;
            }

            let list_json: serde_json::Value = list_res.json().await.map_err(|e| e.to_string())?;
            let messages = match list_json["messages"].as_array() {
                Some(m) if !m.is_empty() => m.clone(),
                _ => continue,
            };

            for msg_summary in &messages {
                let msg_id = match msg_summary["id"].as_str() {
                    Some(id) => id,
                    None => continue,
                };

                // Skip if already in DB (deduplication)
                let item_id = format!("gmail_{}_{}", account_email.replace('@', "_at_"), msg_id);
                {
                    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                    if db::get_queue_item_by_id(&conn, &item_id).ok().flatten().is_some() {
                        continue;
                    }
                }

                let detail_url = format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{}", msg_id);
                let detail_res = client.get(&detail_url)
                    .bearer_auth(&access_token)
                    .send()
                    .await;

                if let Ok(res) = detail_res {
                    if res.status().is_success() {
                        let msg_json: serde_json::Value = res.json().await.unwrap_or_default();
                        let thread_id = msg_json["threadId"].as_str().map(|s| s.to_string());
                        let snippet = msg_json["snippet"].as_str().unwrap_or("No snippet available").to_string();

                        let headers = msg_json["payload"]["headers"].as_array();
                        let mut sender = "Unknown Sender".to_string();
                        let mut subject = "".to_string();
                        let mut message_id: Option<String> = None;

                        if let Some(h_list) = headers {
                            for h in h_list {
                                let name = h["name"].as_str().unwrap_or("");
                                if name.eq_ignore_ascii_case("From") {
                                    sender = h["value"].as_str().unwrap_or("Unknown Sender").to_string();
                                } else if name.eq_ignore_ascii_case("Subject") {
                                    subject = h["value"].as_str().unwrap_or("").to_string();
                                } else if name.eq_ignore_ascii_case("Message-ID") || name.eq_ignore_ascii_case("Message-Id") {
                                    message_id = h["value"].as_str().map(|s| s.to_string());
                                }
                            }
                        }

                        let account_tag = if total_accounts > 1 {
                            format!("<{}> ", account_email)
                        } else {
                            "".to_string()
                        };

                        let preview = if !subject.is_empty() {
                            format!("[{}] {}{}: {}", category_label.to_uppercase(), account_tag, subject, snippet)
                        } else {
                            format!("[{}] {}{}", category_label.to_uppercase(), account_tag, snippet)
                        };

                        let now = crate::db::now_iso();
                        // Fast rule-based classify first — AI classification runs in parallel below
                        let fast_result = ollama::client::rule_based_classify_only(
                            &sender, &preview
                        );

                        let item = QueueItem {
                            id: item_id,
                            source: "gmail".into(),
                            kind: "reply".into(),
                            sender,
                            preview,
                            draft_text: None, // draft generated by parallel AI pass below
                            status: "pending".into(),
                            flagged: fast_result.flagged,
                            confidence: fast_result.confidence,
                            created_at: now.clone(),
                            updated_at: now,
                            thread_id,
                            message_id,
                            urgency: fast_result.urgency,
                        };
                        new_items.push(item);
                    }
                }
            }
        }
    }

    // Persist all new items quickly (no AI blocking the write)
    {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        for item in &new_items {
            if db::insert_queue_item(&conn, item).is_ok() {
                imported_count += 1;
                // Extract tasks synchronously (fast, no AI)
                if !db::task_exists_for_source(&conn, &item.id).unwrap_or(false) {
                    for extracted in productivity::extract::extract_tasks_from_email(item) {
                        let task_id = {
                            let ns = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default().as_nanos();
                            format!("task_{:x}", ns)
                        };
                        let task = db::Task {
                            id: task_id,
                            title: extracted.title,
                            description: Some(format!("Auto-extracted from email by {}", item.sender)),
                            source_item_id: Some(item.id.clone()),
                            due_date: extracted.due_date,
                            priority: extracted.priority,
                            status: "pending".into(),
                            created_at: db::now_iso(),
                            completed_at: None,
                        };
                        db::create_task(&conn, &task).ok();
                    }
                }
            }
        }
    }

    // Parallel AI classification — up to 4 concurrent Ollama calls
    // This runs AFTER the items are persisted so the UI shows them immediately
    if !new_items.is_empty() {
        use futures_util::stream::{self, StreamExt};
        let conn_ref = conn_mutex;
        stream::iter(new_items)
            .map(|item| async move {
                let outcome = ollama::client::classify_and_draft_item(&item, Some(conn_ref)).await;
                (item.id, outcome)
            })
            .buffer_unordered(4) // max 4 concurrent Ollama classifications
            .for_each(|(item_id, outcome)| async move {
                let result = outcome.result;
                if let Ok(conn) = conn_ref.lock() {
                    let now = db::now_iso();
                    conn.execute(
                        "UPDATE queue_items SET flagged=?1, draft_text=?2, confidence=?3, urgency=?4, updated_at=?5 WHERE id=?6",
                        rusqlite::params![
                            if result.flagged { 1 } else { 0 },
                            result.draft_text,
                            result.confidence,
                            result.urgency.as_deref().unwrap_or("high"),
                            now,
                            item_id
                        ],
                    ).ok();
                    db::set_draft_generation_time_ms(&conn, &item_id, outcome.generation_time_ms).ok();
                }
            })
            .await;
    }
    Ok(imported_count)
}



async fn get_valid_access_token(
    client: &reqwest::Client,
    creds: &GmailCredentials,
    conn_mutex: &std::sync::Mutex<Connection>,
) -> Result<String, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    if creds.expires_at > now + 60 {
        return Ok(creds.access_token.clone());
    }

    if creds.refresh_token.is_empty() {
        return Ok(creds.access_token.clone());
    }

    let (client_id, client_secret) = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        let id = crate::db::get_app_setting(&conn, "oauth_google_client_id")
            .ok().flatten().filter(|v| !v.is_empty())
            .unwrap_or_else(|| std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default());
        let secret = crate::db::get_app_setting(&conn, "oauth_google_client_secret")
            .ok().flatten().filter(|v| !v.is_empty())
            .unwrap_or_else(|| std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default());
        (id, secret)
    };

    // PKCE flow — client_secret still required for Google Desktop app token refresh
    let mut params = vec![
        ("client_id",     client_id.as_str()),
        ("refresh_token", creds.refresh_token.as_str()),
        ("grant_type",    "refresh_token"),
    ];
    if !client_secret.is_empty() {
        params.push(("client_secret", client_secret.as_str()));
    }

    let res = client.post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Refresh token error: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        // Parse Google's error field if present
        let google_error = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v["error"].as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| status.to_string());

        // Delete only the specific account that failed, using its exact service key
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::delete_gmail_credentials(&conn, creds.email.as_deref()).ok();
        return Err(format!(
            "Gmail session expired and refresh failed ({}). Please reconnect Gmail.",
            google_error
        ));
    }

    let token_json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let new_access_token = token_json["access_token"].as_str().ok_or("Missing refreshed access_token")?.to_string();
    let expires_in = token_json["expires_in"].as_i64().unwrap_or(3600);
    let new_expires_at = now + expires_in;

    let updated_creds = GmailCredentials {
        service: creds.service.clone(), // preserve the original service key (e.g. "gmail:email@...")
        access_token: new_access_token.clone(),
        refresh_token: creds.refresh_token.clone(),
        expires_at: new_expires_at,
        email: creds.email.clone(),
    };

    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::save_credentials(&conn, &updated_creds).ok();

    Ok(new_access_token)
}
