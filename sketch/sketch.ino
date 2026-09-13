#include <Arduino.h>
#include <Arduino_RouterBridge.h>
#include <Arduino_LED_Matrix.h>

Arduino_LED_Matrix matrix;

int currentMode = 0; // 0 safe, 1 alert, 2 emergency
bool helpActive = false;
bool blinkOn = true;
unsigned long helpUntil = 0;
unsigned long lastBlink = 0;

void setLed3(bool r, bool g, bool b) {
  digitalWrite(LED3_R, r ? LOW : HIGH);
  digitalWrite(LED3_G, g ? LOW : HIGH);
  digitalWrite(LED3_B, b ? LOW : HIGH);
}

void setLed4(bool r, bool g, bool b) {
  digitalWrite(LED4_R, r ? LOW : HIGH);
  digitalWrite(LED4_G, g ? LOW : HIGH);
  digitalWrite(LED4_B, b ? LOW : HIGH);
}

void setMcuLeds(bool r, bool g, bool b) {
  setLed3(r, g, b);
  setLed4(r, g, b);
}

void rgbOff()       { setMcuLeds(false, false, false); }
void rgbSafe()      { setMcuLeds(false, true,  false); } // green
void rgbAlert()     { setMcuLeds(true,  true,  false); } // amber
void rgbEmergency() { setMcuLeds(true,  false, false); } // red
void rgbHelp()      { setMcuLeds(true,  false, true ); } // magenta

void setPixel(uint8_t *frame, int row, int col) {
  if (row >= 0 && row < 8 && col >= 0 && col < 13) {
    frame[row * 13 + col] = 1;
  }
}

void setBlock(uint8_t *frame, int row, int col) {
  setPixel(frame, row, col);
  setPixel(frame, row, col + 1);
  setPixel(frame, row + 1, col);
  setPixel(frame, row + 1, col + 1);
}

void drawSafe() {
  uint8_t frame[104] = {0};
  // Large, thick check mark across most of the 8x13 matrix.
  setBlock(frame, 4, 1);
  setBlock(frame, 5, 2);
  setBlock(frame, 5, 3);
  setBlock(frame, 4, 4);
  setBlock(frame, 3, 5);
  setBlock(frame, 2, 6);
  setBlock(frame, 1, 7);
  setBlock(frame, 0, 8);
  matrix.draw(frame);
}

void drawAlert() {
  uint8_t frame[104] = {0};
  // One large exclamation point for ALERT.
  for (int r = 1; r <= 4; r++) {
    setPixel(frame, r, 5);
    setPixel(frame, r, 6);
    setPixel(frame, r, 7);
  }
  setPixel(frame, 6, 5);
  setPixel(frame, 6, 6);
  setPixel(frame, 6, 7);
  matrix.draw(frame);
}

void drawEmergency() {
  uint8_t frame[104] = {0};
  // Three exclamation marks: !!!
  const int centers[3] = {2, 6, 10};
  for (int i = 0; i < 3; i++) {
    int c = centers[i];
    for (int r = 1; r <= 4; r++) setPixel(frame, r, c);
    setPixel(frame, 6, c);
  }
  matrix.draw(frame);
}

void drawHelp() {
  uint8_t frame[104] = {0};
  // H
  for (int r = 1; r <= 6; r++) {
    setPixel(frame, r, 2);
    setPixel(frame, r, 5);
  }
  for (int c = 2; c <= 5; c++) setPixel(frame, 4, c);
  // !
  for (int r = 1; r <= 4; r++) setPixel(frame, r, 9);
  setPixel(frame, 6, 9);
  matrix.draw(frame);
}

void allOff() {
  rgbOff();
  matrix.clear();
}

void showCurrentMode() {
  blinkOn = true;
  lastBlink = millis();
  if (currentMode == 0) {
    rgbSafe();
    drawSafe();
  } else if (currentMode == 1) {
    rgbAlert();
    drawAlert();
  } else {
    rgbEmergency();
    drawEmergency();
  }
}

bool set_mode(int mode) {
  if (mode < 0 || mode > 2) return false;
  currentMode = mode;
  helpActive = false;
  showCurrentMode();
  return true;
}

bool flash_help() {
  helpActive = true;
  helpUntil = millis() + 4000;
  blinkOn = true;
  lastBlink = millis();
  rgbHelp();
  drawHelp();
  return true;
}

void setup() {
  pinMode(LED3_R, OUTPUT);
  pinMode(LED3_G, OUTPUT);
  pinMode(LED3_B, OUTPUT);
  pinMode(LED4_R, OUTPUT);
  pinMode(LED4_G, OUTPUT);
  pinMode(LED4_B, OUTPUT);
  rgbOff();

  matrix.begin();
  matrix.setGrayscaleBits(1);
  matrix.clear();

  Bridge.begin();
  Bridge.provide_safe("set_mode", set_mode);
  Bridge.provide_safe("flash_help", flash_help);

  showCurrentMode();
}

void loop() {
  const unsigned long now = millis();

  if (helpActive) {
    if ((long)(now - helpUntil) >= 0) {
      helpActive = false;
      showCurrentMode();
      return;
    }
    if (now - lastBlink >= 250) {
      lastBlink = now;
      blinkOn = !blinkOn;
      if (blinkOn) {
        rgbHelp();
        drawHelp();
      } else {
        allOff();
      }
    }
    return;
  }

  if (currentMode == 2 && now - lastBlink >= 500) {
    lastBlink = now;
    blinkOn = !blinkOn;
    if (blinkOn) {
      rgbEmergency();
      drawEmergency();
    } else {
      allOff();
    }
  }
}
