use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use rusqlite::Connection;
use crate::db::{self, GmailCredentials};

pub async fn start_linkedin_oauth_flow(conn_mutex: &std::sync::Mutex<Connection>) -> Result<String, String> {
    let client_id = std::env::var("LINKEDIN_CLIENT_ID").map_err(|_| "LINKEDIN_CLIENT_ID missing from .env. Please set LINKEDIN_CLIENT_ID in your .env file.".to_string())?;
    let client_secret = std::env::var("LINKEDIN_CLIENT_SECRET").map_err(|_| "LINKEDIN_CLIENT_SECRET missing from .env. Please set LINKEDIN_CLIENT_SECRET in your .env file.".to_string())?;
    
    // Configurable redirect URI (defaults to http://localhost:14220/callback)
    let redirect_uri = std::env::var("LINKEDIN_REDIRECT_URI").unwrap_or_else(|_| "http://localhost:14220/callback".to_string());
    let redirect_uri_encoded = urlencoding::encode(&redirect_uri);
    
    // Configurable scope (defaults to OpenID Connect openid profile email)
    let scope = std::env::var("LINKEDIN_SCOPE").unwrap_or_else(|_| "openid profile email".to_string());
    let scope_encoded = urlencoding::encode(&scope);
    
    let state_token = format!("wardyn_state_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs());

    // 1. Build LinkedIn OAuth Auth URL
    let auth_url = format!(
        "https://www.linkedin.com/oauth/v2/authorization?\
response_type=code&\
client_id={}&\
redirect_uri={}&\
state={}&\
scope={}",
        client_id,
        redirect_uri_encoded,
        state_token,
        scope_encoded
    );

    // 2. Start local TCP listener binding on 0.0.0.0:14220 to catch both localhost and 127.0.0.1 callbacks
    let listener = TcpListener::bind("0.0.0.0:14220")
        .or_else(|_| TcpListener::bind("127.0.0.1:14220"))
        .map_err(|e| format!("Failed to bind local OAuth port 14220: {}", e))?;
    listener.set_nonblocking(false).ok();

    // 3. Open system default browser directly via macOS native launcher
    let launch_res = std::process::Command::new("open")
        .arg(&auth_url)
        .spawn();

    if launch_res.is_err() {
        open::that(&auth_url).ok();
    }

    // 4. Spawn blocking task to wait for redirect callback without blocking tokio runtime
    let (code, is_error) = tokio::task::spawn_blocking(move || -> Result<(String, bool), String> {
        let (mut stream, _) = listener.accept().map_err(|e| format!("OAuth listener accept error: {}", e))?;
        let mut reader = BufReader::new(&stream);
        let mut request_line = String::new();
        reader.read_line(&mut request_line).map_err(|e| e.to_string())?;

        if request_line.contains("error=") {
            let err_body = "<html><body style='font-family:sans-serif;background:#0B0E13;color:#F0F4F8;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'>\
                <div style='text-align:center;background:#151A21;padding:40px;border-radius:12px;border:1px solid #242B35;max-width:540px;'>\
                <h2 style='color:#E8A23D;margin-top:0;'>LinkedIn OAuth Authorization Error</h2>\
                <p style='color:#9AA4B2;font-size:14px;line-height:1.5;'>Please check redirect URI and products in your LinkedIn Developer Console.</p>\
                </div></body></html>";
            let http_response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                err_body.len(),
                err_body
            );
            stream.write_all(http_response.as_bytes()).ok();
            stream.flush().ok();
            return Ok(("authorization_error".into(), true));
        }

        let code = parse_code_from_http_request(&request_line).unwrap_or_default();

        let response_body = "<html><body style='font-family:sans-serif;background:#0B0E13;color:#F0F4F8;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'>\
            <div style='text-align:center;background:#151A21;padding:40px;border-radius:12px;border:1px solid #242B35;'>\
            <h2 style='color:#4A8FC2;margin-top:0;'>LinkedIn Connected!</h2>\
            <p style='color:#9AA4B2;'>Wardyn is now authenticated with your personal LinkedIn account (abdulkabirmusa). You can close this window.</p>\
            </div></body></html>";
        let http_response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            response_body.len(),
            response_body
        );
        stream.write_all(http_response.as_bytes()).ok();
        stream.flush().ok();

        Ok((code, false))
    }).await.map_err(|e| e.to_string())??;

    if is_error || code.is_empty() {
        return Err("LinkedIn OAuth flow returned an authorization error or missing code.".into());
    }

    // 5. Exchange code for access token
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
    ];

    let res = client.post("https://www.linkedin.com/oauth/v2/accessToken")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("LinkedIn token exchange network error: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("LinkedIn token exchange failed: {}", err_text));
    }

    let token_json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let access_token = token_json["access_token"].as_str().ok_or("Missing access_token")?.to_string();
    let expires_in = token_json["expires_in"].as_i64().unwrap_or(5184000);
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64 + expires_in;

    // 6. Fetch user personal profile
    let profile_res = client.get("https://api.linkedin.com/v2/userinfo")
        .bearer_auth(&access_token)
        .send()
        .await;

    let profile_name = if let Ok(resp) = profile_res {
        if resp.status().is_success() {
            let p_json: serde_json::Value = resp.json().await.unwrap_or_default();
            let name = p_json["name"].as_str().or_else(|| p_json["given_name"].as_str()).unwrap_or("abdulkabirmusa");
            Some(name.to_string())
        } else {
            Some("abdulkabirmusa".to_string())
        }
    } else {
        Some("abdulkabirmusa".to_string())
    };

    let creds = GmailCredentials {
        service: "linkedin".into(),
        access_token,
        refresh_token: "".into(),
        expires_at,
        email: profile_name.clone(),
    };

    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::save_credentials(&conn, &creds).map_err(|e| e.to_string())?;

    Ok(creds.email.unwrap_or_else(|| "abdulkabirmusa".into()))
}

fn parse_code_from_http_request(request_line: &str) -> Option<String> {
    if let Some(pos) = request_line.find("code=") {
        let code_part = &request_line[pos + 5..];
        let end_pos = code_part.find('&').or_else(|| code_part.find(' ')).unwrap_or(code_part.len());
        return Some(code_part[..end_pos].to_string());
    }
    None
}
