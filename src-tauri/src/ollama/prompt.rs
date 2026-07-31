const VOICE_CORPUS: &str = include_str!("corpus.txt");

pub fn get_system_prompt(
    recent_edits: &[crate::db::VoiceEdit],
    sender_history: &[crate::models::QueueItem],
) -> String {
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
        VOICE_CORPUS,
        edits_section,
        history_section
    )
}


