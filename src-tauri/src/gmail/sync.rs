use rusqlite::Connection;
use crate::db::{self, GmailCredentials};
use crate::models::QueueItem;
use crate::ollama;
use crate::productivity;

/// Three-tier triage classification applied at sync time (before AI):
///
///   "suppressed"   — pure noise: bounce@, mailer-daemon@, marketing spam, unsubscribe
///   "informational"— worth reading, no reply needed: bank alerts, shipping, event
///                    confirmations, real newsletters, CI notifications, FYI emails
///   "active"       — may need a reply (upgraded/downgraded by AI pass)
///
/// The key insight: informational emails are NOT suppressed. They belong in a
/// readable digest panel. Only true junk/bounces are suppressed.
fn classify_triage_tier(sender: &str, preview: &str, category_label: &str) -> &'static str {
    let lower_sender = sender.to_lowercase();
    let lower_preview = preview.to_lowercase();

    // ── Tier 1: Hard suppress — pure noise, never useful ─────────────────
    let is_pure_noise = lower_sender.contains("mailer-daemon")
        || lower_sender.contains("bounce@")
        || lower_sender.contains("donotreply@")
        || lower_preview.contains("this is an automated message")
        || lower_preview.contains("do not reply to this email")
        // Promotional spam with unsubscribe links (marketing blasts)
        || (lower_preview.contains("unsubscribe") && (
               category_label == "promotions"
            || lower_sender.contains("marketing@")
            || lower_sender.contains("promo@")
            || lower_sender.contains("deals@")
            || lower_sender.contains("offers@")
        ));

    if is_pure_noise {
        return "suppressed";
    }

    // ── Tier 2: Informational — real content, no reply expected ──────────
    // These are emails from real services you care about: banks, shops, events,
    // SaaS platforms, newsletters you actually subscribed to, CI systems, etc.
    let is_informational =
        // Transactional: financial / orders
        lower_preview.contains("your receipt")
        || lower_preview.contains("order confirmed")
        || lower_preview.contains("order shipped")
        || lower_preview.contains("your order")
        || lower_preview.contains("invoice #")
        || lower_preview.contains("payment received")
        || lower_preview.contains("payment confirmed")
        || lower_preview.contains("transaction")
        || lower_preview.contains("statement is ready")
        || lower_preview.contains("bank statement")
        // Account / auth
        || lower_preview.contains("password reset")
        || lower_preview.contains("verify your email")
        || lower_preview.contains("confirm your email")
        || lower_preview.contains("two-factor")
        || lower_preview.contains("sign-in attempt")
        || lower_preview.contains("new login")
        // Events / bookings
        || lower_preview.contains("booking confirmed")
        || lower_preview.contains("reservation confirmed")
        || lower_preview.contains("your ticket")
        || lower_preview.contains("event reminder")
        || lower_preview.contains("appointment confirmed")
        // Dev / CI / platform notifications
        || lower_preview.contains("build passed")
        || lower_preview.contains("build failed")
        || lower_preview.contains("pull request")
        || lower_preview.contains("merged into")
        || lower_preview.contains("pipeline")
        || lower_preview.contains("deployment")
        // Shipping
        || lower_preview.contains("has been shipped")
        || lower_preview.contains("out for delivery")
        || lower_preview.contains("delivered")
        || lower_preview.contains("tracking number")
        // Digests / newsletters (non-spam — sender not a known spammer)
        || lower_preview.contains("weekly digest")
        || lower_preview.contains("daily digest")
        || lower_preview.contains("this week in")
        || lower_preview.contains("weekly roundup")
        || lower_preview.contains("newsletter")
        // Notification-style category emails that have real content
        || (category_label == "updates" && lower_sender.contains("noreply"))
        || (category_label == "social"
            && (lower_sender.contains("linkedin")
                || lower_sender.contains("github")));

    if is_informational {
        return "informational";
    }

    // ── Tier 3: Active — potentially needs a reply (AI will confirm) ──────
    "active"
}

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

        // Flag to break out of all categories if this account's session is revoked mid-loop
        let mut account_session_ok = true;

        for (query, category_label) in &categories {
            if !account_session_ok { break; }
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
                // Token is truly revoked — log it clearly and stop iterating this account.
                // Do NOT delete credentials here: the token may have just expired and the
                // refresh will handle it on the next sync cycle. Only delete if the refresh
                // itself explicitly fails (handled in get_valid_access_token).
                eprintln!("[Gmail Sync] 401 for {} ({}) — access token expired or revoked. Will retry on next sync.", account_email, category_label);
                account_session_ok = false;
                break;
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
                        // Classify into three tiers: suppressed / informational / active
                        let triage_status = classify_triage_tier(&sender, &preview, category_label);
                        let is_suppressed = triage_status == "suppressed";
                        let is_informational = triage_status == "informational";

                        // Fast rule-based classify first — AI classification runs in parallel below
                        let fast_result = ollama::client::rule_based_classify_only(
                            &sender, &preview
                        );

                        // Suppressed and informational items never need a reply
                        let needs_reply = !is_suppressed && !is_informational && fast_result.needs_reply;

                        // pending_ai only for active items — no point running AI on suppressed/informational
                        let final_triage_status = if is_suppressed || is_informational {
                            triage_status.to_string()
                        } else {
                            "pending_ai".to_string() // upgraded to "active" by AI pass below
                        };

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
                            needs_reply,
                            triage_status: final_triage_status,
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
                    // After AI scores, promote triage_status from 'pending_ai' -> 'active'
                    // (suppressed items keep their status; AI doesn't override the hard exclusion)
                    conn.execute(
                        "UPDATE queue_items
                         SET flagged=?1, draft_text=?2, confidence=?3, urgency=?4,
                             needs_reply=?5,
                             triage_status=CASE
                               WHEN triage_status='suppressed'    THEN 'suppressed'
                               WHEN triage_status='informational' THEN 'informational'
                               ELSE 'active'
                             END,
                             updated_at=?6
                         WHERE id=?7",
                        rusqlite::params![
                            if result.flagged { 1 } else { 0 },
                            result.draft_text,
                            result.confidence,
                            result.urgency.as_deref().unwrap_or("high"),
                            if result.needs_reply { 1 } else { 0 },
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

    // If the refresh token is empty or still holds the DB placeholder (meaning
    // keychain retrieval returned nothing), don't attempt a refresh — just use
    // the current access token and let the 401 handler surface the issue cleanly.
    if creds.refresh_token.is_empty()
        || creds.refresh_token == "[KEYCHAIN_ENCLAVE]"
        || creds.refresh_token == "[KEYCHAIN_ENCLAVE_ACCESS]"
    {
        eprintln!(
            "[Gmail Token] Refresh token unavailable for {} (keychain may be locked). Using existing access token.",
            creds.email.as_deref().unwrap_or("unknown")
        );
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

        eprintln!(
            "[Gmail Token] Refresh failed for {} — Google error: {} | body: {}",
            creds.email.as_deref().unwrap_or("unknown"),
            google_error,
            body
        );

        // Return an error but NEVER delete credentials on a refresh failure.
        // The credential row may be valid — the failure could be due to:
        //   - A transient network issue
        //   - Keychain being unavailable (unsigned dev build) → empty refresh token → invalid_grant
        //   - Wrong client secret stored
        // Deleting credentials on any of these would permanently log the user out
        // when the fix is simply to re-run the OAuth flow. The user can disconnect
        // manually from Settings if they actually want to remove the account.
        eprintln!(
            "[Gmail Token] Keeping credentials for {} — user can re-auth from Channels if needed.",
            creds.email.as_deref().unwrap_or("unknown")
        );
        return Err(format!(
            "Gmail token refresh failed ({}). Please reconnect your Gmail account in Channels.",
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
