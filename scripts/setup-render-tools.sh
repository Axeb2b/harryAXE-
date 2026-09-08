#!/bin/bash
# Install Java + download apktool into the project's output/ dir
# output/ is part of the repo and persists from build to runtime on Render.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_DIR/output"
APKTOOL_JAR="$OUTPUT_DIR/apktool.jar"
APKTOOL_BIN="$OUTPUT_DIR/apktool"

mkdir -p "$OUTPUT_DIR"

# ── Java / jarsigner ──────────────────────────────────────────────────────────
echo "[setup] Checking Java..."
if command -v jarsigner &>/dev/null; then
  echo "[setup] jarsigner OK: $(jarsigner -help 2>&1 | head -1 || true)"
else
  echo "[setup] Installing default-jdk-headless..."
  apt-get update -qq && apt-get install -y -q default-jdk-headless
fi

# ── apktool ───────────────────────────────────────────────────────────────────
echo "[setup] Checking apktool..."
if [ -f "$APKTOOL_JAR" ] && java -jar "$APKTOOL_JAR" --version &>/dev/null 2>&1; then
  echo "[setup] apktool already OK at $APKTOOL_JAR"
else
  echo "[setup] Downloading apktool 2.11.1 → $APKTOOL_JAR"
  wget -q "https://github.com/iBotPeaches/Apktool/releases/download/v2.11.1/apktool_2.11.1.jar" \
    -O "$APKTOOL_JAR"
  echo "[setup] apktool downloaded."
fi

# Wrapper script (executable)
cat > "$APKTOOL_BIN" <<EOF
#!/bin/bash
exec java -jar "$APKTOOL_JAR" "\$@"
EOF
chmod +x "$APKTOOL_BIN"

echo "[setup] All tools ready."
echo "[setup]  apktool  → $APKTOOL_BIN"
echo "[setup]  jarsigner → $(command -v jarsigner 2>/dev/null || echo 'not found')"
