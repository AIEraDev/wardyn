use rusqlite::Connection;
use crate::db;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SendEmailRequest {
    pub item_id: String,
    pub recipient: String,
    pub subject: String,
    pub in_reply_to: Option<String>,
    pub body_text: String,
    pub test_override_recipient: Option<String>,
}

pub async fn send_gmail_reply(
    conn_mutex: &std::sync::Mutex<Connection>,
    req: SendEmailRequest,
) -> Result<String, String> {
    let creds_opt = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        db::get_credentials(&conn, "gmail").map_err(|e| e.to_string())?
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
    mime_message.push_str(&format!("Subject: Re: {}\r\n", req.subject.replace("Re: ", "").replace("RE: ", "")));
    
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

    let send_payload = serde_json::json!({
        "raw": raw_base64
    });

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

    Ok(sent_msg_id)
}

fn base64_url_encode(input: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(input)
}
