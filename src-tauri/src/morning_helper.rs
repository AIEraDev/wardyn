/// LaunchAgent installer for the Wardyn morning helper.
///
/// Strategy A (externalBin): wardyn_morning is bundled inside
/// Wardyn.app/Contents/MacOS/ alongside the main executable.
/// Tauri handles the universal lipo merge via externalBin.
///
/// Path resolution: current_exe().parent() / wardyn_morning

use std::path::PathBuf;

const PLIST_LABEL: &str = "com.wardyn.morning";
const HOUR: u32 = 8;
const MINUTE: u32 = 0;

// ─── Paths ────────────────────────────────────────────────────────────────────

fn launch_agents_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join("Library").join("LaunchAgents")
}

fn plist_path() -> PathBuf {
    launch_agents_dir().join(format!("{}.plist", PLIST_LABEL))
}

/// Resolve the helper binary path at runtime.
/// In a bundled .app:  Wardyn.app/Contents/MacOS/wardyn_morning
/// In dev builds:      target/debug/wardyn_morning (next to wardyn-desktop)
fn resolve_helper_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let candidate = dir.join("wardyn_morning");
    if candidate.exists() { Some(candidate) } else { None }
}

/// DB path — same location the main app uses.
fn db_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("com.wardyn.desktop")
        .join("wardyn.db")
}

// ─── Plist ────────────────────────────────────────────────────────────────────

fn plist_content(binary: &str, db: &str, log_dir: &str) -> String {
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
        <string>--db-path</string>
        <string>{db}</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>{hour}</integer>
        <key>Minute</key>
        <integer>{minute}</integer>
    </dict>

    <key>RunAtLoad</key>
    <false/>

    <key>StandardOutPath</key>
    <string>{log_dir}/wardyn_morning.log</string>
    <key>StandardErrorPath</key>
    <string>{log_dir}/wardyn_morning.log</string>

    <key>KeepAlive</key>
    <false/>

    <key>ThrottleInterval</key>
    <integer>3600</integer>
</dict>
</plist>
"#,
        label   = PLIST_LABEL,
        binary  = binary,
        db      = db,
        hour    = HOUR,
        minute  = MINUTE,
        log_dir = log_dir,
    )
}

// ─── launchctl bootstrap / bootout ───────────────────────────────────────────

fn gui_target() -> String {
    let uid = unsafe { libc::getuid() };
    format!("gui/{}", uid)
}

fn launchctl_load(plist: &str) -> bool {
    // Modern launchctl (macOS 10.11+): bootstrap gui/$UID
    let gui = gui_target();
    let status = std::process::Command::new("launchctl")
        .args(["bootstrap", &gui, plist])
        .status();
    matches!(status, Ok(s) if s.success())
}

fn launchctl_unload(plist: &str) {
    let gui = gui_target();
    std::process::Command::new("launchctl")
        .args(["bootout", &gui, plist])
        .output()
        .ok();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/// Install or update the LaunchAgent. Idempotent — safe to call on every launch.
pub fn install_or_update() -> Result<bool, String> {
    let helper = match resolve_helper_path() {
        Some(p) => p,
        None => {
            eprintln!(
                "[MorningHelper] wardyn_morning binary not found next to main executable. \
                 Run `cargo build --bin wardyn_morning` to build it."
            );
            return Ok(false);
        }
    };

    let binary_str = helper.to_str()
        .ok_or("Helper path is not valid UTF-8")?
        .to_string();

    let db_str = db_path().to_str()
        .ok_or("DB path is not valid UTF-8")?
        .to_string();

    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let log_dir = PathBuf::from(&home).join("Library").join("Logs").join("Wardyn");
    std::fs::create_dir_all(&log_dir).ok();
    let log_dir_str = log_dir.to_str().unwrap_or("/tmp").to_string();

    let new_plist = plist_content(&binary_str, &db_str, &log_dir_str);
    let plist = plist_path();

    let existing = std::fs::read_to_string(&plist).unwrap_or_default();
    if existing == new_plist {
        return Ok(false); // already current
    }

    std::fs::create_dir_all(launch_agents_dir())
        .map_err(|e| format!("Cannot create LaunchAgents dir: {}", e))?;
    std::fs::write(&plist, &new_plist)
        .map_err(|e| format!("Cannot write plist: {}", e))?;

    let plist_str = plist.to_str().unwrap_or("");
    launchctl_unload(plist_str); // remove old registration, ignore error
    if launchctl_load(plist_str) {
        eprintln!("[MorningHelper] LaunchAgent installed — fires at {:02}:{:02} AM daily", HOUR, MINUTE);
        Ok(true)
    } else {
        Err("launchctl bootstrap failed — check Console.app for details".into())
    }
}

/// Remove the LaunchAgent.
pub fn uninstall() -> Result<(), String> {
    let plist = plist_path();
    if plist.exists() {
        launchctl_unload(plist.to_str().unwrap_or(""));
        std::fs::remove_file(&plist)
            .map_err(|e| format!("Cannot remove plist: {}", e))?;
        eprintln!("[MorningHelper] LaunchAgent removed.");
    }
    Ok(())
}

/// Returns true if the LaunchAgent plist exists.
pub fn is_installed() -> bool {
    plist_path().exists()
}
