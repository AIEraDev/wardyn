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

    // Construct RFC 2822 MIME message string
    let mut mime_message = String::new();
    mime_message.push_str(&format!("To: {}\r\n", target_recipient));
    let clean_subj = req.subject.replace("Re: ", "").replace("RE: ", "");
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
        .bearer_auth(&creds.access_token)
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
