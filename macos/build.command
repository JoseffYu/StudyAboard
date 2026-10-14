#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/setup.sh"
PYINSTALLER_ARGS=(
  --noconfirm --clean --windowed --onedir
  --name StudyAboard
  --osx-bundle-identifier com.joseffyu.studyaboard
  --paths "$PWD"
  --hidden-import webview.platforms.cocoa
  --add-data "$PWD/desktop:desktop"
  --add-data "$PWD/mobile:mobile"
  --add-data "$PWD/shared:shared"
  --distpath "$PWD/macos/dist"
  --workpath "$PWD/macos/build"
  --specpath "$PWD/macos/build"
)
if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  PYINSTALLER_ARGS+=(--codesign-identity "$APPLE_SIGNING_IDENTITY")
fi
if [[ -n "${STUDYABOARD_TARGET_ARCH:-}" ]]; then
  case "$STUDYABOARD_TARGET_ARCH" in
    arm64|x86_64|universal2) ;;
    *) echo 'STUDYABOARD_TARGET_ARCH 只能是 arm64、x86_64 或 universal2。' >&2; exit 1 ;;
  esac
  PYINSTALLER_ARGS+=(--target-architecture "$STUDYABOARD_TARGET_ARCH")
fi
.venv-macos/bin/python -m PyInstaller "${PYINSTALLER_ARGS[@]}" "$PWD/macos/launcher.py"
if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo '签名版应用已生成：macos/dist/StudyAboard.app'
else
  echo '本地测试应用已生成：macos/dist/StudyAboard.app（未使用 Developer ID，不用于外发）'
fi
