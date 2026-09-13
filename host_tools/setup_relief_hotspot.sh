#!/usr/bin/env bash
set -euo pipefail

SSID="${RELIEF_SSID:-RELIEF-NODE}"
PASSWORD="${RELIEF_WIFI_PASSWORD:-reliefnode2026}"
CONNECTION="${RELIEF_CONNECTION_NAME:-ReliefNode-Hotspot}"

if ! command -v nmcli >/dev/null 2>&1; then
  echo "nmcli/NetworkManager is not available on this host."
  exit 1
fi

WIFI_IF="${RELIEF_WIFI_IF:-$(nmcli -t -f DEVICE,TYPE device status | awk -F: '$2=="wifi"{print $1; exit}')}"

if [[ -z "${WIFI_IF}" ]]; then
  echo "No Wi-Fi interface found."
  exit 1
fi

echo "Wi-Fi interface: ${WIFI_IF}"
echo "Creating hotspot: ${SSID}"
echo "NOTE: On a single-radio setup this may disconnect the UNO Q from its existing Wi-Fi/internet."

nmcli connection delete "${CONNECTION}" >/dev/null 2>&1 || true
nmcli device wifi hotspot ifname "${WIFI_IF}" con-name "${CONNECTION}" ssid "${SSID}" password "${PASSWORD}"

IP="$(ip -4 -o addr show dev "${WIFI_IF}" | awk '{print $4}' | cut -d/ -f1 | head -n1)"

echo
echo "Relief Node hotspot is active."
echo "SSID:     ${SSID}"
echo "Password: ${PASSWORD}"
echo "Board IP: ${IP:-unknown}"
if [[ -n "${IP}" ]]; then
  echo "Open:     http://${IP}:7000"
fi
echo
echo "To stop it:"
echo "  sudo $(dirname "$0")/stop_relief_hotspot.sh"
