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
    // Naive: look for YYYY-MM-DD pattern
    for i in 0..text.len().saturating_sub(9) {
        let slice = &text[i..i + 10];
        if slice.len() == 10
            && slice.chars().nth(4) == Some('-')
            && slice.chars().nth(7) == Some('-')
            && slice[..4].chars().all(|c| c.is_ascii_digit())
            && slice[5..7].chars().all(|c| c.is_ascii_digit())
            && slice[8..10].chars().all(|c| c.is_ascii_digit())
        {
            return Some(slice.to_string());
        }
    }
    None
}

fn extract_slashed_date(text: &str, current_year: u64) -> Option<String> {
    // Look for DD/MM/YYYY or MM/DD/YYYY
    for i in 0..text.len().saturating_sub(9) {
        let slice = &text[i..i + 10];
        if slice.chars().nth(2) == Some('/') && slice.chars().nth(5) == Some('/') {
            let p1: u32 = slice[..2].parse().ok()?;
            let p2: u32 = slice[3..5].parse().ok()?;
            let yr: u32 = slice[6..10].parse().ok()?;
            if yr < 2020 || yr > 2035 { continue; }
            // Disambiguate: if p1 > 12 it must be DD/MM
            let (day, month) = if p1 > 12 { (p1, p2) } else { (p2, p1) };
            if month >= 1 && month <= 12 && day >= 1 && day <= 31 {
                return Some(format!("{:04}-{:02}-{:02}", yr, month, day));
            }
        }
    }
    // Also try D/M/YY
    let _ = current_year; // used in future enhancement
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
    let subject = if subject.len() > 70 { &subject[..67] } else { subject };

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
