/// LaunchAgent installer for the Wardyn morning helper.
///
/// macOS-only. All public functions compile to no-ops on Windows and Linux
/// so the codebase builds cleanly on all platforms.

// ── No-op stubs for non-macOS platforms ──────────────────────────────────────

#[cfg(not(target_os = "macos"))]
pub fn install_or_update() -> Result<bool, String> { Ok(false) }
#[cfg(not(target_os = "macos"))]
pub fn uninstall() -> Result<(), String> { Ok(()) }
#[cfg(not(target_os = "macos"))]
pub fn is_installed() -> bool { false }

// ── macOS implementation ──────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
mod macos_impl {
    use std::path::PathBuf;

    const PLIST_LABEL: &str = "com.wardyn.morning";
    const HOUR: u32 = 8;
    const MINUTE: u32 = 0;

    fn launch_agents_dir() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home).join("Library").join("LaunchAgents")
    }

    fn plist_path() -> PathBuf {
        launch_agents_dir().join(format!("{}.plist", PLIST_LABEL))
    }

    fn resolve_helper_path() -> Option<PathBuf> {
        let exe = std::env::current_exe().ok()?;
        let macos_dir = exe.parent()?;
        // 1. Same dir as main exe (dev build)
        let p = macos_dir.join("wardyn_morning");
        if p.exists() { return Some(p); }
        // 2. ../Resources/wardyn_morning (Tauri resources — root placement)
        let resources = macos_dir.parent()?.join("Resources");
        let p2 = resources.join("wardyn_morning");
        if p2.exists() { return Some(p2); }
        // 3. ../Resources/helper/wardyn_morning (subdirectory placement)
        let p3 = resources.join("helper").join("wardyn_morning");
        if p3.exists() { return Some(p3); }
        None
    }

    fn db_path() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("com.wardyn.desktop")
            .join("wardyn.db")
    }

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

    fn gui_target() -> String {
        // getuid() is Unix-only — this mod is only compiled on macOS
        let uid = unsafe { libc::getuid() };
        format!("gui/{}", uid)
    }

    fn launchctl_bootstrap(plist: &str) -> bool {
        let gui = gui_target();
        std::process::Command::new("launchctl")
            .args(["bootstrap", &gui, plist])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    fn launchctl_bootout(plist: &str) {
        let gui = gui_target();
        std::process::Command::new("launchctl")
            .args(["bootout", &gui, plist])
            .output()
            .ok();
    }

    pub fn install_or_update() -> Result<bool, String> {
        let helper = match resolve_helper_path() {
            Some(p) => p,
            None => {
                eprintln!(
                    "[MorningHelper] wardyn_morning binary not found. \
                     Run scripts/setup-morning-helper.sh to build it."
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
        let log_dir = std::path::PathBuf::from(&home)
            .join("Library").join("Logs").join("Wardyn");
        std::fs::create_dir_all(&log_dir).ok();
        let log_dir_str = log_dir.to_str().unwrap_or("/tmp").to_string();

        let new_plist = plist_content(&binary_str, &db_str, &log_dir_str);
        let plist = plist_path();
        let existing = std::fs::read_to_string(&plist).unwrap_or_default();
        if existing == new_plist { return Ok(false); }

        std::fs::create_dir_all(launch_agents_dir())
            .map_err(|e| format!("Cannot create LaunchAgents dir: {}", e))?;
        std::fs::write(&plist, &new_plist)
            .map_err(|e| format!("Cannot write plist: {}", e))?;

        let plist_str = plist.to_str().unwrap_or("");
        launchctl_bootout(plist_str);
        if launchctl_bootstrap(plist_str) {
            eprintln!("[MorningHelper] LaunchAgent installed — fires at {:02}:{:02} AM daily", HOUR, MINUTE);
            Ok(true)
        } else {
            Err("launchctl bootstrap failed".into())
        }
    }

    pub fn uninstall() -> Result<(), String> {
        let plist = plist_path();
        if plist.exists() {
            launchctl_bootout(plist.to_str().unwrap_or(""));
            std::fs::remove_file(&plist)
                .map_err(|e| format!("Cannot remove plist: {}", e))?;
        }
        Ok(())
    }

    pub fn is_installed() -> bool {
        plist_path().exists()
    }
}

// Re-export macOS functions at module level
#[cfg(target_os = "macos")]
pub fn install_or_update() -> Result<bool, String> { macos_impl::install_or_update() }
#[cfg(target_os = "macos")]
pub fn uninstall() -> Result<(), String> { macos_impl::uninstall() }
#[cfg(target_os = "macos")]
pub fn is_installed() -> bool { macos_impl::is_installed() }
