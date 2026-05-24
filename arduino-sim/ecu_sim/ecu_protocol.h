// Generic ECU Simulator — Protocol definitions
// OBD-II (SAE J1979) + ISO-TP (ISO 15765-2)

#ifndef ECU_PROTOCOL_H
#define ECU_PROTOCOL_H

#include <Arduino.h>

// ---------- SIMULATION CONFIG ----------
// ADD_NOISE: 1 = sensor noise enabled, 0 = clean deterministic values
#define ADD_NOISE     1

// SIM_MODE: selects which PIDs the simulated ECU reports as supported
//   SIM_MODE_FULL  — all PIDs handled by this firmware (matches a full ECU)
//   SIM_MODE_BASIC — only the 6 core PIDs: RPM, Speed, Coolant, Load, Throttle, Battery
#define SIM_MODE_FULL  0
#define SIM_MODE_BASIC 1
#define SIM_MODE       SIM_MODE_FULL

// ---------- LOGGING ----------
// 0 = quiet (only errors + key events), 1 = all RX/TX frames, 2 = + broadcasts
#define LOG_LEVEL 0

// ---------- CAN BUS ----------
#define CAN_SPEED          500E3
#define ECU_CAN_ID         0x7E0
#define ECU_RESPONSE_ID    0x7E8

#define TCU_CAN_ID         0x7E1
#define TCU_RESPONSE_ID    0x7E9
#define ABS_CAN_ID         0x7E2
#define ABS_RESPONSE_ID    0x7EA
#define AIRBAG_CAN_ID      0x7E3
#define AIRBAG_RESPONSE_ID 0x7EB

// ---------- ISO-TP ----------
// PCI byte: high nibble = frame type, low nibble = payload length or SN
#define ISOTP_PCI_SF       0x00  // Single Frame
#define ISOTP_PCI_FF       0x10  // First Frame
#define ISOTP_PCI_CF       0x20  // Consecutive Frame
#define ISOTP_PCI_FC       0x30  // Flow Control

#define ISOTP_PADDING_BYTE   0xAA
#define ISOTP_FC_TIMEOUT_MS  1000
#define ISOTP_CF_SEP_MS      25
#define ISOTP_SF_MAX_PAYLOAD 7
#define ISOTP_FF_DATA_BYTES  6
#define ISOTP_CF_DATA_BYTES  7

// ---------- OBD-II MODES ----------
#define MODE_01_CURRENT_DATA       0x01
#define MODE_02_FREEZE_FRAME       0x02
#define MODE_03_DTCS               0x03
#define MODE_04_CLEAR_DTCS         0x04
#define MODE_05_O2_SENSOR          0x05
#define MODE_06_TEST_RESULTS       0x06
#define MODE_07_PENDING_DTCS       0x07
#define MODE_09_VEHICLE_INFO       0x09
#define MODE_22_EXTENDED_DATA      0x22

// ---------- MODE 01 PIDS ----------
#define PID_SUPPORTED_01_20        0x00
#define PID_MONITOR_STATUS         0x01
#define PID_FREEZE_DTC             0x02
#define PID_FUEL_SYSTEM_STATUS     0x03
#define PID_ENGINE_LOAD            0x04
#define PID_COOLANT_TEMP           0x05
#define PID_SHORT_FUEL_TRIM_1      0x06
#define PID_LONG_FUEL_TRIM_1       0x07
#define PID_SHORT_FUEL_TRIM_2      0x08
#define PID_LONG_FUEL_TRIM_2       0x09
#define PID_FUEL_PRESSURE          0x0A
#define PID_INTAKE_MAP             0x0B
#define PID_ENGINE_RPM             0x0C
#define PID_VEHICLE_SPEED          0x0D
#define PID_TIMING_ADVANCE         0x0E
#define PID_INTAKE_TEMP            0x0F
#define PID_MAF_FLOW               0x10
#define PID_THROTTLE_POS           0x11
#define PID_O2_SENSORS_PRESENT     0x13
#define PID_O2_B1S1                0x14
#define PID_OBD_STANDARDS          0x1C
#define PID_RUNTIME_START          0x1F
#define PID_DISTANCE_MIL           0x21
#define PID_FUEL_RAIL_PRESSURE     0x23
#define PID_COMMANDED_EGR          0x2C
#define PID_EGR_ERROR              0x2D
#define PID_FUEL_LEVEL             0x2F
#define PID_DISTANCE_CLEAR         0x31
#define PID_BAROMETRIC_PRESSURE    0x33
#define PID_CONTROL_MODULE_VOLTAGE 0x42
#define PID_ABSOLUTE_LOAD          0x43
#define PID_AMBIENT_TEMP           0x46
#define PID_THROTTLE_POS_B         0x47
#define PID_THROTTLE_POS_C         0x48
#define PID_FUEL_TYPE              0x51
#define PID_ETHANOL_FUEL           0x52
#define PID_ENGINE_OIL_TEMP        0x5C

// ---------- OBD-II RESPONSES ----------
#define RESPONSE_SUCCESS           0x40
#define NEGATIVE_RESPONSE          0x7F

#define NRC_SERVICE_NOT_SUPPORTED  0x11
#define NRC_SUBFUNCTION_NOT_SUPP   0x12
#define NRC_INVALID_FORMAT         0x13
#define NRC_CONDITIONS_NOT_CORRECT 0x22
#define NRC_REQUEST_OUT_OF_RANGE   0x31
#define NRC_SECURITY_ACCESS_DENIED 0x33

// ---------- SYSTEM ----------
#define SERIAL_BAUDRATE              115200
#define MAX_CAN_DATA_LEN             8
#define SIM_UPDATE_INTERVAL_DEFAULT  200

// ---------- HARDWARE ----------
#define ENGINE_START_PIN     7
#define IGNITION_DEBOUNCE_MS 200
#define DTC_FAULT_PIN        6
#define DTC_DEBOUNCE_MS      300

// ---------- CAN NOISE ----------
#define CAN_NOISE_DROP_PCT         2
#define CAN_NOISE_NRC_PCT          1
#define CAN_NOISE_LATENCY_MIN_MS   1
#define CAN_NOISE_LATENCY_MAX_MS   15
#define CAN_NOISE_BG_TRAFFIC_PCT   30
#define CAN_BG_ID_COUNT            4
static const uint32_t CAN_BG_IDS[CAN_BG_ID_COUNT] = {0x280, 0x480, 0x320, 0x520};

// ---------- VEHICLE ----------
#define VIN_LENGTH           17
#define ENGINE_TYPE_GENERIC  0x01

// ---------- SENSOR NOISE AMPLITUDES ----------
#define NOISE_RPM_MAX        25
#define NOISE_COOLANT_MAX     1
#define NOISE_OIL_MAX         1
#define NOISE_INTAKE_MAX      1
#define NOISE_MAF_MAX         8
#define NOISE_THROTTLE_MAX    1
#define NOISE_VOLTAGE_MAX    30
#define NOISE_FUEL_TRIM_MAX   1
#define NOISE_BARO_MAX        0

// ---------- DATA STRUCTURES ----------
struct VehicleData {
  char     vin[18];
  uint8_t  engineType;
  uint16_t odometer;

  uint8_t  engineLoad;
  int16_t  coolantTemp;
  uint16_t rpm;
  uint8_t  speed;
  int8_t   timingAdvance;
  int16_t  intakeTemp;
  uint16_t mafFlow;
  uint8_t  throttlePos;
  uint8_t  fuelLevel;
  uint16_t fuelRailPressure;
  uint16_t batteryVoltage;     // mV
  int16_t  oilTemp;
  int16_t  ambientTemp;
  uint16_t barometricPressure;

  bool     checkEngine;
  uint8_t  numDTCs;
  uint32_t runtimeSinceStart;
  uint16_t distanceSinceClear;

  int8_t shortFuelTrim1;
  int8_t longFuelTrim1;
};

struct DTC {
  uint16_t code;
  bool     active;
};

// ---------- DTC CODES ----------
#define DTC_P0000  0x0000
#define DTC_P0016  0x0016
#define DTC_P0101  0x0101
#define DTC_P0171  0x0171
#define DTC_P0420  0x0420
#define DTC_P0299  0x0299
#define DTC_P0401  0x0401
#define DTC_P0300  0x0300
#define DTC_P0301  0x0301
#define DTC_P0113  0x0113
#define DTC_P0118  0x0118
#define DTC_P0340  0x0340
#define DTC_P0500  0x0500

// ---------- UDS (ISO 14229-1) ----------
#define UDS_SID_SESSION_CTRL       0x10  // DiagnosticSessionControl
#define UDS_SID_READ_DATA_BY_ID    0x22  // ReadDataByIdentifier

#define UDS_RESP_SESSION_CTRL      0x50  // 0x10 + 0x40
#define UDS_RESP_READ_DATA_BY_ID   0x62  // 0x22 + 0x40

// Session types
#define UDS_SESSION_DEFAULT        0x01
#define UDS_SESSION_PROGRAMMING    0x02
#define UDS_SESSION_EXTENDED       0x03

// NRC: service not available in active session
#define NRC_SESSION_NOT_SUPPORTED  0x7E

// Session inactivity timeout before auto-revert to Default
#define UDS_SESSION_TIMEOUT_MS     5000

// ---------- UDS DIDs ----------
// ISO 14229-1 standard DIDs (available in Default + Extended)
#define DID_VIN                    0xF190  // Vehicle Identification Number (17 ASCII)
#define DID_ECU_SERIAL             0xF18C  // ECU Serial Number (4 ASCII)
#define DID_SW_VERSION             0xF189  // Software Version (4 ASCII)

// Proprietary live-data DIDs — Extended session only
#define DID_ENGINE_LOAD_UDS        0x2001  // uint8, percent×255/100
#define DID_COOLANT_TEMP_UDS       0x2002  // int16 BE, °C
#define DID_RPM_UDS                0x2003  // uint16 BE, rpm
#define DID_VEHICLE_SPEED_UDS      0x2004  // uint8, km/h
#define DID_THROTTLE_POS_UDS       0x2005  // uint8, percent×255/100
#define DID_FUEL_LEVEL_UDS         0x2006  // uint8, percent×255/100
#define DID_OIL_TEMP_UDS           0x2007  // int16 BE, °C
#define DID_BATTERY_VOLTAGE_UDS    0x2008  // uint16 BE, mV

// ---------- ENCODING UTILITIES ----------
// OBD-II wire format: rpm*4, temp+40, percent*255/100, fuel trim 0-255 centered at 128

inline void encodeRPM(uint8_t* data, uint16_t rpm) {
  uint16_t encoded = rpm * 4;
  data[0] = (encoded >> 8) & 0xFF;
  data[1] = encoded & 0xFF;
}

inline uint16_t decodeRPM(uint8_t* data) {
  return ((uint16_t)data[0] << 8 | data[1]) / 4;
}

inline uint8_t encodeTemp(int16_t temp) {
  return (uint8_t)(temp + 40);
}

inline int16_t decodeTemp(uint8_t encoded) {
  return (int16_t)encoded - 40;
}

inline uint8_t encodePercent(uint8_t percent) {
  return (percent * 255) / 100;
}

inline uint8_t decodePercent(uint8_t encoded) {
  return (encoded * 100) / 255;
}

inline void encodeFuelTrim(uint8_t* data, int8_t trim) {
  *data = (uint8_t)((trim + 100) * 128 / 100);
}

inline int8_t decodeFuelTrim(uint8_t encoded) {
  return ((int16_t)encoded * 100 / 128) - 100;
}

#endif // ECU_PROTOCOL_H
