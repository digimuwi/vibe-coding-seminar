#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "==> Clean build..."
rm -rf build
cmake -B build -DCMAKE_BUILD_TYPE=Release 2>&1 | tail -3
cmake --build build --config Release -j$(sysctl -n hw.ncpu) 2>&1 | tail -6
echo "==> Done. Launching..."
open "build/WubWub_artefacts/Release/Standalone/Wub Wub.app"
