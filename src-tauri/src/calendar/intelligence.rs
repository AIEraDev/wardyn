/// Smart calendar intelligence for Wardyn.
///
/// For every incoming email item (after AI triage) this module decides:
///   1. Should it be saved to the calendar?
///   2. What date/time does it refer to?
///   3. What recurrence cadence is appropriate?
///   4. What's the ideal reminder lead time?
///
/// Decision is rule-based (fast, no Ollama needed) with an optional Ollama
/// enhancement pass for ambiguous cases.

use crate::models::QueueItem;
use crate::db;

// ─── Output types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CalendarIntent {
    /// Whether this email warrants a calendar entry
    pub should_add_to_calendar: bool,
    /// The resolved event date (ISO-8601). None = couldn't determine a date.
    pub event_date: Option<String>,
    /// Concise event title for the calendar
    pub event_title: String,
    /// Reminder recurrence: "none" | "daily" | "every_2_days" | "weekly" | "weekdays"
    pub recurrence_rule: String,
    /// Minutes before event to fire the first reminder (15 / 60 / 1440 / 2880)
    pub reminder_lead_minutes: i64,
    /// Human-readable reason for this decision
    pub reason: String,
}

// ─── Category detection ───────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
enum EmailCategory {
    VisaImmigration,      // visa, UKVI, Home Office, BRP, biometric
    Appointment,          // doctor, dentist, meeting, interview, call scheduled
    Deadline,             // submit by, due by, expires, cut-off, last date
    Payment,              // invoice due, payment reminder, renew subscription
    Recurring,            // weekly standup, daily scrum, monthly review
    Event,                // conference, webinar, workshop, ceremony
    FollowUp,             // follow up in N days, check back
    None,
}

fn detect_category(sender: &str, preview: &str) -> EmailCategory {
    let s = sender.to_lowercase();
    let p = preview.to_lowercase();

    // Visa / immigration — highest priority
    if s.contains("visa") || s.contains("ukvi") || s.contains("home office")
        || s.contains("immigration") || s.contains("gov.uk")
        || p.contains("visa") || p.contains("ukvi") || p.contains("biometric")
        || p.contains("brp") || p.contains("immigration") || p.contains("global talent")
        || p.contains("tier 2") || p.contains("skilled worker") || p.contains("leave to remain")
    {
        return EmailCategory::VisaImmigration;
    }

    // Payment / subscription reminders
    if p.contains("invoice") || p.contains("payment due") || p.contains("payment reminder")
        || p.contains("renew") || p.contains("subscription") || p.contains("overdue")
        || p.contains("bill is ready") || p.contains("amount due")
    {
        return EmailCategory::Payment;
    }

    // Hard deadlines
    if p.contains("deadline") || p.contains("due by") || p.contains("due date")
        || p.contains("submit by") || p.contains("expires on") || p.contains("expiry")
        || p.contains("last date") || p.contains("cut-off") || p.contains("closing date")
        || p.contains("application closes") || p.contains("apply by")
    {
        return EmailCategory::Deadline;
    }

    // Appointments / meetings
    if p.contains("appointment") || p.contains("interview") || p.contains("scheduled")
        || p.contains("booking confirmed") || p.contains("your meeting")
        || p.contains("calendar invite") || p.contains("zoom") || p.contains("teams meeting")
        || p.contains("google meet") || p.contains("call with") || p.contains("speak with")
    {
        return EmailCategory::Appointment;
    }

    // Events
    if p.contains("conference") || p.contains("webinar") || p.contains("workshop")
        || p.contains("ceremony") || p.contains("event ticket") || p.contains("you're invited")
        || p.contains("register for") || p.contains("join us")
    {
        return EmailCategory::Event;
    }

    // Recurring patterns
    if p.contains("weekly") || p.contains("daily") || p.contains("every week")
        || p.contains("every day") || p.contains("standup") || p.contains("scrum")
        || p.contains("monthly") || p.contains("fortnightly")
    {
        return EmailCategory::Recurring;
    }

    // Follow-up
    if p.contains("follow up") || p.contains("follow-up") || p.contains("checking in")
        || p.contains("get back to") || p.contains("circle back")
    {
        return EmailCategory::FollowUp;
    }

    EmailCategory::None
}

// ─── Date extraction ──────────────────────────────────────────────────────────

/// Tries to extract a meaningful date from the email preview text.
/// Returns an ISO-8601 date string (YYYY-MM-DD) or None.
pub fn extract_date_from_text(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let today_days = now_secs / 86400;
    let (today_y, today_m, today_d) = db::days_to_ymd(today_days as u64);

    // ── Relative: "today", "tonight", "tomorrow", "this week", etc. ──────────
    if lower.contains("today") || lower.contains("tonight") {
        return Some(format!("{:04}-{:02}-{:02}", today_y, today_m, today_d));
    }
    if lower.contains("tomorrow") {
        let t = secs_to_ymd(now_secs + 86400);
        return Some(t);
    }
    if lower.contains("day after tomorrow") {
        return Some(secs_to_ymd(now_secs + 2 * 86400));
    }
    if lower.contains("this week") {
        return Some(secs_to_ymd(now_secs + 3 * 86400));
    }
    if lower.contains("next week") {
        return Some(secs_to_ymd(now_secs + 7 * 86400));
    }
    if lower.contains("next month") {
        return Some(secs_to_ymd(now_secs + 30 * 86400));
    }

    // ── "in N days / weeks / months" ─────────────────────────────────────────
    if let Some(n) = extract_number_before(&lower, " day") {
        return Some(secs_to_ymd(now_secs + n as i64 * 86400));
    }
    if let Some(n) = extract_number_before(&lower, " week") {
        return Some(secs_to_ymd(now_secs + n as i64 * 7 * 86400));
    }
    if let Some(n) = extract_number_before(&lower, " month") {
        return Some(secs_to_ymd(now_secs + n as i64 * 30 * 86400));
    }

    // ── Named weekdays ────────────────────────────────────────────────────────
    // current day of week: 0 = Thursday 1970-01-01
    let today_dow = (today_days + 3) % 7; // 0=Mon,1=Tue,...,6=Sun
    let weekdays = [
        ("monday", 0i64), ("tuesday", 1), ("wednesday", 2), ("thursday", 3),
        ("friday", 4), ("saturday", 5), ("sunday", 6),
    ];
    for (name, dow) in &weekdays {
        if lower.contains(name) {
            let mut delta = dow - today_dow as i64;
            // "next friday" → always at least 7 days away if already past today
            if lower.contains(&format!("next {}", name)) {
                delta += 7;
            } else if delta <= 0 {
                delta += 7;
            }
            return Some(secs_to_ymd(now_secs + delta * 86400));
        }
    }

    // ── Month + day: "January 15", "15th January", "Jan 15", "15 Jan" ────────
    let months = [
        ("january",1),("february",2),("march",3),("april",4),("may",5),("june",6),
        ("july",7),("august",8),("september",9),("october",10),("november",11),("december",12),
        ("jan",1),("feb",2),("mar",3),("apr",4),("jun",6),("jul",7),("aug",8),
        ("sep",9),("oct",10),("nov",11),("dec",12),
    ];
    for (name, month_num) in &months {
        if let Some(pos) = lower.find(name) {
            // Try "Month Day" pattern
            let after = &lower[pos + name.len()..].trim_start_matches(|c: char| !c.is_ascii_digit());
            if let Some(day) = parse_leading_number(after) {
                if day >= 1 && day <= 31 {
                    let year = if *month_num < today_m as u32 { today_y + 1 } else { today_y };
                    return Some(format!("{:04}-{:02}-{:02}", year, month_num, day));
                }
            }
            // Try "Day Month" pattern: look backwards from position
            if pos > 0 {
                let before = &lower[..pos];
                let digits: String = before.chars().rev()
                    .take_while(|c| c.is_ascii_digit() || *c == ' ' || *c == 't' || *c == 'h' || *c == 's' || *c == 'r' || *c == 'd' || *c == 'n')
                    .collect::<String>().chars().rev().collect();
                if let Some(day) = parse_leading_number(digits.trim()) {
                    if day >= 1 && day <= 31 {
                        let year = if *month_num < today_m as u32 { today_y + 1 } else { today_y };
                        return Some(format!("{:04}-{:02}-{:02}", year, month_num, day));
                    }
                }
            }
        }
    }

    // ── ISO / numeric: "2026-08-15", "15/08/2026", "08/15/2026" ─────────────
    // YYYY-MM-DD
    if let Some(iso) = extract_iso_date(&lower) {
        return Some(iso);
    }
    // DD/MM/YYYY or MM/DD/YYYY
    if let Some(slashed) = extract_slashed_date(&lower, today_y) {
        return Some(slashed);
    }

    None
}

fn secs_to_ymd(secs: i64) -> String {
    let days = (secs / 86400) as u64;
    let (y, m, d) = db::days_to_ymd(days);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

fn extract_number_before(text: &str, unit: &str) -> Option<u32> {
    if let Some(pos) = text.find(unit) {
        // Walk backwards to find digits
        let before = &text[..pos];
        let s: String = before.chars().rev()
            .take_while(|c| c.is_ascii_digit() || *c == ' ')
            .collect::<String>().chars().rev().collect();
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return trimmed.parse().ok();
        }
        // Also handle words: "three", "four" etc
        let words = [("one",1u32),("two",2),("three",3),("four",4),("five",5),
                     ("six",6),("seven",7),("eight",8),("nine",9),("ten",10),
                     ("fourteen",14),("thirty",30)];
        for (word, n) in &words {
            if before.trim_end().ends_with(word) { return Some(*n); }
        }
    }
    None
}

fn parse_leading_number(s: &str) -> Option<u32> {
    let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

fn extract_iso_date(text: &str) -> Option<String> {
    // Walk through valid char-boundary positions looking for YYYY-MM-DD
    let bytes = text.as_bytes();
    let len = bytes.len();
    if len < 10 { return None; }
    for i in 0..=(len - 10) {
        // Only attempt a slice at a UTF-8 char boundary
        if !text.is_char_boundary(i) || !text.is_char_boundary(i + 10) {
            continue;
        }
        let slice = &text[i..i + 10];
        // Must match NNNN-NN-NN where N is ASCII digit
        let b = slice.as_bytes();
        if b[4] == b'-' && b[7] == b'-'
            && b[..4].iter().all(|c| c.is_ascii_digit())
            && b[5..7].iter().all(|c| c.is_ascii_digit())
            && b[8..10].iter().all(|c| c.is_ascii_digit())
        {
            return Some(slice.to_string());
        }
    }
    None
}

fn extract_slashed_date(text: &str, current_year: u64) -> Option<String> {
    // Look for DD/MM/YYYY or MM/DD/YYYY — all chars are ASCII so byte slicing is safe
    // after we verify we're on a char boundary.
    let bytes = text.as_bytes();
    let len = bytes.len();
    if len < 10 { let _ = current_year; return None; }
    for i in 0..=(len - 10) {
        if !text.is_char_boundary(i) || !text.is_char_boundary(i + 10) {
            continue;
        }
        let slice = &text[i..i + 10];
        let b = slice.as_bytes();
        // Require NN/NN/NNNN pattern (all digits except separators)
        if b[2] != b'/' || b[5] != b'/' { continue; }
        if !b[..2].iter().all(|c| c.is_ascii_digit()) { continue; }
        if !b[3..5].iter().all(|c| c.is_ascii_digit()) { continue; }
        if !b[6..10].iter().all(|c| c.is_ascii_digit()) { continue; }
        let p1: u32 = match slice[..2].parse() { Ok(n) => n, Err(_) => continue };
        let p2: u32 = match slice[3..5].parse() { Ok(n) => n, Err(_) => continue };
        let yr: u32 = match slice[6..10].parse() { Ok(n) => n, Err(_) => continue };
        if yr < 2020 || yr > 2035 { continue; }
        let (day, month) = if p1 > 12 { (p1, p2) } else { (p2, p1) };
        if month >= 1 && month <= 12 && day >= 1 && day <= 31 {
            return Some(format!("{:04}-{:02}-{:02}", yr, month, day));
        }
    }
    let _ = current_year;
    None
}

// ─── Recurrence logic ─────────────────────────────────────────────────────────

fn determine_recurrence(category: &EmailCategory, preview: &str) -> &'static str {
    let p = preview.to_lowercase();
    match category {
        EmailCategory::Recurring => {
            if p.contains("daily") || p.contains("every day") || p.contains("standup") { "daily" }
            else if p.contains("weekday") { "weekdays" }
            else if p.contains("every 2 day") || p.contains("every two day") { "every_2_days" }
            else { "weekly" }
        }
        EmailCategory::Payment => {
            // Most payment reminders are monthly; but subscription renewals repeat
            if p.contains("monthly") || p.contains("per month") { "none" } // single event
            else { "none" }
        }
        EmailCategory::FollowUp => {
            // "follow up in 2 days" → every_2_days; default → every_2_days until resolved
            if p.contains("daily") || p.contains("every day") { "daily" }
            else if p.contains("weekly") || p.contains("every week") { "weekly" }
            else { "every_2_days" }
        }
        EmailCategory::VisaImmigration => {
            // High stakes — remind daily until the event date
            "daily"
        }
        EmailCategory::Deadline => {
            // Remind daily as deadline approaches
            "daily"
        }
        _ => "none",
    }
}

fn determine_lead_minutes(category: &EmailCategory) -> i64 {
    match category {
        EmailCategory::VisaImmigration => 1440, // 1 day before
        EmailCategory::Deadline        => 1440,
        EmailCategory::Payment         => 1440,
        EmailCategory::Appointment     => 60,   // 1 hour before
        EmailCategory::Event           => 60,
        EmailCategory::Recurring       => 15,   // 15 min before
        EmailCategory::FollowUp        => 0,    // fire at the reminder time itself
        EmailCategory::None            => 15,
    }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/// Analyse an email item and return a `CalendarIntent`.
/// This is synchronous and fast — no Ollama call needed.
pub fn analyse_email(item: &QueueItem) -> CalendarIntent {
    let category = detect_category(&item.sender, &item.preview);

    // Events that never go to calendar
    if category == EmailCategory::None && !item.flagged {
        return CalendarIntent {
            should_add_to_calendar: false,
            event_date: None,
            event_title: String::new(),
            recurrence_rule: "none".into(),
            reminder_lead_minutes: 15,
            reason: "No actionable date or deadline detected.".into(),
        };
    }

    let event_date = extract_date_from_text(&item.preview)
        .or_else(|| extract_date_from_text(&item.sender));

    let event_title = build_event_title(&category, item);
    let recurrence  = determine_recurrence(&category, &item.preview);
    let lead_mins   = determine_lead_minutes(&category);

    let reason = match &category {
        EmailCategory::VisaImmigration => "Visa/immigration content — daily reminders until event.".into(),
        EmailCategory::Deadline        => format!("Deadline detected — daily reminders{}.", event_date.as_deref().map(|d| format!(" until {}", d)).unwrap_or_default()),
        EmailCategory::Payment         => "Payment/invoice due — reminder set.".into(),
        EmailCategory::Appointment     => "Appointment/meeting detected.".into(),
        EmailCategory::Event           => "Event/conference detected.".into(),
        EmailCategory::Recurring       => format!("Recurring {} pattern.", recurrence),
        EmailCategory::FollowUp        => "Follow-up needed — every 2 days until resolved.".into(),
        EmailCategory::None            => "Flagged email — added to calendar for tracking.".into(),
    };

    CalendarIntent {
        should_add_to_calendar: true,
        event_date,
        event_title,
        recurrence_rule: recurrence.into(),
        reminder_lead_minutes: lead_mins,
        reason,
    }
}

fn build_event_title(category: &EmailCategory, item: &QueueItem) -> String {
    let preview = &item.preview;
    // Strip category prefix [PRIMARY], [UPDATES] etc.
    let stripped = preview
        .trim_start_matches('[')
        .split(']')
        .nth(1)
        .unwrap_or(preview)
        .trim();

    // Use subject (before first ":") as the title
    let subject = stripped.split(':').next().unwrap_or(stripped).trim();
    // Truncate at a char boundary — never byte-index into a Unicode string
    let subject = if subject.chars().count() > 70 {
        let end = subject.char_indices().nth(67).map(|(i, _)| i).unwrap_or(subject.len());
        &subject[..end]
    } else {
        subject
    };

    let prefix = match category {
        EmailCategory::VisaImmigration => "🛂 Visa:",
        EmailCategory::Deadline        => "⏰ Deadline:",
        EmailCategory::Payment         => "💳 Payment:",
        EmailCategory::Appointment     => "📅 Appointment:",
        EmailCategory::Event           => "🎯 Event:",
        EmailCategory::Recurring       => "🔁 Recurring:",
        EmailCategory::FollowUp        => "↩ Follow-up:",
        EmailCategory::None            => "📌 Flagged:",
    };

    format!("{} {}", prefix, subject)
}

/// Compute the next reminder fire time based on the current time and recurrence rule.
/// Returns ISO-8601 UTC string or None if recurrence is "none".
pub fn next_reminder_date(recurrence_rule: &str, from_secs: i64) -> Option<String> {
    let delta_secs: i64 = match recurrence_rule {
        "daily"       => 86400,
        "every_2_days" => 2 * 86400,
        "weekly"      => 7 * 86400,
        "weekdays"    => {
            // Skip to next weekday
            let dow = ((from_secs / 86400) + 3) % 7; // 0=Mon..6=Sun
            match dow {
                4 => 3 * 86400, // Friday → Monday
                5 => 2 * 86400, // Saturday → Monday
                _ => 86400,
            }
        }
        _ => return None,
    };
    let next_secs = from_secs + delta_secs;
    let days = (next_secs / 86400) as u64;
    let (y, m, d) = db::days_to_ymd(days);
    let h = (next_secs / 3600) % 24;
    let mn = (next_secs / 60) % 60;
    let s = next_secs % 60;
    Some(format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, d, h, mn, s))
}

// ─── Memory & Project Intent Analysis ────────────────────────────────────────
//
// These functions mirror analyse_email() but work on the user's own stored
// data — life events, tasks, knowledge items, and decisions — rather than
// incoming emails. Together they form the "memories → calendar" pipeline.

/// A source-agnostic calendar intent produced from non-email data.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MemoryCalendarIntent {
    /// Unique source ID used as the calendar_events.queue_item_id dedup key
    pub source_id:   String,
    /// "life_event" | "task" | "knowledge" | "decision" | "project"
    pub source_type: String,
    pub event_title:           String,
    pub event_date:            Option<String>,
    pub recurrence_rule:       String,
    pub reminder_lead_minutes: i64,
    pub reason:                String,
}

// ── Life Events ───────────────────────────────────────────────────────────────

/// Maps a `life_events` row into a calendar intent.
/// `intent` is one of: event_prep | study_plan | project_kickoff |
///                     habit_goal | deadline | travel
pub fn analyse_life_event(
    id: &str,
    title: &str,
    intent: &str,
    event_date: Option<&str>,
) -> Option<MemoryCalendarIntent> {
    // Only actionable intents go to calendar
    let (prefix, recurrence, lead_mins, reason): (&str, &str, i64, &str) = match intent {
        "deadline"        => ("⏰ Deadline:", "daily",  1440, "Life-event deadline — daily reminders until date"),
        "event_prep"      => ("📅 Prep:",     "daily",   480, "Preparation period starts — daily reminders"),
        "study_plan"      => ("📚 Study:",    "weekdays", 60, "Study session — weekday reminders"),
        "project_kickoff" => ("🚀 Kickoff:",  "none",    60,  "Project kickoff event"),
        "travel"          => ("✈️ Travel:",   "daily",  1440, "Travel event — daily reminders leading up"),
        "habit_goal"      => ("🎯 Goal:",     "daily",     0, "Daily habit goal reminder"),
        _ => return None,
    };

    let date = event_date
        .map(|d| d.to_string())
        .or_else(|| None); // life_events already store a clean date

    let title_trunc = if title.chars().count() > 60 {
        let end = title.char_indices().nth(57).map(|(i, _)| i).unwrap_or(title.len());
        format!("{}...", &title[..end])
    } else {
        title.to_string()
    };

    Some(MemoryCalendarIntent {
        source_id:             format!("life_{}", id),
        source_type:           "life_event".into(),
        event_title:           format!("{} {}", prefix, title_trunc),
        event_date:            date,
        recurrence_rule:       recurrence.into(),
        reminder_lead_minutes: lead_mins,
        reason:                reason.into(),
    })
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

/// Maps a `tasks` row with a due_date into a calendar intent.
pub fn analyse_task(
    id: &str,
    title: &str,
    priority: &str,
    due_date: Option<&str>,
) -> Option<MemoryCalendarIntent> {
    // Only tasks with a due date get a calendar event
    let date = due_date?.to_string();

    // Skip if already past
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    if let Some(event_secs) = db::iso_to_unix_secs(&date) {
        if event_secs < now_secs - 86400 { return None; } // more than 1 day past
    }

    let (recurrence, lead_mins) = match priority {
        "high"   => ("daily", 1440i64), // remind daily, 1 day before
        "medium" => ("none",   480i64), // 8 hours before
        _        => ("none",    60i64), // 1 hour before
    };

    let reason = format!("{}-priority task due — added to calendar", priority);

    let title_trunc = if title.chars().count() > 60 {
        let end = title.char_indices().nth(57).map(|(i, _)| i).unwrap_or(title.len());
        format!("{}...", &title[..end])
    } else {
        title.to_string()
    };

    Some(MemoryCalendarIntent {
        source_id:             format!("task_{}", id),
        source_type:           "task".into(),
        event_title:           format!("✅ Task: {}", title_trunc),
        event_date:            Some(date),
        recurrence_rule:       recurrence.into(),
        reminder_lead_minutes: lead_mins,
        reason,
    })
}

// ── Knowledge Items ───────────────────────────────────────────────────────────

/// Scans a knowledge item's content for embedded dates/deadlines and creates
/// a calendar intent if a future date is found.
pub fn analyse_knowledge_item(
    id: &str,
    content: &str,
    summary: Option<&str>,
    tags: &[String],
) -> Option<MemoryCalendarIntent> {
    // Only create events if the content mentions a deadline/date keyword
    let lower = content.to_lowercase();
    let has_temporal = lower.contains("deadline") || lower.contains("due by")
        || lower.contains("expires") || lower.contains("by ")
        || lower.contains("submit") || lower.contains("register by")
        || lower.contains("application") || lower.contains("exam")
        || lower.contains("certification") || lower.contains("renewal");

    if !has_temporal { return None; }

    // Try to extract a date from the content
    let event_date = extract_date_from_text(content)?;

    // Skip past dates
    let now_str = {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let d = (secs / 86400) as u64;
        let (y, m, dd) = db::days_to_ymd(d);
        format!("{:04}-{:02}-{:02}", y, m, dd)
    };
    if event_date < now_str { return None; }

    // Build a readable title from summary or first 50 chars of content
    let display = summary.unwrap_or(content);
    let title_trunc = if display.chars().count() > 55 {
        let end = display.char_indices().nth(52).map(|(i, _)| i).unwrap_or(display.len());
        format!("{}...", &display[..end])
    } else {
        display.to_string()
    };

    let tag_label = if !tags.is_empty() {
        format!(" [{}]", tags.first().map(|s| s.as_str()).unwrap_or(""))
    } else {
        String::new()
    };

    Some(MemoryCalendarIntent {
        source_id:             format!("mem_{}", id),
        source_type:           "knowledge".into(),
        event_title:           format!("🧠 Memory{}: {}", tag_label, title_trunc),
        event_date:            Some(event_date),
        recurrence_rule:       "daily".into(), // remind daily as the date approaches
        reminder_lead_minutes: 1440,
        reason:                "Knowledge item mentions a future deadline or date".into(),
    })
}

// ── Decisions ─────────────────────────────────────────────────────────────────

/// Creates a follow-up reminder for a decision if the rationale mentions
/// a review date or follow-up timeframe.
pub fn analyse_decision(
    id: &str,
    decision: &str,
    rationale: &str,
) -> Option<MemoryCalendarIntent> {
    let combined = format!("{} {}", decision, rationale);

    // Only schedule if rationale explicitly mentions a review/follow-up time
    let lower = combined.to_lowercase();
    let has_review = lower.contains("review") || lower.contains("follow up")
        || lower.contains("revisit") || lower.contains("check back")
        || lower.contains("in ") || lower.contains("by ");

    if !has_review { return None; }

    let event_date = extract_date_from_text(&combined)?;

    // Skip past dates
    let now_str = {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let d = (secs / 86400) as u64;
        let (y, m, dd) = db::days_to_ymd(d);
        format!("{:04}-{:02}-{:02}", y, m, dd)
    };
    if event_date < now_str { return None; }

    let decision_trunc = if decision.chars().count() > 50 {
        let end = decision.char_indices().nth(47).map(|(i, _)| i).unwrap_or(decision.len());
        format!("{}...", &decision[..end])
    } else {
        decision.to_string()
    };

    Some(MemoryCalendarIntent {
        source_id:             format!("dec_{}", id),
        source_type:           "decision".into(),
        event_title:           format!("🔄 Review: {}", decision_trunc),
        event_date:            Some(event_date),
        recurrence_rule:       "none".into(),
        reminder_lead_minutes: 60,
        reason:                "Decision rationale mentions a follow-up or review date".into(),
    })
}

// ── Projects ──────────────────────────────────────────────────────────────────

/// Creates a daily focus reminder for an active project.
/// No explicit deadline needed — fires every morning at 9 AM as a
/// "work on X today" nudge based on the daily target.
pub fn analyse_project_daily_focus(
    id: &str,
    name: &str,
    daily_target_minutes: i64,
    today_minutes: i64,
) -> Option<MemoryCalendarIntent> {
    // Skip if today's target is already met
    if today_minutes >= daily_target_minutes { return None; }
    if daily_target_minutes <= 0 { return None; }

    // Fire tomorrow morning (9 AM) as an all-day-style focus reminder
    let tomorrow_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64 + 86400;
    let d = (tomorrow_secs / 86400) as u64;
    let (y, m, dd) = db::days_to_ymd(d);
    let event_date = format!("{:04}-{:02}-{:02}", y, m, dd);

    let h = daily_target_minutes / 60;
    let min = daily_target_minutes % 60;
    let target_label = if h > 0 && min > 0 {
        format!("{}h {}m", h, min)
    } else if h > 0 {
        format!("{}h", h)
    } else {
        format!("{}m", min)
    };

    Some(MemoryCalendarIntent {
        source_id:             format!("proj_{}", id),
        source_type:           "project".into(),
        event_title:           format!("🏗️ Focus: {} ({})", name, target_label),
        event_date:            Some(event_date),
        recurrence_rule:       "weekdays".into(), // remind every weekday
        reminder_lead_minutes: 0, // fire at 9 AM on the day
        reason:                format!("Active project — {} daily target not yet met today", target_label),
    })
}
