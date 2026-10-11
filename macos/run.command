#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/setup.sh"
exec .venv-macos/bin/python macos/launcher.py
