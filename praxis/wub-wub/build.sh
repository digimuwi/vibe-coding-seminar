#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "==> Clean build..."
rm -rf build
cmake -B build -DCMAKE_BUILD_TYPE=Release 2>&1 | tail -3
cmake --build build --config Release -j$(sysctl -n hw.ncpu) 2>&1 | tail -6

# Install AU plugin and sign it
AU_DIR=~/Library/Audio/Plug-Ins/Components
mkdir -p "$AU_DIR"
rm -rf "$AU_DIR/Wub Wub.component"
cp -r "build/WubWub_artefacts/Release/AU/Wub Wub.component" "$AU_DIR/"
codesign -s - --deep --force "$AU_DIR/Wub Wub.component" 2>/dev/null || true

# Clear AU cache so Logic Pro re-discovers the plugin
rm -rf ~/Library/Caches/AudioUnitCache 2>/dev/null || true
defaults delete com.apple.audio.AudioComponentRegistrar 2>/dev/null || true

echo "==> Done. Launching..."
open "build/WubWub_artefacts/Release/Standalone/Wub Wub.app"
