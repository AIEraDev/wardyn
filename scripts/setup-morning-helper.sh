#!/usr/bin/env bash
# Builds the wardyn_morning helper binary and places it in src-tauri/binaries/
# with the correct target-triple filename required by Tauri's externalBin.
#
# Run this once before `npm run tauri dev` or `npm run tauri build` on a fresh clone.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TAURI_DIR="$REPO_ROOT/src-tauri"

ARCH=$(rustc -vV | grep 'host:' | awk '{print $2}')
echo "[setup] Host architecture: $ARCH"

mkdir -p "$TAURI_DIR/binaries"

echo "[setup] Building wardyn_morning (debug)..."
cargo build --manifest-path "$TAURI_DIR/Cargo.toml" --bin wardyn_morning

cp "$TAURI_DIR/target/debug/wardyn_morning" "$TAURI_DIR/binaries/wardyn_morning-$ARCH"
echo "[setup] ✓ Installed: src-tauri/binaries/wardyn_morning-$ARCH"
