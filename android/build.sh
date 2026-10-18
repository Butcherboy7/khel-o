#!/usr/bin/env bash
# Builds the signed Play Store bundle (app-release-bundle.aab) and a signed APK
# for sideloading (app-release-signed.apk) from twa-manifest.json.
#
#   bash android/build.sh            # rebuild the same version
#   bash android/build.sh --bump     # next versionCode (needed for every Play upload)
#
# Needs (one-time, see docs/android/ANDROID-APP.md): JDK 17, the Android SDK,
# `npm i -g @bubblewrap/cli`, ~/.bubblewrap/config.json, and the upload key in
# ~/.khelo-android/ (never in this repo: it is public).
set -euo pipefail
cd "$(dirname "$0")"

KEY_DIR="$HOME/.khelo-android"
README="$KEY_DIR/SIGNING-KEY-README.txt"
JDK="$(python -c "import json,os;print(json.load(open(os.path.expanduser('~/.bubblewrap/config.json')))['jdkPath'])")"

if [[ -z "${BUBBLEWRAP_KEYSTORE_PASSWORD:-}" ]]; then
  [[ -f "$README" ]] || { echo "No $README and BUBBLEWRAP_KEYSTORE_PASSWORD unset" >&2; exit 1; }
  BUBBLEWRAP_KEYSTORE_PASSWORD="$(grep -oP 'Password\s+: \K\S+' "$README")"
fi
export BUBBLEWRAP_KEYSTORE_PASSWORD BUBBLEWRAP_KEY_PASSWORD="$BUBBLEWRAP_KEYSTORE_PASSWORD"
# Bubblewrap signs the bundle with `jarsigner`, which only the JDK has.
export JAVA_HOME="$JDK" PATH="$(cygpath -u "$JDK")/bin:$PATH"
# Claude Code / hardened shells set this, which stops cmd from running the
# project's own gradlew.bat.
unset NoDefaultCurrentDirectoryInExePath || true

if [[ "${1:-}" == "--bump" ]]; then
  # Regenerates the project from twa-manifest.json and raises appVersionCode.
  bubblewrap update --manifest=./twa-manifest.json < /dev/null
fi

# Bubblewrap echoes the passwords if a signing step fails, so keep its output
# out of any log file.
bubblewrap build --skipPwaValidation < /dev/null 2>&1 | sed -E 's/(pass(word)?|-storepass|-keypass) *"?[^" ]+"?/\1 ***/gI'

ls -la app-release-bundle.aab app-release-signed.apk
grep -o '"appVersionCode": *[0-9]*' twa-manifest.json
