from arduino.app_utils import *
from arduino.app_bricks.web_ui import WebUI

from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json
import math
import os
import re
import sqlite3
import threading
import time


ADMIN_PIN = "2468"  # Change this before a public demo.
CLIMATE_REFRESH_SECONDS = 15 * 60
HTTP_TIMEOUT_SECONDS = 12
NWS_USER_AGENT = "ReliefNode/2.0 Arduino-UNO-Q contest prototype"

APP_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = APP_ROOT / "data"
DB_PATH = DATA_DIR / "relief_node.db"

VALID_STATUSES = {"safe", "help", "supplies"}
VALID_MODES = {"safe": 0, "alert": 1, "emergency": 2}
VALID_UNITS = {"F", "C"}

ui = WebUI()
# Local generative AI runs entirely on the UNO Q through App Lab's arduino:llm Brick.
# Qwen 3.5 0.8B Q4_0 is the smaller/faster default for the 4GB board.
# If you download Gemma 3 1B instead, change this to:
#   llamacpp:gemma-3-1b-it-Q4_0
LOCAL_LLM_MODEL = "llamacpp:Qwen3.5-0.8B-Q4_0"
_local_llm = None
_local_llm_error = ""
_local_llm_lock = threading.Lock()

# Board state spans both processors: RGB LEDs 1-2 are on Linux/MPU; 3-4 and the matrix are on the MCU.
_board_mode_name = "safe"
_mpu_help_until = 0.0
_mpu_led_state = None
_board_state_lock = threading.Lock()

UI_NOTICE_LANGUAGES = {
    "es": "Spanish",
    "ar": "Arabic",
    "hi": "Hindi",
    "fr": "French",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db_connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db_connect() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS checkins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                severity TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notice_translations (
                notice_id INTEGER NOT NULL,
                language TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (notice_id, language)
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS climate_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                location_name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                units TEXT NOT NULL,
                temperature REAL,
                apparent_temperature REAL,
                humidity REAL,
                precipitation REAL,
                wind_speed REAL,
                weather_code INTEGER,
                high_temperature REAL,
                low_temperature REAL,
                precipitation_probability REAL,
                alert_count INTEGER NOT NULL DEFAULT 0,
                source_status TEXT NOT NULL DEFAULT 'ok'
            );

            CREATE TABLE IF NOT EXISTS emergency_alerts (
                external_id TEXT PRIMARY KEY,
                event TEXT NOT NULL,
                severity TEXT,
                headline TEXT,
                description TEXT,
                instruction TEXT,
                onset TEXT,
                expires TEXT,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            );
        """)

        defaults = {
            "location_name": "",
            "latitude": "",
            "longitude": "",
            "units": "F",
        }
        for key, value in defaults.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
                (key, value),
            )

        n = conn.execute("SELECT COUNT(*) AS n FROM notices").fetchone()["n"]
        if n == 0:
            conn.execute(
                "INSERT INTO notices(title, body, severity, created_at) VALUES (?, ?, ?, ?)",
                (
                    "Relief Node Online",
                    "Local emergency information and community check-in are available.",
                    "safe",
                    now_iso(),
                ),
            )


def get_setting(conn, key, default=""):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(conn, key, value):
    conn.execute(
        "INSERT INTO settings(key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


def get_settings(conn):
    return {
        "location_name": get_setting(conn, "location_name", ""),
        "latitude": get_setting(conn, "latitude", ""),
        "longitude": get_setting(conn, "longitude", ""),
        "units": get_setting(conn, "units", "F"),
    }


def latest_notice(conn):
    row = conn.execute(
        "SELECT id, title, body, severity, created_at FROM notices ORDER BY id DESC LIMIT 1"
    ).fetchone()
    return dict(row) if row else None


def notice_by_id(conn, notice_id):
    row = conn.execute(
        "SELECT id, title, body, severity, created_at FROM notices WHERE id = ?",
        (notice_id,),
    ).fetchone()
    return dict(row) if row else None


def cached_notice_translation(conn, notice_id, language):
    row = conn.execute(
        "SELECT title, body FROM notice_translations WHERE notice_id = ? AND language = ?",
        (notice_id, language),
    ).fetchone()
    return dict(row) if row else None


def counts(conn):
    out = {"safe": 0, "help": 0, "supplies": 0}
    for row in conn.execute("SELECT status, COUNT(*) AS n FROM checkins GROUP BY status"):
        if row["status"] in out:
            out[row["status"]] = row["n"]
    out["total"] = sum(out.values())
    return out


def recent_checkins(conn, limit=40):
    rows = conn.execute(
        "SELECT id, name, status, note, created_at FROM checkins ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def latest_climate(conn):
    row = conn.execute(
        "SELECT * FROM climate_logs ORDER BY id DESC LIMIT 1"
    ).fetchone()
    return dict(row) if row else None


def climate_history(conn, limit=16):
    rows = conn.execute(
        "SELECT * FROM climate_logs ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def active_alerts(conn, limit=8):
    rows = conn.execute(
        """SELECT external_id, event, severity, headline, description, instruction,
                  onset, expires, first_seen, last_seen
           FROM emergency_alerts
           WHERE active = 1
           ORDER BY
             CASE severity
               WHEN 'Extreme' THEN 1
               WHEN 'Severe' THEN 2
               WHEN 'Moderate' THEN 3
               WHEN 'Minor' THEN 4
               ELSE 5
             END,
             last_seen DESC
           LIMIT ?""",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def cluster_needs(checkins):
    groups = {
        "urgent_help": [],
        "medical": [],
        "water": [],
        "food": [],
        "shelter": [],
        "power": [],
        "transport": [],
        "supplies_other": [],
    }

    patterns = {
        "medical": r"\b(med|medicine|medical|doctor|nurse|injur|bleed|insulin|asthma|prescription|pain)\w*\b",
        "water": r"\b(water|drink|hydration|bottle)\w*\b",
        "food": r"\b(food|meal|hungry|baby formula|formula)\w*\b",
        "shelter": r"\b(shelter|blanket|bed|sleep|housing|room)\w*\b",
        "power": r"\b(power|electric|battery|charger|charging|generator)\w*\b",
        "transport": r"\b(transport|ride|car|bus|evacuat|pickup)\w*\b",
    }

    for item in checkins:
        text = f"{item.get('name','')} {item.get('note','')}".lower()
        if item.get("status") == "help":
            groups["urgent_help"].append(item)
        matched = False
        for key, pattern in patterns.items():
            if re.search(pattern, text, re.IGNORECASE):
                groups[key].append(item)
                matched = True
        if item.get("status") == "supplies" and not matched:
            groups["supplies_other"].append(item)

    labels = {
        "urgent_help": "Urgent help",
        "medical": "Medical",
        "water": "Water",
        "food": "Food",
        "shelter": "Shelter",
        "power": "Power / charging",
        "transport": "Transport",
        "supplies_other": "Other supplies",
    }

    result = []
    for key, items in groups.items():
        if not items:
            continue
        result.append({
            "key": key,
            "label": labels[key],
            "count": len(items),
            "examples": [
                {
                    "name": x.get("name", "Anonymous"),
                    "note": x.get("note", ""),
                    "status": x.get("status", ""),
                }
                for x in items[:3]
            ],
        })
    result.sort(key=lambda x: (0 if x["key"] == "urgent_help" else 1, -x["count"]))
    return result


def state():
    with db_connect() as conn:
        checkins = recent_checkins(conn)
        return {
            "notice": latest_notice(conn),
            "counts": counts(conn),
            "checkins": checkins,
            "needs_summary": cluster_needs(checkins),
            "settings": get_settings(conn),
            "climate": {
                "latest": latest_climate(conn),
                "history": climate_history(conn),
                "alerts": active_alerts(conn),
            },
            "ai": {
                "mode": "on_device_genai",
                "provider": "Arduino App Lab local LLM / llama.cpp",
                "model": LOCAL_LLM_MODEL,
                "initialized": _local_llm is not None,
                "last_error": _local_llm_error,
                "fallback": "offline rule-based action summarizer",
            },
        }


def broadcast_state():
    ui.send_message("state", state())


def send_result(message, extra=None):
    payload = {"message": message}
    if extra:
        payload.update(extra)
    ui.send_message("result", payload)


def send_error(message):
    ui.send_message("error", {"message": message})


def valid_pin(data):
    return str(data.get("pin", "")).strip() == ADMIN_PIN


def set_mpu_leds(r, g, b):
    """Set UNO Q RGB LEDs 1 and 2 (the Linux/MPU-controlled pair)."""
    global _mpu_led_state
    state = (bool(r), bool(g), bool(b))
    if state == _mpu_led_state:
        return
    try:
        Leds.set_led1_color(*state)
        Leds.set_led2_color(*state)
        _mpu_led_state = state
    except Exception as exc:
        print(f"[ReliefNode] MPU LED update failed: {exc}")


def board_mode(severity):
    global _board_mode_name, _mpu_help_until
    if severity not in VALID_MODES:
        return
    with _board_state_lock:
        _board_mode_name = severity
        _mpu_help_until = 0.0

    # Give LEDs 1-2 immediate feedback; a worker handles emergency blinking.
    if severity == "safe":
        set_mpu_leds(False, True, False)       # green
    elif severity == "alert":
        set_mpu_leds(True, True, False)        # amber
    else:
        set_mpu_leds(True, False, False)       # red; worker blinks it

    try:
        Bridge.call("set_mode", VALID_MODES[severity])
    except Exception as exc:
        print(f"[ReliefNode] Board mode update failed: {exc}")


def flash_help():
    global _mpu_help_until
    with _board_state_lock:
        _mpu_help_until = time.monotonic() + 4.0
    set_mpu_leds(True, False, True)             # magenta help pulse
    try:
        Bridge.call("flash_help")
    except Exception as exc:
        print(f"[ReliefNode] Help flash failed: {exc}")


def mpu_led_worker():
    """Keep LEDs 1-2 synchronized with the MCU-controlled LEDs 3-4."""
    while True:
        now = time.monotonic()
        with _board_state_lock:
            mode = _board_mode_name
            help_until = _mpu_help_until

        if now < help_until:
            on = int(now * 4) % 2 == 0          # 250 ms help flash
            set_mpu_leds(on, False, on)
        elif mode == "emergency":
            on = int(now * 2) % 2 == 0          # 500 ms emergency flash
            set_mpu_leds(on, False, False)
        elif mode == "alert":
            set_mpu_leds(True, True, False)
        else:
            set_mpu_leds(False, True, False)
        time.sleep(0.10)


def fetch_json(url, headers=None):
    request = Request(url, headers=headers or {})
    with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def weather_code_label(code):
    labels = {
        0: "Clear",
        1: "Mostly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Rime fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Heavy drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        80: "Rain showers",
        81: "Rain showers",
        82: "Heavy rain showers",
        85: "Snow showers",
        86: "Heavy snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm with hail",
        99: "Severe thunderstorm with hail",
    }
    return labels.get(code, f"Weather code {code}")


def parse_coordinates(settings):
    try:
        lat = float(settings["latitude"])
        lon = float(settings["longitude"])
    except (TypeError, ValueError):
        raise ValueError("Set a valid latitude and longitude first.")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Latitude/longitude are outside valid ranges.")
    return lat, lon


def fetch_open_meteo(lat, lon, units):
    is_f = units == "F"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": ",".join([
            "temperature_2m",
            "apparent_temperature",
            "relative_humidity_2m",
            "precipitation",
            "weather_code",
            "wind_speed_10m",
        ]),
        "daily": ",".join([
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max",
        ]),
        "forecast_days": 1,
        "timezone": "auto",
        "temperature_unit": "fahrenheit" if is_f else "celsius",
        "wind_speed_unit": "mph" if is_f else "kmh",
        "precipitation_unit": "inch" if is_f else "mm",
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urlencode(params)
    data = fetch_json(url, headers={"User-Agent": NWS_USER_AGENT})
    cur = data.get("current", {})
    daily = data.get("daily", {})
    code = cur.get("weather_code")
    return {
        "temperature": cur.get("temperature_2m"),
        "apparent_temperature": cur.get("apparent_temperature"),
        "humidity": cur.get("relative_humidity_2m"),
        "precipitation": cur.get("precipitation"),
        "wind_speed": cur.get("wind_speed_10m"),
        "weather_code": code,
        "condition": weather_code_label(code),
        "high_temperature": (daily.get("temperature_2m_max") or [None])[0],
        "low_temperature": (daily.get("temperature_2m_min") or [None])[0],
        "precipitation_probability": (daily.get("precipitation_probability_max") or [None])[0],
    }


def fetch_nws_alerts(lat, lon):
    url = "https://api.weather.gov/alerts/active?" + urlencode({"point": f"{lat:.4f},{lon:.4f}"})
    data = fetch_json(
        url,
        headers={
            "User-Agent": NWS_USER_AGENT,
            "Accept": "application/geo+json",
        },
    )
    alerts = []
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        alerts.append({
            "external_id": feature.get("id") or props.get("id") or f"{props.get('event','alert')}-{props.get('sent','')}",
            "event": props.get("event") or "Weather alert",
            "severity": props.get("severity") or "Unknown",
            "headline": props.get("headline") or props.get("event") or "Weather alert",
            "description": props.get("description") or "",
            "instruction": props.get("instruction") or "",
            "onset": props.get("onset") or "",
            "expires": props.get("expires") or "",
        })
    return alerts


def save_alerts(conn, alerts):
    now = now_iso()
    conn.execute("UPDATE emergency_alerts SET active = 0")
    for alert in alerts:
        existing = conn.execute(
            "SELECT first_seen FROM emergency_alerts WHERE external_id = ?",
            (alert["external_id"],),
        ).fetchone()
        first_seen = existing["first_seen"] if existing else now
        conn.execute(
            """INSERT INTO emergency_alerts(
                   external_id, event, severity, headline, description, instruction,
                   onset, expires, first_seen, last_seen, active
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
               ON CONFLICT(external_id) DO UPDATE SET
                   event=excluded.event,
                   severity=excluded.severity,
                   headline=excluded.headline,
                   description=excluded.description,
                   instruction=excluded.instruction,
                   onset=excluded.onset,
                   expires=excluded.expires,
                   last_seen=excluded.last_seen,
                   active=1""",
            (
                alert["external_id"],
                alert["event"],
                alert["severity"],
                alert["headline"],
                alert["description"],
                alert["instruction"],
                alert["onset"],
                alert["expires"],
                first_seen,
                now,
            ),
        )


def refresh_climate_data():
    with db_connect() as conn:
        settings = get_settings(conn)

    lat, lon = parse_coordinates(settings)
    units = settings["units"] if settings["units"] in VALID_UNITS else "F"
    location_name = settings["location_name"].strip() or f"{lat:.4f}, {lon:.4f}"

    weather = None
    alerts = []
    errors = []

    try:
        weather = fetch_open_meteo(lat, lon, units)
    except Exception as exc:
        errors.append(f"weather: {exc}")

    try:
        alerts = fetch_nws_alerts(lat, lon)
    except Exception as exc:
        # NWS is U.S.-focused; failing here does not block Open-Meteo weather logging.
        errors.append(f"NWS alerts: {exc}")

    if weather is None:
        raise RuntimeError("Could not fetch weather data. " + "; ".join(errors))

    with db_connect() as conn:
        save_alerts(conn, alerts)
        conn.execute(
            """INSERT INTO climate_logs(
                   created_at, location_name, latitude, longitude, units,
                   temperature, apparent_temperature, humidity, precipitation,
                   wind_speed, weather_code, high_temperature, low_temperature,
                   precipitation_probability, alert_count, source_status
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                now_iso(),
                location_name,
                lat,
                lon,
                units,
                weather["temperature"],
                weather["apparent_temperature"],
                weather["humidity"],
                weather["precipitation"],
                weather["wind_speed"],
                weather["weather_code"],
                weather["high_temperature"],
                weather["low_temperature"],
                weather["precipitation_probability"],
                len(alerts),
                "ok" if not errors else "partial: " + "; ".join(errors),
            ),
        )

    return {
        "location": location_name,
        "condition": weather["condition"],
        "alerts": len(alerts),
        "partial_errors": errors,
    }


def background_climate_worker():
    time.sleep(8)
    while True:
        try:
            with db_connect() as conn:
                settings = get_settings(conn)
            if settings["latitude"] and settings["longitude"]:
                result = refresh_climate_data()
                print(f"[ReliefNode] Climate refresh: {result}")
        except Exception as exc:
            print(f"[ReliefNode] Climate refresh skipped/failed: {exc}")
        time.sleep(CLIMATE_REFRESH_SECONDS)


def sentence_split(text):
    cleaned = re.sub(r"\s+", " ", text.strip())
    if not cleaned:
        return []
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]


def offline_action_summary(text, max_items=5):
    sentences = sentence_split(text)
    if not sentences:
        return ""

    action_words = {
        "avoid", "stay", "leave", "evacuate", "evacuation", "shelter", "call",
        "use", "bring", "do not", "don't", "wait", "remain", "move", "report",
        "close", "turn off", "keep", "drink", "check", "enter", "exit",
    }

    scored = []
    for index, sentence in enumerate(sentences):
        lower = sentence.lower()
        score = 0
        score += sum(4 for word in action_words if word in lower)
        if re.search(r"\b\d{1,2}(:\d{2})?\s*(am|pm)?\b", lower):
            score += 2
        if any(x in lower for x in ["warning", "emergency", "danger", "flood", "fire", "heat", "storm", "smoke"]):
            score += 2
        score += max(0, 3 - index * 0.25)
        scored.append((score, index, sentence))

    selected = sorted(scored, reverse=True)[:max_items]
    selected.sort(key=lambda x: x[1])
    bullets = []
    for _, _, sentence in selected:
        short = sentence
        if len(short) > 170:
            short = short[:167].rsplit(" ", 1)[0] + "…"
        bullets.append("• " + short)
    return "\n".join(bullets)


def _chunk_text(chunk):
    """Convert a streaming LLM chunk into plain text across Brick versions."""
    if chunk is None:
        return ""
    if isinstance(chunk, str):
        return chunk
    content = getattr(chunk, "content", None)
    if content is not None:
        return str(content)
    if isinstance(chunk, dict):
        for key in ("content", "text", "message"):
            if key in chunk and chunk[key] is not None:
                return str(chunk[key])
    return str(chunk)


def get_local_llm():
    """Lazily initialize the local App Lab LLM so the core emergency app still starts if a model is missing."""
    global _local_llm, _local_llm_error
    if _local_llm is not None:
        return _local_llm

    try:
        from arduino.app_bricks.llm import LargeLanguageModel
        model = LargeLanguageModel(model=LOCAL_LLM_MODEL)
        # Each emergency task should be independent; no conversational memory is needed.
        model.with_memory(0)
        _local_llm = model
        _local_llm_error = ""
        print(f"[ReliefNode] Local LLM initialized: {LOCAL_LLM_MODEL}")
        return _local_llm
    except Exception as exc:
        _local_llm_error = str(exc)
        print(f"[ReliefNode] Local LLM unavailable: {exc}")
        raise


def local_llm_generate(prompt):
    """Generate a complete response locally on the UNO Q using the llama.cpp-backed LLM Brick."""
    global _local_llm_error
    with _local_llm_lock:
        llm = get_local_llm()
        parts = []
        try:
            for chunk in llm.chat_stream(prompt):
                parts.append(_chunk_text(chunk))
            result = "".join(parts).strip()
            if not result:
                raise RuntimeError("The local model returned an empty response.")
            _local_llm_error = ""
            return result
        except Exception as exc:
            _local_llm_error = str(exc)
            raise


def clean_model_output(text):
    text = str(text or "").strip()
    text = re.sub(r"^```(?:text|markdown)?\\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\\s*```$", "", text)
    return text.strip()


def ai_summarize(text):
    text = text.strip()
    if not text:
        raise ValueError("Enter source instructions first.")

    prompt = (
        "You are Relief Node's on-device emergency communication assistant. "
        "Convert the SOURCE into a short action card with 3 to 5 bullets. "
        "Use ONLY facts explicitly present in SOURCE. Do not infer, diagnose, predict, "
        "or invent risks, locations, times, phone numbers, supplies, or instructions. "
        "Never add an evacuation instruction unless SOURCE explicitly says to evacuate. "
        "Preserve names, street names, addresses, times, phone numbers, quantities, and URLs exactly. "
        "Prefer direct plain language. If SOURCE is ambiguous, preserve the ambiguity rather than guessing. "
        "Return only bullet lines beginning with • and no preamble.\n\nSOURCE:\n" + text
    )

    try:
        result = clean_model_output(local_llm_generate(prompt))
        return result, "local_genai", ""
    except Exception as exc:
        # The emergency workflow must remain usable even if the downloaded model is absent or fails.
        print(f"[ReliefNode] Local GenAI failed, using deterministic fallback: {exc}")
        return offline_action_summary(text), "offline_fallback", str(exc)


def ai_translate(text, language):
    text = text.strip()
    language = language.strip()
    if not text or not language:
        raise ValueError("Provide notice text and a target language.")

    prompt = (
        f"Translate the emergency notice below into {language}. "
        "This translation is a draft for human review. Preserve every name, number, time, address, "
        "URL, warning level, and instruction. Do not add, remove, soften, strengthen, or reinterpret instructions. "
        "If a proper name should not be translated, keep it unchanged. Return only the translated notice.\n\nNOTICE:\n" + text
    )
    return clean_model_output(local_llm_generate(prompt))


def translate_notice_for_ui(title, body, language_name):
    """Translate the currently published notice while preserving the original DB record."""
    prompt = (
        f"Translate the emergency notice TITLE and BODY into {language_name}. "
        "This is display-only translation. Preserve every proper name, street name, address, number, time, "
        "URL, warning level, and instruction. Do not add or remove information. "
        "Return exactly this structure and no preamble:\n"
        "<<<TITLE>>>\n[translated title]\n<<<BODY>>>\n[translated body]\n\n"
        f"SOURCE TITLE:\n{title}\n\nSOURCE BODY:\n{body}"
    )
    output = clean_model_output(local_llm_generate(prompt))
    if "<<<TITLE>>>" in output and "<<<BODY>>>" in output:
        after_title = output.split("<<<TITLE>>>", 1)[1]
        translated_title, translated_body = after_title.split("<<<BODY>>>", 1)
        translated_title = translated_title.strip()
        translated_body = translated_body.strip()
        if translated_title and translated_body:
            return translated_title, translated_body

    # Small models occasionally ignore the requested separators; retry the two short fields independently.
    return ai_translate(title, language_name), ai_translate(body, language_name)

def on_get_state(client_id, data):
    broadcast_state()


def on_verify_admin(client_id, data):
    request_id = str(data.get("request_id", ""))[:120]
    ui.send_message("admin_auth", {
        "request_id": request_id,
        "ok": valid_pin(data),
        "explicit": bool(data.get("explicit", False)),
    })


def on_translate_notice_ui(client_id, data):
    request_id = str(data.get("request_id", ""))[:120]
    language = str(data.get("language", "")).strip().lower()
    try:
        notice_id = int(data.get("notice_id"))
    except (TypeError, ValueError):
        ui.send_message("notice_translation", {
            "request_id": request_id, "ok": False, "notice_id": 0, "language": language
        })
        return

    if language not in UI_NOTICE_LANGUAGES:
        ui.send_message("notice_translation", {
            "request_id": request_id, "ok": False, "notice_id": notice_id, "language": language
        })
        return

    with db_connect() as conn:
        notice = notice_by_id(conn, notice_id)
        cached = cached_notice_translation(conn, notice_id, language)

    if not notice:
        ui.send_message("notice_translation", {
            "request_id": request_id, "ok": False, "notice_id": notice_id, "language": language
        })
        return

    if cached:
        ui.send_message("notice_translation", {
            "request_id": request_id, "ok": True, "notice_id": notice_id, "language": language,
            "title": cached["title"], "body": cached["body"], "cached": True,
        })
        return

    def worker():
        try:
            title, body = translate_notice_for_ui(
                notice["title"], notice["body"], UI_NOTICE_LANGUAGES[language]
            )
            with db_connect() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO notice_translations(notice_id, language, title, body, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (notice_id, language, title, body, now_iso()),
                )
            ui.send_message("notice_translation", {
                "request_id": request_id, "ok": True, "notice_id": notice_id, "language": language,
                "title": title, "body": body, "cached": False,
            })
        except Exception as exc:
            print(f"[ReliefNode] UI notice translation failed: {exc}")
            ui.send_message("notice_translation", {
                "request_id": request_id, "ok": False, "notice_id": notice_id, "language": language,
                "error": str(exc),
            })

    threading.Thread(target=worker, daemon=True).start()


def on_check_in(client_id, data):
    status = str(data.get("status", "")).strip().lower()
    name = str(data.get("name", "")).strip()[:40] or "Anonymous"
    note = str(data.get("note", "")).strip()[:180]

    if status not in VALID_STATUSES:
        send_error("Choose Safe, Need Help, or Need Supplies.")
        return

    with db_connect() as conn:
        conn.execute(
            "INSERT INTO checkins(name, status, note, created_at) VALUES (?, ?, ?, ?)",
            (name, status, note, now_iso()),
        )

    if status == "help":
        flash_help()

    send_result({
        "safe": "Your SAFE check-in was recorded.",
        "help": "Your HELP request was recorded.",
        "supplies": "Your SUPPLIES request was recorded.",
    }[status])
    broadcast_state()


def on_publish_notice(client_id, data):
    if not valid_pin(data):
        send_error("Organizer PIN is incorrect.")
        return

    title = str(data.get("title", "")).strip()[:100]
    body = str(data.get("body", "")).strip()[:1600]
    severity = str(data.get("severity", "")).strip().lower()

    if not title or not body:
        send_error("A title and instructions are required.")
        return
    if severity not in VALID_MODES:
        send_error("Invalid severity.")
        return

    with db_connect() as conn:
        conn.execute(
            "INSERT INTO notices(title, body, severity, created_at) VALUES (?, ?, ?, ?)",
            (title, body, severity, now_iso()),
        )

    board_mode(severity)
    send_result("Emergency notice published.")
    broadcast_state()


def on_set_mode(client_id, data):
    if not valid_pin(data):
        send_error("Organizer PIN is incorrect.")
        return
    severity = str(data.get("severity", "")).strip().lower()
    if severity not in VALID_MODES:
        send_error("Invalid board mode.")
        return
    board_mode(severity)
    send_result(f"Board mode set to {severity.upper()}.")


def on_clear_checkins(client_id, data):
    if not valid_pin(data):
        send_error("Organizer PIN is incorrect.")
        return
    with db_connect() as conn:
        conn.execute("DELETE FROM checkins")
    send_result("Check-ins cleared.")
    broadcast_state()


def on_save_climate_settings(client_id, data):
    if not valid_pin(data):
        send_error("Organizer PIN is incorrect.")
        return

    name = str(data.get("location_name", "")).strip()[:100]
    units = str(data.get("units", "F")).strip().upper()
    try:
        lat = float(data.get("latitude"))
        lon = float(data.get("longitude"))
    except (TypeError, ValueError):
        send_error("Latitude and longitude must be numbers.")
        return

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        send_error("Latitude/longitude are outside valid ranges.")
        return
    if units not in VALID_UNITS:
        units = "F"

    with db_connect() as conn:
        set_setting(conn, "location_name", name)
        set_setting(conn, "latitude", lat)
        set_setting(conn, "longitude", lon)
        set_setting(conn, "units", units)

    send_result("Climate location saved. Refreshing public data…")
    try:
        result = refresh_climate_data()
        send_result(
            f"Climate data updated for {result['location']}: "
            f"{result['condition']}; {result['alerts']} active NWS alert(s)."
        )
    except Exception as exc:
        send_error(f"Location saved, but online refresh failed: {exc}")
    broadcast_state()


def on_refresh_climate(client_id, data):
    if not valid_pin(data):
        send_error("Organizer PIN is incorrect.")
        return
    try:
        result = refresh_climate_data()
        send_result(
            f"Climate data updated: {result['condition']}; "
            f"{result['alerts']} active NWS alert(s)."
        )
        broadcast_state()
    except Exception as exc:
        send_error(f"Climate refresh failed: {exc}")


def on_test_local_ai(client_id, data):
    if not valid_pin(data):
        send_error("Organizer PIN is incorrect.")
        return

    def worker():
        ui.send_message("ai_busy", {"busy": True, "message": "Testing the on-device model…"})
        try:
            answer = local_llm_generate(
                "Reply with exactly: RELIEF NODE LOCAL AI READY"
            )
            send_result(f"Local GenAI responded: {answer[:160]}")
        except Exception as exc:
            send_error(
                "Local LLM is not ready. Download the Relief Node model in App Lab's AI Models section, "
                f"then run again. Details: {exc}"
            )
        finally:
            ui.send_message("ai_busy", {"busy": False})
            broadcast_state()

    threading.Thread(target=worker, daemon=True).start()

def on_ai_summarize(client_id, data):
    if not valid_pin(data):
        send_error("Organizer PIN is incorrect.")
        return
    text = str(data.get("text", ""))[:6000]

    def worker():
        ui.send_message("ai_busy", {"busy": True, "message": "On-device GenAI is creating an action card…"})
        try:
            summary, mode, detail = ai_summarize(text)
            if mode == "local_genai":
                message = "On-device GenAI draft ready — review before publishing."
            else:
                message = "Local model unavailable; deterministic offline fallback created the draft. Review before publishing."
            ui.send_message("ai_draft", {
                "text": summary,
                "mode": mode,
                "message": message,
                "detail": detail,
            })
        except Exception as exc:
            send_error(f"Could not create summary: {exc}")
        finally:
            ui.send_message("ai_busy", {"busy": False})
            broadcast_state()

    threading.Thread(target=worker, daemon=True).start()


def on_ai_translate(client_id, data):
    request_id = str(data.get("request_id", "")).strip()[:120]
    language = str(data.get("language", "")).strip()[:50]

    def translation_status(state, message=""):
        ui.send_message("translation_status", {
            "request_id": request_id,
            "state": state,
            "language": language,
            "message": message,
        })

    if not valid_pin(data):
        translation_status("error", "Organizer PIN is incorrect.")
        send_error("Organizer PIN is incorrect.")
        return

    text = str(data.get("text", ""))[:4000]
    if not text or not language:
        translation_status("error", "Provide notice text and a target language.")
        send_error("Provide notice text and a target language.")
        return


    def worker():
        translation_status("working", f"Translating to {language}…")
        ui.send_message("ai_busy", {"busy": True, "message": f"On-device GenAI is translating to {language}…"})
        try:
            translated = ai_translate(text, language)
            ui.send_message("translation_draft", {
                "request_id": request_id,
                "text": translated,
                "language": language,
                "message": "On-device translation draft ready — verify before publishing.",
            })
            translation_status("done", "Translation complete.")
        except Exception as exc:
            translation_status("error", str(exc))
            send_error(
                "Local translation failed. Make sure the local LLM model is downloaded and available. "
                f"Details: {exc}"
            )
        finally:
            ui.send_message("ai_busy", {"busy": False})
            broadcast_state()

    threading.Thread(target=worker, daemon=True).start()


print("===================================")
print("Relief Node Climate + Local GenAI backend starting")
print("===================================")

init_db()

ui.on_message("get_state", on_get_state)
ui.on_message("verify_admin", on_verify_admin)
ui.on_message("translate_notice_ui", on_translate_notice_ui)
ui.on_message("check_in", on_check_in)
ui.on_message("publish_notice", on_publish_notice)
ui.on_message("set_mode", on_set_mode)
ui.on_message("clear_checkins", on_clear_checkins)
ui.on_message("save_climate_settings", on_save_climate_settings)
ui.on_message("refresh_climate", on_refresh_climate)
ui.on_message("test_local_ai", on_test_local_ai)
ui.on_message("ai_summarize", on_ai_summarize)
ui.on_message("ai_translate", on_ai_translate)

try:
    current = state()["notice"]
    if current:
        board_mode(current["severity"])
except Exception as exc:
    print(f"[ReliefNode] Initial board sync skipped: {exc}")

threading.Thread(target=mpu_led_worker, daemon=True).start()
threading.Thread(target=background_climate_worker, daemon=True).start()

print(f"Relief Node ready. Local LLM target: {LOCAL_LLM_MODEL}")
print("Open the Network URL printed by WebUI below.")
App.run()
