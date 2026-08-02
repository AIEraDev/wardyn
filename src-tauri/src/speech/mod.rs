use std::process::{Command, Child};
use std::sync::{Mutex, atomic::{AtomicBool, Ordering}};
use lazy_static::lazy_static;

lazy_static! {
    static ref AUDIO_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
    // True while the watcher thread is alive — prevents spawning duplicates
    static ref WATCHER_RUNNING: AtomicBool = AtomicBool::new(false);
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
/// Only one watcher runs at a time — duplicate spawns are suppressed.
pub fn watch_speech_completion(app: tauri::AppHandle) {
    // Swap false→true; if it was already true, a watcher is running — skip
    if WATCHER_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return;
    }
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let finished = if let Ok(mut guard) = AUDIO_PROCESS.lock() {
                match guard.as_mut() {
                    Some(child) => {
                        match child.try_wait() {
                            Ok(Some(_)) => { *guard = None; true }
                            Ok(None)    => false,
                            Err(_)      => { *guard = None; true }
                        }
                    }
                    None => true, // process was stopped manually
                }
            } else {
                true // lock poisoned — exit watcher
            };

            if finished {
                WATCHER_RUNNING.store(false, Ordering::SeqCst);
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
    // Allow a new watcher to be spawned for the next speak call
    WATCHER_RUNNING.store(false, Ordering::SeqCst);
}

fn clean_text_for_speech(input: &str) -> String {
    input
        .replace("⚡", "").replace("📅", "").replace("📚", "")
        .replace("💡", "").replace("📊", "").replace("🎯", "")
        .replace("📬", "").replace("⚠️", "Warning:")
        .replace("⭐", "").replace('#', "").replace('*', "").replace('`', "")
        .trim().to_string()
}
