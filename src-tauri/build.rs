fn main() {
    tauri_build::build();

    // OAuth CLIENT_IDs can be provided at compile time for convenience (dev/CI).
    // In production, users supply their own credentials via Settings → OAuth Credentials.
    // SECRETS (client_secret) are NEVER baked in — always user-supplied at runtime.
    let vars = [
        "GOOGLE_CLIENT_ID",
        "LINKEDIN_CLIENT_ID",
    ];
    for var in vars {
        // Default to empty string so env!() compiles even without the var set
        let val = std::env::var(var).unwrap_or_default();
        println!("cargo:rustc-env={}={}", var, val);
        println!("cargo:rerun-if-env-changed={}", var);
    }
}
