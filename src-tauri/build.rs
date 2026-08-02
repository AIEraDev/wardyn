fn main() {
    tauri_build::build();

    // Embed OAuth credentials at compile time.
    // In dev: sourced from .env via dotenvy at runtime (see lib.rs).
    // In production CI: sourced from GitHub Actions secrets injected as env vars.
    // This ensures release builds always have credentials baked in.
    let vars = [
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "LINKEDIN_CLIENT_ID",
        "LINKEDIN_CLIENT_SECRET",
    ];
    for var in vars {
        if let Ok(val) = std::env::var(var) {
            // Pass through to the compiled binary so env::var() finds them at runtime
            // even without a .env file present
            println!("cargo:rustc-env={}={}", var, val);
        }
        // Tell cargo to rerun if the var changes
        println!("cargo:rerun-if-env-changed={}", var);
    }
}
