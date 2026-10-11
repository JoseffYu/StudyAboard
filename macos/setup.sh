#!/bin/bash
# Sourced by the launch and build scripts.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo '请在 MacBook 的终端运行此脚本。'
  exit 1
fi
APP_PYTHON="${STUDYABOARD_PYTHON:-python3}"
if ! command -v "$APP_PYTHON" >/dev/null; then
  echo '请先安装 Python 3.12 或更新版本。'
  exit 1
fi
"$APP_PYTHON" -c 'import sys; sys.exit("需要 Python 3.12 或更新版本") if sys.version_info < (3, 12) else None'
if [[ ! -x .venv-macos/bin/python ]]; then
  "$APP_PYTHON" -m venv .venv-macos
fi
if [[ ! -f .venv-macos/installed-requirements.txt ]] || ! cmp -s macos/requirements.txt .venv-macos/installed-requirements.txt; then
  .venv-macos/bin/python -m pip install -r macos/requirements.txt
  cp macos/requirements.txt .venv-macos/installed-requirements.txt
fi
