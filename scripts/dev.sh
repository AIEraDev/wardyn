#!/bin/bash
# Wardyn dev launcher.
# The Cargo runner in .cargo/config.toml automatically signs the binary
# with microphone entitlements before each run, so getUserMedia works.
#
# Usage:  bash scripts/dev.sh
#    or:  npm run dev:signed  (if added to package.json)

set -e
cd "$(dirname "$0")/.."
npm run tauri dev
