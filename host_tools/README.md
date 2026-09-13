# Relief Node standalone Wi-Fi hotspot

Run these scripts from the **UNO Q host shell** (the same `arduino@Your-UnoQ` shell
where `hostname -I` showed the board's LAN address). Do not run them from the App
Lab Python container.

## Start

```bash
cd ~/ArduinoApps/<your-app-folder>
sudo ./host_tools/setup_relief_hotspot.sh
```

Defaults:

- SSID: `RELIEF-NODE`
- password: `reliefnode2026`

Change the password before a public demo:

```bash
sudo RELIEF_WIFI_PASSWORD='choose-a-strong-password' ./host_tools/setup_relief_hotspot.sh
```

The script prints the hotspot IP and the `http://<ip>:7000` URL.

## Important networking behavior

The UNO Q has to be tested on your exact OS/firmware/network configuration.
A hotspot can disconnect the board from the Wi-Fi network it was using for
internet access. Relief Node still works locally in that state, using its cached
weather/alert snapshot; online climate refresh and Cloud AI need internet.

## Stop

```bash
sudo ./host_tools/stop_relief_hotspot.sh
```
