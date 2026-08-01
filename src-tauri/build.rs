fn main() {
    tauri_build::build();
    // Microphone entitlements are applied via .cargo/config.toml runner (sign-and-run.sh)
    // which signs the binary after each cargo build before tauri executes it.
}
