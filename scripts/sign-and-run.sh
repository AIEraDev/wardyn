#!/bin/bash
# Cargo runner: signs the binary with microphone entitlements before executing it.
# Configured in src-tauri/.cargo/config.toml as the runner for Apple Silicon + Intel.
# Arguments: $1 = binary path, $@ = all args passed by cargo/tauri

BINARY="$1"
shift
ENTITLEMENTS="$(dirname "$0")/../src-tauri/Entitlements.plist"

if [ -f "$ENTITLEMENTS" ] && [ -f "$BINARY" ]; then
  codesign --force --sign - \
    --entitlements "$ENTITLEMENTS" \
    --timestamp=none \
    "$BINARY" 2>/dev/null
fi

exec "$BINARY" "$@"
