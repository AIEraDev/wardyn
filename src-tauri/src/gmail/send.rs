use rusqlite::Connection;
use crate::db;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SendEmailRequest {
    pub item_id: String,
    pub recipient: String,
    pub subject: String,
    pub in_reply_to: Option<String>,
    pub thread_id: Option<String>,
    pub body_text: String,
    pub test_override_recipient: Option<String>,
}

pub async fn send_gmail_reply(
    conn_mutex: &std::sync::Mutex<Connection>,
    req: SendEmailRequest,
) -> Result<String, String> {
    let creds_opt = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        let all_creds = db::get_all_gmail_credentials(&conn).unwrap_or_default();
        let matched = all_creds.iter().find(|c| {
            if let Some(ref em) = c.email {
                let clean = em.replace('@', "_at_");
                req.item_id.contains(&clean)
            } else {
                false
            }
        }).cloned();

        match matched {
            Some(c) => Some(c),
            None => db::get_credentials(&conn, "gmail").unwrap_or(None),
        }
    };

    let creds = match creds_opt {
        Some(c) => c,
        None => return Err("Gmail is not connected. Please authenticate first.".into()),
    };

    let target_recipient = if let Some(ref override_email) = req.test_override_recipient {
        if !override_email.trim().is_empty() {
            override_email.trim()
        } else {
            &req.recipient
        }
    } else {
        &req.recipient
    };

    // Refresh access token if expired or about to expire
    let access_token = {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        if creds.expires_at <= now + 60 && !creds.refresh_token.is_empty() {
            // Refresh the token
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
            let refresh_client = reqwest::Client::new();
            let mut params = vec![
                ("client_id", client_id.as_str()),
                ("refresh_token", creds.refresh_token.as_str()),
                ("grant_type", "refresh_token"),
            ];
            if !client_secret.is_empty() {
                params.push(("client_secret", client_secret.as_str()));
            }
            let res = refresh_client.post("https://oauth2.googleapis.com/token")
                .form(&params).send().await
                .map_err(|e| format!("Token refresh network error: {}", e))?;
            if res.status().is_success() {
                let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
                let new_token = json["access_token"].as_str().unwrap_or(&creds.access_token).to_string();
                let expires_in = json["expires_in"].as_i64().unwrap_or(3600);
                let updated = crate::db::GmailCredentials {
                    service: creds.service.clone(),
                    access_token: new_token.clone(),
                    refresh_token: creds.refresh_token.clone(),
                    expires_at: now + expires_in,
                    email: creds.email.clone(),
                };
                let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
                crate::db::save_credentials(&conn, &updated).ok();
                new_token
            } else {
                creds.access_token.clone()
            }
        } else {
            creds.access_token.clone()
        }
    };

    // Construct RFC 2822 MIME message string
    let mut mime_message = String::new();
    mime_message.push_str(&format!("To: {}\r\n", target_recipient));
    // Strip category prefixes like [PRIMARY], [UPDATES] and any Re: prefixes
    let clean_subj = {
        let s = req.subject.as_str();
        let s = if s.starts_with('[') {
            s.find(']').map(|i| s[i + 1..].trim()).unwrap_or(s)
        } else { s };
        let s = s.trim_start_matches("Re: ")
            .trim_start_matches("RE: ")
            .trim_start_matches("re: ");
        s.to_string()
    };
    mime_message.push_str(&format!("Subject: Re: {}\r\n", clean_subj));

    if let Some(ref reply_header) = req.in_reply_to {
        if !reply_header.trim().is_empty() {
            mime_message.push_str(&format!("In-Reply-To: {}\r\n", reply_header.trim()));
            mime_message.push_str(&format!("References: {}\r\n", reply_header.trim()));
        }
    }

    mime_message.push_str("Content-Type: text/plain; charset=UTF-8\r\n\r\n");
    mime_message.push_str(&req.body_text);

    // URL-safe Base64 Encoding as required by Gmail API raw field
    let raw_base64 = base64_url_encode(mime_message.as_bytes());

    let mut send_payload = serde_json::json!({
        "raw": raw_base64
    });

    if let Some(ref th_id) = req.thread_id {
        if !th_id.trim().is_empty() {
            send_payload["threadId"] = serde_json::json!(th_id.trim());
        }
    }


    let client = reqwest::Client::new();
    let res = client.post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(&access_token)
        .json(&send_payload)
        .send()
        .await
        .map_err(|e| format!("Network error sending email via Gmail API: {}", e))?;

    let status = res.status();
    if !status.is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Gmail API send failed ({}): {}", status, err_text));
    }

    let resp_json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let sent_msg_id = resp_json["id"].as_str().unwrap_or("unknown").to_string();

    // Single source of truth update: status = "sent"
    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::update_status_and_draft(&conn, &req.item_id, "sent", Some(&req.body_text)).map_err(|e| e.to_string())?;

    if let Ok(Some(item)) = db::get_queue_item_by_id(&conn, &req.item_id) {
        // Record how much the AI draft was edited before sending — quality feedback loop
        if let Some(ref original_draft) = item.draft_text {
            db::record_draft_edit_distance(&conn, &req.item_id, original_draft, &req.body_text).ok();
        }

        let responded_at = db::now_iso();
        let response_time_seconds = db::iso_to_unix_secs(&responded_at)
            .zip(db::iso_to_unix_secs(&item.created_at))
            .map(|(responded, received)| (responded - received).max(0));
        let category = item
            .preview
            .split(']')
            .next()
            .and_then(|prefix| prefix.strip_prefix('['))
            .map(|c| c.to_lowercase());

        db::record_response_analytics(
            &conn,
            &req.item_id,
            &item.sender,
            category.as_deref(),
            &item.created_at,
            Some(&responded_at),
            response_time_seconds,
            db::get_draft_generation_time_ms(&conn, &req.item_id).ok().flatten(),
        )
        .ok();
    }

    Ok(sent_msg_id)
}

fn base64_url_encode(input: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(input)
}
