use crate::models::QueueItem;

#[derive(Debug, Clone)]
pub struct ExtractedTask {
    pub title: String,
    pub priority: String,
    pub due_date: Option<String>,
}

const ACTION_PHRASES: &[&str] = &[
    "action required",
    "please review",
    "please confirm",
    "follow up",
    "follow-up",
    "deadline",
    "due by",
    "by eod",
    "by end of",
    "need your",
    "waiting for",
    "can you send",
    "please send",
    "please provide",
    "urgent",
    "asap",
    "todo",
    "to-do",
    "task:",
];

pub fn extract_tasks_from_email(item: &QueueItem) -> Vec<ExtractedTask> {
    let preview_lower = item.preview.to_lowercase();
    let sender_short = item.sender.split('<').next().unwrap_or(&item.sender).trim();

    let has_action = ACTION_PHRASES.iter().any(|p| preview_lower.contains(p));
    let is_flagged = item.flagged;

    if !has_action && !is_flagged {
        return vec![];
    }

    let subject = extract_subject(&item.preview);
    let title = if subject.len() > 8 {
        format!("Follow up: {}", subject)
    } else {
        format!("Follow up with {}", sender_short)
    };

    let priority = if is_flagged || preview_lower.contains("urgent") || preview_lower.contains("deadline") {
        "high"
    } else if preview_lower.contains("please") || preview_lower.contains("review") {
        "medium"
    } else {
        "low"
    };

    vec![ExtractedTask {
        title,
        priority: priority.into(),
        due_date: None,
    }]
}

fn extract_subject(preview: &str) -> String {
    let stripped = preview
        .trim_start_matches('[')
        .split(']')
        .nth(1)
        .unwrap_or(preview)
        .trim();

    // Helper: truncate at a char boundary — never byte-index into Unicode strings
    fn truncate_chars(s: &str, max_chars: usize) -> String {
        if s.chars().count() <= max_chars {
            s.to_string()
        } else {
            let end = s.char_indices().nth(max_chars).map(|(i, _)| i).unwrap_or(s.len());
            format!("{}...", &s[..end])
        }
    }

    if let Some((subject, _)) = stripped.split_once(':') {
        let clean = subject.trim();
        truncate_chars(clean, 57)
    } else {
        truncate_chars(stripped, 57)
    }
}
