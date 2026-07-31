use rusqlite::Connection;
use crate::db::{self, GmailCredentials};
use crate::models::QueueItem;
use crate::ollama;

pub async fn sync_gmail_messages(conn_mutex: &std::sync::Mutex<Connection>) -> Result<usize, String> {
    let creds_opt = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_credentials(&conn, "gmail").map_err(|e| e.to_string())?
    };

    let creds = match creds_opt {
        Some(c) => c,
        None => return Err("Gmail not connected. Please authenticate first.".into()),
    };

    let client = reqwest::Client::new();
    let access_token = get_valid_access_token(&client, &creds, conn_mutex).await?;

    // Fetch all 5 Gmail categories in parallel
    let categories: Vec<(&str, &str)> = vec![
        ("INBOX -category:promotions -category:social -category:updates -category:forums", "primary"),
        ("category:updates", "updates"),
        ("category:promotions", "promotions"),
        ("category:social", "social"),
        ("category:forums", "forums"),
    ];

    let mut imported_count = 0;

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
                eprintln!("[Gmail Sync] Network error for category {}: {}", category_label, e);
                continue;
            }
        };

        if list_res.status().as_u16() == 401 {
            let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
            db::delete_credentials(&conn, "gmail").ok();
            return Err("Gmail authorization was revoked or expired. Please re-authenticate.".into());
        }

        if !list_res.status().is_success() {
            eprintln!("[Gmail Sync] Category {} returned status: {}", category_label, list_res.status());
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

            // Fetch detailed message content
            let detail_url = format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{}", msg_id);
            let detail_res = client.get(&detail_url)
                .bearer_auth(&access_token)
                .send()
                .await;

            if let Ok(res) = detail_res {
                if res.status().is_success() {
                    let msg_json: serde_json::Value = res.json().await.unwrap_or_default();
                    let snippet = msg_json["snippet"].as_str().unwrap_or("No snippet available").to_string();

                    // Extract From header and Subject
                    let headers = msg_json["payload"]["headers"].as_array();
                    let mut sender = "Unknown Sender".to_string();
                    let mut subject = "".to_string();

                    if let Some(h_list) = headers {
                        for h in h_list {
                            let name = h["name"].as_str().unwrap_or("");
                            if name.eq_ignore_ascii_case("From") {
                                sender = h["value"].as_str().unwrap_or("Unknown Sender").to_string();
                            } else if name.eq_ignore_ascii_case("Subject") {
                                subject = h["value"].as_str().unwrap_or("").to_string();
                            }
                        }
                    }

                    let preview = if !subject.is_empty() {
                        format!("[{}] {}: {}", category_label.to_uppercase(), subject, snippet)
                    } else {
                        format!("[{}] {}", category_label.to_uppercase(), snippet)
                    };

                    let item_id = format!("gmail_{}", msg_id);

                    // Initial temp item
                    let now = crate::db::now_iso();
                    let temp_item = QueueItem {
                        id: item_id.clone(),
                        source: "gmail".into(),
                        kind: "reply".into(),
                        sender: sender.clone(),
                        preview: preview.clone(),
                        draft_text: None,
                        status: "pending".into(),
                        flagged: false,
                        confidence: 0.0,
                        created_at: now.clone(),
                        updated_at: now.clone(),
                    };

                    // Run Ollama local model analysis & draft generation
                    let analysis = ollama::client::classify_and_draft_item(&temp_item).await;

                    let item = QueueItem {
                        id: item_id,
                        source: "gmail".into(),
                        kind: "reply".into(),
                        sender,
                        preview,
                        draft_text: analysis.draft_text,
                        status: "pending".into(),
                        flagged: analysis.flagged,
                        confidence: analysis.confidence,
                        created_at: now.clone(),
                        updated_at: now,
                    };

                    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                    if db::insert_queue_item(&conn, &item).is_ok() {
                        imported_count += 1;
                    }
                }
            }
        }
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

    let client_id = std::env::var("GOOGLE_CLIENT_ID").unwrap_or_else(|_| "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com".to_string());
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default();

    let mut params = vec![
        ("client_id", client_id.as_str()),
        ("refresh_token", creds.refresh_token.as_str()),
        ("grant_type", "refresh_token"),
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
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::delete_credentials(&conn, "gmail").ok();
        return Err("Gmail session expired and refresh failed. Please reconnect Gmail.".into());
    }

    let token_json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let new_access_token = token_json["access_token"].as_str().ok_or("Missing refreshed access_token")?.to_string();
    let expires_in = token_json["expires_in"].as_i64().unwrap_or(3600);
    let new_expires_at = now + expires_in;

    let updated_creds = GmailCredentials {
        service: "gmail".into(),
        access_token: new_access_token.clone(),
        refresh_token: creds.refresh_token.clone(),
        expires_at: new_expires_at,
        email: creds.email.clone(),
    };

    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::save_credentials(&conn, &updated_creds).ok();

    Ok(new_access_token)
}
