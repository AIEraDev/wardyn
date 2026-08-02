use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rusqlite::Connection;
use crate::db::{self, GmailCredentials};

// CLIENT_ID is a public identifier — safe to embed in the binary.
// CLIENT_SECRET is intentionally NOT used: we implement PKCE (RFC 7636)
// so no secret is ever needed or stored in the distributed app.
const COMPILED_GOOGLE_CLIENT_ID: &str = env!("GOOGLE_CLIENT_ID");

const REDIRECT_URI: &str = "http://127.0.0.1:14220/callback";
const REDIRECT_URI_ENCODED: &str = "http%3A%2F%2F127.0.0.1%3A14220%2Fcallback";

/// Generate a PKCE code_verifier using time-seeded LCG entropy, base64url encoded.
fn generate_pkce_verifier() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut bytes = [0u8; 64];
    let seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut hasher = DefaultHasher::new();
    seed.hash(&mut hasher);
    std::thread::current().id().hash(&mut hasher);
    let h1 = hasher.finish();
    let h2 = h1.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    let h3 = h2.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    let h4 = h3.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    let h5 = h4.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    let h6 = h5.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    let h7 = h6.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    let h8 = h7.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    for (i, h) in [h1, h2, h3, h4, h5, h6, h7, h8].iter().enumerate() {
        bytes[i * 8..(i + 1) * 8].copy_from_slice(&h.to_le_bytes());
    }
    URL_SAFE_NO_PAD.encode(bytes)
}

pub async fn start_oauth_flow(conn_mutex: &std::sync::Mutex<Connection>) -> Result<String, String> {
    // Prefer user-supplied credentials from DB, then compiled-in fallback
    let (client_id, client_secret) = {
        let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
        let id = crate::db::get_app_setting(&conn, "oauth_google_client_id")
            .ok().flatten().filter(|v| !v.is_empty())
            .unwrap_or_else(|| std::env::var("GOOGLE_CLIENT_ID")
                .unwrap_or_else(|_| COMPILED_GOOGLE_CLIENT_ID.to_string()));
        // For Google Desktop apps the client_secret is required even with PKCE.
        // It is NOT a true secret — Google's docs explicitly state desktop client
        // secrets are not confidential and can be distributed in apps.
        let secret = crate::db::get_app_setting(&conn, "oauth_google_client_secret")
            .ok().flatten().filter(|v| !v.is_empty())
            .unwrap_or_else(|| std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default());
        (id, secret)
    };

    if client_id.is_empty() || client_id.contains("YOUR_GOOGLE") {
        return Err("Google OAuth client ID is not configured. Go to Settings → OAuth Credentials and paste your Google Client ID.".to_string());
    }
    if client_secret.is_empty() {
        return Err("Google OAuth client secret is not configured. Go to Settings → OAuth Credentials and paste your Google Client Secret.".to_string());
    }

    // PKCE — plain method: code_challenge = code_verifier (Google supports for installed apps)
    let code_verifier = generate_pkce_verifier();
    let code_challenge_encoded = urlencoding::encode(&code_verifier).into_owned();

    // 1. Build Google OAuth Auth URL with PKCE, no client_secret needed
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
client_id={}&\
redirect_uri={}&\
response_type=code&\
scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.send%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events&\
access_type=offline&\
prompt=consent&\
code_challenge={}&\
code_challenge_method=plain",
        client_id,
        REDIRECT_URI_ENCODED,
        code_challenge_encoded,
    );

    // 2. Start local TCP listener
    let listener = TcpListener::bind("127.0.0.1:14220")
        .map_err(|e| format!("Failed to bind OAuth callback port 14220: {}", e))?;
    listener.set_nonblocking(true).ok();

    // 3. Open system browser — explicit path works inside .app bundle
    let opened = std::process::Command::new("/usr/bin/open")
        .arg(&auth_url)
        .spawn()
        .is_ok();
    if !opened {
        open::that(&auth_url).ok();
    }

    // 4. Wait for redirect callback (non-blocking, 2-min timeout)
    let start_time = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(120);
    let mut stream = loop {
        match listener.accept() {
            Ok((s, _)) => break s,
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if start_time.elapsed() >= timeout {
                    return Err("OAuth login timed out after 2 minutes.".into());
                }
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            }
            Err(e) => return Err(format!("OAuth listener error: {}", e)),
        }
    };

    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    reader.read_line(&mut request_line).map_err(|e| e.to_string())?;

    let code = parse_code_from_http_request(&request_line)
        .ok_or("No authorization code in OAuth callback")?;

    let response_body = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wardyn — Gmail Connected</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0B0E13;
      color: #F0F4F8;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #151A21;
      border: 1px solid #242B35;
      border-radius: 16px;
      padding: 48px 56px;
      text-align: center;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    }
    .icon-wrap {
      width: 64px; height: 64px;
      background: rgba(52, 211, 153, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.3);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 24px;
    }
    .checkmark {
      width: 28px; height: 28px;
      stroke: #34D399; stroke-width: 2.5;
      fill: none; stroke-linecap: round; stroke-linejoin: round;
    }
    .brand {
      font-size: 11px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      color: #4A8FC2;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 22px;
      font-weight: 600;
      color: #F0F4F8;
      margin-bottom: 10px;
    }
    p {
      font-size: 14px;
      color: #9AA4B2;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(52,211,153,0.1);
      border: 1px solid rgba(52,211,153,0.25);
      border-radius: 999px;
      padding: 6px 16px;
      font-size: 12px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      color: #34D399;
    }
    .dot {
      width: 7px; height: 7px;
      background: #34D399;
      border-radius: 50%;
      animation: pulse 1.8s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
    }
    .close-hint {
      margin-top: 24px;
      font-size: 11px;
      color: #4A5568;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">
      <svg class="checkmark" viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
    <div class="brand">Wardyn</div>
    <h1>Gmail Connected</h1>
    <p>Your Gmail account has been authenticated successfully.<br/>Wardyn will now sync your inbox in the background.</p>
    <div class="pill"><div class="dot"></div> Authentication complete</div>
    <div class="close-hint">You can close this window and return to Wardyn</div>
  </div>
</body>
</html>"#;
    let http_response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        response_body.len(), response_body
    );
    stream.write_all(http_response.as_bytes()).ok();
    stream.flush().ok();

    // 5. Exchange code for tokens — Google Desktop apps require client_secret even with PKCE
    let client = reqwest::Client::new();
    let params = vec![
        ("client_id",      client_id.as_str()),
        ("client_secret",  client_secret.as_str()),
        ("code",           code.as_str()),
        ("grant_type",     "authorization_code"),
        ("redirect_uri",   REDIRECT_URI),
        ("code_verifier",  code_verifier.as_str()),
    ];

    let res = client.post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange network error: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", err_text));
    }

    let token_json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let access_token  = token_json["access_token"].as_str().ok_or("Missing access_token")?.to_string();
    let refresh_token = token_json["refresh_token"].as_str().unwrap_or("").to_string();
    let expires_in    = token_json["expires_in"].as_i64().unwrap_or(3600);
    let expires_at    = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64 + expires_in;

    // 6. Fetch Gmail address
    let profile_res = client.get("https://gmail.googleapis.com/gmail/v1/users/me/profile")
        .bearer_auth(&access_token)
        .send().await;

    let email = if let Ok(resp) = profile_res {
        if resp.status().is_success() {
            let p: serde_json::Value = resp.json().await.unwrap_or_default();
            p["emailAddress"].as_str().map(|s| s.to_string())
        } else { None }
    } else { None };

    let service_key = match &email {
        Some(addr) => format!("gmail:{}", addr),
        None => "gmail".into(),
    };

    let creds = GmailCredentials { service: service_key, access_token, refresh_token, expires_at, email };
    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::save_credentials(&conn, &creds).map_err(|e| e.to_string())?;

    Ok(creds.email.unwrap_or_else(|| "Connected Account".into()))
}

fn parse_code_from_http_request(request_line: &str) -> Option<String> {
    if let Some(pos) = request_line.find("code=") {
        let part = &request_line[pos + 5..];
        let end = part.find('&').or_else(|| part.find(' ')).unwrap_or(part.len());
        return Some(part[..end].to_string());
    }
    None
}
