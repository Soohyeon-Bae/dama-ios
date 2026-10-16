#!/usr/bin/env bash
set -euo pipefail
: "${CM_BUILD_DIR:?Codemagic build directory is required}"
cd "$CM_BUILD_DIR"

simulator="$(xcrun simctl list devices available --json | node scripts/select-ios-simulator.mjs)"
read -r simulator_udid simulator_state <<< "$simulator"
echo "Using iOS Simulator $simulator_udid ($simulator_state)"

xcodebuild \
  -project "$CM_BUILD_DIR/ios/App/App.xcodeproj" \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$simulator_udid" \
  -derivedDataPath "$CM_BUILD_DIR/build/SimulatorDerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  build

app_path="$CM_BUILD_DIR/build/SimulatorDerivedData/Build/Products/Debug-iphonesimulator/App.app"
test -d "$app_path"
test -s "$app_path/public/index.html"
test -s "$app_path/public/app.js"

if [[ "$simulator_state" != 'Booted' ]]; then
  xcrun simctl boot "$simulator_udid"
fi
xcrun simctl bootstatus "$simulator_udid" -b
xcrun simctl install "$simulator_udid" "$app_path"
xcrun simctl launch "$simulator_udid" io.dama.memories

mkdir -p "$CM_BUILD_DIR/build"
sleep 20
xcrun simctl io "$simulator_udid" screenshot "$CM_BUILD_DIR/build/simulator-20s.png"
sleep 20
xcrun simctl io "$simulator_udid" screenshot "$CM_BUILD_DIR/build/simulator-launch.png"
if ! swift scripts/check-simulator-screen.swift "$CM_BUILD_DIR/build/simulator-launch.png"; then
  echo 'The iOS app launched but did not show a readable screen within 40 seconds.' >&2
  xcrun simctl spawn "$simulator_udid" log show --last 3m --style compact \
    --predicate 'process == "App" OR process == "WebKit.WebContent"' \
    > "$CM_BUILD_DIR/build/simulator-runtime.log" 2>&1 || true
  exit 1
fi
