use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use rusqlite::Connection;
use crate::db::{self, GmailCredentials};

const GOOGLE_CLIENT_ID: &str = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"; // Standard PKCE client
const REDIRECT_URI: &str = "http://127.0.0.1:14220/callback";
const REDIRECT_URI_ENCODED: &str = "http%3A%2F%2F127.0.0.1%3A14220%2Fcallback";

pub async fn start_oauth_flow(conn_mutex: &std::sync::Mutex<Connection>) -> Result<String, String> {
    // 1. Build Google OAuth Auth URL
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
client_id={}&\
redirect_uri={}&\
response_type=code&\
scope=https://www.googleapis.com/auth/gmail.readonly%20https://www.googleapis.com/auth/calendar.events&\
access_type=offline&\
prompt=consent",
        GOOGLE_CLIENT_ID,
        REDIRECT_URI_ENCODED
    );

    // 2. Start local TCP listener on 127.0.0.1:14220
    let listener = TcpListener::bind("127.0.0.1:14220").map_err(|e| format!("Failed to bind local OAuth port 14220: {}", e))?;
    listener.set_nonblocking(false).ok();

    // 3. Open system browser
    if let Err(_) = open::that(&auth_url) {
        println!("Could not automatically open browser, URL: {}", auth_url);
    }

    // 4. Wait for redirect callback connection
    let (mut stream, _) = listener.accept().map_err(|e| format!("OAuth listener accept error: {}", e))?;
    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    reader.read_line(&mut request_line).map_err(|e| e.to_string())?;

    // Parse authorization code from HTTP GET request line
    let code = parse_code_from_http_request(&request_line).ok_or("No authorization code returned in OAuth callback")?;

    // Send HTTP HTML response back to user's browser
    let response_body = "<html><body style='font-family:sans-serif;background:#0B0E13;color:#F0F4F8;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'>\
        <div style='text-align:center;background:#151A21;padding:40px;border-radius:12px;border:1px solid #242B35;'>\
        <h2 style='color:#4A8FC2;margin-top:0;'>Wardyn Connected!</h2>\
        <p style='color:#9AA4B2;'>Gmail authentication complete. You can close this window and return to Wardyn.</p>\
        </div></body></html>";
    let http_response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        response_body.len(),
        response_body
    );
    stream.write_all(http_response.as_bytes()).ok();
    stream.flush().ok();

    // 5. Exchange code for access & refresh tokens
    let client = reqwest::Client::new();
    let params = [
        ("client_id", GOOGLE_CLIENT_ID),
        ("code", &code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", REDIRECT_URI),
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
    let access_token = token_json["access_token"].as_str().ok_or("Missing access_token")?.to_string();
    let refresh_token = token_json["refresh_token"].as_str().unwrap_or("").to_string();
    let expires_in = token_json["expires_in"].as_i64().unwrap_or(3600);
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64 + expires_in;

    // 6. Fetch user Gmail email address
    let profile_res = client.get("https://gmail.googleapis.com/gmail/v1/users/me/profile")
        .bearer_auth(&access_token)
        .send()
        .await;

    let email = if let Ok(resp) = profile_res {
        if resp.status().is_success() {
            let p_json: serde_json::Value = resp.json().await.unwrap_or_default();
            p_json["emailAddress"].as_str().map(|s| s.to_string())
        } else {
            None
        }
    } else {
        None
    };

    let creds = GmailCredentials {
        service: "gmail".into(),
        access_token,
        refresh_token,
        expires_at,
        email,
    };

    let conn = conn_mutex.lock().map_err(|e| e.to_string())?;
    db::save_credentials(&conn, &creds).map_err(|e| e.to_string())?;

    Ok(creds.email.unwrap_or_else(|| "Connected Account".into()))
}

fn parse_code_from_http_request(request_line: &str) -> Option<String> {
    if let Some(pos) = request_line.find("code=") {
        let code_part = &request_line[pos + 5..];
        let end_pos = code_part.find('&').or_else(|| code_part.find(' ')).unwrap_or(code_part.len());
        return Some(code_part[..end_pos].to_string());
    }
    None
}
