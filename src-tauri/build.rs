fn main() {
    tauri_build::build();
    // OAuth credentials are NOT baked into the binary.
    // Users supply their own via Settings → OAuth Credentials (stored in local SQLite).
}
