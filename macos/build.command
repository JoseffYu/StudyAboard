#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/setup.sh"
.venv-macos/bin/python -m PyInstaller \
  --noconfirm --clean --windowed --onedir \
  --name StudyAboard \
  --osx-bundle-identifier com.joseffyu.studyaboard \
  --paths "$PWD" \
  --hidden-import webview.platforms.cocoa \
  --add-data "$PWD/desktop:desktop" \
  --add-data "$PWD/mobile:mobile" \
  --add-data "$PWD/shared:shared" \
  --distpath "$PWD/macos/dist" \
  --workpath "$PWD/macos/build" \
  --specpath "$PWD/macos/build" \
  "$PWD/macos/launcher.py"
echo '打包完成：macos/dist/StudyAboard.app，可在 Finder 中双击启动。'
