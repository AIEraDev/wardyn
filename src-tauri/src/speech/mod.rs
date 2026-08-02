use std::process::{Command, Child};
use std::sync::Mutex;
use lazy_static::lazy_static;

lazy_static! {
    static ref AUDIO_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
}

pub fn speak_text(text: &str) -> Result<(), String> {
    stop_speech();
    let clean = clean_text_for_speech(text);

    #[cfg(target_os = "macos")]
    {
        match Command::new("say").arg("-r").arg("185").arg(&clean).spawn() {
            Ok(child) => {
                if let Ok(mut guard) = AUDIO_PROCESS.lock() {
                    *guard = Some(child);
                }
                Ok(())
            }
            Err(e) => Err(format!("Failed to launch speech process: {}", e)),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Native speech synthesis currently supported on macOS".into())
    }
}

pub fn stop_speech() {
    if let Ok(mut guard) = AUDIO_PROCESS.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
}

fn clean_text_for_speech(input: &str) -> String {
    input
        .replace("⚡", "").replace("📅", "").replace("📚", "")
        .replace("💡", "").replace("📊", "").replace("🎯", "")
        .replace("📬", "").replace("⚠️", "Warning:")
        .replace("⭐", "").replace('#', "").replace('*', "").replace('`', "")
        .trim().to_string()
}
