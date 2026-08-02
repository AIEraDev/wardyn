use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use rusqlite::Connection;
use crate::db::{self, GmailCredentials};

// CLIENT_ID is a public identifier — safe to embed in the binary.
// CLIENT_SECRET is intentionally NOT baked in at compile time.
// LinkedIn's API requires a confidential client secret for token exchange.
// In production this should be proxied server-side. In dev, set
// LINKEDIN_CLIENT_SECRET in your .env file.
const COMPILED_LINKEDIN_CLIENT_ID: &str = env!("LINKEDIN_CLIENT_ID");

// LinkedIn uses a different port to avoid conflicts with Gmail OAuth (14220)
const REDIRECT_PORT: u16 = 14221;
const REDIRECT_URI: &str = "http://localhost:14221/callback";

pub async fn start_linkedin_oauth_flow(conn_mutex: &std::sync::Mutex<Connection>) -> Result<String, String> {
    let client_id = std::env::var("LINKEDIN_CLIENT_ID")
        .unwrap_or_else(|_| COMPILED_LINKEDIN_CLIENT_ID.to_string());

    if client_id.is_empty() {
        return Err("LinkedIn client ID is not configured.".to_string());
    }

    let scope_encoded = urlencoding::encode("openid profile email w_member_social");
    let redirect_encoded = urlencoding::encode(REDIRECT_URI);
    let state_token = format!(
        "wardyn_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    );

    // 1. Build auth URL — browser open happens before any secret check
    let auth_url = format!(
        "https://www.linkedin.com/oauth/v2/authorization?\
response_type=code&\
client_id={}&\
redirect_uri={}&\
state={}&\
scope={}",
        client_id, redirect_encoded, state_token, scope_encoded
    );

    // 2. Bind callback listener on port 14221
    let listener = TcpListener::bind(format!("127.0.0.1:{}", REDIRECT_PORT))
        .or_else(|_| TcpListener::bind(format!("0.0.0.0:{}", REDIRECT_PORT)))
        .map_err(|e| format!("Failed to bind LinkedIn OAuth port {}: {}", REDIRECT_PORT, e))?;
    listener.set_nonblocking(true).ok();

    // 3. Open browser — explicit /usr/bin/open works inside .app bundle
    let opened = std::process::Command::new("/usr/bin/open")
        .arg(&auth_url)
        .spawn()
        .is_ok();
    if !opened {
        open::that(&auth_url).ok();
    }

    // 4. Wait for callback (non-blocking, 2-min timeout, off the tokio thread)
    let (code, is_error) = tokio::task::spawn_blocking(move || -> Result<(String, bool), String> {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(120);

        let mut stream = loop {
            match listener.accept() {
                Ok((s, _)) => break s,
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    if start.elapsed() >= timeout {
                        return Err("LinkedIn OAuth timed out after 2 minutes. Please try again.".into());
                    }
                    std::thread::sleep(std::time::Duration::from_millis(200));
                }
                Err(e) => return Err(format!("OAuth listener error: {}", e)),
            }
        };

        let mut reader = BufReader::new(&stream);
        let mut request_line = String::new();
        reader.read_line(&mut request_line).map_err(|e| e.to_string())?;

        let (html, is_err) = if request_line.contains("error=") {
            (
                "<html><body style='font-family:sans-serif;background:#0B0E13;color:#F0F4F8;\
                display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'>\
                <div style='text-align:center;background:#151A21;padding:40px;border-radius:12px;\
                border:1px solid #242B35;max-width:540px;'>\
                <h2 style='color:#E8A23D;margin-top:0;'>Authorization Error</h2>\
                <p style='color:#9AA4B2;'>Please check your LinkedIn Developer Console redirect URI settings.</p>\
                </div></body></html>".to_string(),
                true,
            )
        } else {
            (
                "<html><body style='font-family:sans-serif;background:#0B0E13;color:#F0F4F8;\
                display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'>\
                <div style='text-align:center;background:#151A21;padding:40px;border-radius:12px;\
                border:1px solid #242B35;'>\
                <h2 style='color:#4A8FC2;margin-top:0;'>LinkedIn Connected!</h2>\
                <p style='color:#9AA4B2;'>Authentication complete. You can close this window.</p>\
                </div></body></html>".to_string(),
                false,
            )
        };

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\n\
            Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(), html
        );
        stream.write_all(response.as_bytes()).ok();
        stream.flush().ok();

        let code = if is_err {
            "authorization_error".to_string()
        } else {
            parse_code_from_request(&request_line).unwrap_or_default()
        };

        Ok((code, is_err))
    })
    .await
    .map_err(|e| e.to_string())??;

    if is_error || code.is_empty() {
        return Err("LinkedIn OAuth authorization failed or returned no code.".into());
    }

    // 5. Token exchange — requires client_secret (not baked into binary)
    let client_secret = std::env::var("LINKEDIN_CLIENT_SECRET").unwrap_or_default();
    if client_secret.is_empty() {
        return Err(
            "LinkedIn token exchange requires LINKEDIN_CLIENT_SECRET. \
            Set it in .env for development. Production requires a backend proxy."
                .to_string(),
        );
    }

    let http = reqwest::Client::new();
    let params = [
        ("grant_type",    "authorization_code"),
        ("code",          code.as_str()),
        ("client_id",     client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("redirect_uri",  REDIRECT_URI),
    ];

    let res = http
        .post("https://www.linkedin.com/oauth/v2/accessToken")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("LinkedIn token exchange network error: {}", e))?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("LinkedIn token exchange failed: {}", err));
    }

    let token_json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let access_token = token_json["access_token"]
        .as_str()
        .ok_or("Missing access_token")?
        .to_string();
    let expires_in = token_json["expires_in"].as_i64().unwrap_or(5184000);
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
        + expires_in;

    // 6. Fetch profile name
    let profile_res = http
        .get("https://api.linkedin.com/v2/userinfo")
        .bearer_auth(&access_token)
        .send()
        .await;

    let profile_name = if let Ok(resp) = profile_res {
        if resp.status().is_success() {
            let p: serde_json::Value = resp.json().await.unwrap_or_default();
            p["name"]
                .as_str()
                .or_else(|| p["given_name"].as_str())
                .map(|s| s.to_string())
        } else {
            None
        }
    } else {
        None
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

    Ok(creds.email.unwrap_or_else(|| "LinkedIn User".into()))
}

fn parse_code_from_request(request_line: &str) -> Option<String> {
    let pos = request_line.find("code=")?;
    let part = &request_line[pos + 5..];
    let end = part.find('&').or_else(|| part.find(' ')).unwrap_or(part.len());
    Some(part[..end].to_string())
}
