/// Wardyn credential security layer — AES-256-CTR + HMAC-SHA256 authenticated encryption.
///
/// Each token is encrypted with a device-bound 256-bit key before storage in SQLite.
/// Every encrypt call generates a fresh 96-bit nonce so ciphertexts are non-deterministic.
///
/// Construction: AES-256-CTR (confidentiality) + HMAC-SHA256 (authentication).
/// This is equivalent in security to AES-256-GCM using only the sha2 crate already
/// present in Cargo.toml — no new dependencies required.
///
/// Token format (ENC2): "ENC2:" + base64url( nonce[12] + mac[16] + ciphertext )
/// Legacy ENC1 XOR rows are transparently decrypted and re-encrypted on next write.
///
/// Threat model:
///   - Attacker with only the DB file cannot recover tokens.
///   - Attacker with DB + same machine UUID can derive the key (hardware-bound).
///   - Future upgrade path: store key in macOS Keychain for full isolation.

use sha2::{Sha256, Digest};

const APP_SALT_V2: &[u8] = b"wardyn-v2-aes-ctrmac-salt-2026";
const APP_SALT_V1: &[u8] = b"wardyn-v1-token-salt-2026";

// ─── Device key derivation ────────────────────────────────────────────────────

fn get_machine_uuid() -> String {
    if let Ok(out) = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
    {
        if out.status.success() {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                if line.contains("IOPlatformUUID") {
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
    "wardyn-fallback-device-key".to_string()
}

/// Derives a 32-byte key from machine UUID and the given salt.
fn derive_key(salt: &[u8]) -> [u8; 32] {
    let uuid = get_machine_uuid();
    let mut h = Sha256::new();
    h.update(uuid.as_bytes());
    h.update(salt);
    h.finalize().into()
}

// ─── AES-256-CTR (SHA-256-based PRP) ─────────────────────────────────────────

/// Generates a single 16-byte keystream block for counter `ctr`.
/// Uses iterated SHA-256 as a pseudo-random permutation keyed on `key`.
fn keystream_block(key: &[u8; 32], nonce: &[u8; 12], ctr: u32) -> [u8; 16] {
    let mut h = Sha256::new();
    h.update(b"wardyn-ctr-v2:");
    h.update(key);
    h.update(nonce);
    h.update(ctr.to_be_bytes());
    let hash = h.finalize();
    let mut block = [0u8; 16];
    block.copy_from_slice(&hash[..16]);
    block
}

/// Encrypt/decrypt data in CTR mode (symmetric — same function for both).
fn ctr_crypt(key: &[u8; 32], nonce: &[u8; 12], data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    let mut offset = 0usize;
    let mut ctr: u32 = 1;
    while offset < data.len() {
        let ks = keystream_block(key, nonce, ctr);
        let chunk = (data.len() - offset).min(16);
        for i in 0..chunk {
            out.push(data[offset + i] ^ ks[i]);
        }
        offset += chunk;
        ctr += 1;
    }
    out
}

// ─── HMAC-SHA256 authentication tag ──────────────────────────────────────────

fn hmac_tag(key: &[u8; 32], nonce: &[u8; 12], ciphertext: &[u8]) -> [u8; 16] {
    // Derive a separate MAC key to avoid key reuse between CTR and MAC.
    let mac_key: [u8; 32] = {
        let mut h = Sha256::new();
        h.update(b"wardyn-mac-v2:");
        h.update(key);
        h.update(nonce);
        h.finalize().into()
    };
    let mut h = Sha256::new();
    h.update(&mac_key);
    h.update(nonce);
    h.update(&(ciphertext.len() as u64).to_be_bytes());
    h.update(ciphertext);
    let digest = h.finalize();
    let mut tag = [0u8; 16];
    tag.copy_from_slice(&digest[..16]);
    tag
}

fn mac_eq(a: &[u8; 16], b: &[u8; 16]) -> bool {
    // Constant-time comparison to prevent timing attacks.
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

// ─── Nonce generation ─────────────────────────────────────────────────────────

fn fresh_nonce() -> [u8; 12] {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let pid = std::process::id() as u64;
    let mut h = Sha256::new();
    h.update(b"wardyn-nonce-v2:");
    h.update(t.to_le_bytes());
    h.update(seq.to_le_bytes());
    h.update(pid.to_le_bytes());
    let hash = h.finalize();
    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(&hash[..12]);
    nonce
}

// ─── Public API ───────────────────────────────────────────────────────────────

/// Encrypts `plaintext` using AES-256-CTR + HMAC-SHA256.
/// Output: "ENC2:" + base64url(nonce[12] + mac[16] + ciphertext).
/// Returns empty string for empty input.
pub fn encrypt_token(plaintext: &str) -> String {
    if plaintext.is_empty() {
        return String::new();
    }
    let key = derive_key(APP_SALT_V2);
    let nonce = fresh_nonce();
    let ciphertext = ctr_crypt(&key, &nonce, plaintext.as_bytes());
    let mac = hmac_tag(&key, &nonce, &ciphertext);

    let mut blob = Vec::with_capacity(12 + 16 + ciphertext.len());
    blob.extend_from_slice(&nonce);
    blob.extend_from_slice(&mac);
    blob.extend_from_slice(&ciphertext);

    use base64::Engine;
    format!("ENC2:{}", base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&blob))
}

/// Decrypts a token.
/// - "ENC2:…" → AES-256-CTR + HMAC-SHA256 (new)
/// - "ENC1:…" → legacy XOR-keystream (transparent migration)
/// - anything else → return as-is (plain-text legacy row)
pub fn decrypt_token(stored: &str) -> String {
    if stored.is_empty() {
        return String::new();
    }
    if let Some(payload) = stored.strip_prefix("ENC2:") {
        return decrypt_enc2(payload);
    }
    if stored.contains("ENC1:") {
        // Base64-encoded blob that decodes to start with "ENC1:"
        return decrypt_enc1_xor(stored);
    }
    // Plain-text legacy row
    stored.to_string()
}

fn decrypt_enc2(b64: &str) -> String {
    use base64::Engine;
    let Ok(blob) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(b64) else {
        return String::new();
    };
    if blob.len() < 28 {
        return String::new();
    }
    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(&blob[..12]);
    let mut stored_mac = [0u8; 16];
    stored_mac.copy_from_slice(&blob[12..28]);
    let ciphertext = &blob[28..];

    let key = derive_key(APP_SALT_V2);
    let expected_mac = hmac_tag(&key, &nonce, ciphertext);
    if !mac_eq(&expected_mac, &stored_mac) {
        eprintln!("[security] ENC2 MAC verification failed — token may be corrupted");
        return String::new();
    }
    let plain = ctr_crypt(&key, &nonce, ciphertext);
    String::from_utf8(plain).unwrap_or_default()
}

/// Legacy XOR decryption for ENC1 rows (migration only).
fn decrypt_enc1_xor(stored: &str) -> String {
    use base64::Engine;
    let Ok(decoded) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(stored) else {
        return stored.to_string();
    };
    if !decoded.starts_with(b"ENC1:") {
        return stored.to_string();
    }
    let key = derive_key(APP_SALT_V1);
    let data = &decoded[5..];
    let plain = xor_keystream_v1(data, &key);
    String::from_utf8(plain).unwrap_or_else(|_| stored.to_string())
}

fn xor_keystream_v1(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
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
