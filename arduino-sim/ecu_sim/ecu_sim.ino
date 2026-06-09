// Generic ECU Simulator
// OBD-II (SAE J1979) + ISO-TP (ISO 15765-2)
// Arduino MKR + CAN Shield

#include <CAN.h>
#include "ECU_protocol.h"

// ---------- GLOBALS ----------
VehicleData vehicle;
DTC dtcList[8];
uint8_t numStoredDTCs = 0;

unsigned long lastUpdate    = 0;
unsigned long engineStartTime = 0;
bool engineRunning = false;
uint8_t udsSession = 1;  // 1=default, 3=extended

bool keyOn = false;

volatile uint16_t ignitionFlag      = 0;
volatile uint32_t lastIgnitionISR   = 0;
volatile uint16_t dtcFlag           = 0;
volatile uint32_t lastDtcISR        = 0;

static const uint16_t DTC_FAULT_SET[]   = { DTC_P0300, DTC_P0171, DTC_P0420 };
static const uint8_t  DTC_FAULT_SET_SIZE = 3;

uint8_t responseBuffer[7];
uint8_t responseLength = 0;

// ---------- PROTOTYPES ----------
void handleIgnitionButton();
void handleDTCButton();
void broadcastVehicleState();
void sendResponse();
void sendNegativeResponse(uint8_t mode, uint8_t errorCode);
void sendMultiFrame(const uint8_t* payload, uint8_t payloadLen);
void sendVINMultiFrame();
bool waitForFlowControl();
bool handleMode10(uint8_t subFunc);
bool handleMode22(uint16_t did);

// ---------- ISRs — FALLING edge + millis() hysteresis ----------
void onIgnitionPress() {
  uint32_t now = millis();
  if ((uint32_t)(now - lastIgnitionISR) < IGNITION_HYSTERESIS_MS) return;
  lastIgnitionISR = now;
  ignitionFlag++;
}
void onDTCPress() {
  uint32_t now = millis();
  if ((uint32_t)(now - lastDtcISR) < DTC_HYSTERESIS_MS) return;
  lastDtcISR = now;
  dtcFlag++;
}

// ---------- IGNITION BUTTON ----------
void handleIgnitionButton() {
  if (!ignitionFlag) return;
  ignitionFlag--;
  keyOn = !keyOn;
  if (keyOn) {
    vehicle.rpm = 850;
    Serial.println(F("[IGN] Key ON — engine starting (850 RPM)"));
  } else {
    vehicle.rpm = 0;
    Serial.println(F("[IGN] Key OFF — engine stopped"));
  }
}

// ---------- DTC FAULT BUTTON ----------
void handleDTCButton() {
  if (!dtcFlag) return;
  dtcFlag--;
  if (numStoredDTCs >= DTC_FAULT_SET_SIZE) {
    for (uint8_t i = 0; i < 8; i++) { dtcList[i].code = DTC_P0000; dtcList[i].active = false; }
    numStoredDTCs       = 0;
    vehicle.numDTCs     = 0;
    vehicle.checkEngine = false;
    Serial.println(F("[DTC] All faults cleared"));
  } else {
    dtcList[numStoredDTCs].code   = DTC_FAULT_SET[numStoredDTCs];
    dtcList[numStoredDTCs].active = true;
    numStoredDTCs++;
    vehicle.numDTCs     = numStoredDTCs;
    vehicle.checkEngine = true;
    Serial.print(F("[DTC] Fault injected — active DTCs: "));
    Serial.println(numStoredDTCs);
  }
}

// ---------- SETUP ----------
void setup() {
  Serial.begin(SERIAL_BAUDRATE);
  while (!Serial) { ; }

  Serial.println(F("==========================================="));
  Serial.println(F("     GENERIC ECU SIMULATOR"));
  Serial.println(F("       ISO-TP (ISO 15765-2)"));
  Serial.println(F("==========================================="));

  if (!CAN.begin(CAN_SPEED)) {
    Serial.println(F("[ERROR] CAN Bus init failed"));
    while (1) delay(1000);
  }
  Serial.print(F("[OK] CAN Bus at "));
  Serial.print(CAN_SPEED / 1000);
  Serial.println(F(" kbps"));

  initVehicleData();
  initDTCs();

  pinMode(ENGINE_START_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENGINE_START_PIN), onIgnitionPress, FALLING);
  Serial.print(F("[OK] Ignition button on pin D"));
  Serial.println(ENGINE_START_PIN);

  pinMode(DTC_FAULT_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(DTC_FAULT_PIN), onDTCPress, FALLING);
  Serial.print(F("[OK] DTC fault button on pin D"));
  Serial.println(DTC_FAULT_PIN);

  Serial.print(F("[INFO] VIN: "));
  Serial.println(vehicle.vin);
  Serial.print(F("[INFO] Listen: 0x"));
  Serial.println(ECU_CAN_ID, HEX);
  Serial.print(F("[INFO] Reply:  0x"));
  Serial.println(ECU_RESPONSE_ID, HEX);
  Serial.println(F("===========================================\n"));
}

// ---------- LOOP ----------
void loop() {
  handleIgnitionButton();
  handleDTCButton();
  updateVehicleSimulation();
#if BROADCAST_ENABLE
  broadcastVehicleState();
#endif
  processCANMessages();
  delay(10);
}

// ---------- INITIALIZATION ----------

void initVehicleData() {
  strcpy(vehicle.vin, "ARDUINO0000000000");  // 17 chars exactos (cabe en vin[18] con null)

  vehicle.engineType         = ENGINE_TYPE_GENERIC;
  vehicle.odometer           = 0;
  vehicle.engineLoad         = 0;
  vehicle.coolantTemp        = 20;
  vehicle.rpm                = 0;
  vehicle.speed              = 0;
  vehicle.timingAdvance      = 0;
  vehicle.intakeTemp         = 20;
  vehicle.mafFlow            = 0;
  vehicle.throttlePos        = 0;
  vehicle.throttlePosB       = 0;
  vehicle.pedalAccelD        = 0;
  vehicle.pedalAccelE        = 0;
  vehicle.fuelLevel          = 75;
  vehicle.fuelPressure       = 0;
  vehicle.intakeMAP          = 101;
  vehicle.fuelRailPressure   = 0;
  vehicle.fuelConsumptionRate= 0;
  vehicle.batteryVoltage     = 12450;
  vehicle.oilTemp            = 20;
  vehicle.ambientTemp        = 20;
  vehicle.barometricPressure = 101;
  vehicle.checkEngine        = false;
  vehicle.numDTCs            = 0;
  vehicle.runtimeSinceStart  = 0;
  vehicle.distanceSinceClear = 0;
  vehicle.shortFuelTrim1     = 0;
  vehicle.longFuelTrim1      = 0;

  engineRunning   = false;
  engineStartTime = 0;
}

void initDTCs() {
  for (int i = 0; i < 8; i++) {
    dtcList[i].code   = DTC_P0000;
    dtcList[i].active = false;
  }
  numStoredDTCs = 0;
}

// ---------- SIMULATION ----------
// Updates all engine parameters each SIM_UPDATE_INTERVAL_DEFAULT ms.
// Throttle → RPM (first-order lag), RPM → Speed (longitudinal model),
// correlated params, sensor noise, physical clamps.
void updateVehicleSimulation() {
  static unsigned long lastSimUpdate = 0;
  unsigned long currentTime = millis();

  if (currentTime - lastSimUpdate < SIM_UPDATE_INTERVAL_DEFAULT) return;
  uint16_t dtMs = (uint16_t)(currentTime - lastSimUpdate);
  lastSimUpdate = currentTime;
  lastUpdate    = currentTime;

  if (vehicle.rpm > 0 && !engineRunning) {
    engineRunning   = true;
    engineStartTime = currentTime;
  } else if (vehicle.rpm == 0 && engineRunning) {
    engineRunning       = false;
    vehicle.throttlePos = 0;
  }

  if (engineRunning) {
    // --- Throttle ramp state machine ---
    static uint8_t rampState = 0;  // 0=idle, 1=rampup, 2=cruise, 3=rampdown
    static uint16_t rampTick = 0;
    switch (rampState) {
      case 0:  // idle — throttle at 0
        vehicle.throttlePos = 0;
        if (++rampTick >= RAMP_IDLE_TICKS)   { rampTick = 0; rampState = 1; }
        break;
      case 1:  // ramp up
        vehicle.throttlePos = (uint8_t)min((int)vehicle.throttlePos + RAMP_STEP, (int)RAMP_MAX_THROTTLE);
        if (vehicle.throttlePos >= RAMP_MAX_THROTTLE) { rampState = 2; rampTick = 0; }
        break;
      case 2:  // cruise
        if (++rampTick >= RAMP_CRUISE_TICKS) { rampTick = 0; rampState = 3; }
        break;
      case 3:  // ramp down
        vehicle.throttlePos = (vehicle.throttlePos > RAMP_STEP) ?
                              vehicle.throttlePos - RAMP_STEP : 0;
        if (vehicle.throttlePos == 0)        { rampState = 0; rampTick = 0; }
        break;
    }

    int16_t targetRpm = (int16_t)map(vehicle.throttlePos, 0, 100, 850, 5500);
    float alpha = 0.3f * ((float)dtMs / 200.0f);
    if (alpha > 1.0f) alpha = 1.0f;
    vehicle.rpm = (uint16_t)(vehicle.rpm + alpha * (targetRpm - (int16_t)vehicle.rpm));

    float force = 0.00002f * (float)vehicle.rpm * (float)vehicle.engineLoad
                - 0.003f   * (float)vehicle.speed * (float)vehicle.speed;
    force *= ((float)dtMs / 200.0f);
    vehicle.speed = (uint8_t)constrain((int16_t)vehicle.speed + (int16_t)force, 0, 180);

    vehicle.engineLoad         = (uint8_t)map(vehicle.throttlePos, 0, 100, 15, 85);
    vehicle.mafFlow            = (uint16_t)((vehicle.rpm * vehicle.engineLoad) / 500);
    vehicle.timingAdvance      = (int8_t)map(vehicle.rpm, 800, 6000, 8, 32);
    vehicle.fuelRailPressure   = 30;
    vehicle.fuelPressure       = (uint8_t)map(vehicle.engineLoad, 0, 100, 30, 60); // kPa
    vehicle.intakeMAP          = (uint8_t)map(vehicle.engineLoad, 0, 100, 30, 100);// kPa
    vehicle.throttlePosB       = vehicle.throttlePos;
    vehicle.pedalAccelD        = vehicle.throttlePos;
    vehicle.pedalAccelE        = vehicle.throttlePos;
    vehicle.fuelConsumptionRate= (uint16_t)((vehicle.rpm * vehicle.engineLoad) / 800); // L/h ×20

    if (vehicle.coolantTemp < 90) vehicle.coolantTemp += random(1, 4);
    if (vehicle.oilTemp     < 95) vehicle.oilTemp     += random(1, 3);
    if (vehicle.intakeTemp  < vehicle.ambientTemp + 15) vehicle.intakeTemp++;
    if (vehicle.batteryVoltage < 13800) vehicle.batteryVoltage += 50;

    static uint8_t fuelTick = 0;
    if (++fuelTick >= (uint8_t)(30 - vehicle.engineLoad / 5)) {
      fuelTick = 0;
      if (vehicle.fuelLevel > 0) vehicle.fuelLevel--;
    }

    vehicle.runtimeSinceStart = (currentTime - engineStartTime) / 1000;

#if ADD_NOISE
    vehicle.rpm            += random(-NOISE_RPM_MAX,       NOISE_RPM_MAX + 1);
    vehicle.coolantTemp    += random(-NOISE_COOLANT_MAX,   NOISE_COOLANT_MAX + 1);
    vehicle.oilTemp        += random(-NOISE_OIL_MAX,       NOISE_OIL_MAX + 1);
    vehicle.intakeTemp     += random(-NOISE_INTAKE_MAX,    NOISE_INTAKE_MAX + 1);
    vehicle.mafFlow        += random(-NOISE_MAF_MAX,       NOISE_MAF_MAX + 1);
    vehicle.batteryVoltage += random(-NOISE_VOLTAGE_MAX,   NOISE_VOLTAGE_MAX + 1);
    vehicle.shortFuelTrim1 += random(-NOISE_FUEL_TRIM_MAX, NOISE_FUEL_TRIM_MAX + 1);
#endif

    vehicle.rpm            = constrain(vehicle.rpm,            750,  6500);
    vehicle.coolantTemp    = constrain(vehicle.coolantTemp,    -40,   130);
    vehicle.oilTemp        = constrain(vehicle.oilTemp,        -40,   150);
    vehicle.intakeTemp     = constrain(vehicle.intakeTemp,     -40,    80);
    vehicle.batteryVoltage = constrain(vehicle.batteryVoltage, 13800, 14400);
    vehicle.throttlePos    = constrain(vehicle.throttlePos,    0,     100);
    vehicle.shortFuelTrim1 = constrain(vehicle.shortFuelTrim1, -100,   99);
    if ((int16_t)vehicle.mafFlow < 0) vehicle.mafFlow = 0;

  } else {
    vehicle.runtimeSinceStart  = 0;
    vehicle.rpm                = 0;
    vehicle.engineLoad         = 0;
    vehicle.mafFlow            = 0;
    vehicle.fuelRailPressure   = 0;
    vehicle.fuelPressure       = 0;
    vehicle.intakeMAP          = (uint8_t)vehicle.barometricPressure;
    vehicle.fuelConsumptionRate= 0;
    vehicle.timingAdvance      = 0;

    if (vehicle.speed > 0)
      vehicle.speed = (uint8_t)constrain((int16_t)vehicle.speed - 2, 0, 255);

    if (vehicle.coolantTemp > vehicle.ambientTemp) vehicle.coolantTemp -= random(0, 2);
    if (vehicle.oilTemp     > vehicle.ambientTemp) vehicle.oilTemp     -= random(0, 2);
    if (vehicle.intakeTemp  > vehicle.ambientTemp) vehicle.intakeTemp--;

    if (vehicle.batteryVoltage > 12600) vehicle.batteryVoltage -= 20;
    vehicle.batteryVoltage = constrain(vehicle.batteryVoltage, 12200, 12600);
  }
}

// ---------- BROADCAST ----------
// Emits unsolicited CAN frames every BROADCAST_INTERVAL_MS (like a real ECU).
void broadcastVehicleState() {
  static unsigned long lastBroadcast = 0;
  unsigned long now = millis();
  if (now - lastBroadcast < BROADCAST_INTERVAL_MS) return;
  lastBroadcast = now;

  uint8_t frame[8];

  uint16_t rpmRaw = (uint16_t)(vehicle.rpm * 4);
  frame[0] = 0x00;
  frame[1] = (rpmRaw >> 8) & 0xFF;
  frame[2] = rpmRaw & 0xFF;
  frame[3] = encodePercent(vehicle.engineLoad);
  frame[4] = 0x00; frame[5] = 0x00; frame[6] = 0x00;
  frame[7] = (uint8_t)(engineRunning ? 0x01 : 0x00);
  CAN.beginPacket(0x280); CAN.write(frame, 8); CAN.endPacket();

  uint16_t speedRaw = (uint16_t)(vehicle.speed * 100);
  frame[0] = (speedRaw >> 8) & 0xFF; frame[1] = speedRaw & 0xFF;
  frame[2] = (speedRaw >> 8) & 0xFF; frame[3] = speedRaw & 0xFF;
  frame[4] = (speedRaw >> 8) & 0xFF; frame[5] = speedRaw & 0xFF;
  frame[6] = (speedRaw >> 8) & 0xFF; frame[7] = speedRaw & 0xFF;
  CAN.beginPacket(0x320); CAN.write(frame, 8); CAN.endPacket();

  frame[0] = encodeTemp(vehicle.coolantTemp);
  frame[1] = encodePercent(vehicle.throttlePos);
  frame[2] = (uint8_t)(vehicle.batteryVoltage >> 8);
  frame[3] = (uint8_t)(vehicle.batteryVoltage & 0xFF);
  frame[4] = 0x00; frame[5] = 0x00; frame[6] = 0x00; frame[7] = 0x00;
  CAN.beginPacket(0x3D0); CAN.write(frame, 8); CAN.endPacket();
  logCANFrame("[BC TX]", 0x3D0, frame, 8);
}

// ---------- CAN LOG ----------
void logCANFrame(const char* tag, uint32_t id, const uint8_t* data, uint8_t len) {
#if LOG_LEVEL >= 1
  Serial.print(tag);
  Serial.print(F(" 0x")); Serial.print(id, HEX);
  Serial.print(F(" |"));
  for (uint8_t i = 0; i < len; i++) {
    Serial.print(F(" "));
    if (data[i] < 0x10) Serial.print(F("0"));
    Serial.print(data[i], HEX);
  }
  Serial.println();
#else
  (void)tag; (void)id; (void)data; (void)len;
#endif
}

// ---------- CAN RX — ISO-TP ----------
// Parses incoming ISO-TP Single Frame OBD-II requests, dispatches to mode handlers.
void processCANMessages() {
  int packetSize = CAN.parsePacket();
  if (packetSize <= 0) return;

  uint32_t id = CAN.packetId();
  if (id != ECU_CAN_ID) return;

  uint8_t data[8];
  uint8_t dataLen = 0;
  while (CAN.available() && dataLen < 8)
    data[dataLen++] = (uint8_t)CAN.read();

  if (dataLen < 1) return;

  uint8_t pciType   = (data[0] & 0xF0);
  uint8_t pciLength = (data[0] & 0x0F);

  if (pciType != ISOTP_PCI_SF) {
    Serial.print(F("[WARN] Non-SF PCI: 0x")); Serial.println(data[0], HEX);
    return;
  }
  if (pciLength < 1 || dataLen < 2) {
    Serial.println(F("[WARN] SF too short"));
    return;
  }

  uint8_t mode = data[1];
  uint8_t pid  = data[2];

#if LOG_LEVEL >= 1
  Serial.print(F("\n[RX] 0x")); Serial.print(id, HEX);
  Serial.print(F(" Mode:0x")); Serial.print(mode, HEX);
  Serial.print(F(" PID:0x"));  Serial.println(pid, HEX);
#endif

  bool handled = false;
  switch (mode) {
    case MODE_01_CURRENT_DATA: handled = handleMode01(pid); break;
    case MODE_03_DTCS:         handled = handleMode03();    break;
    case MODE_04_CLEAR_DTCS:   handled = handleMode04();    break;
    case MODE_09_VEHICLE_INFO: handled = handleMode09(pid); break;
    case 0x10: handled = handleMode10(pid); break;
    case 0x22: {
      uint8_t didLow = (dataLen >= 4) ? data[3] : 0x00;
      handled = handleMode22((uint16_t)(pid << 8) | didLow);
      break;
    }
    default:
      sendNegativeResponse(mode, NRC_SERVICE_NOT_SUPPORTED);
      handled = true;
      break;
  }

  if (!handled) sendNegativeResponse(mode, NRC_SUBFUNCTION_NOT_SUPP);
}

// ---------- MODE 01 ----------
bool handleMode01(uint8_t pid) {
  responseLength = 0;

  // BASIC mode: reject PIDs not in the core set before entering the switch
#if SIM_MODE == SIM_MODE_BASIC
  switch (pid) {
    case 0x00: case 0x20: case 0x40:           // support bitmask queries
    case PID_ENGINE_LOAD:   case PID_COOLANT_TEMP:
    case PID_ENGINE_RPM:    case PID_VEHICLE_SPEED:
    case PID_THROTTLE_POS:  case PID_CONTROL_MODULE_VOLTAGE:
      break;  // allowed — fall through to main switch
    default:
      return false;  // NRC: subfunction not supported
  }
#endif

  switch (pid) {
    // --- Support bitmask PIDs (0x00 / 0x20 / 0x40) ---
    case PID_SUPPORTED_01_20:  // 0x00 — PIDs 0x01-0x20
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
#if SIM_MODE == SIM_MODE_BASIC
      // 0x04,0x05,0x0C,0x0D,0x11 + next-range bit (0x20)
      responseBuffer[2] = 0x18; responseBuffer[3] = 0x18;
      responseBuffer[4] = 0x80; responseBuffer[5] = 0x01;
#else
      // Full: 0x04-0x07,0x0A-0x11,0x1F + next-range
      // byte[2] 0x01-0x08: 0x04(b4),0x05(b3),0x06(b2),0x07(b1) = 0x1E
      // byte[3] 0x09-0x10: 0x0A(b6),0x0B(b5),0x0C(b4),0x0D(b3),0x0E(b2),0x0F(b1),0x10(b0) = 0x7F
      // byte[4] 0x11-0x18: 0x11(b7) = 0x80
      // byte[5] 0x19-0x20: 0x1F(b1),next(b0) = 0x03
      responseBuffer[2] = 0x1E; responseBuffer[3] = 0x7F;
      responseBuffer[4] = 0x80; responseBuffer[5] = 0x03;
#endif
      responseLength = 6;
      break;

    case 0x20:  // PIDs 0x21-0x40
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
#if SIM_MODE == SIM_MODE_BASIC
      // only next-range bit (0x40) so 0x42 is reachable
      responseBuffer[2] = 0x00; responseBuffer[3] = 0x00;
      responseBuffer[4] = 0x00; responseBuffer[5] = 0x01;
#else
      // Full: 0x23,0x2F,0x31,0x33 + next-range
      // byte[2] 0x21-0x28: 0x23(b5) = 0x20
      // byte[3] 0x29-0x30: 0x2F(b1) = 0x02
      // byte[4] 0x31-0x38: 0x31(b7),0x33(b5) = 0xA0
      // byte[5] 0x39-0x40: next(b0) = 0x01
      responseBuffer[2] = 0x20; responseBuffer[3] = 0x02;
      responseBuffer[4] = 0xA0; responseBuffer[5] = 0x01;
#endif
      responseLength = 6;
      break;

    case 0x40:  // PIDs 0x41-0x60
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
#if SIM_MODE == SIM_MODE_BASIC
      // 0x42 only
      responseBuffer[2] = 0x40; responseBuffer[3] = 0x00;
      responseBuffer[4] = 0x00; responseBuffer[5] = 0x00;
#else
      // Full: 0x42,0x46,0x47,0x49,0x4A,0x5C,0x5E
      // byte[2] 0x41-0x48: 0x42(b6),0x46(b2),0x47(b1) = 0x46
      // byte[3] 0x49-0x50: 0x49(b7),0x4A(b6) = 0xC0
      // byte[4] 0x51-0x58: none = 0x00
      // byte[5] 0x59-0x60: 0x5C(b4),0x5E(b2) = 0x14
      responseBuffer[2] = 0x46; responseBuffer[3] = 0xC0;
      responseBuffer[4] = 0x00; responseBuffer[5] = 0x14;
#endif
      responseLength = 6;
      break;
    case PID_ENGINE_LOAD:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = encodePercent(vehicle.engineLoad);
      responseLength = 3;
      break;
    case PID_FUEL_PRESSURE:          // 0x0A — kPa, wire: A = kPa/3
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = vehicle.fuelPressure / 3;
      responseLength = 3;
      break;
    case PID_INTAKE_MAP:             // 0x0B — kPa, wire: A = kPa
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = vehicle.intakeMAP;
      responseLength = 3;
      break;
    case PID_COOLANT_TEMP:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = encodeTemp(vehicle.coolantTemp);
      responseLength = 3;
      break;
    case PID_ENGINE_RPM:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      encodeRPM(&responseBuffer[2], vehicle.rpm);
      responseLength = 4;
      break;
    case PID_VEHICLE_SPEED:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = vehicle.speed;
      responseLength = 3;
      break;
    case PID_TIMING_ADVANCE:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = (uint8_t)((vehicle.timingAdvance + 64) * 2);
      responseLength = 3;
      break;
    case PID_INTAKE_TEMP:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = encodeTemp(vehicle.intakeTemp);
      responseLength = 3;
      break;
    case PID_MAF_FLOW:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = (vehicle.mafFlow >> 8) & 0xFF;
      responseBuffer[3] = vehicle.mafFlow & 0xFF;
      responseLength = 4;
      break;
    case PID_THROTTLE_POS:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = encodePercent(vehicle.throttlePos);
      responseLength = 3;
      break;
    case PID_RUNTIME_START:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = (vehicle.runtimeSinceStart >> 8) & 0xFF;
      responseBuffer[3] = vehicle.runtimeSinceStart & 0xFF;
      responseLength = 4;
      break;
    case PID_FUEL_LEVEL:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = encodePercent(vehicle.fuelLevel);
      responseLength = 3;
      break;
    case PID_DISTANCE_CLEAR:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = (vehicle.distanceSinceClear >> 8) & 0xFF;
      responseBuffer[3] = vehicle.distanceSinceClear & 0xFF;
      responseLength = 4;
      break;
    case PID_BAROMETRIC_PRESSURE:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = vehicle.barometricPressure;
      responseLength = 3;
      break;
    case PID_CONTROL_MODULE_VOLTAGE:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = (vehicle.batteryVoltage >> 8) & 0xFF;
      responseBuffer[3] = vehicle.batteryVoltage & 0xFF;
      responseLength = 4;
      break;
    case PID_AMBIENT_TEMP:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = encodeTemp(vehicle.ambientTemp);
      responseLength = 3;
      break;
    case PID_THROTTLE_POS_B:         // 0x47
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = encodePercent(vehicle.throttlePosB);
      responseLength = 3;
      break;
    case PID_ACCEL_PEDAL_D:          // 0x49
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = encodePercent(vehicle.pedalAccelD);
      responseLength = 3;
      break;
    case PID_ACCEL_PEDAL_E:          // 0x4A
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = encodePercent(vehicle.pedalAccelE);
      responseLength = 3;
      break;
    case PID_ENGINE_OIL_TEMP:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = encodeTemp(vehicle.oilTemp);
      responseLength = 3;
      break;
    case PID_SHORT_FUEL_TRIM_1:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      encodeFuelTrim(&responseBuffer[2], vehicle.shortFuelTrim1);
      responseLength = 3;
      break;
    case PID_LONG_FUEL_TRIM_1:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      encodeFuelTrim(&responseBuffer[2], vehicle.longFuelTrim1);
      responseLength = 3;
      break;
    case PID_FUEL_RAIL_PRESSURE:
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = (vehicle.fuelRailPressure >> 8) & 0xFF;
      responseBuffer[3] = vehicle.fuelRailPressure & 0xFF;
      responseLength = 4;
      break;
    case PID_FUEL_RATE:              // 0x5E — L/h ×20, 2 bytes BE
      responseBuffer[0] = MODE_01_CURRENT_DATA + RESPONSE_SUCCESS;
      responseBuffer[1] = pid;
      responseBuffer[2] = (vehicle.fuelConsumptionRate >> 8) & 0xFF;
      responseBuffer[3] = vehicle.fuelConsumptionRate & 0xFF;
      responseLength = 4;
      break;
    default:
      return false;
  }

  if (responseLength > 0) { sendResponse(); return true; }
  return false;
}

// ---------- MODE 03 ----------
// Sends up to 2 DTCs as ISO-TP Single Frame (max 7 payload bytes).
bool handleMode03() {
  responseBuffer[0] = MODE_03_DTCS + RESPONSE_SUCCESS;
  responseLength = 2;

  uint8_t toSend = min(numStoredDTCs, (uint8_t)2);
  responseBuffer[1] = toSend;
  for (uint8_t i = 0; i < toSend; i++) {
    if (dtcList[i].active && responseLength <= ISOTP_SF_MAX_PAYLOAD - 2) {
      responseBuffer[responseLength++] = (dtcList[i].code >> 8) & 0xFF;
      responseBuffer[responseLength++] = dtcList[i].code & 0xFF;
    }
  }

  sendResponse();
#if LOG_LEVEL >= 1
  Serial.print(F("[INFO] Sent ")); Serial.print(toSend); Serial.println(F(" DTCs"));
#endif
  return true;
}

// ---------- MODE 04 ----------
bool handleMode04() {
  for (int i = 0; i < 8; i++) {
    dtcList[i].code   = DTC_P0000;
    dtcList[i].active = false;
  }
  numStoredDTCs              = 0;
  vehicle.numDTCs            = 0;
  vehicle.checkEngine        = false;
  vehicle.distanceSinceClear = 0;

  responseBuffer[0] = MODE_04_CLEAR_DTCS + RESPONSE_SUCCESS;
  responseLength = 1;
  sendResponse();
  Serial.println(F("[INFO] DTCs cleared"));
  return true;
}

// ---------- MODE 09 ----------
bool handleMode09(uint8_t pid) {
  switch (pid) {
    case 0x02:
#if LOG_LEVEL >= 1
      Serial.print(F("[INFO] VIN: ")); Serial.println(vehicle.vin);
#endif
      sendVINMultiFrame();
      return true;
    default:
      return false;
  }
}

// ---------- TX: SINGLE FRAME ----------
// Wraps responseBuffer in ISO-TP SF [PCI | payload | 0xAA padding] and sends on ECU_RESPONSE_ID.
void sendResponse() {
  if (responseLength == 0) return;
  if (responseLength > ISOTP_SF_MAX_PAYLOAD) {
    Serial.println(F("[ERROR] Payload > 7 bytes"));
    return;
  }

  uint8_t frame[8];
  frame[0] = (uint8_t)responseLength;
  for (uint8_t i = 0; i < responseLength; i++) frame[1 + i] = responseBuffer[i];
  for (uint8_t i = responseLength + 1; i < 8; i++) frame[i] = ISOTP_PADDING_BYTE;

  CAN.beginPacket(ECU_RESPONSE_ID);
  for (uint8_t i = 0; i < 8; i++) CAN.write(frame[i]);
  CAN.endPacket();

#if LOG_LEVEL >= 1
  Serial.print(F("[TX SF] 0x")); Serial.print(ECU_RESPONSE_ID, HEX); Serial.print(F(" | "));
  for (uint8_t i = 0; i < 8; i++) {
    if (frame[i] < 0x10) Serial.print(F("0"));
    Serial.print(frame[i], HEX); Serial.print(F(" "));
  }
  Serial.println();
#endif
}

// ---------- TX: NEGATIVE RESPONSE ----------
// Sends ISO-TP NRC frame [0x03, 0x7F, mode, errorCode, 0xAA×4].
void sendNegativeResponse(uint8_t mode, uint8_t errorCode) {
  uint8_t frame[8] = { 0x03, NEGATIVE_RESPONSE, mode, errorCode,
                        ISOTP_PADDING_BYTE, ISOTP_PADDING_BYTE,
                        ISOTP_PADDING_BYTE, ISOTP_PADDING_BYTE };
  CAN.beginPacket(ECU_RESPONSE_ID);
  for (uint8_t i = 0; i < 8; i++) CAN.write(frame[i]);
  CAN.endPacket();

#if LOG_LEVEL >= 1
  Serial.print(F("[TX NRC] Mode=0x")); Serial.print(mode, HEX);
  Serial.print(F(" Err=0x")); Serial.println(errorCode, HEX);
#endif
}

// ---------- TX: VIN MULTI-FRAME ----------
// Sends 20-byte VIN payload as ISO-TP FF + CF1 + CF2 sequence.
void sendVINMultiFrame() {
  const uint8_t PAYLOAD_LEN = 3 + VIN_LENGTH;
  uint8_t payload[20];
  payload[0] = MODE_09_VEHICLE_INFO + RESPONSE_SUCCESS;
  payload[1] = 0x02;
  payload[2] = 0x01;
  for (uint8_t i = 0; i < VIN_LENGTH; i++) payload[3 + i] = (uint8_t)vehicle.vin[i];

  uint8_t ff[8];
  ff[0] = ISOTP_PCI_FF | ((PAYLOAD_LEN >> 8) & 0x0F);
  ff[1] = PAYLOAD_LEN & 0xFF;
  for (uint8_t i = 0; i < ISOTP_FF_DATA_BYTES; i++) ff[2 + i] = payload[i];

  CAN.beginPacket(ECU_RESPONSE_ID);
  for (uint8_t i = 0; i < 8; i++) CAN.write(ff[i]);
  CAN.endPacket();

#if LOG_LEVEL >= 1
  Serial.print(F("[TX FF] 0x")); Serial.print(ECU_RESPONSE_ID, HEX); Serial.print(F(" | "));
  for (uint8_t i = 0; i < 8; i++) {
    if (ff[i] < 0x10) Serial.print(F("0"));
    Serial.print(ff[i], HEX); Serial.print(F(" "));
  }
  Serial.println();
#endif

  if (!waitForFlowControl())
    Serial.println(F("[WARN] FC timeout — sending CFs anyway"));

  uint8_t bytesSent = ISOTP_FF_DATA_BYTES;
  uint8_t sn = 1;
  while (bytesSent < PAYLOAD_LEN) {
    uint8_t cf[8];
    cf[0] = ISOTP_PCI_CF | (sn & 0x0F);
    for (uint8_t i = 0; i < ISOTP_CF_DATA_BYTES; i++) {
      uint8_t idx = bytesSent + i;
      cf[1 + i] = (idx < PAYLOAD_LEN) ? payload[idx] : ISOTP_PADDING_BYTE;
    }
    CAN.beginPacket(ECU_RESPONSE_ID);
    for (uint8_t i = 0; i < 8; i++) CAN.write(cf[i]);
    CAN.endPacket();

#if LOG_LEVEL >= 1
    Serial.print(F("[TX CF] SN=0x")); Serial.print(sn & 0x0F, HEX); Serial.print(F(" | "));
    for (uint8_t i = 0; i < 8; i++) {
      if (cf[i] < 0x10) Serial.print(F("0"));
      Serial.print(cf[i], HEX); Serial.print(F(" "));
    }
    Serial.println();
#endif

    bytesSent += ISOTP_CF_DATA_BYTES;
    sn = (sn + 1) & 0x0F;
    if (bytesSent < PAYLOAD_LEN) delay(ISOTP_CF_SEP_MS);
  }
#if LOG_LEVEL >= 1
  Serial.println(F("[INFO] VIN complete"));
#endif
}

// ---------- UDS MODE 10 — DiagnosticSessionControl ----------
bool handleMode10(uint8_t subFunc) {
  if (subFunc != 0x01 && subFunc != 0x03) {
    sendNegativeResponse(0x10, NRC_SUBFUNCTION_NOT_SUPP);
    return true;
  }
  udsSession = subFunc;
  responseBuffer[0] = 0x50;
  responseBuffer[1] = subFunc;
  responseBuffer[2] = 0x00; responseBuffer[3] = 0x19;  // P2=25ms
  responseBuffer[4] = 0x01; responseBuffer[5] = 0xF4;  // P2ext=500ms
  responseLength = 6;
  sendResponse();
  Serial.print(F("[UDS] Session -> "));
  Serial.println(subFunc == 3 ? F("extended") : F("default"));
  return true;
}

// ---------- UDS MODE 22 — ReadDataByIdentifier ----------
bool handleMode22(uint16_t did) {
  uint8_t payload[24];
  uint8_t payloadLen = 0;

  payload[0] = 0x62;
  payload[1] = (did >> 8) & 0xFF;
  payload[2] = did & 0xFF;

  switch (did) {
    case 0xF190:  // VIN — 17 bytes, always accessible
      for (uint8_t i = 0; i < VIN_LENGTH; i++) payload[3 + i] = (uint8_t)vehicle.vin[i];
      payloadLen = 3 + VIN_LENGTH;
      break;
    case 0xF18C:  // ECU Serial Number
      memcpy(&payload[3], "ECU00001", 8);
      payloadLen = 11;
      break;
    case 0xF189:  // Software Version
      memcpy(&payload[3], "V1.0.0", 6);
      payloadLen = 9;
      break;
    case 0x2001:  // Engine Load — extended session only
      if (udsSession != 3) { sendNegativeResponse(0x22, NRC_CONDITIONS_NOT_CORRECT); return true; }
      payload[3] = encodePercent(vehicle.engineLoad);
      payloadLen = 4;
      break;
    case 0x2002:  // Coolant Temp
      if (udsSession != 3) { sendNegativeResponse(0x22, NRC_CONDITIONS_NOT_CORRECT); return true; }
      payload[3] = encodeTemp(vehicle.coolantTemp);
      payloadLen = 4;
      break;
    case 0x2003:  // Engine RPM
      if (udsSession != 3) { sendNegativeResponse(0x22, NRC_CONDITIONS_NOT_CORRECT); return true; }
      encodeRPM(&payload[3], vehicle.rpm);
      payloadLen = 5;
      break;
    case 0x2004:  // Vehicle Speed
      if (udsSession != 3) { sendNegativeResponse(0x22, NRC_CONDITIONS_NOT_CORRECT); return true; }
      payload[3] = vehicle.speed;
      payloadLen = 4;
      break;
    case 0x2005:  // Throttle Position
      if (udsSession != 3) { sendNegativeResponse(0x22, NRC_CONDITIONS_NOT_CORRECT); return true; }
      payload[3] = encodePercent(vehicle.throttlePos);
      payloadLen = 4;
      break;
    case 0x2006:  // Fuel Level
      if (udsSession != 3) { sendNegativeResponse(0x22, NRC_CONDITIONS_NOT_CORRECT); return true; }
      payload[3] = encodePercent(vehicle.fuelLevel);
      payloadLen = 4;
      break;
    case 0x2007:  // Engine Oil Temp
      if (udsSession != 3) { sendNegativeResponse(0x22, NRC_CONDITIONS_NOT_CORRECT); return true; }
      payload[3] = encodeTemp(vehicle.oilTemp);
      payloadLen = 4;
      break;
    case 0x2008:  // Battery Voltage (mV, 2 bytes)
      if (udsSession != 3) { sendNegativeResponse(0x22, NRC_CONDITIONS_NOT_CORRECT); return true; }
      payload[3] = (vehicle.batteryVoltage >> 8) & 0xFF;
      payload[4] = vehicle.batteryVoltage & 0xFF;
      payloadLen = 5;
      break;
    default:
      sendNegativeResponse(0x22, NRC_REQUEST_OUT_OF_RANGE);
      return true;
  }

  if (payloadLen <= ISOTP_SF_MAX_PAYLOAD) {
    memcpy(responseBuffer, payload, payloadLen);
    responseLength = payloadLen;
    sendResponse();
  } else {
    sendMultiFrame(payload, payloadLen);
  }

  Serial.print(F("[UDS] DID 0x")); Serial.print(did, HEX);
  Serial.print(F(" -> ")); Serial.print(payloadLen - 3); Serial.println(F(" bytes"));
  return true;
}

// ---------- TX: GENERIC MULTI-FRAME ----------
void sendMultiFrame(const uint8_t* payload, uint8_t payloadLen) {
  uint8_t ff[8];
  ff[0] = ISOTP_PCI_FF | ((payloadLen >> 8) & 0x0F);
  ff[1] = payloadLen & 0xFF;
  for (uint8_t i = 0; i < ISOTP_FF_DATA_BYTES; i++) ff[2 + i] = payload[i];

  CAN.beginPacket(ECU_RESPONSE_ID);
  for (uint8_t i = 0; i < 8; i++) CAN.write(ff[i]);
  CAN.endPacket();

  Serial.print(F("[TX FF] 0x")); Serial.print(ECU_RESPONSE_ID, HEX); Serial.print(F(" | "));
  for (uint8_t i = 0; i < 8; i++) {
    if (ff[i] < 0x10) Serial.print(F("0"));
    Serial.print(ff[i], HEX); Serial.print(F(" "));
  }
  Serial.println();

  if (!waitForFlowControl())
    Serial.println(F("[WARN] FC timeout — sending CFs anyway"));

  uint8_t bytesSent = ISOTP_FF_DATA_BYTES;
  uint8_t sn = 1;
  while (bytesSent < payloadLen) {
    uint8_t cf[8];
    cf[0] = ISOTP_PCI_CF | (sn & 0x0F);
    for (uint8_t i = 0; i < ISOTP_CF_DATA_BYTES; i++) {
      uint8_t idx = bytesSent + i;
      cf[1 + i] = (idx < payloadLen) ? payload[idx] : ISOTP_PADDING_BYTE;
    }
    CAN.beginPacket(ECU_RESPONSE_ID);
    for (uint8_t i = 0; i < 8; i++) CAN.write(cf[i]);
    CAN.endPacket();

    Serial.print(F("[TX CF] SN=0x")); Serial.print(sn & 0x0F, HEX); Serial.print(F(" | "));
    for (uint8_t i = 0; i < 8; i++) {
      if (cf[i] < 0x10) Serial.print(F("0"));
      Serial.print(cf[i], HEX); Serial.print(F(" "));
    }
    Serial.println();

    bytesSent += ISOTP_CF_DATA_BYTES;
    sn = (sn + 1) & 0x0F;
    if (bytesSent < payloadLen) delay(ISOTP_CF_SEP_MS);
  }
}

// ---------- FLOW CONTROL ----------
// Polls CAN for FC frame from scanner. Returns false on ISOTP_FC_TIMEOUT_MS timeout.
bool waitForFlowControl() {
  unsigned long deadline = millis() + ISOTP_FC_TIMEOUT_MS;
#if LOG_LEVEL >= 1
  Serial.println(F("[INFO] Waiting for FC..."));
#endif
  while (millis() < deadline) {
    int pktSize = CAN.parsePacket();
    if (pktSize > 0) {
      uint32_t rxId = CAN.packetId();
      uint8_t  pci  = (uint8_t)CAN.read();
      while (CAN.available()) CAN.read();

      if (rxId == ECU_CAN_ID && (pci & 0xF0) == ISOTP_PCI_FC) {
#if LOG_LEVEL >= 1
        Serial.print(F("[RX FC] flag=0x")); Serial.println(pci & 0x0F, HEX);
#endif
        return true;
      }
    }
  }
  return false;
}
