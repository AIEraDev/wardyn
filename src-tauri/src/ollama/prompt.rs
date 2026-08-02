// Static seed corpus — used as a baseline when no real sent emails exist yet.
// As the user approves replies, their actual sent drafts accumulate in voice_edits
// and queue_items (status='sent'), progressively replacing this seed.
const SEED_CORPUS: &str = include_str!("corpus.txt");

/// Builds the email classification + drafting system prompt.
///
/// Voice corpus is now dynamic:
/// 1. Pull up to 15 most recent approved/sent draft_texts from queue_items — these
///    are the user's actual sent replies, the highest-quality style signal.
/// 2. Supplement with the static seed corpus if fewer than 5 real samples exist.
/// 3. Append recent voice edits (original → preferred) so the model learns
///    corrections in real time.
/// 4. Append sender thread history for continuity.
pub fn get_system_prompt(
    recent_edits: &[crate::db::VoiceEdit],
    sender_history: &[crate::models::QueueItem],
) -> String {
    get_system_prompt_with_corpus(recent_edits, sender_history, None)
}

pub fn get_system_prompt_with_corpus(
    recent_edits: &[crate::db::VoiceEdit],
    sender_history: &[crate::models::QueueItem],
    dynamic_corpus: Option<&str>,
) -> String {
    let corpus = dynamic_corpus.unwrap_or(SEED_CORPUS);

    let mut edits_section = String::new();
    if !recent_edits.is_empty() {
        edits_section.push_str("\n\nRECENT USER EDIT PREFERENCES & CORRECTIONS (Prefer user's revised phrasing):\n");
        for edit in recent_edits {
            edits_section.push_str(&format!(
                "- Initial Candidate Draft: \"{}\"\n  User Preferred Revision: \"{}\"\n",
                edit.original_draft, edit.edited_draft
            ));
        }
    }

    let mut history_section = String::new();
    if !sender_history.is_empty() {
        history_section.push_str("\n\nHISTORICAL THREAD CONTEXT (Past interactions with this sender):\n");
        for item in sender_history {
            let date_str = if item.created_at.len() >= 10 { &item.created_at[..10] } else { "recent" };
            history_section.push_str(&format!(
                "- [{}] Sender: {} | Preview: \"{}\"\n",
                date_str, item.sender, item.preview
            ));
        }
    }

    format!(
        r#"You are Wardyn, an intelligent executive assistant writing draft responses on behalf of the user.

USER WRITING STYLE & FEW-SHOT CORPUS:
Tone: Concise, professional, warm, and direct.
Below are authentic past sent messages from the user. Match this exact style, sentence structure, and brevity:

---
{}
---{}{}

YOUR TASK:
Analyze the incoming message sender and preview. Output ONLY a valid JSON object with the following schema:
{{
  "flagged": true/false,     // Set to true ONLY if sender or subject is related to UK Visas, UKVI, Home Office, or immigration documents.
  "urgency": "high",         // Use "high" for direct inquiries, action items, or Visa/UKVI emails. Use "low" for newsletters, social updates, and promotional items.
  "draft_text": "...",       // Suggested reply draft matching the corpus and preference corrections above. If confidence < 0.6, set this to null.
  "confidence": 0.95         // Floating point between 0.0 and 1.0 indicating classification & drafting confidence.
}}

Do not include any explanation or markdown formatting outside the JSON object."#,
        corpus,
        edits_section,
        history_section
    )
}

/// Builds a dynamic voice corpus string from the user's actual sent replies.
/// Call this once per session and cache the result.
pub fn build_dynamic_corpus(conn: &rusqlite::Connection) -> String {
    // Pull sent drafts ordered by quality:
    // 1. draft_edit_distance = 0 (approved as-is — best style signal)
    // 2. draft_edit_distance IS NULL (no tracking yet — assume acceptable)
    // 3. low edit distance (minor tweaks)
    // Exclude heavily rewritten drafts (edit_distance > 100) — they don't represent the AI's style
    let sent_drafts: Vec<String> = {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT draft_text, sender, COALESCE(draft_edit_distance, 0) as dist
             FROM queue_items
             WHERE status IN ('sent', 'approved') AND draft_text IS NOT NULL
             AND LENGTH(draft_text) > 20
             AND (draft_edit_distance IS NULL OR draft_edit_distance <= 100)
             ORDER BY COALESCE(draft_edit_distance, 99) ASC, updated_at DESC
             LIMIT 15",
        ) {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            }) {
                rows.filter_map(|r| r.ok())
                    .enumerate()
                    .map(|(i, (draft, sender, dist))| {
                        let quality_tag = if dist == 0 { " ✓" } else { "" };
                        format!(
                            "Sent Reply {}{} (to: {}):\n\"{}\"",
                            i + 1,
                            quality_tag,
                            sender.split('<').last().unwrap_or(&sender)
                                  .split('@').next().unwrap_or("contact"),
                            draft.trim()
                        )
                    })
                    .collect()
            } else { vec![] }
        } else { vec![] }
    };

    if sent_drafts.len() >= 5 {
        sent_drafts.join("\n\n")
    } else if !sent_drafts.is_empty() {
        format!("{}\n\n{}", sent_drafts.join("\n\n"), SEED_CORPUS)
    } else {
        SEED_CORPUS.to_string()
    }
}
