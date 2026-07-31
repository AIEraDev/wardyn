use keyring::Entry;

const SERVICE_NAME: &str = "com.wardyn.desktop";

pub fn store_secure_token(account_key: &str, token: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, account_key).map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())
}

pub fn retrieve_secure_token(account_key: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, account_key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(pass) => Ok(Some(pass)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_secure_token(account_key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, account_key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
