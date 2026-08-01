#!/bin/bash
# Signs the Tauri debug binary with microphone entitlements so getUserMedia
# works in dev mode without a full release build.
# Run this once after `cargo build` or whenever the binary is rebuilt.

BINARY="src-tauri/target/debug/wardyn-desktop"
ENTITLEMENTS="src-tauri/Entitlements.plist"

if [ ! -f "$BINARY" ]; then
  echo "Binary not found at $BINARY — run 'cargo build' first or start tauri dev."
  exit 0
fi

if [ ! -f "$ENTITLEMENTS" ]; then
  echo "Entitlements.plist not found."
  exit 1
fi

echo "Signing $BINARY with entitlements..."
codesign --force --sign - --entitlements "$ENTITLEMENTS" --timestamp=none "$BINARY"

if [ $? -eq 0 ]; then
  echo "✅ Signed successfully. Microphone access should now work in dev mode."
else
  echo "❌ Signing failed."
  exit 1
fi
