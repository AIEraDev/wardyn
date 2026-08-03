/// Wardyn credential security layer — DB-only encrypted storage.
///
/// Tokens are encrypted with a device-derived key before being stored in the
/// SQLite `*_token` columns. An attacker with a copy of the DB file cannot
/// read tokens without also knowing the machine UUID (hardware-bound key).
///
/// Cipher: XOR-keystream using SHA-256 block expansion keyed on:
///   SHA-256( APP_SALT ‖ machine_uuid )
/// Output is URL-safe base64 tagged with "ENC1:" so legacy plain-text rows
/// are transparently handled.

use sha2::{Sha256, Digest};

/// Rotate this salt to invalidate all stored tokens (forces re-auth for all users).
const APP_SALT: &[u8] = b"wardyn-v1-token-salt-2026";

// ─── Device-keyed encryption ─────────────────────────────────────────────────

/// Derives a 32-byte key: SHA-256( APP_SALT ‖ machine_uuid ).
fn derive_device_key() -> [u8; 32] {
    let uuid = get_machine_uuid();
    let mut h = Sha256::new();
    h.update(APP_SALT);
    h.update(uuid.as_bytes());
    h.finalize().into()
}

/// Reads the hardware UUID via `ioreg` (macOS).
/// Falls back to hostname, then empty string — all stable per-machine.
fn get_machine_uuid() -> String {
    if let Ok(out) = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
    {
        if out.status.success() {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                if line.contains("IOPlatformUUID") {
                    // `  "IOPlatformUUID" = "XXXX-XXXX-..."`
                    if let Some(start) = line.rfind('"') {
                        let before = &line[..start];
                        if let Some(s) = before.rfind('"') {
                            let uuid = &before[s + 1..];
                            if !uuid.is_empty() {
                                return uuid.to_string();
                            }
                        }
                    }
                }
            }
        }
    }
    if let Ok(out) = std::process::Command::new("hostname").output() {
        return String::from_utf8_lossy(&out.stdout).trim().to_string();
    }
    String::new()
}

/// XOR-keystream cipher with SHA-256 block expansion.
/// Symmetric: encrypt(encrypt(x)) == x.
fn xor_keystream(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let mut stream: Vec<u8> = Vec::with_capacity(data.len() + 32);
    let mut idx: u64 = 0;
    while stream.len() < data.len() {
        let mut h = Sha256::new();
        h.update(key);
        h.update(idx.to_le_bytes());
        stream.extend_from_slice(&h.finalize());
        idx += 1;
    }
    data.iter().zip(stream.iter()).map(|(b, k)| b ^ k).collect()
}

/// Encrypt `plaintext` → URL-safe base64 ciphertext tagged with "ENC1:".
/// Returns empty string for empty input.
pub fn encrypt_token(plaintext: &str) -> String {
    if plaintext.is_empty() {
        return String::new();
    }
    let key = derive_device_key();
    let mut tagged = b"ENC1:".to_vec();
    tagged.extend_from_slice(&xor_keystream(plaintext.as_bytes(), &key));
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&tagged)
}

/// Decrypt a ciphertext produced by `encrypt_token`.
/// Transparently returns the input as-is if it looks like plain text (no ENC1 tag),
/// so legacy unencrypted rows keep working until they're next written.
pub fn decrypt_token(stored: &str) -> String {
    if stored.is_empty() {
        return String::new();
    }
    use base64::Engine;
    let Ok(decoded) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(stored) else {
        // Not base64 — treat as plain text (legacy row)
        return stored.to_string();
    };
    if !decoded.starts_with(b"ENC1:") {
        // Plain text row written before encryption was introduced
        return stored.to_string();
    }
    let key = derive_device_key();
    let plain = xor_keystream(&decoded[5..], &key);
    String::from_utf8(plain).unwrap_or_else(|_| stored.to_string())
}
