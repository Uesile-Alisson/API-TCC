/*
 * TSEA - Firmware ESP32 para a API NestJS
 * Contrato MQTT oficial: schema_version 2
 * Alvo: ESP32 Dev Module / ESP32-WROOM, Arduino-ESP32 3.x
 *
 * Bibliotecas instaladas pelo Library Manager:
 *   - ArduinoJson 7.x (Benoit Blanchon)
 *   - PubSubClient 2.8.x (Nick O'Leary)
 *
 * IMPORTANTE:
 * 1. Revise toda a secao CONFIGURACAO OBRIGATORIA antes de energizar.
 * 2. Saidas do ESP32 acionam drivers, reles/contatores ou MOSFETs adequados.
 *    Nunca alimente bomba ou solenoide diretamente por um GPIO.
 * 3. Este firmware confirma o comando eletrico aplicado ao GPIO. Sem sensores
 *    de corrente/posicao, isso nao e confirmacao mecanica do atuador.
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <math.h>
#include <stdlib.h>
#include <sys/time.h>
#include <time.h>

// =============================================================================
// CONFIGURACAO OBRIGATORIA
// =============================================================================

constexpr char WIFI_SSID[] = "ALTERE_AQUI";
constexpr char WIFI_PASSWORD[] = "ALTERE_AQUI";

// Use o IP/nome da maquina que executa o broker. "localhost" apontaria para
// o proprio ESP32 e, portanto, nao deve ser usado aqui.
constexpr char MQTT_HOST[] = "192.168.1.100";
constexpr uint16_t MQTT_PORT = 1883;
constexpr char MQTT_USERNAME[] = "";
constexpr char MQTT_PASSWORD[] = "";
constexpr bool MQTT_USE_TLS = false;

// Para TLS, cole a CA raiz do broker entre R"CERT(...)CERT" e use porta 8883.
// Nao e usado setInsecure(): TLS sem CA valida permanece bloqueado.
constexpr char MQTT_CA_CERT[] = R"CERT(
)CERT";

constexpr char DEVICE_ID[] = "ESP32_TSEA_01";
constexpr char FIRMWARE_VERSION[] = "tsea-esp32-2.0.0";

/*
 * O seed atual cita XGZP6847D001MP. Se esse for exatamente o componente
 * fisico, ele normalmente representa faixa positiva de 0..1000 kPa e nao e
 * apropriado para o alvo de vacuo -80 kPa. Confirme no corpo/nota fiscal que
 * o sensor mede -100..0 kPa (por exemplo, variante 100KPGN), confirme a
 * revisao do datasheet e so entao altere esta constante para true.
 */
constexpr bool VACUUM_SENSOR_CONFIGURATION_CONFIRMED = false;
constexpr float XGZP_PRESSURE_MIN_PA = -100000.0F;
constexpr float XGZP_PRESSURE_MAX_PA = 0.0F;

// Revisoes antigas do XGZP6847D (endereco 0x6D) usam Raw/K em Pa. Informe o
// K da folha de dados exata caso o autodetector encontre o protocolo legado.
constexpr float XGZP_LEGACY_K = 64.0F;
constexpr bool XGZP_LEGACY_K_CONFIRMED = false;

// Tres XGZP6847D de mesma revisao compartilham o mesmo endereco I2C. O modo
// recomendado usa um multiplexador TCA9548A nos canais 0, 1 e 2.
constexpr bool USE_TCA9548A = true;
constexpr uint8_t TCA9548A_ADDRESS = 0x70;
constexpr uint8_t XGZP_MUX_CHANNELS[3] = {0, 1, 2};
constexpr uint8_t XGZP_DIRECT_ADDRESSES[3] = {0x58, 0x59, 0x5A};

// ESP32-WROOM. GPIO16/17 nao devem ser usados assim em placas WROVER com PSRAM.
constexpr uint8_t I2C_SDA_PIN = 21;
constexpr uint8_t I2C_SCL_PIN = 22;
constexpr uint8_t VALVE_PINS[6] = {13, 14, 16, 17, 18, 19};
constexpr uint8_t MAIN_PUMP_PIN = 23;
constexpr uint8_t AUX_PUMP_PWM_PIN = 25;
constexpr uint8_t COUPLING_PINS[3] = {26, 27, 32};
constexpr uint8_t AUX_POTENTIOMETER_PIN = 33;  // ADC1; funciona durante Wi-Fi.

// Ajuste conforme a placa de acionamento. O boot sempre escreve o nivel inativo.
constexpr uint8_t VALVE_ACTIVE_LEVEL = HIGH;
constexpr uint8_t MAIN_PUMP_ACTIVE_LEVEL = HIGH;
constexpr uint8_t COUPLING_ACTIVE_LEVEL = LOW;  // INPUT_PULLUP, contato para GND.

// Entrada fisica opcional de emergencia. GPIO34 nao tem pull-up interno.
// Se habilitar, instale resistor externo e prefira contato NC (fail-safe).
constexpr bool ENABLE_PHYSICAL_ESTOP = false;
constexpr uint8_t PHYSICAL_ESTOP_PIN = 34;
constexpr uint8_t PHYSICAL_ESTOP_ACTIVE_LEVEL = LOW;

// INICIAR_PROCESSO_VACUO carrega somente o contexto operacional. A API abre
// cada VP_Tn selecionada e liga a bomba principal em comandos individuais,
// aguardando o ACK EXECUTADO de cada etapa antes de prosseguir.
constexpr bool START_COMMAND_ACTUATES_MAIN_LINE = false;

// PWM e potenciometro sao exclusivamente locais e nunca entram no MQTT.
constexpr uint32_t AUX_PWM_FREQUENCY_HZ = 20000;
constexpr uint8_t AUX_PWM_RESOLUTION_BITS = 8;
constexpr uint16_t AUX_POT_MIN_MV = 100;
constexpr uint16_t AUX_POT_MAX_MV = 3100;
constexpr uint8_t AUX_MIN_SAFE_DUTY = 90;

// =============================================================================
// CONSTANTES OPERACIONAIS
// =============================================================================

constexpr uint8_t MQTT_SCHEMA_VERSION = 2;
constexpr size_t MQTT_PACKET_BUFFER_SIZE = 12288;
constexpr size_t MQTT_OUT_BUFFER_SIZE = 6144;
constexpr uint32_t WIFI_RECONNECT_INTERVAL_MS = 5000;
constexpr uint32_t MQTT_RECONNECT_INTERVAL_MS = 3000;
constexpr uint32_t DEFAULT_MQTT_SAFETY_TIMEOUT_MS = 10000;
constexpr uint32_t MIN_MQTT_SAFETY_TIMEOUT_MS = 3000;
constexpr uint32_t NTP_INITIAL_WAIT_MS = 10000;
constexpr uint32_t SENSOR_READ_INTERVAL_MS = 100;
constexpr uint32_t SENSOR_STALE_TIMEOUT_MS = 2500;
constexpr uint8_t SENSOR_FAILURE_LIMIT = 5;
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 3000;
constexpr uint32_t STATUS_INTERVAL_MS = 5000;
constexpr uint32_t COUPLING_PUBLISH_INTERVAL_MS = 5000;
constexpr uint32_t DIAGNOSTIC_READING_INTERVAL_MS = 2000;
constexpr uint32_t PROCESS_READING_INTERVAL_MS = 1000;
constexpr uint32_t VALVE_SETTLE_MS = 250;
constexpr uint32_t INPUT_DEBOUNCE_MS = 50;
constexpr uint8_t RECENT_COMMAND_COUNT = 10;
constexpr uint8_t SENSOR_FILTER_SIZE = 5;

enum class ValveKind : uint8_t { PRINCIPAL, AUXILIAR };
enum class XgzpProtocol : uint8_t { NONE, V3, LEGACY };

struct ValveState {
  const char* code;
  uint8_t pin;
  uint8_t tankIndex;
  ValveKind kind;
  int32_t id;
  int32_t tankId;
  int32_t pumpId;
  int16_t manifoldOutput;
  bool configured;
  bool available;
  bool open;
  bool fault;
};

struct PumpState {
  const char* code;
  uint8_t pin;
  bool auxiliary;
  int32_t id;
  bool configured;
  bool available;
  bool on;
  bool fault;
};

struct CouplingState {
  const char* code;
  uint8_t pin;
  uint8_t tankIndex;
  int32_t id;
  int32_t tankId;
  bool configured;
  bool available;
  bool coupled;
  bool rawCoupled;
  uint32_t rawChangedAt;
};

struct VacuumSensorState {
  const char* code;
  uint8_t tankIndex;
  uint8_t muxChannel;
  uint8_t address;
  XgzpProtocol protocol;
  int32_t id;
  bool configured;
  bool available;
  bool present;
  bool valid;
  float filteredKpa;
  float samples[SENSOR_FILTER_SIZE];
  uint8_t sampleCount;
  uint8_t sampleCursor;
  uint8_t consecutiveFailures;
  uint32_t lastReadAt;
};

struct TankContext {
  const char* code;
  uint8_t index;
  int32_t id;
  int32_t processTankId;
  int32_t processTankSensorId;
  float targetKpa;
  bool configured;
  bool selected;
};

struct AckCacheEntry {
  bool used;
  char correlationId[112];
  char command[40];
  char status[12];
  char errorCode[48];
  char message[192];
  int32_t processId;
  int32_t tankId;
  int32_t valveId;
  int32_t pumpId;
};

struct PendingAlarm {
  bool pending;
  char type[20];
  char severity[12];
  char title[80];
  char description[240];
  char hardwareCode[40];
  int32_t processId;
  int32_t sensorId;
  int32_t tankId;
  int32_t processTankId;
  int32_t processTankSensorId;
};

ValveState valves[6] = {
    {"VP_T1", VALVE_PINS[0], 0, ValveKind::PRINCIPAL, 0, 0, 0, 1, false, false, false, false},
    {"VA_T1", VALVE_PINS[1], 0, ValveKind::AUXILIAR, 0, 0, 0, 1, false, false, false, false},
    {"VP_T2", VALVE_PINS[2], 1, ValveKind::PRINCIPAL, 0, 0, 0, 2, false, false, false, false},
    {"VA_T2", VALVE_PINS[3], 1, ValveKind::AUXILIAR, 0, 0, 0, 2, false, false, false, false},
    {"VP_T3", VALVE_PINS[4], 2, ValveKind::PRINCIPAL, 0, 0, 0, 3, false, false, false, false},
    {"VA_T3", VALVE_PINS[5], 2, ValveKind::AUXILIAR, 0, 0, 0, 3, false, false, false, false},
};

PumpState pumps[2] = {
    {"BOMBA_VACUO_PRINCIPAL", MAIN_PUMP_PIN, false, 0, false, false, false, false},
    {"BOMBA_VACUO_AUXILIAR", AUX_PUMP_PWM_PIN, true, 0, false, false, false, false},
};

CouplingState couplings[3] = {
    {"ACOP_T1", COUPLING_PINS[0], 0, 0, 0, false, false, false, false, 0},
    {"ACOP_T2", COUPLING_PINS[1], 1, 0, 0, false, false, false, false, 0},
    {"ACOP_T3", COUPLING_PINS[2], 2, 0, 0, false, false, false, false, 0},
};

VacuumSensorState vacuumSensors[3] = {
    {"VACUO_T1", 0, XGZP_MUX_CHANNELS[0], 0, XgzpProtocol::NONE, 0, false, false, false, false, NAN, {}, 0, 0, 0, 0},
    {"VACUO_T2", 1, XGZP_MUX_CHANNELS[1], 0, XgzpProtocol::NONE, 0, false, false, false, false, NAN, {}, 0, 0, 0, 0},
    {"VACUO_T3", 2, XGZP_MUX_CHANNELS[2], 0, XgzpProtocol::NONE, 0, false, false, false, false, NAN, {}, 0, 0, 0, 0},
};

TankContext tanks[3] = {
    {"TANQUE_1", 0, 0, 0, 0, 0.0F, false, false},
    {"TANQUE_2", 1, 0, 0, 0, 0.0F, false, false},
    {"TANQUE_3", 2, 0, 0, 0, 0.0F, false, false},
};

WiFiClient plainNetworkClient;
WiFiClientSecure secureNetworkClient;
PubSubClient mqttClient;

char topicConfig[96] = "tsea/config";
char topicCommands[96] = "tsea/comandos";
char topicAcks[96] = "tsea/acks";
char topicReadings[96] = "tsea/leituras";
char topicStatus[96] = "tsea/status";
char topicHeartbeat[96] = "tsea/heartbeat";
char topicCouplings[96] = "tsea/acoplamentos";
char topicAlarms[96] = "tsea/alarmes";
char mqttOutBuffer[MQTT_OUT_BUFFER_SIZE];
char currentError[120] = "CONFIGURACAO_NAO_SINCRONIZADA";

AckCacheEntry ackCache[RECENT_COMMAND_COUNT] = {};
PendingAlarm pendingAlarm = {};
uint8_t ackCacheCursor = 0;
uint8_t nextSensorIndex = 0;

bool configSynchronized = false;
bool processActive = false;
bool emergencyLatched = false;
bool reconnectRequested = false;
bool mqttDisconnectSafetyHandled = false;
bool auxPwmAttached = false;
int32_t activeProcessId = 0;
float safetyVacuumLimitKpa = -95.0F;
float vacuumTolerancePercent = 10.0F;
uint32_t mqttSafetyTimeoutMs = DEFAULT_MQTT_SAFETY_TIMEOUT_MS;
uint32_t mqttDisconnectedAt = 0;
uint32_t lastWifiAttemptAt = 0;
uint32_t lastMqttAttemptAt = 0;
uint32_t lastSensorReadAt = 0;
uint32_t lastHeartbeatAt = 0;
uint32_t lastStatusAt = 0;
uint32_t lastCouplingPublishAt = 0;
uint32_t lastDiagnosticReadingAt = 0;
uint32_t lastProcessReadingAt = 0;
time_t fallbackEpochAtBoot = 0;

// Declaracoes explicitas evitam problemas do gerador automatico de prototipos
// do Arduino IDE com structs e enums definidos no proprio sketch.
void initializeSafeOutputs();
void initializeInputs();
void initializeTime();
void initializeI2cSensors();
void configureMqttClient();
void maintainWifi();
void maintainMqtt();
void onMqttMessage(char* topic, byte* payload, unsigned int length);
void updateCouplings();
void updateVacuumSensors();
void updateAuxiliaryPwm();
void enforceLocalSafety();
void runPeriodicPublishers();
void forceAllActuatorsSafe(bool clearProcess);
void setValveOutput(ValveState& valve, bool open);
void setPumpOutput(PumpState& pump, bool on);
bool anyOpenValve(ValveKind kind);
bool selectedPrincipalValvesOpen();
bool mainProcessLineReady();
uint8_t countOpenValves(ValveKind kind);
bool initializeXgzpV3(VacuumSensorState& sensor);
bool readXgzpV3(VacuumSensorState& sensor, float& pressureKpa);
bool readXgzpLegacy(VacuumSensorState& sensor, float& pressureKpa);
void acceptSensorReading(VacuumSensorState& sensor, float pressureKpa);
void rejectSensorReading(VacuumSensorState& sensor);
void queueAlarm(const char* type, const char* severity, const char* title,
                const char* description, const char* hardwareCode = nullptr,
                int8_t tankIndex = -1);
void enterSafeFault(const char* errorCode, const char* alarmType,
                    const char* title, const char* description,
                    int8_t tankIndex = -1);
bool publishHeartbeat(bool retained = false, const char* status = "ONLINE");
bool publishHardwareStatus(bool retained = false);
bool publishCouplingStates();
bool publishDiagnosticReadings();
bool publishProcessReadings();
bool publishPendingAlarm();
bool publishDocument(const char* topic, JsonDocument& document, bool retained);
int8_t findTankIndexByCode(const char* code);
ValveState* findValveByCode(const char* code);
ValveState* findValveById(int32_t id);
PumpState* findPumpByCode(const char* code);
PumpState* findPumpById(int32_t id);
AckCacheEntry* findCachedAck(const char* correlationId);
void republishCachedAck(const AckCacheEntry& entry);
ValveState* resolveCommandValve(JsonObjectConst root);
PumpState* resolveCommandPump(JsonObjectConst root);
void handleSyncConfig(JsonObjectConst root);
void handleCommand(JsonObjectConst root);
void handleStartProcess(JsonObjectConst root, const char* correlationId,
                        const char* command);
void handleGenericCommand(JsonObjectConst root, const char* correlationId,
                          const char* command);

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println(F("[TSEA] Inicializando firmware ESP32 MQTT v2..."));

  initializeSafeOutputs();
  initializeInputs();
  initializeTime();
  initializeI2cSensors();
  configureMqttClient();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  maintainWifi();

  if (!VACUUM_SENSOR_CONFIGURATION_CONFIRMED) {
    Serial.println(F("[TSEA][BLOQUEIO] Confirme modelo/faixa dos sensores antes do processo."));
  }
}

void loop() {
  maintainWifi();
  maintainMqtt();

  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  updateCouplings();
  updateVacuumSensors();
  updateAuxiliaryPwm();
  enforceLocalSafety();
  runPeriodicPublishers();

  delay(2);
}

// =============================================================================
// REDE, RELOGIO E MQTT
// =============================================================================

bool credentialsConfigured() {
  return strcmp(WIFI_SSID, "ALTERE_AQUI") != 0 && WIFI_SSID[0] != '\0' &&
         MQTT_HOST[0] != '\0';
}

void initializeTime() {
  struct tm compiled = {};
  char month[4] = {};
  int day = 1;
  int year = 2026;
  int hour = 0;
  int minute = 0;
  int second = 0;

  if (sscanf(__DATE__, "%3s %d %d", month, &day, &year) == 3 &&
      sscanf(__TIME__, "%d:%d:%d", &hour, &minute, &second) == 3) {
    const char* months = "JanFebMarAprMayJunJulAugSepOctNovDec";
    const char* match = strstr(months, month);
    compiled.tm_mon = match == nullptr ? 0 : static_cast<int>((match - months) / 3);
    compiled.tm_mday = day;
    compiled.tm_year = year - 1900;
    compiled.tm_hour = hour;
    compiled.tm_min = minute;
    compiled.tm_sec = second;
    fallbackEpochAtBoot = timegm(&compiled);
  }

  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
}

bool clockIsValid() {
  return time(nullptr) >= 1700000000;
}

void waitBrieflyForNtp() {
  const uint32_t startedAt = millis();
  while (!clockIsValid() && millis() - startedAt < NTP_INITIAL_WAIT_MS) {
    delay(100);
  }
  Serial.println(clockIsValid() ? F("[TSEA] Relogio UTC sincronizado.")
                                : F("[TSEA][AVISO] NTP indisponivel; usando horario de compilacao."));
}

void isoTimestampNow(char* destination, size_t size) {
  time_t now = time(nullptr);
  if (now < 1700000000) {
    now = fallbackEpochAtBoot + static_cast<time_t>(millis() / 1000UL);
  }
  struct tm utc = {};
  gmtime_r(&now, &utc);
  strftime(destination, size, "%Y-%m-%dT%H:%M:%S.000Z", &utc);
}

void synchronizeClockFromIso(const char* iso) {
  if (iso == nullptr || strlen(iso) < 19) {
    return;
  }

  struct tm parsed = {};
  int year, month, day, hour, minute, second;
  if (sscanf(iso, "%d-%d-%dT%d:%d:%d", &year, &month, &day, &hour, &minute, &second) != 6) {
    return;
  }

  parsed.tm_year = year - 1900;
  parsed.tm_mon = month - 1;
  parsed.tm_mday = day;
  parsed.tm_hour = hour;
  parsed.tm_min = minute;
  parsed.tm_sec = second;
  const time_t parsedEpoch = timegm(&parsed);

  if (parsedEpoch >= 1700000000 &&
      (!clockIsValid() ||
       llabs(static_cast<long long>(time(nullptr) - parsedEpoch)) > 300)) {
    timeval tv = {parsedEpoch, 0};
    settimeofday(&tv, nullptr);
  }
}

void configureMqttClient() {
  if (MQTT_USE_TLS) {
    if (strlen(MQTT_CA_CERT) < 100) {
      Serial.println(F("[TSEA][BLOQUEIO] MQTT TLS habilitado sem certificado CA."));
    } else {
      secureNetworkClient.setCACert(MQTT_CA_CERT);
    }
    mqttClient.setClient(secureNetworkClient);
  } else {
    mqttClient.setClient(plainNetworkClient);
  }

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setKeepAlive(15);
  mqttClient.setSocketTimeout(5);
  if (!mqttClient.setBufferSize(MQTT_PACKET_BUFFER_SIZE)) {
    Serial.println(F("[TSEA][ERRO] Nao foi possivel reservar o buffer MQTT."));
  }
}

void maintainWifi() {
  if (WiFi.status() == WL_CONNECTED || !credentialsConfigured()) {
    return;
  }

  const uint32_t now = millis();
  if (lastWifiAttemptAt != 0 && now - lastWifiAttemptAt < WIFI_RECONNECT_INTERVAL_MS) {
    return;
  }

  lastWifiAttemptAt = now;
  Serial.printf("[TSEA][WiFi] Conectando em %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void subscribeToApiTopics() {
  const bool configOk = mqttClient.subscribe(topicConfig, 1);
  const bool commandsOk = mqttClient.subscribe(topicCommands, 1);
  Serial.printf("[TSEA][MQTT] subscribe config=%s comandos=%s\n",
                configOk ? "ok" : "falha", commandsOk ? "ok" : "falha");
}

bool connectMqtt() {
  if (MQTT_USE_TLS && strlen(MQTT_CA_CERT) < 100) {
    return false;
  }

  char clientId[64] = {};
  const uint64_t chipId = ESP.getEfuseMac();
  snprintf(clientId, sizeof(clientId), "%s-%04X", DEVICE_ID,
           static_cast<unsigned int>(chipId & 0xFFFF));

  char timestamp[32] = {};
  isoTimestampNow(timestamp, sizeof(timestamp));
  char lastWill[320] = {};
  snprintf(lastWill, sizeof(lastWill),
           "{\"tipo\":\"HEARTBEAT\",\"schema_version\":2,\"device_id\":\"%s\","
           "\"firmware_version\":\"%s\",\"uptime_ms\":%lu,\"status\":\"OFFLINE\","
           "\"enviado_em\":\"%s\"}",
           DEVICE_ID, FIRMWARE_VERSION, static_cast<unsigned long>(millis()), timestamp);

  const char* username = MQTT_USERNAME[0] == '\0' ? nullptr : MQTT_USERNAME;
  const char* password = MQTT_USERNAME[0] == '\0' ? nullptr : MQTT_PASSWORD;
  const bool connected = mqttClient.connect(clientId, username, password,
                                             topicHeartbeat, 1, true, lastWill, true);
  if (!connected) {
    Serial.printf("[TSEA][MQTT] Falha de conexao, estado=%d\n", mqttClient.state());
    return false;
  }

  Serial.println(F("[TSEA][MQTT] Conectado ao broker."));
  subscribeToApiTopics();
  mqttDisconnectedAt = 0;
  mqttDisconnectSafetyHandled = false;
  publishHeartbeat(true, "ONLINE");
  publishHardwareStatus(true);
  publishPendingAlarm();
  return true;
}

void maintainMqtt() {
  if (reconnectRequested && mqttClient.connected()) {
    reconnectRequested = false;
    mqttClient.disconnect();
    mqttDisconnectedAt = millis();
    return;
  }

  const bool networkReady = WiFi.status() == WL_CONNECTED;
  const bool mqttReady = mqttClient.connected();

  if (!networkReady || !mqttReady) {
    if (mqttDisconnectedAt == 0) {
      mqttDisconnectedAt = millis();
    }
  }

  if (!networkReady || mqttReady || !credentialsConfigured()) {
    return;
  }

  const uint32_t now = millis();
  if (lastMqttAttemptAt != 0 && now - lastMqttAttemptAt < MQTT_RECONNECT_INTERVAL_MS) {
    return;
  }

  lastMqttAttemptAt = now;
  if (!clockIsValid()) {
    waitBrieflyForNtp();
  }
  connectMqtt();
}

// =============================================================================
// GPIO, ATUADORES E ENTRADAS DE SEGURANCA
// =============================================================================

uint8_t inactiveLevel(uint8_t activeLevel) {
  return activeLevel == HIGH ? LOW : HIGH;
}

void initializeSafeOutputs() {
  for (ValveState& valve : valves) {
    digitalWrite(valve.pin, inactiveLevel(VALVE_ACTIVE_LEVEL));
    pinMode(valve.pin, OUTPUT);
    digitalWrite(valve.pin, inactiveLevel(VALVE_ACTIVE_LEVEL));
    valve.open = false;
  }

  digitalWrite(MAIN_PUMP_PIN, inactiveLevel(MAIN_PUMP_ACTIVE_LEVEL));
  pinMode(MAIN_PUMP_PIN, OUTPUT);
  digitalWrite(MAIN_PUMP_PIN, inactiveLevel(MAIN_PUMP_ACTIVE_LEVEL));
  pumps[0].on = false;

  pinMode(AUX_PUMP_PWM_PIN, OUTPUT);
  digitalWrite(AUX_PUMP_PWM_PIN, LOW);
  auxPwmAttached = ledcAttach(AUX_PUMP_PWM_PIN, AUX_PWM_FREQUENCY_HZ,
                              AUX_PWM_RESOLUTION_BITS);
  if (auxPwmAttached) {
    ledcWrite(AUX_PUMP_PWM_PIN, 0);
  } else {
    pumps[1].fault = true;
    strlcpy(currentError, "FALHA_CONFIGURACAO_PWM", sizeof(currentError));
    Serial.println(F("[TSEA][ERRO] Nao foi possivel configurar LEDC da bomba auxiliar."));
  }
  pumps[1].on = false;
}

void initializeInputs() {
  for (CouplingState& coupling : couplings) {
    pinMode(coupling.pin, INPUT_PULLUP);
    const bool detected = digitalRead(coupling.pin) == COUPLING_ACTIVE_LEVEL;
    coupling.rawCoupled = detected;
    coupling.coupled = detected;
    coupling.rawChangedAt = millis();
  }

  analogReadResolution(12);
  analogSetPinAttenuation(AUX_POTENTIOMETER_PIN, ADC_ATTEN_DB_11);

  if (ENABLE_PHYSICAL_ESTOP) {
    pinMode(PHYSICAL_ESTOP_PIN, INPUT);  // Requer resistor externo.
  }
}

void setValveOutput(ValveState& valve, bool open) {
  digitalWrite(valve.pin, open ? VALVE_ACTIVE_LEVEL
                              : inactiveLevel(VALVE_ACTIVE_LEVEL));
  valve.open = open;
}

uint8_t readAuxiliaryDuty() {
  const uint32_t millivolts = analogReadMilliVolts(AUX_POTENTIOMETER_PIN);
  const float normalized = constrain(
      (static_cast<float>(millivolts) - AUX_POT_MIN_MV) /
          static_cast<float>(AUX_POT_MAX_MV - AUX_POT_MIN_MV),
      0.0F, 1.0F);
  return static_cast<uint8_t>(lroundf(normalized * 255.0F));
}

void setPumpOutput(PumpState& pump, bool on) {
  if (pump.auxiliary) {
    const uint8_t duty = on ? readAuxiliaryDuty() : 0;
    if (auxPwmAttached) {
      ledcWrite(pump.pin, duty);
    } else {
      digitalWrite(pump.pin, LOW);
    }
  } else {
    digitalWrite(pump.pin, on ? MAIN_PUMP_ACTIVE_LEVEL
                              : inactiveLevel(MAIN_PUMP_ACTIVE_LEVEL));
  }
  pump.on = on;
}

void clearProcessContext() {
  processActive = false;
  activeProcessId = 0;
  for (TankContext& tank : tanks) {
    tank.selected = false;
    tank.processTankId = 0;
    tank.processTankSensorId = 0;
    tank.targetKpa = 0.0F;
  }
}

void forceAllActuatorsSafe(bool clearProcess) {
  // Ordem segura: retirar energia das bombas antes de isolar as linhas.
  setPumpOutput(pumps[1], false);
  setPumpOutput(pumps[0], false);
  delay(20);
  for (ValveState& valve : valves) {
    setValveOutput(valve, false);
  }
  if (clearProcess) {
    clearProcessContext();
  }
}

bool anyOpenValve(ValveKind kind) {
  for (const ValveState& valve : valves) {
    if (valve.kind == kind && valve.open) {
      return true;
    }
  }
  return false;
}

bool selectedPrincipalValvesOpen() {
  if (!processActive) {
    return false;
  }

  bool selectedTankFound = false;
  for (uint8_t tankIndex = 0; tankIndex < 3; ++tankIndex) {
    if (!tanks[tankIndex].selected) {
      continue;
    }
    selectedTankFound = true;

    bool principalOpen = false;
    for (const ValveState& valve : valves) {
      if (valve.tankIndex == tankIndex &&
          valve.kind == ValveKind::PRINCIPAL && valve.open) {
        principalOpen = true;
        break;
      }
    }

    if (!principalOpen) {
      return false;
    }
  }

  return selectedTankFound;
}

bool mainProcessLineReady() {
  return pumps[0].on && selectedPrincipalValvesOpen();
}

bool allActuatorsSafe() {
  if (pumps[0].on || pumps[1].on) {
    return false;
  }
  for (const ValveState& valve : valves) {
    if (valve.open) {
      return false;
    }
  }
  return true;
}

void closeAuxiliaryValves() {
  for (ValveState& valve : valves) {
    if (valve.kind == ValveKind::AUXILIAR) {
      setValveOutput(valve, false);
    }
  }
}

void updateAuxiliaryPwm() {
  if (!pumps[1].on) {
    return;
  }

  const uint8_t duty = readAuxiliaryDuty();
  if (duty < AUX_MIN_SAFE_DUTY) {
    setPumpOutput(pumps[1], false);
    closeAuxiliaryValves();
    queueAlarm("BOMBA", "CRITICO", "PWM auxiliar insuficiente",
               "A bomba auxiliar foi desligada e suas valvulas foram fechadas porque o ajuste local ficou abaixo do minimo seguro.",
               pumps[1].code);
    strlcpy(currentError, "PWM_AUXILIAR_INSUFICIENTE", sizeof(currentError));
    return;
  }

  if (auxPwmAttached) {
    ledcWrite(AUX_PUMP_PWM_PIN, duty);
  }
}

void updateCouplings() {
  const uint32_t now = millis();
  for (CouplingState& coupling : couplings) {
    const bool detected = digitalRead(coupling.pin) == COUPLING_ACTIVE_LEVEL;
    if (detected != coupling.rawCoupled) {
      coupling.rawCoupled = detected;
      coupling.rawChangedAt = now;
    }

    if (coupling.coupled != coupling.rawCoupled &&
        now - coupling.rawChangedAt >= INPUT_DEBOUNCE_MS) {
      coupling.coupled = coupling.rawCoupled;
      Serial.printf("[TSEA][ACOP] %s=%s\n", coupling.code,
                    coupling.coupled ? "ACOPLADA" : "DESACOPLADA");

      if (processActive && tanks[coupling.tankIndex].selected &&
          !coupling.coupled) {
        enterSafeFault("ACOPLAMENTO_PERDIDO", "MANGUEIRA",
                       "Mangueira desacoplada",
                       "Um tanque selecionado perdeu o sinal de acoplamento durante o processo; todos os atuadores foram colocados em estado seguro.",
                       coupling.tankIndex);
      }
    }
  }
}

// =============================================================================
// XGZP6847D I2C: REVISAO V3 E COMPATIBILIDADE LEGADA
// =============================================================================

bool selectI2cSensor(uint8_t sensorIndex) {
  if (!USE_TCA9548A) {
    return true;
  }
  Wire.beginTransmission(TCA9548A_ADDRESS);
  Wire.write(static_cast<uint8_t>(1U << vacuumSensors[sensorIndex].muxChannel));
  return Wire.endTransmission() == 0;
}

bool i2cProbe(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

bool i2cReadRegisters(uint8_t address, uint8_t firstRegister,
                      uint8_t* destination, size_t length) {
  Wire.beginTransmission(address);
  Wire.write(firstRegister);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }
  const size_t received = Wire.requestFrom(static_cast<int>(address),
                                           static_cast<int>(length));
  if (received != length) {
    while (Wire.available()) {
      Wire.read();
    }
    return false;
  }
  for (size_t index = 0; index < length; ++index) {
    destination[index] = static_cast<uint8_t>(Wire.read());
  }
  return true;
}

bool i2cReadRegister(uint8_t address, uint8_t registerAddress, uint8_t& value) {
  return i2cReadRegisters(address, registerAddress, &value, 1);
}

bool i2cWriteRegister(uint8_t address, uint8_t registerAddress, uint8_t value) {
  Wire.beginTransmission(address);
  Wire.write(registerAddress);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool initializeXgzpV3(VacuumSensorState& sensor) {
  uint8_t id = 0;
  if (!i2cReadRegister(sensor.address, 0x00, id)) {
    return false;
  }

  uint8_t osr = 0;
  if (!i2cReadRegister(sensor.address, 0x02, osr)) {
    return false;
  }
  // Preserva o oversampling gravado na OTP e seleciona modo normal (01b).
  if (!i2cWriteRegister(sensor.address, 0x02, (osr & 0xFCU) | 0x01U)) {
    return false;
  }

  uint8_t control = 0;
  if (!i2cReadRegister(sensor.address, 0x01, control)) {
    return false;
  }
  // Active=01b e measurement_ctrl=1; demais bits sao preservados.
  return i2cWriteRegister(sensor.address, 0x01,
                          static_cast<uint8_t>((control & 0xFCU) | 0x05U));
}

void detectXgzpSensor(uint8_t sensorIndex) {
  VacuumSensorState& sensor = vacuumSensors[sensorIndex];
  sensor.present = false;
  sensor.valid = false;
  sensor.protocol = XgzpProtocol::NONE;

  if (!selectI2cSensor(sensorIndex)) {
    Serial.printf("[TSEA][I2C] Canal/multiplexador indisponivel para %s.\n", sensor.code);
    return;
  }

  if (USE_TCA9548A) {
    if (i2cProbe(0x58)) {
      sensor.address = 0x58;
      sensor.protocol = XgzpProtocol::V3;
    } else if (i2cProbe(0x6D)) {
      sensor.address = 0x6D;
      sensor.protocol = XgzpProtocol::LEGACY;
    }
  } else {
    sensor.address = XGZP_DIRECT_ADDRESSES[sensorIndex];
    if (i2cProbe(sensor.address)) {
      sensor.protocol = sensor.address == 0x6D ? XgzpProtocol::LEGACY
                                              : XgzpProtocol::V3;
    }
  }

  if (sensor.protocol == XgzpProtocol::NONE) {
    Serial.printf("[TSEA][I2C] %s nao encontrado.\n", sensor.code);
    return;
  }

  sensor.present = sensor.protocol != XgzpProtocol::V3 || initializeXgzpV3(sensor);
  Serial.printf("[TSEA][I2C] %s endereco=0x%02X protocolo=%s estado=%s\n",
                sensor.code, sensor.address,
                sensor.protocol == XgzpProtocol::V3 ? "V3" : "LEGADO",
                sensor.present ? "ok" : "falha");
}

void initializeI2cSensors() {
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 400000);
  Wire.setTimeOut(50);

  if (USE_TCA9548A && !i2cProbe(TCA9548A_ADDRESS)) {
    Serial.println(F("[TSEA][BLOQUEIO] TCA9548A nao encontrado em 0x70."));
  }

  for (uint8_t index = 0; index < 3; ++index) {
    detectXgzpSensor(index);
  }
}

int32_t signExtend24(uint32_t raw) {
  return (raw & 0x00800000UL) != 0
             ? static_cast<int32_t>(raw | 0xFF000000UL)
             : static_cast<int32_t>(raw);
}

bool readXgzpV3(VacuumSensorState& sensor, float& pressureKpa) {
  uint8_t control = 0;
  if (!i2cReadRegister(sensor.address, 0x01, control)) {
    return false;
  }

  if ((control & 0x20U) == 0) {
    // Solicita nova medicao e tenta novamente no proximo ciclo.
    i2cWriteRegister(sensor.address, 0x01,
                     static_cast<uint8_t>(control | 0x05U));
    return false;
  }

  uint8_t bytes[3] = {};
  if (!i2cReadRegisters(sensor.address, 0x04, bytes, sizeof(bytes))) {
    return false;
  }
  const uint32_t raw = (static_cast<uint32_t>(bytes[0]) << 16U) |
                       (static_cast<uint32_t>(bytes[1]) << 8U) | bytes[2];
  const int32_t signedRaw = signExtend24(raw);
  const float spanPa = XGZP_PRESSURE_MAX_PA - XGZP_PRESSURE_MIN_PA;
  const float pressurePa =
      (static_cast<float>(signedRaw) / 2097152.0F) * spanPa +
      XGZP_PRESSURE_MIN_PA;
  pressureKpa = pressurePa / 1000.0F;
  return isfinite(pressureKpa);
}

bool readXgzpLegacy(VacuumSensorState& sensor, float& pressureKpa) {
  if (!XGZP_LEGACY_K_CONFIRMED || XGZP_LEGACY_K <= 0.0F) {
    return false;
  }
  if (!i2cWriteRegister(sensor.address, 0x30, 0x0A)) {
    return false;
  }

  const uint32_t startedAt = millis();
  uint8_t status = 0x08;
  while ((status & 0x08U) != 0 && millis() - startedAt < 60) {
    delay(2);
    if (!i2cReadRegister(sensor.address, 0x30, status)) {
      return false;
    }
  }
  if ((status & 0x08U) != 0) {
    return false;
  }

  uint8_t bytes[3] = {};
  if (!i2cReadRegisters(sensor.address, 0x06, bytes, sizeof(bytes))) {
    return false;
  }
  const uint32_t raw = (static_cast<uint32_t>(bytes[0]) << 16U) |
                       (static_cast<uint32_t>(bytes[1]) << 8U) | bytes[2];
  pressureKpa = (static_cast<float>(signExtend24(raw)) / XGZP_LEGACY_K) / 1000.0F;
  return isfinite(pressureKpa);
}

float medianSamples(const float* values, uint8_t count) {
  float sorted[SENSOR_FILTER_SIZE] = {};
  for (uint8_t index = 0; index < count; ++index) {
    sorted[index] = values[index];
  }
  for (uint8_t i = 1; i < count; ++i) {
    const float value = sorted[i];
    int8_t j = static_cast<int8_t>(i) - 1;
    while (j >= 0 && sorted[j] > value) {
      sorted[j + 1] = sorted[j];
      --j;
    }
    sorted[j + 1] = value;
  }
  return sorted[count / 2];
}

bool pressureWithinPhysicalRange(float pressureKpa) {
  const float minKpa = XGZP_PRESSURE_MIN_PA / 1000.0F;
  const float maxKpa = XGZP_PRESSURE_MAX_PA / 1000.0F;
  const float margin = fabsf(maxKpa - minKpa) * 0.05F;
  return pressureKpa >= minKpa - margin && pressureKpa <= maxKpa + margin;
}

void acceptSensorReading(VacuumSensorState& sensor, float pressureKpa) {
  sensor.samples[sensor.sampleCursor] = pressureKpa;
  sensor.sampleCursor = (sensor.sampleCursor + 1U) % SENSOR_FILTER_SIZE;
  if (sensor.sampleCount < SENSOR_FILTER_SIZE) {
    ++sensor.sampleCount;
  }

  const float median = medianSamples(sensor.samples, sensor.sampleCount);
  sensor.filteredKpa = !isfinite(sensor.filteredKpa)
                           ? median
                           : sensor.filteredKpa * 0.75F + median * 0.25F;
  sensor.consecutiveFailures = 0;
  sensor.valid = true;
  sensor.lastReadAt = millis();
}

void rejectSensorReading(VacuumSensorState& sensor) {
  if (sensor.consecutiveFailures < 255) {
    ++sensor.consecutiveFailures;
  }
  if (sensor.consecutiveFailures >= SENSOR_FAILURE_LIMIT) {
    sensor.valid = false;
  }
}

void updateVacuumSensors() {
  const uint32_t now = millis();
  if (now - lastSensorReadAt < SENSOR_READ_INTERVAL_MS) {
    return;
  }
  lastSensorReadAt = now;

  VacuumSensorState& sensor = vacuumSensors[nextSensorIndex];
  const uint8_t currentIndex = nextSensorIndex;
  nextSensorIndex = (nextSensorIndex + 1U) % 3U;

  if (!sensor.present && now % 10000U < SENSOR_READ_INTERVAL_MS) {
    detectXgzpSensor(currentIndex);
  }
  if (!sensor.present || !selectI2cSensor(currentIndex)) {
    rejectSensorReading(sensor);
    return;
  }

  float pressureKpa = NAN;
  const bool readOk = sensor.protocol == XgzpProtocol::V3
                          ? readXgzpV3(sensor, pressureKpa)
                          : readXgzpLegacy(sensor, pressureKpa);
  if (!readOk || !pressureWithinPhysicalRange(pressureKpa)) {
    rejectSensorReading(sensor);
    return;
  }
  acceptSensorReading(sensor, pressureKpa);
}

// =============================================================================
// INTERTRAVAMENTOS E ALARMES LOCAIS
// =============================================================================

void queueAlarm(const char* type, const char* severity, const char* title,
                const char* description, const char* hardwareCode,
                int8_t tankIndex) {
  pendingAlarm.pending = true;
  strlcpy(pendingAlarm.type, type == nullptr ? "ESP32" : type,
          sizeof(pendingAlarm.type));
  strlcpy(pendingAlarm.severity, severity == nullptr ? "CRITICO" : severity,
          sizeof(pendingAlarm.severity));
  strlcpy(pendingAlarm.title, title == nullptr ? "Falha de hardware" : title,
          sizeof(pendingAlarm.title));
  strlcpy(pendingAlarm.description,
          description == nullptr ? "Falha local detectada pelo ESP32." : description,
          sizeof(pendingAlarm.description));
  strlcpy(pendingAlarm.hardwareCode,
          hardwareCode == nullptr ? DEVICE_ID : hardwareCode,
          sizeof(pendingAlarm.hardwareCode));
  pendingAlarm.processId = activeProcessId;
  pendingAlarm.sensorId = 0;
  pendingAlarm.tankId = 0;
  pendingAlarm.processTankId = 0;
  pendingAlarm.processTankSensorId = 0;

  if (tankIndex >= 0 && tankIndex < 3) {
    const uint8_t index = static_cast<uint8_t>(tankIndex);
    pendingAlarm.sensorId = vacuumSensors[index].id;
    pendingAlarm.tankId = tanks[index].id;
    pendingAlarm.processTankId = tanks[index].processTankId;
    pendingAlarm.processTankSensorId = tanks[index].processTankSensorId;
  }

  if (mqttClient.connected()) {
    publishPendingAlarm();
  }
}

void enterSafeFault(const char* errorCode, const char* alarmType,
                    const char* title, const char* description,
                    int8_t tankIndex) {
  forceAllActuatorsSafe(false);
  strlcpy(currentError, errorCode, sizeof(currentError));
  queueAlarm(alarmType, "CRITICO", title, description, nullptr, tankIndex);
  clearProcessContext();
  publishHardwareStatus(true);
}

bool selectedCouplingsAreSafe() {
  for (uint8_t index = 0; index < 3; ++index) {
    if (tanks[index].selected && !couplings[index].coupled) {
      return false;
    }
  }
  return true;
}

void enforceLocalSafety() {
  if (ENABLE_PHYSICAL_ESTOP &&
      digitalRead(PHYSICAL_ESTOP_PIN) == PHYSICAL_ESTOP_ACTIVE_LEVEL &&
      !emergencyLatched) {
    emergencyLatched = true;
    enterSafeFault("PARADA_EMERGENCIA_FISICA", "SEGURANCA",
                   "Parada de emergencia fisica",
                   "A entrada fisica de emergencia foi acionada; a liberacao exige reinicializacao consciente do equipamento.");
    return;
  }

  if (!processActive) {
    return;
  }

  if (!mqttClient.connected() && mqttDisconnectedAt != 0 &&
      millis() - mqttDisconnectedAt >= mqttSafetyTimeoutMs &&
      !mqttDisconnectSafetyHandled) {
    mqttDisconnectSafetyHandled = true;
    enterSafeFault("TIMEOUT_MQTT", "MQTT", "Timeout de comunicacao MQTT",
                   "A comunicacao MQTT permaneceu indisponivel alem do limite; o ESP32 executou parada local segura.");
    return;
  }

  if (!selectedCouplingsAreSafe()) {
    enterSafeFault("ACOPLAMENTO_INVALIDO", "MANGUEIRA",
                   "Acoplamento invalido",
                   "Um tanque ativo nao possui sinal de acoplamento; o processo foi colocado em estado seguro.");
    return;
  }

  for (uint8_t index = 0; index < 3; ++index) {
    if (!tanks[index].selected) {
      continue;
    }
    const VacuumSensorState& sensor = vacuumSensors[index];
    const bool stale = sensor.lastReadAt == 0 ||
                       millis() - sensor.lastReadAt > SENSOR_STALE_TIMEOUT_MS;
    if (!sensor.valid || stale) {
      enterSafeFault("SENSOR_VACUO_INVALIDO", "SENSOR",
                     "Sensor de vacuo invalido",
                     "Uma leitura individual de vacuo ficou invalida ou vencida; todos os atuadores foram colocados em estado seguro.",
                     index);
      return;
    }
    if (sensor.filteredKpa < safetyVacuumLimitKpa) {
      enterSafeFault("LIMITE_VACUO_EXCEDIDO", "SEGURANCA",
                     "Limite de vacuo excedido",
                     "O vacuo ultrapassou o limite local de seguranca configurado; foi executada parada segura.",
                     index);
      return;
    }
  }

  if (pumps[0].on && !selectedPrincipalValvesOpen()) {
    enterSafeFault("PRINCIPAL_SEM_VALVULA", "SEGURANCA",
                   "Bomba principal sem todas as linhas abertas",
                   "A bomba principal estava ligada sem todas as valvulas principais selecionadas abertas; foi executada parada segura.");
    return;
  }

  if (pumps[1].on &&
      (!pumps[0].on || !anyOpenValve(ValveKind::AUXILIAR))) {
    enterSafeFault("AUXILIAR_SEM_INTERTRAVAMENTO", "SEGURANCA",
                   "Intertravamento da bomba auxiliar",
                   "A bomba auxiliar perdeu a bomba principal ou sua linha auxiliar aberta; foi executada parada segura.");
  }
}

// =============================================================================
// PUBLICACAO MQTT V2
// =============================================================================

bool publishDocument(const char* topic, JsonDocument& document, bool retained) {
  if (!mqttClient.connected() || topic == nullptr || topic[0] == '\0') {
    return false;
  }

  const size_t required = measureJson(document);
  if (required == 0 || required >= sizeof(mqttOutBuffer)) {
    Serial.printf("[TSEA][MQTT] JSON excede buffer de saida: %u bytes.\n",
                  static_cast<unsigned int>(required));
    return false;
  }

  const size_t written = serializeJson(document, mqttOutBuffer, sizeof(mqttOutBuffer));
  if (written != required) {
    return false;
  }
  return mqttClient.publish(topic,
                            reinterpret_cast<const uint8_t*>(mqttOutBuffer),
                            static_cast<unsigned int>(written), retained);
}

bool publishHeartbeat(bool retained, const char* status) {
  JsonDocument document;
  document["tipo"] = "HEARTBEAT";
  document["schema_version"] = MQTT_SCHEMA_VERSION;
  document["device_id"] = DEVICE_ID;
  document["firmware_version"] = FIRMWARE_VERSION;
  document["uptime_ms"] = millis();
  if (processActive && activeProcessId > 0) {
    document["id_processo"] = activeProcessId;
  }
  document["status"] = status;
  char timestamp[32] = {};
  isoTimestampNow(timestamp, sizeof(timestamp));
  document["enviado_em"] = timestamp;
  return publishDocument(topicHeartbeat, document, retained);
}

const char* statusGeneral() {
  const bool startupWarning =
      strcmp(currentError, "CONFIGURACAO_NAO_SINCRONIZADA") == 0 ||
      strcmp(currentError, "CALIBRACAO_SENSOR_PENDENTE") == 0;
  if (emergencyLatched ||
      (currentError[0] != '\0' && strcmp(currentError, "SEM_ERRO") != 0 &&
       !startupWarning)) {
    return "FALHA";
  }
  if (!configSynchronized || !VACUUM_SENSOR_CONFIGURATION_CONFIRMED) {
    return "ALERTA";
  }
  return "OPERACIONAL";
}

bool publishHardwareStatus(bool retained) {
  JsonDocument document;
  document["tipo"] = "HARDWARE_STATUS";
  document["schema_version"] = MQTT_SCHEMA_VERSION;
  document["esp32_on"] = true;
  document["device_id"] = DEVICE_ID;
  document["device"] = DEVICE_ID;
  document["firmware_version"] = FIRMWARE_VERSION;
  document["status_geral"] = statusGeneral();
  document["emergencia_ativa"] = emergencyLatched;
  document["erro_atual"] = strcmp(currentError, "SEM_ERRO") == 0 ? nullptr : currentError;

  uint8_t validSensors = 0;
  for (const VacuumSensorState& sensor : vacuumSensors) {
    if (sensor.valid && millis() - sensor.lastReadAt <= SENSOR_STALE_TIMEOUT_MS) {
      ++validSensors;
    }
  }
  document["sensores_ativos"] = validSensors;

  JsonArray pumpArray = document["bombas"].to<JsonArray>();
  for (const PumpState& pump : pumps) {
    JsonObject item = pumpArray.add<JsonObject>();
    if (pump.id > 0) {
      item["id_bomba"] = pump.id;
    }
    item["codigo_hardware"] = pump.code;
    item["ligada"] = pump.on;
    item["disponivel"] = pump.available && !pump.fault;
    item["falha"] = pump.fault;
  }

  JsonArray valveArray = document["valvulas"].to<JsonArray>();
  for (const ValveState& valve : valves) {
    JsonObject item = valveArray.add<JsonObject>();
    if (valve.id > 0) {
      item["id_valvula"] = valve.id;
    }
    item["codigo_hardware"] = valve.code;
    if (valve.tankId > 0) {
      item["id_tanque"] = valve.tankId;
    }
    item["numero_saida_manifold"] = valve.manifoldOutput;
    item["tipo"] = valve.kind == ValveKind::PRINCIPAL ? "PRINCIPAL" : "AUXILIAR";
    item["status_valvula"] = valve.fault ? "FALHA" : (valve.open ? "ABERTA" : "FECHADA");
    item["aberta"] = valve.open;
    item["ack"] = !valve.fault;  // ACK eletrico local, nao feedback mecanico.
    item["falha"] = valve.fault;
    item["disponivel"] = valve.available && !valve.fault;
  }

  JsonArray couplingArray = document["acoplamentos"].to<JsonArray>();
  for (const CouplingState& coupling : couplings) {
    JsonObject item = couplingArray.add<JsonObject>();
    item["codigo_hardware"] = coupling.code;
    if (coupling.tankId > 0) {
      item["id_tanque"] = coupling.tankId;
    }
    item["acoplado"] = coupling.coupled;
  }

  char timestamp[32] = {};
  isoTimestampNow(timestamp, sizeof(timestamp));
  document["enviado_em"] = timestamp;
  return publishDocument(topicStatus, document, retained);
}

bool publishCouplingStates() {
  bool allPublished = true;
  for (uint8_t index = 0; index < 3; ++index) {
    const CouplingState& coupling = couplings[index];
    if (coupling.id <= 0 || coupling.tankId <= 0) {
      continue;
    }

    JsonDocument document;
    document["tipo"] = "ACOPLAMENTO_STATUS";
    document["schema_version"] = MQTT_SCHEMA_VERSION;
    document["device_id"] = DEVICE_ID;
    if (processActive && tanks[index].selected) {
      document["id_processo"] = activeProcessId;
      document["id_processo_tanque"] = tanks[index].processTankId;
    }
    document["id_sensor"] = coupling.id;
    document["id_tanque"] = coupling.tankId;
    document["codigo_hardware"] = coupling.code;
    document["sinal_detectado"] = coupling.coupled;
    char timestamp[32] = {};
    isoTimestampNow(timestamp, sizeof(timestamp));
    document["verificado_em"] = timestamp;
    allPublished = publishDocument(topicCouplings, document, false) && allPublished;
  }
  return allPublished;
}

bool publishDiagnosticReadings() {
  bool allPublished = true;
  for (const VacuumSensorState& sensor : vacuumSensors) {
    if (!sensor.valid || millis() - sensor.lastReadAt > SENSOR_STALE_TIMEOUT_MS) {
      continue;
    }
    JsonDocument document;
    document["tipo"] = "SENSOR_READING";
    document["schema_version"] = MQTT_SCHEMA_VERSION;
    document["device_id"] = DEVICE_ID;
    document["modo"] = "DIAGNOSTICO";
    document["codigo_hardware"] = sensor.code;
    if (sensor.id > 0) {
      document["id_sensor"] = sensor.id;
    }
    document["valor"] = roundf(sensor.filteredKpa * 1000.0F) / 1000.0F;
    document["unidade"] = "kPa";
    char timestamp[32] = {};
    isoTimestampNow(timestamp, sizeof(timestamp));
    document["leitura_em"] = timestamp;
    allPublished = publishDocument(topicReadings, document, false) && allPublished;
  }
  return allPublished;
}

bool publishProcessReadings() {
  if (!mainProcessLineReady()) {
    return true;
  }

  bool allPublished = true;
  for (uint8_t index = 0; index < 3; ++index) {
    if (!tanks[index].selected || !vacuumSensors[index].valid) {
      continue;
    }
    const VacuumSensorState& sensor = vacuumSensors[index];
    JsonDocument document;
    document["tipo"] = "SENSOR_READING";
    document["schema_version"] = MQTT_SCHEMA_VERSION;
    document["device_id"] = DEVICE_ID;
    document["modo"] = "PROCESSO";
    document["id_processo"] = activeProcessId;
    document["id_processo_tanque"] = tanks[index].processTankId;
    document["id_tanque"] = tanks[index].id;
    document["id_sensor"] = sensor.id;
    document["id_processo_tanque_sensor"] = tanks[index].processTankSensorId;
    document["codigo_hardware"] = sensor.code;
    document["valor_vacuo"] = roundf(sensor.filteredKpa * 1000.0F) / 1000.0F;
    document["unidade_medida"] = "kPa";
    char timestamp[32] = {};
    isoTimestampNow(timestamp, sizeof(timestamp));
    document["leitura_em"] = timestamp;
    allPublished = publishDocument(topicReadings, document, false) && allPublished;
  }
  return allPublished;
}

bool publishPendingAlarm() {
  if (!pendingAlarm.pending || !mqttClient.connected()) {
    return false;
  }

  JsonDocument document;
  document["tipo"] = "ALARME_HARDWARE";
  document["schema_version"] = MQTT_SCHEMA_VERSION;
  document["device_id"] = DEVICE_ID;
  document["codigo_hardware"] = pendingAlarm.hardwareCode;
  if (pendingAlarm.processId > 0) {
    document["id_processo"] = pendingAlarm.processId;
  }
  if (pendingAlarm.sensorId > 0) {
    document["id_sensor"] = pendingAlarm.sensorId;
  }
  if (pendingAlarm.tankId > 0) {
    document["id_tanque"] = pendingAlarm.tankId;
  }
  if (pendingAlarm.processTankId > 0) {
    document["id_processo_tanque"] = pendingAlarm.processTankId;
  }
  if (pendingAlarm.processTankSensorId > 0) {
    document["id_processo_tanque_sensor"] = pendingAlarm.processTankSensorId;
  }
  document["tipo_alarme"] = pendingAlarm.type;
  document["origem_alarme"] = "ESP32";
  document["severidade"] = pendingAlarm.severity;
  document["titulo"] = pendingAlarm.title;
  document["descricao"] = pendingAlarm.description;
  char timestamp[32] = {};
  isoTimestampNow(timestamp, sizeof(timestamp));
  document["ocorrido_em"] = timestamp;

  const bool published = publishDocument(topicAlarms, document, false);
  if (published) {
    pendingAlarm.pending = false;
  }
  return published;
}

void runPeriodicPublishers() {
  if (!mqttClient.connected()) {
    return;
  }

  const uint32_t now = millis();
  if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatAt = now;
    publishHeartbeat(false, "ONLINE");
  }
  if (now - lastStatusAt >= STATUS_INTERVAL_MS) {
    lastStatusAt = now;
    publishHardwareStatus(false);
  }
  if (now - lastCouplingPublishAt >= COUPLING_PUBLISH_INTERVAL_MS) {
    lastCouplingPublishAt = now;
    publishCouplingStates();
  }
  if (now - lastDiagnosticReadingAt >= DIAGNOSTIC_READING_INTERVAL_MS) {
    lastDiagnosticReadingAt = now;
    publishDiagnosticReadings();
  }
  if (mainProcessLineReady() &&
      now - lastProcessReadingAt >= PROCESS_READING_INTERVAL_MS) {
    lastProcessReadingAt = now;
    publishProcessReadings();
  }
  publishPendingAlarm();
}

// =============================================================================
// ACK, IDEMPOTENCIA E RESOLUCAO DE RECURSOS
// =============================================================================

int8_t findTankIndexByCode(const char* code) {
  if (code == nullptr) {
    return -1;
  }
  for (uint8_t index = 0; index < 3; ++index) {
    if (strcmp(tanks[index].code, code) == 0) {
      return static_cast<int8_t>(index);
    }
  }
  return -1;
}

ValveState* findValveByCode(const char* code) {
  if (code == nullptr || code[0] == '\0') {
    return nullptr;
  }
  for (ValveState& valve : valves) {
    if (strcmp(valve.code, code) == 0) {
      return &valve;
    }
  }
  return nullptr;
}

ValveState* findValveById(int32_t id) {
  if (id <= 0) {
    return nullptr;
  }
  for (ValveState& valve : valves) {
    if (valve.id == id) {
      return &valve;
    }
  }
  return nullptr;
}

PumpState* findPumpByCode(const char* code) {
  if (code == nullptr || code[0] == '\0') {
    return nullptr;
  }
  for (PumpState& pump : pumps) {
    if (strcmp(pump.code, code) == 0) {
      return &pump;
    }
  }
  return nullptr;
}

PumpState* findPumpById(int32_t id) {
  if (id <= 0) {
    return nullptr;
  }
  for (PumpState& pump : pumps) {
    if (pump.id == id) {
      return &pump;
    }
  }
  return nullptr;
}

AckCacheEntry* findCachedAck(const char* correlationId) {
  if (correlationId == nullptr || correlationId[0] == '\0') {
    return nullptr;
  }
  for (AckCacheEntry& entry : ackCache) {
    if (entry.used && strcmp(entry.correlationId, correlationId) == 0) {
      return &entry;
    }
  }
  return nullptr;
}

bool publishAckValues(const char* correlationId, const char* command,
                      const char* status, const char* message,
                      const char* errorCode = nullptr,
                      int32_t processId = 0, int32_t tankId = 0,
                      int32_t valveId = 0, int32_t pumpId = 0) {
  JsonDocument document;
  document["tipo"] = "ACK";
  document["schema_version"] = MQTT_SCHEMA_VERSION;
  document["device_id"] = DEVICE_ID;
  document["codigo_hardware"] = DEVICE_ID;
  document["correlation_id"] = correlationId;
  document["comando"] = command;
  document["status"] = status;
  if (processId > 0) {
    document["id_processo"] = processId;
  }
  if (tankId > 0) {
    document["id_tanque"] = tankId;
  }
  if (valveId > 0) {
    document["id_valvula"] = valveId;
  }
  if (pumpId > 0) {
    document["id_bomba"] = pumpId;
  }
  if (message != nullptr && message[0] != '\0') {
    document["mensagem"] = message;
  }
  if (errorCode != nullptr && errorCode[0] != '\0') {
    document["erro"] = errorCode;
  }
  char timestamp[32] = {};
  isoTimestampNow(timestamp, sizeof(timestamp));
  document["recebido_em"] = timestamp;
  return publishDocument(topicAcks, document, false);
}

void cacheAndPublishFinalAck(const char* correlationId, const char* command,
                             const char* status, const char* message,
                             const char* errorCode = nullptr,
                             int32_t processId = 0, int32_t tankId = 0,
                             int32_t valveId = 0, int32_t pumpId = 0) {
  AckCacheEntry& entry = ackCache[ackCacheCursor];
  ackCacheCursor = (ackCacheCursor + 1U) % RECENT_COMMAND_COUNT;
  entry.used = true;
  strlcpy(entry.correlationId, correlationId, sizeof(entry.correlationId));
  strlcpy(entry.command, command, sizeof(entry.command));
  strlcpy(entry.status, status, sizeof(entry.status));
  strlcpy(entry.errorCode, errorCode == nullptr ? "" : errorCode,
          sizeof(entry.errorCode));
  strlcpy(entry.message, message == nullptr ? "" : message,
          sizeof(entry.message));
  entry.processId = processId;
  entry.tankId = tankId;
  entry.valveId = valveId;
  entry.pumpId = pumpId;

  publishAckValues(entry.correlationId, entry.command, entry.status,
                   entry.message, entry.errorCode, entry.processId,
                   entry.tankId, entry.valveId, entry.pumpId);
}

void republishCachedAck(const AckCacheEntry& entry) {
  publishAckValues(entry.correlationId, entry.command, entry.status,
                   entry.message, entry.errorCode, entry.processId,
                   entry.tankId, entry.valveId, entry.pumpId);
}

void rejectCommand(const char* correlationId, const char* command,
                   const char* errorCode, const char* message,
                   int32_t processId = 0, int32_t tankId = 0,
                   int32_t valveId = 0, int32_t pumpId = 0) {
  cacheAndPublishFinalAck(correlationId, command, "RECUSADO", message,
                          errorCode, processId, tankId, valveId, pumpId);
}

bool validSchema(JsonObjectConst root) {
  const int schema = root["schema_version"] | 0;
  return schema == 1 || schema == 2;
}

bool copyTopic(JsonObjectConst mqtt, const char* key, char* destination,
               size_t size) {
  const char* value = mqtt[key] | "";
  if (value[0] == '\0' || strlen(value) >= size) {
    return false;
  }
  strlcpy(destination, value, size);
  return true;
}

void resetApiMappings() {
  for (ValveState& valve : valves) {
    valve.id = 0;
    valve.tankId = 0;
    valve.pumpId = 0;
    valve.configured = false;
    valve.available = false;
  }
  for (PumpState& pump : pumps) {
    pump.id = 0;
    pump.configured = false;
    pump.available = false;
  }
  for (uint8_t index = 0; index < 3; ++index) {
    tanks[index].id = 0;
    tanks[index].configured = false;
    vacuumSensors[index].id = 0;
    vacuumSensors[index].configured = false;
    vacuumSensors[index].available = false;
    couplings[index].id = 0;
    couplings[index].tankId = 0;
    couplings[index].configured = false;
    couplings[index].available = false;
  }
}

// =============================================================================
// SYNC_CONFIG
// =============================================================================

void handleSyncConfig(JsonObjectConst root) {
  char correlationId[112] = {};
  strlcpy(correlationId, root["correlation_id"] | "", sizeof(correlationId));
  constexpr char command[] = "SINCRONIZAR_HARDWARE";

  if (correlationId[0] == '\0') {
    Serial.println(F("[TSEA][CONFIG] correlation_id ausente; payload ignorado."));
    return;
  }
  if (AckCacheEntry* cached = findCachedAck(correlationId)) {
    republishCachedAck(*cached);
    return;
  }

  publishAckValues(correlationId, command, "RECEBIDO",
                   "SYNC_CONFIG recebido e em validacao.");

  if (!validSchema(root) || strcmp(root["tipo"] | "", "SYNC_CONFIG") != 0) {
    rejectCommand(correlationId, command, "SCHEMA_INVALIDO",
                  "SYNC_CONFIG recusado: tipo ou schema_version incompativel.");
    return;
  }
  if (processActive || !allActuatorsSafe()) {
    rejectCommand(correlationId, command, "ATUADORES_ATIVOS",
                  "Nao e permitido trocar a configuracao com processo ou atuadores ativos.",
                  activeProcessId);
    return;
  }

  synchronizeClockFromIso(root["enviado_em"].as<const char*>());
  JsonObjectConst hardware = root["hardware"].as<JsonObjectConst>();
  JsonObjectConst mqtt = root["mqtt"].as<JsonObjectConst>();
  if (hardware.isNull() || mqtt.isNull()) {
    rejectCommand(correlationId, command, "PAYLOAD_INVALIDO",
                  "SYNC_CONFIG sem os objetos hardware e mqtt.");
    return;
  }

  resetApiMappings();

  for (JsonObjectConst item : hardware["tanques"].as<JsonArrayConst>()) {
    const int8_t index =
        findTankIndexByCode(item["codigo_hardware"].as<const char*>());
    const int32_t id = item["id_tanque"] | 0;
    if (index >= 0 && id > 0) {
      tanks[index].id = id;
      tanks[index].configured = true;
    }
  }

  for (JsonObjectConst item : hardware["bombas"].as<JsonArrayConst>()) {
    PumpState* pump =
        findPumpByCode(item["codigo_hardware"].as<const char*>());
    const int32_t id = item["id_bomba"] | 0;
    if (pump != nullptr && id > 0) {
      pump->id = id;
      pump->configured = true;
      pump->available = (item["disponivel"] | false) && !pump->fault;
    }
  }

  for (JsonObjectConst item : hardware["valvulas"].as<JsonArrayConst>()) {
    ValveState* valve =
        findValveByCode(item["codigo_hardware"].as<const char*>());
    const int32_t id = item["id_valvula"] | 0;
    const int32_t tankId = item["id_tanque"] | 0;
    const int32_t pumpId = item["id_bomba"] | 0;
    const char* type = item["tipo"] | "";
    if (valve == nullptr || id <= 0 || tankId <= 0 || pumpId <= 0) {
      continue;
    }
    const bool typeMatches =
        (valve->kind == ValveKind::PRINCIPAL && strcmp(type, "PRINCIPAL") == 0) ||
        (valve->kind == ValveKind::AUXILIAR && strcmp(type, "AUXILIAR") == 0);
    const PumpState& expectedPump =
        valve->kind == ValveKind::PRINCIPAL ? pumps[0] : pumps[1];
    if (!typeMatches || !tanks[valve->tankIndex].configured ||
        tanks[valve->tankIndex].id != tankId || !expectedPump.configured ||
        expectedPump.id != pumpId) {
      continue;
    }
    valve->id = id;
    valve->tankId = tankId;
    valve->pumpId = pumpId;
    valve->manifoldOutput = item["numero_saida_manifold"] | valve->manifoldOutput;
    valve->configured = true;
    valve->available = item["disponivel"] | false;
  }

  for (JsonObjectConst item : hardware["sensores_vacuo"].as<JsonArrayConst>()) {
    const char* code = item["codigo_hardware"].as<const char*>();
    const int32_t id = item["id_sensor"] | 0;
    for (VacuumSensorState& sensor : vacuumSensors) {
      if (code != nullptr && strcmp(sensor.code, code) == 0 && id > 0) {
        sensor.id = id;
        sensor.configured = true;
        sensor.available = item["disponivel"] | false;
      }
    }
  }

  for (JsonObjectConst item : hardware["sensores_acoplamento"].as<JsonArrayConst>()) {
    const char* code = item["codigo_hardware"].as<const char*>();
    const int32_t id = item["id_sensor"] | 0;
    const int32_t tankId = item["id_tanque"] | 0;
    for (CouplingState& coupling : couplings) {
      if (code != nullptr && strcmp(coupling.code, code) == 0 && id > 0 &&
          tankId == tanks[coupling.tankIndex].id) {
        coupling.id = id;
        coupling.tankId = tankId;
        coupling.configured = true;
        coupling.available = item["disponivel"] | false;
      }
    }
  }

  bool mappingsComplete = true;
  for (const TankContext& tank : tanks) {
    mappingsComplete = mappingsComplete && tank.configured;
  }
  for (const PumpState& pump : pumps) {
    mappingsComplete = mappingsComplete && pump.configured;
  }
  for (const ValveState& valve : valves) {
    mappingsComplete = mappingsComplete && valve.configured;
  }
  for (uint8_t index = 0; index < 3; ++index) {
    mappingsComplete = mappingsComplete && vacuumSensors[index].configured &&
                       couplings[index].configured;
  }

  char newTopicConfig[96] = {};
  char newTopicCommands[96] = {};
  char newTopicAcks[96] = {};
  char newTopicReadings[96] = {};
  char newTopicStatus[96] = {};
  char newTopicHeartbeat[96] = {};
  char newTopicCouplings[96] = {};
  char newTopicAlarms[96] = {};
  const bool topicsComplete =
      copyTopic(mqtt, "topico_configuracoes", newTopicConfig, sizeof(newTopicConfig)) &&
      copyTopic(mqtt, "topico_comandos", newTopicCommands, sizeof(newTopicCommands)) &&
      copyTopic(mqtt, "topico_acks", newTopicAcks, sizeof(newTopicAcks)) &&
      copyTopic(mqtt, "topico_leituras", newTopicReadings, sizeof(newTopicReadings)) &&
      copyTopic(mqtt, "topico_status", newTopicStatus, sizeof(newTopicStatus)) &&
      copyTopic(mqtt, "topico_heartbeat", newTopicHeartbeat, sizeof(newTopicHeartbeat)) &&
      copyTopic(mqtt, "topico_acoplamentos", newTopicCouplings, sizeof(newTopicCouplings)) &&
      copyTopic(mqtt, "topico_alarmes", newTopicAlarms, sizeof(newTopicAlarms));

  if (!mappingsComplete || !topicsComplete) {
    configSynchronized = false;
    strlcpy(currentError, "SYNC_CONFIG_INCOMPLETO", sizeof(currentError));
    rejectCommand(correlationId, command, "TOPOLOGIA_INCOMPLETA",
                  "SYNC_CONFIG precisa mapear duas bombas, tres tanques, seis valvulas, tres sensores de vacuo e tres acoplamentos.");
    return;
  }

  strlcpy(topicConfig, newTopicConfig, sizeof(topicConfig));
  strlcpy(topicCommands, newTopicCommands, sizeof(topicCommands));
  strlcpy(topicAcks, newTopicAcks, sizeof(topicAcks));
  strlcpy(topicReadings, newTopicReadings, sizeof(topicReadings));
  strlcpy(topicStatus, newTopicStatus, sizeof(topicStatus));
  strlcpy(topicHeartbeat, newTopicHeartbeat, sizeof(topicHeartbeat));
  strlcpy(topicCouplings, newTopicCouplings, sizeof(topicCouplings));
  strlcpy(topicAlarms, newTopicAlarms, sizeof(topicAlarms));

  JsonObjectConst system = root["sistema"].as<JsonObjectConst>();
  safetyVacuumLimitKpa = system["limite_seguranca_vacuo"] | -95.0F;
  vacuumTolerancePercent = system["tolerancia_vacuo_percentual"] | 10.0F;
  const uint32_t requestedTimeout =
      root["seguranca"]["timeout_heartbeat_ms"] | DEFAULT_MQTT_SAFETY_TIMEOUT_MS;
  mqttSafetyTimeoutMs = max(requestedTimeout, MIN_MQTT_SAFETY_TIMEOUT_MS);
  configSynchronized = true;
  strlcpy(currentError,
          VACUUM_SENSOR_CONFIGURATION_CONFIRMED ? "SEM_ERRO"
                                               : "CALIBRACAO_SENSOR_PENDENTE",
          sizeof(currentError));

  subscribeToApiTopics();
  cacheAndPublishFinalAck(
      correlationId, command, "EXECUTADO",
      "Configuracao v2 aplicada: duas bombas, tres tanques, seis valvulas e seis sensores mapeados.");
  publishHardwareStatus(true);
}

// =============================================================================
// INICIO DO PROCESSO E COMANDOS OPERACIONAIS
// =============================================================================

bool sensorReadyForProcess(uint8_t index) {
  const VacuumSensorState& sensor = vacuumSensors[index];
  return sensor.configured && sensor.available && sensor.present && sensor.valid &&
         sensor.lastReadAt > 0 &&
         millis() - sensor.lastReadAt <= SENSOR_STALE_TIMEOUT_MS;
}

bool hasUnconfirmedLegacySensor() {
  for (const VacuumSensorState& sensor : vacuumSensors) {
    if (sensor.protocol == XgzpProtocol::LEGACY && !XGZP_LEGACY_K_CONFIRMED) {
      return true;
    }
  }
  return false;
}

bool valueInsideConfiguredSensorRange(float valueKpa) {
  return valueKpa >= XGZP_PRESSURE_MIN_PA / 1000.0F &&
         valueKpa <= XGZP_PRESSURE_MAX_PA / 1000.0F;
}

void handleStartProcess(JsonObjectConst root, const char* correlationId,
                        const char* command) {
  const int32_t processId = root["id_processo"] | 0;
  if (!configSynchronized) {
    rejectCommand(correlationId, command, "CONFIGURACAO_NAO_SINCRONIZADA",
                  "Execute SYNC_CONFIG antes de iniciar o processo.", processId);
    return;
  }
  if (emergencyLatched) {
    rejectCommand(correlationId, command, "EMERGENCIA_ATIVA",
                  "A emergencia esta travada; reinicializacao fisica consciente e obrigatoria.",
                  processId);
    return;
  }
  if (processActive || !allActuatorsSafe()) {
    rejectCommand(correlationId, command, "HARDWARE_OCUPADO",
                  "Nao e permitido trocar de processo com processo ou atuadores ativos.",
                  processId);
    return;
  }
  if (!VACUUM_SENSOR_CONFIGURATION_CONFIRMED || hasUnconfirmedLegacySensor()) {
    rejectCommand(correlationId, command, "CALIBRACAO_PENDENTE",
                  "Confirme modelo, faixa e revisao dos tres sensores de vacuo no firmware.",
                  processId);
    return;
  }
  if (processId <= 0) {
    rejectCommand(correlationId, command, "PROCESSO_INVALIDO",
                  "id_processo deve ser um inteiro positivo.");
    return;
  }

  JsonObjectConst startPump = root["bomba"].as<JsonObjectConst>();
  const int32_t startPumpId = startPump["id_bomba"] | 0;
  const char* startPumpCode = startPump["codigo_hardware"] | "";
  if (startPumpId != pumps[0].id || strcmp(startPumpCode, pumps[0].code) != 0 ||
      !pumps[0].available) {
    rejectCommand(correlationId, command, "BOMBA_PRINCIPAL_INVALIDA",
                  "O inicio deve referenciar a bomba principal sincronizada e disponivel.",
                  processId, 0, 0, startPumpId);
    return;
  }

  const float requestedSafetyLimit =
      root["limite_seguranca_vacuo"] | safetyVacuumLimitKpa;
  const float requestedTolerance =
      root["tolerancia_vacuo_percentual"] | vacuumTolerancePercent;
  if (!valueInsideConfiguredSensorRange(requestedSafetyLimit) ||
      requestedTolerance < 0.0F || requestedTolerance > 100.0F) {
    rejectCommand(correlationId, command, "LIMITES_INVALIDOS",
                  "Limite de seguranca ou tolerancia fora da faixa local confirmada.",
                  processId);
    return;
  }

  JsonArrayConst startTanks = root["tanques"].as<JsonArrayConst>();
  if (startTanks.isNull() || startTanks.size() == 0 || startTanks.size() > 3) {
    rejectCommand(correlationId, command, "TANQUES_INVALIDOS",
                  "O processo deve selecionar de um a tres tanques.", processId);
    return;
  }

  bool selected[3] = {false, false, false};
  int32_t processTankIds[3] = {0, 0, 0};
  int32_t processTankSensorIds[3] = {0, 0, 0};
  float targets[3] = {0.0F, 0.0F, 0.0F};

  for (JsonObjectConst item : startTanks) {
    const int8_t signedIndex =
        findTankIndexByCode(item["codigo_hardware"].as<const char*>());
    if (signedIndex < 0) {
      rejectCommand(correlationId, command, "TANQUE_DESCONHECIDO",
                    "codigo_hardware de tanque desconhecido.", processId);
      return;
    }
    const uint8_t index = static_cast<uint8_t>(signedIndex);
    const int32_t tankId = item["id_tanque"] | 0;
    const int32_t processTankId = item["id_processo_tanque"] | 0;
    const int32_t processTankSensorId = item["id_processo_tanque_sensor"] | 0;
    JsonVariantConst targetValue = item["vacuo_alvo"];
    const float target = targetValue.isNull() ? NAN : targetValue.as<float>();
    if (selected[index] || tankId != tanks[index].id || processTankId <= 0 ||
        processTankSensorId <= 0 || !isfinite(target) ||
        !valueInsideConfiguredSensorRange(target) || target <= requestedSafetyLimit) {
      rejectCommand(correlationId, command, "CONTEXTO_TANQUE_INVALIDO",
                    "IDs, alvo ou duplicidade de tanque invalidos no inicio.",
                    processId, tankId);
      return;
    }

    JsonObjectConst sensor = item["sensor_vacuo"].as<JsonObjectConst>();
    JsonObjectConst coupling = item["sensor_acoplamento"].as<JsonObjectConst>();
    if (strcmp(sensor["codigo_hardware"] | "", vacuumSensors[index].code) != 0 ||
        (sensor["id_sensor"] | 0) != vacuumSensors[index].id ||
        strcmp(coupling["codigo_hardware"] | "", couplings[index].code) != 0 ||
        (coupling["id_sensor"] | 0) != couplings[index].id) {
      rejectCommand(correlationId, command, "SENSORES_DIVERGENTES",
                    "Sensores do tanque divergem do ultimo SYNC_CONFIG.",
                    processId, tankId);
      return;
    }
    if (!sensorReadyForProcess(index)) {
      rejectCommand(correlationId, command, "SENSOR_VACUO_INDISPONIVEL",
                    "Sensor de vacuo sem leitura fisica valida e recente.",
                    processId, tankId);
      return;
    }
    if (!couplings[index].configured || !couplings[index].available ||
        !couplings[index].coupled) {
      rejectCommand(correlationId, command, "MANGUEIRA_DESACOPLADA",
                    "O tanque selecionado nao possui acoplamento fisico confirmado.",
                    processId, tankId);
      return;
    }

    JsonArrayConst startValves = item["valvulas"].as<JsonArrayConst>();
    bool principalFound = false;
    bool auxiliaryFound = false;
    if (startValves.isNull() || startValves.size() != 2) {
      rejectCommand(correlationId, command, "VALVULAS_INVALIDAS",
                    "Cada tanque deve conter exatamente uma VP_Tn e uma VA_Tn.",
                    processId, tankId);
      return;
    }
    for (JsonObjectConst valveItem : startValves) {
      ValveState* valve =
          findValveByCode(valveItem["codigo_hardware"].as<const char*>());
      const int32_t valveId = valveItem["id_valvula"] | 0;
      const int32_t pumpId = valveItem["id_bomba"] | 0;
      const char* pumpCode = valveItem["bomba_codigo_hardware"] | "";
      const char* type = valveItem["tipo"] | "";
      if (valve == nullptr || valve->tankIndex != index || valve->id != valveId ||
          !valve->configured || !valve->available) {
        rejectCommand(correlationId, command, "VALVULA_DIVERGENTE",
                      "Valvula do processo diverge do ultimo SYNC_CONFIG.",
                      processId, tankId, valveId);
        return;
      }
      const PumpState& expectedPump =
          valve->kind == ValveKind::PRINCIPAL ? pumps[0] : pumps[1];
      if (pumpId != expectedPump.id || strcmp(pumpCode, expectedPump.code) != 0) {
        rejectCommand(correlationId, command, "BOMBA_DA_VALVULA_DIVERGENTE",
                      "A bomba vinculada a valvula diverge do ultimo SYNC_CONFIG.",
                      processId, tankId, valveId, pumpId);
        return;
      }
      if (valve->kind == ValveKind::PRINCIPAL && strcmp(type, "PRINCIPAL") == 0) {
        principalFound = true;
      } else if (valve->kind == ValveKind::AUXILIAR && strcmp(type, "AUXILIAR") == 0) {
        auxiliaryFound = true;
      } else {
        rejectCommand(correlationId, command, "TIPO_VALVULA_INVALIDO",
                      "O tipo da valvula nao corresponde ao codigo_hardware.",
                      processId, tankId, valveId);
        return;
      }
    }
    if (!principalFound || !auxiliaryFound) {
      rejectCommand(correlationId, command, "PAR_VALVULAS_INCOMPLETO",
                    "Cada tanque precisa do par principal e auxiliar.",
                    processId, tankId);
      return;
    }

    selected[index] = true;
    processTankIds[index] = processTankId;
    processTankSensorIds[index] = processTankSensorId;
    targets[index] = target;
  }

  activeProcessId = processId;
  safetyVacuumLimitKpa = requestedSafetyLimit;
  vacuumTolerancePercent = requestedTolerance;
  for (uint8_t index = 0; index < 3; ++index) {
    tanks[index].selected = selected[index];
    tanks[index].processTankId = processTankIds[index];
    tanks[index].processTankSensorId = processTankSensorIds[index];
    tanks[index].targetKpa = targets[index];
  }
  processActive = true;

  if (START_COMMAND_ACTUATES_MAIN_LINE) {
    for (ValveState& valve : valves) {
      if (valve.kind == ValveKind::PRINCIPAL && tanks[valve.tankIndex].selected) {
        setValveOutput(valve, true);
      }
    }
    delay(VALVE_SETTLE_MS);
    setPumpOutput(pumps[0], true);
  }

  strlcpy(currentError, "SEM_ERRO", sizeof(currentError));
  cacheAndPublishFinalAck(
      correlationId, command, "EXECUTADO",
      START_COMMAND_ACTUATES_MAIN_LINE
          ? "Contexto carregado; VP dos tanques selecionados e saida da bomba principal acionadas. Sem realimentacao mecanica."
          : "Contexto carregado; atuadores aguardam comandos individuais.",
      nullptr, processId, 0, 0, pumps[0].id);
  publishHardwareStatus(true);
}

ValveState* resolveCommandValve(JsonObjectConst root) {
  JsonObjectConst params = root["parametros"].as<JsonObjectConst>();
  const int32_t id = params["id_valvula"] | (root["id_valvula"] | 0);
  const char* code = params["codigo_hardware"] | "";
  if (code[0] == '\0') {
    code = root["codigo_hardware"] | "";
  }
  ValveState* byId = findValveById(id);
  ValveState* byCode = findValveByCode(code);
  if (byId != nullptr && byCode != nullptr && byId != byCode) {
    return nullptr;
  }
  return byId != nullptr ? byId : byCode;
}

PumpState* resolveCommandPump(JsonObjectConst root) {
  JsonObjectConst params = root["parametros"].as<JsonObjectConst>();
  const int32_t id = params["id_bomba"] | (root["id_bomba"] | 0);
  const char* code = params["codigo_hardware"] | "";
  if (code[0] == '\0') {
    code = root["codigo_hardware"] | "";
  }
  PumpState* byId = findPumpById(id);
  PumpState* byCode = findPumpByCode(code);
  if (byId != nullptr && byCode != nullptr && byId != byCode) {
    return nullptr;
  }
  return byId != nullptr ? byId : byCode;
}

uint8_t countOpenValves(ValveKind kind) {
  uint8_t count = 0;
  for (const ValveState& valve : valves) {
    if (valve.kind == kind && valve.open) {
      ++count;
    }
  }
  return count;
}

bool isKnownCommand(const char* command) {
  constexpr const char* known[] = {
      "LIGAR_BOMBA",          "DESLIGAR_BOMBA",
      "DESLIGAR_TODAS_BOMBAS", "ABRIR_VALVULA",
      "FECHAR_VALVULA",       "ABRIR_TODAS_VALVULAS",
      "FECHAR_TODAS_VALVULAS", "INICIAR_PROCESSO_VACUO",
      "PARAR_PROCESSO",       "PARADA_EMERGENCIA",
      "SINCRONIZAR_HARDWARE", "REINICIAR_COMUNICACAO"};
  for (const char* item : known) {
    if (strcmp(command, item) == 0) {
      return true;
    }
  }
  return false;
}

bool commandAllowedDuringEmergency(const char* command) {
  return strcmp(command, "PARADA_EMERGENCIA") == 0 ||
         strcmp(command, "PARAR_PROCESSO") == 0 ||
         strcmp(command, "DESLIGAR_BOMBA") == 0 ||
         strcmp(command, "DESLIGAR_TODAS_BOMBAS") == 0 ||
         strcmp(command, "FECHAR_VALVULA") == 0 ||
         strcmp(command, "FECHAR_TODAS_VALVULAS") == 0 ||
         strcmp(command, "REINICIAR_COMUNICACAO") == 0;
}

void handleGenericCommand(JsonObjectConst root, const char* correlationId,
                          const char* command) {
  const int32_t requestedProcessId = root["id_processo"] | activeProcessId;

  if (strcmp(command, "PARADA_EMERGENCIA") == 0) {
    const int32_t stoppedProcessId = activeProcessId > 0 ? activeProcessId
                                                         : requestedProcessId;
    forceAllActuatorsSafe(false);
    emergencyLatched = true;
    strlcpy(currentError, "PARADA_EMERGENCIA", sizeof(currentError));
    queueAlarm("SEGURANCA", "CRITICO", "Parada de emergencia",
               "O ESP32 recebeu PARADA_EMERGENCIA e retirou energia de todas as saidas.");
    clearProcessContext();
    cacheAndPublishFinalAck(correlationId, command, "EXECUTADO",
                            "Parada de emergencia aplicada; trava permanece ate reinicializacao fisica.",
                            nullptr, stoppedProcessId);
    publishHardwareStatus(true);
    return;
  }

  if (emergencyLatched && !commandAllowedDuringEmergency(command)) {
    rejectCommand(correlationId, command, "EMERGENCIA_ATIVA",
                  "Comando operacional bloqueado enquanto a emergencia esta travada.",
                  requestedProcessId);
    return;
  }

  if (strcmp(command, "PARAR_PROCESSO") == 0) {
    const int32_t stoppedProcessId = activeProcessId > 0 ? activeProcessId
                                                         : requestedProcessId;
    forceAllActuatorsSafe(true);
    if (!emergencyLatched) {
      strlcpy(currentError, "SEM_ERRO", sizeof(currentError));
    }
    cacheAndPublishFinalAck(correlationId, command, "EXECUTADO",
                            "Bombas desligadas, seis valvulas fechadas e contexto removido.",
                            nullptr, stoppedProcessId);
    publishHardwareStatus(true);
    return;
  }

  if (strcmp(command, "REINICIAR_COMUNICACAO") == 0) {
    forceAllActuatorsSafe(true);
    cacheAndPublishFinalAck(correlationId, command, "EXECUTADO",
                            "Atuadores seguros; reconexao MQTT solicitada.",
                            nullptr, requestedProcessId);
    reconnectRequested = true;
    return;
  }

  if (strcmp(command, "DESLIGAR_TODAS_BOMBAS") == 0) {
    setPumpOutput(pumps[1], false);
    setPumpOutput(pumps[0], false);
    cacheAndPublishFinalAck(correlationId, command, "EXECUTADO",
                            "As duas saidas de bomba foram desligadas.",
                            nullptr, requestedProcessId);
    publishHardwareStatus(true);
    return;
  }

  if (strcmp(command, "FECHAR_TODAS_VALVULAS") == 0) {
    if (pumps[0].on || pumps[1].on) {
      rejectCommand(correlationId, command, "BOMBA_LIGADA",
                    "Desligue as bombas antes de fechar todas as valvulas.",
                    requestedProcessId);
      return;
    }
    for (ValveState& valve : valves) {
      setValveOutput(valve, false);
    }
    cacheAndPublishFinalAck(correlationId, command, "EXECUTADO",
                            "As seis saidas de valvula foram fechadas.",
                            nullptr, requestedProcessId);
    publishHardwareStatus(true);
    return;
  }

  if (!configSynchronized) {
    rejectCommand(correlationId, command, "CONFIGURACAO_NAO_SINCRONIZADA",
                  "Execute SYNC_CONFIG antes de comandos operacionais.",
                  requestedProcessId);
    return;
  }

  if (strcmp(command, "ABRIR_TODAS_VALVULAS") == 0) {
    if (!processActive || !selectedCouplingsAreSafe()) {
      rejectCommand(correlationId, command, "PROCESSO_OU_ACOPLAMENTO_INVALIDO",
                    "Somente valvulas de tanques selecionados e acoplados podem abrir.",
                    requestedProcessId);
      return;
    }
    for (const ValveState& valve : valves) {
      if (tanks[valve.tankIndex].selected) {
        if (!valve.available) {
          rejectCommand(correlationId, command, "VALVULA_INDISPONIVEL",
                        "Uma valvula selecionada esta indisponivel.",
                        requestedProcessId, valve.tankId, valve.id);
          return;
        }
      }
    }
    for (ValveState& valve : valves) {
      if (tanks[valve.tankIndex].selected) {
        setValveOutput(valve, true);
      }
    }
    cacheAndPublishFinalAck(correlationId, command, "EXECUTADO",
                            "Valvulas principal e auxiliar dos tanques selecionados foram abertas.",
                            nullptr, requestedProcessId);
    publishHardwareStatus(true);
    return;
  }

  if (strcmp(command, "LIGAR_BOMBA") == 0 ||
      strcmp(command, "DESLIGAR_BOMBA") == 0) {
    PumpState* pump = resolveCommandPump(root);
    if (pump == nullptr || !pump->configured) {
      rejectCommand(correlationId, command, "BOMBA_DESCONHECIDA",
                    "id_bomba/codigo_hardware nao corresponde ao SYNC_CONFIG.",
                    requestedProcessId);
      return;
    }
    if (strcmp(command, "DESLIGAR_BOMBA") == 0) {
      if (!pump->auxiliary && pumps[1].on) {
        setPumpOutput(pumps[1], false);
      }
      setPumpOutput(*pump, false);
      cacheAndPublishFinalAck(correlationId, command, "EXECUTADO",
                              "Saida eletrica da bomba desligada.", nullptr,
                              requestedProcessId, 0, 0, pump->id);
      publishHardwareStatus(true);
      return;
    }
    if (!processActive || !pump->available || !selectedCouplingsAreSafe()) {
      rejectCommand(correlationId, command, "INTERTRAVAMENTO_BOMBA",
                    "Bomba exige processo ativo, recurso disponivel e acoplamentos validos.",
                    requestedProcessId, 0, 0, pump->id);
      return;
    }
    if (!pump->auxiliary && !selectedPrincipalValvesOpen()) {
      rejectCommand(correlationId, command, "VP_FECHADA",
                    "A bomba principal exige todas as VP_Tn selecionadas abertas.",
                    requestedProcessId, 0, 0, pump->id);
      return;
    }
    if (pump->auxiliary &&
        (!pumps[0].on || !anyOpenValve(ValveKind::AUXILIAR))) {
      rejectCommand(correlationId, command, "AUXILIAR_SEM_LINHA",
                    "A auxiliar exige principal ligada e ao menos uma VA_Tn aberta.",
                    requestedProcessId, 0, 0, pump->id);
      return;
    }
    if (pump->auxiliary && readAuxiliaryDuty() < AUX_MIN_SAFE_DUTY) {
      rejectCommand(correlationId, command, "PWM_AUXILIAR_INSUFICIENTE",
                    "Ajuste local abaixo do minimo seguro para mover a bomba auxiliar.",
                    requestedProcessId, 0, 0, pump->id);
      return;
    }
    setPumpOutput(*pump, true);
    cacheAndPublishFinalAck(correlationId, command, "EXECUTADO",
                            "Saida eletrica da bomba acionada; sem sensor de corrente/rotacao.",
                            nullptr, requestedProcessId, 0, 0, pump->id);
    publishHardwareStatus(true);
    return;
  }

  if (strcmp(command, "ABRIR_VALVULA") == 0 ||
      strcmp(command, "FECHAR_VALVULA") == 0) {
    ValveState* valve = resolveCommandValve(root);
    if (valve == nullptr || !valve->configured) {
      rejectCommand(correlationId, command, "VALVULA_DESCONHECIDA",
                    "id_valvula/codigo_hardware nao corresponde ao SYNC_CONFIG.",
                    requestedProcessId);
      return;
    }
    if (!processActive || !tanks[valve->tankIndex].selected) {
      rejectCommand(correlationId, command, "TANQUE_NAO_SELECIONADO",
                    "Valvula de tanque nao selecionado permanece bloqueada.",
                    requestedProcessId, valve->tankId, valve->id);
      return;
    }
    if (strcmp(command, "ABRIR_VALVULA") == 0) {
      if (!valve->available || !couplings[valve->tankIndex].coupled) {
        rejectCommand(correlationId, command, "VALVULA_BLOQUEADA",
                      "Valvula indisponivel ou tanque desacoplado.",
                      requestedProcessId, valve->tankId, valve->id);
        return;
      }
      setValveOutput(*valve, true);
    } else {
      const bool correspondingPumpOn = valve->kind == ValveKind::PRINCIPAL
                                           ? pumps[0].on
                                           : pumps[1].on;
      if (valve->open && correspondingPumpOn &&
          countOpenValves(valve->kind) <= 1) {
        rejectCommand(correlationId, command, "ULTIMA_VALVULA_COM_BOMBA_LIGADA",
                      "Nao e permitido fechar a ultima valvula da linha com a bomba correspondente ligada.",
                      requestedProcessId, valve->tankId, valve->id);
        return;
      }
      setValveOutput(*valve, false);
    }
    cacheAndPublishFinalAck(
        correlationId, command, "EXECUTADO",
        strcmp(command, "ABRIR_VALVULA") == 0
            ? "Saida eletrica da valvula aberta; sem sensor de posicao."
            : "Saida eletrica da valvula fechada; sem sensor de posicao.",
        nullptr, requestedProcessId, valve->tankId, valve->id);
    publishHardwareStatus(true);
    return;
  }

  if (strcmp(command, "SINCRONIZAR_HARDWARE") == 0) {
    rejectCommand(correlationId, command, "USE_TOPICO_CONFIG",
                  "A configuracao completa deve ser publicada em tsea/config.",
                  requestedProcessId);
    return;
  }

  rejectCommand(correlationId, command, "COMANDO_NAO_IMPLEMENTADO",
                "Comando conhecido, mas sem implementacao nesta versao.",
                requestedProcessId);
}

void handleCommand(JsonObjectConst root) {
  char correlationId[112] = {};
  char command[40] = {};
  strlcpy(correlationId, root["correlation_id"] | "", sizeof(correlationId));

  const char* explicitCommand = root["comando"] | "";
  const char* type = root["tipo"] | "";
  strlcpy(command, explicitCommand[0] != '\0' ? explicitCommand : type,
          sizeof(command));

  if (correlationId[0] == '\0') {
    queueAlarm("ESP32", "MEDIO", "Comando MQTT invalido",
               "Um comando sem correlation_id foi ignorado.");
    return;
  }
  if (AckCacheEntry* cached = findCachedAck(correlationId)) {
    republishCachedAck(*cached);
    return;
  }
  if (!validSchema(root)) {
    // O nome e valido, entao a API consegue registrar o ACK de recusa.
    if (isKnownCommand(command)) {
      rejectCommand(correlationId, command, "SCHEMA_INVALIDO",
                    "Somente schema_version 1 ou 2 e aceito.");
    }
    return;
  }
  if (!isKnownCommand(command)) {
    queueAlarm("ESP32", "MEDIO", "Comando MQTT desconhecido",
               "O ESP32 recebeu um nome de comando fora do contrato e nao acionou saidas.");
    return;
  }

  synchronizeClockFromIso(root["enviado_em"].as<const char*>());
  publishAckValues(correlationId, command, "RECEBIDO",
                   "Comando recebido e em validacao local.",
                   nullptr, root["id_processo"] | 0);

  if (strcmp(command, "INICIAR_PROCESSO_VACUO") == 0) {
    handleStartProcess(root, correlationId, command);
    return;
  }
  handleGenericCommand(root, correlationId, command);
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (topic == nullptr || payload == nullptr || length == 0) {
    return;
  }

  JsonDocument document;
  // Entrada const faz o ArduinoJson copiar strings. Assim, publicar RECEBIDO
  // dentro do callback nao invalida ponteiros que vieram do buffer PubSubClient.
  const DeserializationError error = deserializeJson(
      document, reinterpret_cast<const char*>(payload), length);
  if (error) {
    Serial.printf("[TSEA][MQTT] JSON invalido em %s: %s\n", topic,
                  error.c_str());
    queueAlarm("ESP32", "MEDIO", "JSON MQTT invalido",
               "Uma mensagem recebida nao pode ser interpretada; nenhuma saida foi alterada.");
    return;
  }

  JsonObjectConst root = document.as<JsonObjectConst>();
  if (strcmp(topic, topicConfig) == 0) {
    handleSyncConfig(root);
  } else if (strcmp(topic, topicCommands) == 0) {
    handleCommand(root);
  }
}
