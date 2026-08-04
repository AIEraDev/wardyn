/// LaunchAgent installer for the Wardyn morning helper.
///
/// Installs a macOS LaunchAgent plist that runs `wardyn_morning` at 8:00 AM
/// every day. The helper fires pending reminders and sends a morning brief
/// notification even when the main Wardyn app is not open.
///
/// No app signing required — LaunchAgents run as the current user.

use std::path::PathBuf;

const PLIST_LABEL: &str = "com.wardyn.desktop.morning";
const HOUR: u32 = 8;   // 8 AM
const MINUTE: u32 = 0;

// ─── Paths ────────────────────────────────────────────────────────────────────

fn launch_agents_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join("Library").join("LaunchAgents")
}

fn plist_path() -> PathBuf {
    launch_agents_dir().join(format!("{}.plist", PLIST_LABEL))
}

/// Resolves the path to the wardyn_morning binary.
/// In a dev build it sits next to wardyn-desktop in target/debug/.
/// In a release / .app bundle it sits next to the main executable.
fn helper_binary_path(app_exe: &str) -> PathBuf {
    let exe_path = std::path::Path::new(app_exe);
    let dir = exe_path.parent().unwrap_or(std::path::Path::new("."));
    dir.join("wardyn_morning")
}

// ─── Plist generation ─────────────────────────────────────────────────────────

fn plist_content(binary_path: &str, log_dir: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>

    <key>ProgramArguments</key>
    <array>
        <string>{binary}</string>
    </array>

    <!-- Fire every day at {hour}:{minute:02} AM -->
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>{hour}</integer>
        <key>Minute</key>
        <integer>{minute}</integer>
    </dict>

    <!-- Also fire immediately if the scheduled time was missed (e.g. laptop was asleep) -->
    <key>RunAtLoad</key>
    <false/>

    <key>StandardOutPath</key>
    <string>{log_dir}/wardyn_morning.log</string>
    <key>StandardErrorPath</key>
    <string>{log_dir}/wardyn_morning.log</string>

    <!-- Restart automatically if the helper crashes -->
    <key>KeepAlive</key>
    <false/>

    <key>ThrottleInterval</key>
    <integer>3600</integer>
</dict>
</plist>
"#,
        label   = PLIST_LABEL,
        binary  = binary_path,
        hour    = HOUR,
        minute  = MINUTE,
        log_dir = log_dir,
    )
}

// ─── Install / Update ─────────────────────────────────────────────────────────

/// Install or update the LaunchAgent.
/// Call this once on app startup — it is idempotent.
/// Returns Ok(true) if newly installed, Ok(false) if already up to date.
pub fn install_or_update(app_exe: &str) -> Result<bool, String> {
    let binary = helper_binary_path(app_exe);

    // Helper binary must exist — skip silently in dev if it hasn't been built yet
    if !binary.exists() {
        eprintln!(
            "[MorningHelper] Binary not found at {:?} — LaunchAgent not installed. \
             Run `cargo build --bin wardyn_morning` to build it.",
            binary
        );
        return Ok(false);
    }

    let binary_str = binary
        .to_str()
        .ok_or("Binary path is not valid UTF-8")?
        .to_string();

    // Log dir: ~/Library/Logs/Wardyn/
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let log_dir = PathBuf::from(&home).join("Library").join("Logs").join("Wardyn");
    std::fs::create_dir_all(&log_dir).ok();
    let log_dir_str = log_dir.to_str().unwrap_or("/tmp").to_string();

    let new_plist = plist_content(&binary_str, &log_dir_str);
    let plist = plist_path();

    // Read existing plist to detect if an update is needed
    let existing = std::fs::read_to_string(&plist).unwrap_or_default();
    if existing == new_plist {
        return Ok(false); // already up to date
    }

    // Write the plist
    std::fs::create_dir_all(launch_agents_dir())
        .map_err(|e| format!("Cannot create LaunchAgents dir: {}", e))?;
    std::fs::write(&plist, &new_plist)
        .map_err(|e| format!("Cannot write plist: {}", e))?;

    // Unload old version (ignore error — may not be loaded yet)
    std::process::Command::new("launchctl")
        .args(["unload", plist.to_str().unwrap_or("")])
        .output()
        .ok();

    // Load new version
    let load = std::process::Command::new("launchctl")
        .args(["load", plist.to_str().unwrap_or("")])
        .output()
        .map_err(|e| format!("launchctl load failed: {}", e))?;

    if load.status.success() {
        eprintln!(
            "[MorningHelper] LaunchAgent installed — will run daily at {:02}:{:02} AM",
            HOUR, MINUTE
        );
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&load.stderr);
        Err(format!("launchctl load error: {}", stderr))
    }
}

/// Remove the LaunchAgent (called when user disables morning notifications in Settings).
pub fn uninstall() -> Result<(), String> {
    let plist = plist_path();
    if plist.exists() {
        std::process::Command::new("launchctl")
            .args(["unload", plist.to_str().unwrap_or("")])
            .output()
            .ok();
        std::fs::remove_file(&plist)
            .map_err(|e| format!("Cannot remove plist: {}", e))?;
        eprintln!("[MorningHelper] LaunchAgent removed.");
    }
    Ok(())
}

/// Returns true if the LaunchAgent plist exists and is loaded.
pub fn is_installed() -> bool {
    plist_path().exists()
}
