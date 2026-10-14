#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != Darwin ]]; then
  echo '发行包只能在 macOS 上构建。' >&2
  exit 1
fi
: "${APPLE_SIGNING_IDENTITY:?请设置 APPLE_SIGNING_IDENTITY，例如 Developer ID Application: 姓名 (TEAMID)}"
: "${APPLE_NOTARY_PROFILE:?请设置 APPLE_NOTARY_PROFILE，它是 notarytool 保存到钥匙串的凭据名称}"

for RELEASE_TOOL in security codesign hdiutil xcrun spctl; do
  if ! command -v "$RELEASE_TOOL" >/dev/null; then
    echo "缺少发行工具：$RELEASE_TOOL" >&2
    exit 1
  fi
done
if ! xcrun --find notarytool >/dev/null 2>&1; then
  echo '找不到 notarytool，请安装并选择 Xcode 13 或更新版本。' >&2
  exit 1
fi
if ! security find-identity -v -p codesigning | /usr/bin/grep -F -- "$APPLE_SIGNING_IDENTITY" >/dev/null; then
  echo "钥匙串中找不到签名证书：$APPLE_SIGNING_IDENTITY" >&2
  exit 1
fi
if ! xcrun notarytool history --keychain-profile "$APPLE_NOTARY_PROFILE" >/dev/null; then
  echo "无法使用公证凭据：$APPLE_NOTARY_PROFILE" >&2
  exit 1
fi

bash macos/build.command
APP_PATH="$PWD/macos/dist/StudyAboard.app"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

RELEASE_VERSION="${STUDYABOARD_VERSION:-$(.venv-macos/bin/python -c 'import json; print(json.load(open("package.json"))["version"])')}"
RELEASE_ARCH="${STUDYABOARD_TARGET_ARCH:-$(uname -m)}"
DMG_PATH="$PWD/macos/dist/StudyAboard-${RELEASE_VERSION}-${RELEASE_ARCH}.dmg"
STAGING_DIR="$(mktemp -d /tmp/studyaboard-release.XXXXXX)"
cleanup() { rm -rf "$STAGING_DIR"; }
trap cleanup EXIT

ditto "$APP_PATH" "$STAGING_DIR/StudyAboard.app"
ln -s /Applications "$STAGING_DIR/Applications"
hdiutil create -ov -format UDZO -volname StudyAboard -srcfolder "$STAGING_DIR" "$DMG_PATH"
codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG_PATH"
codesign --verify --verbose=2 "$DMG_PATH"
hdiutil verify "$DMG_PATH"

xcrun notarytool submit "$DMG_PATH" \
  --keychain-profile "$APPLE_NOTARY_PROFILE" \
  --wait --timeout 2h
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG_PATH"

echo "发行包已完成：$DMG_PATH"
