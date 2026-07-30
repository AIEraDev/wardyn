use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueueItem {
    pub id: String,
    pub source: String,     // "gmail" | "calendar"
    pub kind: String,       // "reply" | "deadline"
    pub sender: String,
    pub preview: String,
    pub draft_text: Option<String>,
    pub status: String,     // "pending" | "approved" | "edited" | "skipped" | "sent"
    pub flagged: bool,
    pub confidence: f64,
    pub created_at: String,
    pub updated_at: String,
}
