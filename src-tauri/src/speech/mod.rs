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
        Err("Native speech synthesis currently supported on macOS only.".into())
    }
}

/// Starts a background watcher thread that waits for the speech process to finish
/// and emits a `speech-ended` Tauri event so the frontend can reset `isPlayingAudio`.
pub fn watch_speech_completion(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let finished = if let Ok(mut guard) = AUDIO_PROCESS.lock() {
                match guard.as_mut() {
                    Some(child) => {
                        match child.try_wait() {
                            Ok(Some(_)) => {
                                // Process exited — clear the handle
                                *guard = None;
                                true
                            }
                            Ok(None) => false, // still running
                            Err(_) => {
                                *guard = None;
                                true
                            }
                        }
                    }
                    None => return, // no process — exit watcher thread
                }
            } else {
                return;
            };

            if finished {
                use tauri::Emitter;
                let _ = app.emit("speech-ended", ());
                return;
            }
        }
    });
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
