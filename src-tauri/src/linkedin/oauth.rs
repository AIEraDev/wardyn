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

// LinkedIn uses the same port as Gmail (14220) — they never run concurrently
const REDIRECT_PORT: u16 = 14220;
const REDIRECT_URI: &str = "http://localhost:14220/callback";

pub async fn start_linkedin_oauth_flow(conn_mutex: &std::sync::Mutex<Connection>) -> Result<String, String> {
    // Read user-supplied credentials from DB first
    let (client_id, client_secret) = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        let id = crate::db::get_app_setting(&conn, "oauth_linkedin_client_id")
            .ok().flatten().filter(|v| !v.is_empty())
            .unwrap_or_else(|| {
                std::env::var("LINKEDIN_CLIENT_ID")
                    .unwrap_or_else(|_| COMPILED_LINKEDIN_CLIENT_ID.to_string())
            });
        let secret = crate::db::get_app_setting(&conn, "oauth_linkedin_client_secret")
            .ok().flatten().filter(|v| !v.is_empty())
            .unwrap_or_else(|| std::env::var("LINKEDIN_CLIENT_SECRET").unwrap_or_default());
        (id, secret)
    };

    if client_id.is_empty() {
        return Err("LinkedIn client ID is not configured. Go to Settings → OAuth Credentials and paste your LinkedIn Client ID and Secret.".to_string());
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

    // 2. Bind callback listener — try both localhost variants on 14220
    let listener = TcpListener::bind("127.0.0.1:14220")
        .or_else(|_| TcpListener::bind("0.0.0.0:14220"))
        .map_err(|e| format!("Failed to bind LinkedIn OAuth port 14220: {}", e))?;
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
            (r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wardyn — Authorization Error</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0B0E13; color: #F0F4F8; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #151A21; border: 1px solid #242B35; border-radius: 16px; padding: 48px 56px; text-align: center; max-width: 480px; width: 90%; box-shadow: 0 24px 64px rgba(0,0,0,0.5); }
    .icon-wrap { width: 64px; height: 64px; background: rgba(232,162,61,0.12); border: 1px solid rgba(232,162,61,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
    .x-icon { width: 26px; height: 26px; stroke: #E8A23D; stroke-width: 2.5; fill: none; stroke-linecap: round; }
    .brand { font-size: 11px; font-family: 'SF Mono', monospace; color: #4A8FC2; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 12px; }
    h1 { font-size: 22px; font-weight: 600; color: #F0F4F8; margin-bottom: 10px; }
    p { font-size: 14px; color: #9AA4B2; line-height: 1.6; margin-bottom: 16px; }
    .hint { font-size: 12px; color: #E8A23D; font-family: 'SF Mono', monospace; background: rgba(232,162,61,0.08); border: 1px solid rgba(232,162,61,0.2); border-radius: 8px; padding: 10px 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">
      <svg class="x-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </div>
    <div class="brand">Wardyn</div>
    <h1>Authorization Error</h1>
    <p>LinkedIn declined the authorization request.</p>
    <div class="hint">Check that your redirect URI matches exactly in the LinkedIn Developer Console, then try again.</div>
  </div>
</body>
</html>"#.to_string(), true)
        } else {
            (r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wardyn — LinkedIn Connected</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0B0E13; color: #F0F4F8; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #151A21; border: 1px solid #242B35; border-radius: 16px; padding: 48px 56px; text-align: center; max-width: 480px; width: 90%; box-shadow: 0 24px 64px rgba(0,0,0,0.5); }
    .icon-wrap { width: 64px; height: 64px; background: rgba(52,211,153,0.12); border: 1px solid rgba(52,211,153,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
    .checkmark { width: 28px; height: 28px; stroke: #34D399; stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .brand { font-size: 11px; font-family: 'SF Mono', monospace; color: #4A8FC2; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 12px; }
    h1 { font-size: 22px; font-weight: 600; color: #F0F4F8; margin-bottom: 10px; }
    p { font-size: 14px; color: #9AA4B2; line-height: 1.6; margin-bottom: 28px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.25); border-radius: 999px; padding: 6px 16px; font-size: 12px; font-family: 'SF Mono', monospace; color: #34D399; }
    .dot { width: 7px; height: 7px; background: #34D399; border-radius: 50%; animation: pulse 1.8s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }
    .close-hint { margin-top: 24px; font-size: 11px; color: #4A5568; font-family: 'SF Mono', monospace; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">
      <svg class="checkmark" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <div class="brand">Wardyn</div>
    <h1>LinkedIn Connected</h1>
    <p>Your LinkedIn profile has been authenticated successfully.<br/>Wardyn will now sync your timeline and content briefs.</p>
    <div class="pill"><div class="dot"></div> Authentication complete</div>
    <div class="close-hint">You can close this window and return to Wardyn</div>
  </div>
</body>
</html>"#.to_string(), false)
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

    // 5. Token exchange — uses client_secret from user's DB credentials
    if client_secret.is_empty() {
        return Err(
            "LinkedIn client secret is not configured. Go to Settings → OAuth Credentials and paste your LinkedIn Client Secret."
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
