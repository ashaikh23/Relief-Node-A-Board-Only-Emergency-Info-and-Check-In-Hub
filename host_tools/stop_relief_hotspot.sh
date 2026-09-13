#!/usr/bin/env bash
set -euo pipefail
CONNECTION="${RELIEF_CONNECTION_NAME:-ReliefNode-Hotspot}"

nmcli connection down "${CONNECTION}" >/dev/null 2>&1 || true
echo "Relief Node hotspot stopped."
echo "Reconnect the UNO Q to your normal Wi-Fi using App Lab or nmcli."
