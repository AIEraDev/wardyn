fn main() {
    tauri_build::build();

    // Embed OAuth credentials at compile time using cargo:rustc-env.
    // These are accessed via env!() macros in the source (NOT std::env::var at runtime).
    // In CI: sourced from GitHub Actions secrets.
    // In dev: sourced from the shell environment (run: source .env && cargo build, or use direnv).
    let vars = [
        "GOOGLE_CLIENT_ID",
        "LINKEDIN_CLIENT_ID",
    ];
    for var in vars {
        let val = std::env::var(var).unwrap_or_default();
        println!("cargo:rustc-env={}={}", var, val);
        println!("cargo:rerun-if-env-changed={}", var);
    }
}
