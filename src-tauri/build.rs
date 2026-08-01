fn main() {
    tauri_build::build();

    // On macOS debug builds, re-sign the binary with microphone entitlements
    // so getUserMedia works in `tauri dev` without a full release/notarized build.
    #[cfg(all(target_os = "macos", debug_assertions))]
    sign_debug_binary_with_entitlements();
}

#[cfg(all(target_os = "macos", debug_assertions))]
fn sign_debug_binary_with_entitlements() {
    use std::path::PathBuf;

    // CARGO_MANIFEST_DIR is src-tauri/
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
    let entitlements = PathBuf::from(&manifest_dir).join("Entitlements.plist");

    if !entitlements.exists() {
        return;
    }

    // The binary lives at target/{profile}/wardyn-desktop relative to workspace root
    let target_dir = std::env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(&manifest_dir).join("target"));

    let binary = target_dir.join("debug").join("wardyn-desktop");

    if !binary.exists() {
        // Binary not built yet — will be signed on next build after it exists
        return;
    }

    let status = std::process::Command::new("codesign")
        .args([
            "--force",
            "--sign", "-",                        // ad-hoc identity (no Apple Developer account needed)
            "--entitlements", entitlements.to_str().unwrap_or(""),
            "--timestamp=none",
            binary.to_str().unwrap_or(""),
        ])
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("cargo:warning=✅ wardyn-desktop signed with mic entitlements");
        }
        Ok(s) => {
            println!("cargo:warning=⚠️  codesign exited with status {}", s);
        }
        Err(e) => {
            println!("cargo:warning=⚠️  codesign not available: {}", e);
        }
    }
}
