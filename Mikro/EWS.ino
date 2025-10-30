#include <RTClib.h>
#include <Wire.h>
#include <MPU9250_WE.h>
#include <DHT.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include <freertos/timers.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <HTTPClient.h> 
#include <LiquidCrystal_I2C.h>

// ============================
//   KONFIGURASI SENSOR & PIN
// ============================

// MPU9250
#define MPU9250_ADDR 0x68
MPU9250_WE myMPU9250 = MPU9250_WE(MPU9250_ADDR);

// DHT22
#define DHT_PIN 4
#define DHT_TYPE DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// Soil Moisture
#define SOIL_MOISTURE_PIN 34

// Rain
#define RainPin 2

// Buzzer & LED
#define BUZZER_PIN1 13
#define BUZZER_PIN2 12
#define LED_GREEN 27

// ============================
//   KONFIGURASI TELEGRAM BOT
// ============================
#define BOT_TOKEN "8214144992:AAFUsNNCpOHdb_Jdo2AZdV9uWC5i6hEqDXI"
String CHAT_ID = "-1003253052270";
String last_chat_id = "";

String telegramBaseURL = "https://api.telegram.org/bot" + String(BOT_TOKEN);

// ============================
// KONFIGURASI JARINGAN & MQTT
// ============================
const char* ssid = "oramodal";
const char* password = "cobatanyaaku";

// MQTT Broker
const char* mqtt_server = "103.127.97.247";
const int mqtt_port = 1883;
const char* mqtt_user = "rzkink_2554";
const char* mqtt_password = "rizkink1234";

// MQTT Topics
const char* topic_data = "rzkink_2554/ews/sensor/data";
const char* topic_alerts = "rzkink_2554/ews/sensor/alerts";
const char* topic_control = "rzkink_2554/ews/control/#";
const char* topic_ota = "rzkink_2554/ews/ota/status";

// Device Info
String deviceID = "EWS_001";
String location = "Lokasi_A";

// ============================
//    THRESHOLD & KALIBRASI
// ============================
float TILT_WARNING = 3.0;
float TILT_DANGER = 6.0;
int SOIL_WARNING = 70;
int SOIL_DANGER = 85;
int HUMIDITY_WARNING = 85;
float DISPLACEMENT_WARNING = 5.0;   // 5 cm
float DISPLACEMENT_DANGER = 10.0;   // 10 cm
double HOURLY_WARNING = 40, HOURLY_DANGER = 80;
double DAILY_WARNING = 40, DAILY_DANGER = 80;

const int SOIL_DRY = 4095;
const int SOIL_WET = 1800;

// ============================
//   STRUKTUR DATA UNTUK RTOS 
// ============================
typedef struct {
  float roll;
  float pitch;
  int soil_moisture;
  float temperature;
  float humidity;
  double dailyRain;
  double hourlyRain;
  int status;
  int risk_score;
  bool sensors_ok;
  float displacement_x;
  float displacement_y;
  float displacement_z;
  float total_displacement;
  float acceleration_x;
  float acceleration_y;
  float acceleration_z;
} SensorData_t;

typedef struct {
  String topic;
  String message;
} MQTTMessage_t;

typedef struct {
  String version;
  String message;
  bool in_progress;
} OTAStatus_t;

typedef struct {
  String command;
  String chat_id;
  String message;
} TelegramMessage_t;

// ============================
//        RTOS HANDLES 
// ============================
TaskHandle_t taskSensorHandle = NULL;
TaskHandle_t taskMQTTHandle = NULL;
TaskHandle_t taskStatusHandle = NULL;
TaskHandle_t taskMonitorHandle = NULL;
TaskHandle_t taskTelegramHandle = NULL;  // TASK BARU UNTUK TELEGRAM

QueueHandle_t sensorDataQueue = NULL;
QueueHandle_t mqttQueue = NULL;
QueueHandle_t alertQueue = NULL;
QueueHandle_t otaQueue = NULL;
QueueHandle_t telegramSendQueue = NULL;

SemaphoreHandle_t i2cMutex = NULL;
SemaphoreHandle_t mqttMutex = NULL;
SemaphoreHandle_t thresholdMutex = NULL;
SemaphoreHandle_t otaMutex = NULL;
SemaphoreHandle_t telegramMutex = NULL;   // MUTEX BARU UNTUK TELEGRAM

TimerHandle_t mqttTimer = NULL;
TimerHandle_t otaTimer = NULL;

// ============================
//       VARIABEL GLOBAL
// ============================
SensorData_t currentSensorData;
WiFiClient espClient;
PubSubClient mqttClient(espClient);
RTC_Millis rtc;
LiquidCrystal_I2C lcd(0x27, 16, 2);

unsigned long MQTT_INTERVAL = 10000;
bool wifiConnected = false;
bool mqttConnected = false;
bool otaInProgress = false;
bool mqttReconnecting = false;
bool telegramConnected = false;
String firmwareVersion = "1.0.0";

float filteredRoll = 0, filteredPitch = 0;
const float ALPHA = 0.8;
float roll = 0, pitch = 0;
int soilMoisture = 0;
float temperature = 0, humidity = 0;
bool bucketPositionA = false;              
const double bucketAmount = 0.053;  
double dailyRain = 0.0, hourlyRain = 0.0, dailyRain_till_LastHour = 0.0;        
bool first; 
float displacementX = 0.0;  // Pergeseran sumbu X (cm)
float displacementY = 0.0;  // Pergeseran sumbu Y (cm) 
float displacementZ = 0.0;  // Pergeseran sumbu Z (cm)
float totalDisplacement = 0.0;  // Total pergeseran (cm)

// Variabel untuk perhitungan integrasi
xyzFloat lastAccel = {0, 0, 0};
xyzFloat velocity = {0, 0, 0};
unsigned long lastIntegrationTime = 0;
bool firstIntegration = true;

// Filter untuk accelerometer
const float ACCEL_ALPHA = 0.8;  // Filter low-pass
xyzFloat filteredAccel = {0, 0, 0};

unsigned long lastReconnectAttempt = 0;
const unsigned long RECONNECT_INTERVAL = 10000;
unsigned long lastTelegramCheck = 0;
int lastUpdateId = 0;

// ============================
//      PROTOTYPE FUNCTIONS
// ============================
int analyzeRisk();
int calculateRiskScore();
void handleStatus(int status);
void handleConnectionLEDs();
void displaySensorData(SensorData_t data);
String getStatusText(int status);
void sendSensorDataMQTT(SensorData_t data);
void sendConnectionStatus(bool connected);
void setupOTA();
void mqttTimerCallback(TimerHandle_t xTimer);
void telegramTimerCallback(TimerHandle_t xTimer);
void handleTelegramMessages();
void sendTelegramMessage(String chat_id, String message);
void sendTelegramAlert(SensorData_t data);
void handleTelegramCommand(String chat_id, String command, String text);

// ==============================
// TASK SENSOR - PRIORITAS TINGGI
// ==============================
void taskSensor(void *parameter) {
  SensorData_t sensorData;
  TickType_t lastWakeTime = xTaskGetTickCount();
  const TickType_t frequency = pdMS_TO_TICKS(2000);

  initializeSensors();

  while (1) {
    if (!otaInProgress) {
      if (xSemaphoreTake(i2cMutex, portMAX_DELAY) == pdTRUE) {
        readMPU9250();
        readSoilMoisture();
        readDHT22();
        rainGauge();
        xSemaphoreGive(i2cMutex);
      }

      sensorData.roll = filteredRoll;
      sensorData.pitch = filteredPitch;
      sensorData.soil_moisture = soilMoisture;
      sensorData.temperature = temperature;
      sensorData.humidity = humidity;
      sensorData.dailyRain = dailyRain;
      sensorData.hourlyRain = hourlyRain;
      sensorData.displacement_x = displacementX;
      sensorData.displacement_y = displacementY; 
      sensorData.displacement_z = displacementZ;
      sensorData.total_displacement = totalDisplacement;
      sensorData.status = analyzeRisk();
      sensorData.risk_score = calculateRiskScore();

      if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
        currentSensorData = sensorData;
        xSemaphoreGive(thresholdMutex);
      }

      if (xQueueSend(sensorDataQueue, &sensorData, 0) != pdTRUE) {
        Serial.println("Sensor queue full!");
      }

      if (sensorData.status > 0) {
        if (xQueueSend(alertQueue, &sensorData, 0) != pdTRUE) {
          Serial.println("Alert queue full!");
        }
      }
    }

    vTaskDelayUntil(&lastWakeTime, frequency);
  }
}

// ==============================
// TASK MQTT - PRIORITAS MENENGAH
// ==============================
void taskMQTT(void *parameter) {
  MQTTMessage_t mqttMsg;
  SensorData_t sensorData;
  
  connectToWiFi();
  int waitCount = 0;
  while (!wifiConnected && waitCount < 30) {
    vTaskDelay(pdMS_TO_TICKS(1000));
    waitCount++;
  }
  
  if (wifiConnected) {
    setupMQTT();
    Serial.println("📡 Task MQTT: SIAP");
  }

  unsigned long lastReconnectAttempt = 0;
  const unsigned long RECONNECT_COOLDOWN = 30000; // 30 detik
  bool wasConnected = false;

  while (1) {
    if (wifiConnected && !otaInProgress) {
      bool currentConnected = mqttClient.connected();
      if (!currentConnected) {
        unsigned long now = millis();
        if (now - lastReconnectAttempt > RECONNECT_COOLDOWN) {
          Serial.println("🔄 Mencoba reconnect MQTT...");
          reconnectMQTT();
          lastReconnectAttempt = now;
        }
      } 
      else{
        mqttClient.loop();
        if (!wasConnected && currentConnected) {
          sendConnectionStatus(true);
          wasConnected = true;
        }
      }

      while (xQueueReceive(mqttQueue, &mqttMsg, 0) == pdTRUE) {
        if (currentConnected) { // Hanya kirim jika connected
          if (xSemaphoreTake(mqttMutex, portMAX_DELAY) == pdTRUE) {
            bool published = mqttClient.publish(mqttMsg.topic.c_str(), mqttMsg.message.c_str());
            xSemaphoreGive(mqttMutex);
            
            if(!published){
              Serial.println("❌ MQTT publish failed, re-queueing message");
              // Tunggu sebentar sebelum re-queue
              vTaskDelay(pdMS_TO_TICKS(100));
              xQueueSend(mqttQueue, &mqttMsg, pdMS_TO_TICKS(10));
              break;
            } else {
              Serial.println("✅ MQTT message published: " + mqttMsg.topic);
            }
          }
        } else {
          // Jika tidak connected, masukkan kembali ke queue
          Serial.println("📭 MQTT not connected, re-queueing message");
          xQueueSend(mqttQueue, &mqttMsg, pdMS_TO_TICKS(10));
          break;
        }
        vTaskDelay(pdMS_TO_TICKS(20));
      }

      if (currentConnected) {
        while (xQueueReceive(sensorDataQueue, &sensorData, 0) == pdTRUE) {
          sendSensorDataMQTT(sensorData);
          vTaskDelay(pdMS_TO_TICKS(10));
        }

        while (xQueueReceive(alertQueue, &sensorData, 0) == pdTRUE) {
          sendAlertMQTT(sensorData);
          vTaskDelay(pdMS_TO_TICKS(10));
        }
      }

      wasConnected = currentConnected;
    } else {
      // OTA in progress, skip MQTT operations
      vTaskDelay(pdMS_TO_TICKS(1000));
    }

    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

// ==================================
// TASK TELEGRAM - PRIORITAS MENENGAH
// ==================================
void taskTelegram(void *parameter) {
  TelegramMessage_t telegramMsg;
  SensorData_t sensorData;
  int lastAlertStatus = -1;
  static bool restartInProgress = false;
  unsigned long lastRestartCommand = 0;
  
  // Tunggu sampai WiFi connected
  Serial.println("🤖 Menunggu koneksi WiFi untuk Telegram...");
  while (!wifiConnected) {
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
  
  // Kirim pesan startup ke Telegram group
  String startupMsg = "🚀 <b>EARLY WARNING SYSTEM STARTED</b>\n\n";
  startupMsg += "✅ <b>System Initialization Complete</b>\n";
  startupMsg += "📍 <b>Device:</b> " + deviceID + "\n";
  startupMsg += "🏠 <b>Location:</b> " + location + "\n";
  startupMsg += "🔧 <b>Firmware:</b> " + firmwareVersion + "\n";
  startupMsg += "🌐 <b>IP Address:</b> " + WiFi.localIP().toString() + "\n";
  startupMsg += "📡 <b>MQTT:</b> " + String(mqttConnected ? "Connected" : "Connecting...") + "\n";
  startupMsg += "🤖 <b>Telegram Bot:</b> Online\n\n";
  startupMsg += "🟢 <b>Status: Monitoring Active</b>\n";
  startupMsg += "All sensors are now being monitored for landslide risks.";
  
  sendTelegramMessage(CHAT_ID, startupMsg);
  Serial.println("🤖 Telegram Bot: DIINISIALISASI & STARTUP MESSAGE SENT");

  while (1) {
    if (wifiConnected && !otaInProgress && !restartInProgress) {
      // Handle incoming Telegram messages setiap 3 detik
      if (millis() - lastTelegramCheck > 1000) {
        handleTelegramMessages();
        lastTelegramCheck = millis();
      }
      
      // Process outgoing Telegram messages dari queue
      while (xQueueReceive(telegramSendQueue, &telegramMsg, 0) == pdTRUE) {
        if (telegramMsg.chat_id != "" && telegramMsg.chat_id != "0") {
          sendTelegramMessage(telegramMsg.chat_id, telegramMsg.message);
        }
        vTaskDelay(pdMS_TO_TICKS(500)); // Delay antar pesan
      }
      
      // Check untuk alerts
      if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
        sensorData = currentSensorData;
        xSemaphoreGive(thresholdMutex);
      }
      
      // Kirim alert jika status berubah
      if (sensorData.status != lastAlertStatus && sensorData.status > 0) {
        Serial.println("🚨 Status changed to: " + String(sensorData.status));
        sendTelegramAlert(sensorData);
        lastAlertStatus = sensorData.status;
      } else if (sensorData.status == 0 && lastAlertStatus > 0) {
        // Kirim pesan normal jika status kembali normal
        String normalMsg = "🟢 <b>CONDITION NORMALIZED</b>\n\n";
        normalMsg += "All sensor readings have returned to normal levels.\n";
        normalMsg += "Risk of landslide has decreased.\n\n";
        normalMsg += "📍 <b>Device:</b> " + deviceID + "\n";
        normalMsg += "🏠 <b>Location:</b> " + location;
          
        sendTelegramMessage(CHAT_ID, normalMsg);
        lastAlertStatus = 0;
      }
    }
    
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

// ====================================
// TASK STATUS & LED - PRIORITAS RENDAH
// ====================================
void taskStatus(void *parameter) {
  SensorData_t sensorData;
  int lastStatus = -1;

  while (1) {
    if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
      sensorData = currentSensorData;
      xSemaphoreGive(thresholdMutex);
    }

    if (sensorData.status != lastStatus && !otaInProgress) {
      handleStatus(sensorData.status);
      lastStatus = sensorData.status;
    }

    handleConnectionLEDs();

    vTaskDelay(pdMS_TO_TICKS(500));
  }
}

// ==========================================================
// TASK MONITOR DENGAN OTA HANDLING - PRIORITAS SANGAT RENDAH
// ==========================================================
void taskMonitor(void *parameter) {
  SensorData_t sensorData;
  OTAStatus_t otaStatus;
  TickType_t lastWakeTime = xTaskGetTickCount();
  const TickType_t frequency = pdMS_TO_TICKS(2000); // 2 detik untuk OTA responsiveness
  bool otaInitialized = false;

  // Setup OTA
  while (!wifiConnected) {
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
  
  // Setup OTA HANYA SEKALI di sini
  vTaskDelay(pdMS_TO_TICKS(2000)); // Beri waktu stabilisasi

  while (1) {
    // Handle OTA
    if (wifiConnected && !otaInitialized) {
      setupOTA();
      otaInitialized = true; 
    }

    if (wifiConnected && otaInitialized) {
      ArduinoOTA.handle();
    }

    // Check for OTA status updates
    if (xQueueReceive(otaQueue, &otaStatus, 0) == pdTRUE) {
      handleOTAStatus(otaStatus);
    }

    // Tampilkan data di serial (kecuali saat OTA progress)
    if (!otaInProgress) {
      if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
        sensorData = currentSensorData;
        xSemaphoreGive(thresholdMutex);
      }
      displaySensorData(sensorData);
      
      // Print task monitoring (setiap 10 detik)
      static unsigned long lastStackPrint = 0;
      if (millis() - lastStackPrint > 10000) {
        Serial.printf("RTOS Task Stack - Sensor: %d, MQTT: %d, Telegram: %d, Status: %d, Monitor: %d\n",
                      uxTaskGetStackHighWaterMark(taskSensorHandle),
                      uxTaskGetStackHighWaterMark(taskMQTTHandle),
                      uxTaskGetStackHighWaterMark(taskTelegramHandle),
                      uxTaskGetStackHighWaterMark(taskStatusHandle),
                      uxTaskGetStackHighWaterMark(taskMonitorHandle));
        lastStackPrint = millis();
      }
    }

    vTaskDelayUntil(&lastWakeTime, frequency);
  }
}

// ============================
//    OTA SETUP & HANDLING
// ============================
void setupOTA() {
  // Set hostname berdasarkan device ID
  String hostname = "EWS-" + deviceID;
  ArduinoOTA.setHostname(hostname.c_str());
  
  // Set password (opsional) - HAPUS KOMENTAR JIKA MAU PAKAI PASSWORD
  ArduinoOTA.setPassword("admin123");
  
  // OTA Event Handlers
  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else { // U_SPIFFS
      type = "filesystem";
    }
    
    // NOTE: if updating SPIFFS this would be the place to unmount SPIFFS using SPIFFS.end()
    Serial.println("\n=== OTA Update Started ===");
    Serial.println("Update type: " + type);
    
    // Set flag OTA in progress
    otaInProgress = true;
    
    // Matikan semua task yang tidak penting
    digitalWrite(LED_GREEN, LOW);
    
    // Kirim status OTA mulai via MQTT
    OTAStatus_t otaStatus;
    otaStatus.version = firmwareVersion;
    otaStatus.message = "OTA Update Started - " + type;
    otaStatus.in_progress = true;
    xQueueSend(otaQueue, &otaStatus, 0);
  });

  ArduinoOTA.onEnd([]() {
    Serial.println("\n=== OTA Update Finished ===");
    Serial.println("Rebooting...");
    
    // Kirim status OTA selesai
    OTAStatus_t otaStatus;
    otaStatus.version = firmwareVersion;
    otaStatus.message = "OTA Update Finished - Rebooting";
    otaStatus.in_progress = false;
    xQueueSend(otaQueue, &otaStatus, 0);
    
    // Delay sebentar sebelum reboot
    vTaskDelay(pdMS_TO_TICKS(1000));
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    int percentage = (progress / (total / 100));
    
    // Tampilkan progress setiap 10%
    if (percentage % 10 == 0) {
      Serial.printf("OTA Progress: %u%%\r", percentage);
      
      // Blink LED sebagai indikator progress
      digitalWrite(LED_GREEN, !digitalRead(LED_GREEN));
    }
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("\nOTA Error[%u]: ", error);
    
    String errorMsg;
    switch (error) {
      case OTA_AUTH_ERROR:
        errorMsg = "Auth Failed";
        break;
      case OTA_BEGIN_ERROR:
        errorMsg = "Begin Failed";
        break;
      case OTA_CONNECT_ERROR:
        errorMsg = "Connect Failed";
        break;
      case OTA_RECEIVE_ERROR:
        errorMsg = "Receive Failed";
        break;
      case OTA_END_ERROR:
        errorMsg = "End Failed";
        break;
      default:
        errorMsg = "Unknown Error";
        break;
    }
    
    Serial.println(errorMsg);
    
    // Reset OTA flag
    otaInProgress = false;
    
    // Kirim error status
    OTAStatus_t otaStatus;
    otaStatus.version = firmwareVersion;
    otaStatus.message = "OTA Error: " + errorMsg;
    otaStatus.in_progress = false;
    xQueueSend(otaQueue, &otaStatus, 0);
    
    // Reset LED ke normal
    digitalWrite(LED_GREEN, HIGH);
  });

  // Start OTA service
  ArduinoOTA.begin();

  if (!MDNS.begin("EWS-EWS_001")) {
    Serial.println("❌ mDNS setup failed");
  } else {
    Serial.println("✅ mDNS started: EWS-EWS_001.local");
    MDNS.addService("arduino", "tcp", 3232);
  }
  
  Serial.println("OTA Update Service Ready");
  Serial.println("Hostname: " + String(ArduinoOTA.getHostname()));
  Serial.println("IP: " + WiFi.localIP().toString());
  Serial.println("Firmware: " + firmwareVersion);
}

void handleOTAStatus(OTAStatus_t otaStatus) {
  // Kirim status OTA via MQTT
  DynamicJsonDocument doc(512);
  doc["device_id"] = deviceID;
  doc["firmware_version"] = otaStatus.version;
  doc["message"] = otaStatus.message;
  doc["in_progress"] = otaStatus.in_progress;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  MQTTMessage_t mqttMsg;
  mqttMsg.topic = topic_ota;
  mqttMsg.message = jsonString;
  
  if (xQueueSend(mqttQueue, &mqttMsg, 0) != pdTRUE) {
    Serial.println("Failed to send OTA status to MQTT queue");
  }
}

// ============================
//     CALLBACK MQTT TIMER
// ============================
void mqttTimerCallback(TimerHandle_t xTimer) {
  if (!otaInProgress && xSemaphoreTake(thresholdMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    SensorData_t data = currentSensorData;
    xSemaphoreGive(thresholdMutex);
    sendSensorDataMQTT(data);
  }
}

// ============================
//   FUNGSI TELEGRAM HANDLER
// ============================
void sendTelegramMessage(String chat_id, String message) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi tidak terhubung, tidak bisa kirim Telegram");
    return;
  }

  // Validasi chat_id
  if (chat_id == "" || chat_id == "0") {
    Serial.println("❌ Chat ID tidak valid: " + chat_id);
    return;
  }

  HTTPClient http;
  String url = telegramBaseURL + "/sendMessage";
  
  // Escape karakter khusus untuk JSON
  message.replace("\\", "\\\\");  // Escape backslash dulu
  message.replace("\"", "\\\"");
  message.replace("\n", "\\n");
  message.replace("\r", "\\r");
  message.replace("\t", "\\t");
  
  String jsonPayload = "{";
  jsonPayload += "\"chat_id\":" + chat_id + ",";  // Tidak pakai quotes untuk numeric ID
  jsonPayload += "\"text\":\"" + message + "\",";
  jsonPayload += "\"parse_mode\":\"HTML\"";
  jsonPayload += "}";

  Serial.println("📤 Mengirim pesan Telegram ke: " + chat_id);
  Serial.println("Payload: " + jsonPayload);
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    if (httpResponseCode == 200) {
      Serial.println("✅ Telegram message sent successfully");
    } else {
      Serial.println("❌ Telegram API error: " + String(httpResponseCode));
      Serial.println("Response: " + response);
    }
  } else {
    Serial.println("❌ Error dalam mengirim pesan: " + String(httpResponseCode));
  }
  
  http.end();
}

String getTelegramUpdates() {
  if (WiFi.status() != WL_CONNECTED) {
    return "";
  }

  HTTPClient http;
  String url = telegramBaseURL + "/getUpdates?offset=" + String(lastUpdateId + 1) + "&limit=5";
  
  Serial.println("🔍 Checking Telegram updates...");
  http.begin(url);
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();
    http.end();
    return payload;
  } else {
    Serial.println("❌ Error getting Telegram updates: " + String(httpCode));
  }
  
  http.end();
  return "";
}

void handleTelegramMessages() {
  String updates = getTelegramUpdates();
  if (updates == "" || updates == "{\"ok\":true,\"result\":[]}") {
    return; // Tidak ada pesan baru
  }

  Serial.println("📱 Raw Telegram response: " + updates);

  // Parse JSON response
  DynamicJsonDocument doc(4096);  // Increase buffer size
  DeserializationError error = deserializeJson(doc, updates);
  
  if (error) {
    Serial.println("❌ JSON parse error: " + String(error.c_str()));
    return;
  }

  if (doc["ok"] == true) {
    JsonArray results = doc["result"];
    
    for (JsonObject update : results) {
      int update_id = update["update_id"];
      lastUpdateId = update_id; // Update last processed ID
      
      if (update.containsKey("message")) {
        JsonObject message = update["message"];
        
        // Handle different chat ID formats
        String chat_id;
        if (message["chat"]["id"].is<long>()) {
          chat_id = String(message["chat"]["id"].as<long>());
        } else {
          chat_id = message["chat"]["id"].as<String>();
        }
        
        String text = message["text"].as<String>();
        String from_name = message["from"]["first_name"].as<String>();
        
        Serial.println("💬 New message from: " + from_name + " - Chat ID: " + chat_id + " - Text: " + text);
        
        // Simpan chat_id untuk reply
        last_chat_id = chat_id;
        
        handleTelegramCommand(chat_id, text);
      }
    }
  }
}

// ==========================================
// FUNGSI UNTUK UPDATE THRESHOLD VIA TELEGRAM
// ==========================================

void handleThresholdUpdate(String chat_id, String text) {
  // Parse command format: /threshold [parameter] [value]
  text.toLowerCase();
  text.trim();
  
  Serial.println("🔧 Processing threshold update: " + text);
  
  // Hapus command /threshold
  text.replace("/threshold", "");
  text.trim();
  
  // Split parameter dan value
  int spaceIndex = text.indexOf(' ');
  if (spaceIndex == -1) {
    sendTelegramMessage(chat_id, "❌ <b>Invalid format!</b>\n\n"
                         "Format: <code>/threshold [parameter] [value]</code>\n\n"
                         "Contoh: <code>/threshold tilt_warning 5.0</code>");
    return;
  }
  
  String parameter = text.substring(0, spaceIndex);
  String valueStr = text.substring(spaceIndex + 1);
  valueStr.trim();
  
  float newValue = valueStr.toFloat();
  
  Serial.println("Parameter: " + parameter + ", Value: " + String(newValue));
  
  if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
    bool updated = false;
    String message = "";
    
    if (parameter == "tilt_warning" || parameter == "tilt_warn") {
      if (newValue >= 1.0 && newValue < TILT_DANGER) {
        TILT_WARNING = newValue;
        updated = true;
        message = "✅ <b>Tilt Warning threshold updated</b>\n";
        message += "New value: <code>" + String(TILT_WARNING, 1) + "°</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Tilt Warning must be between 1.0° and " + String(TILT_DANGER - 0.1, 1) + "°";
      }
    }
    else if (parameter == "tilt_danger" || parameter == "tilt_critical") {
      if (newValue > TILT_WARNING && newValue <= 20.0) {
        TILT_DANGER = newValue;
        updated = true;
        message = "✅ <b>Tilt Danger threshold updated</b>\n";
        message += "New value: <code>" + String(TILT_DANGER, 1) + "°</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Tilt Danger must be greater than " + String(TILT_WARNING + 0.1, 1) + "° and max 20.0°";
      }
    }
    else if (parameter == "soil_warning" || parameter == "soil_warn") {
      if (newValue >= 30 && newValue < SOIL_DANGER) {
        SOIL_WARNING = newValue;
        updated = true;
        message = "✅ <b>Soil Warning threshold updated</b>\n";
        message += "New value: <code>" + String(SOIL_WARNING) + "%</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Soil Warning must be between 30% and " + String(SOIL_DANGER - 1) + "%";
      }
    }
    else if (parameter == "soil_danger" || parameter == "soil_critical") {
      if (newValue > SOIL_WARNING && newValue <= 100) {
        SOIL_DANGER = newValue;
        updated = true;
        message = "✅ <b>Soil Danger threshold updated</b>\n";
        message += "New value: <code>" + String(SOIL_DANGER) + "%</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Soil Danger must be greater than " + String(SOIL_WARNING + 1) + "% and max 100%";
      }
    }
    else if (parameter == "humidity_warning" || parameter == "humidity_warn") {
      if (newValue >= 50 && newValue <= 100) {
        HUMIDITY_WARNING = newValue;
        updated = true;
        message = "✅ <b>Humidity Warning threshold updated</b>\n";
        message += "New value: <code>" + String(HUMIDITY_WARNING) + "%</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Humidity Warning must be between 50% and 100%";
      }
    }
    else if(parameter == "displacement_warning") {
      if (newValue <= DISPLACEMENT_DANGER) {
        DISPLACEMENT_WARNING = newValue;
        updated = true;
        message = "✅ <b>Displacement Warning threshold updated</b>\n";
        message += "New value: <code>" + String(DISPLACEMENT_WARNING) + "%</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Displacement Warning must be between 0cm and" + String(DISPLACEMENT_DANGER) + "cm";
      }
    }
    else if(parameter == "displacement_danger") {
      if (newValue > DISPLACEMENT_WARNING) {
        DISPLACEMENT_DANGER = newValue;
        updated = true;
        message = "✅ <b>Displacement Danger threshold updated</b>\n";
        message += "New value: <code>" + String(DISPLACEMENT_DANGER) + "%</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Displacement Danger must be greater than" + String(DISPLACEMENT_WARNING) + "cm";
      }
    }
    else if (parameter == "hourly_danger") {
      if (newValue > HOURLY_WARNING) {
        HOURLY_DANGER = newValue;
        updated = true;
        message = "✅ <b>Hourly Danger threshold updated</b>\n";
        message += "New value: <code>" + String(HOURLY_DANGER, 1) + "°</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Hourly Danger must be greater than " + String(HOURLY_WARNING + 0.1, 1) + "mm";
      }
    }
    else if (parameter == "hourly_warning") {
      if (newValue < HOURLY_DANGER) {
        HOURLY_WARNING = newValue;
        updated = true;
        message = "✅ <b>Hourly Warning threshold updated</b>\n";
        message += "New value: <code>" + String(HOURLY_WARNING) + "%</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Hourly Warning must be lower " + String(HOURLY_DANGER - 1) + "mm";
      }
    }
    else if (parameter == "daily_danger") {
      if (newValue > DAILY_WARNING) {
        DAILY_DANGER = newValue;
        updated = true;
        message = "✅ <b>Daily Danger threshold updated</b>\n";
        message += "New value: <code>" + String(DAILY_DANGER) + "%</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Daily Danger must be greater than " + String(DAILY_WARNING + 1) + "mm";
      }
    }
    else if (parameter == "daily_warning") {
      if (newValue <= DAILY_DANGER) {
        DAILY_WARNING = newValue;
        updated = true;
        message = "✅ <b>Daily Warning threshold updated</b>\n";
        message += "New value: <code>" + String(DAILY_DANGER) + "%</code>";
      } else {
        message = "❌ <b>Invalid value!</b>\n";
        message += "Daily Warning must be lower " + String(DAILY_DANGER - 1) + "mm";
      }
    }
    else {
      message = "❌ <b>Unknown parameter!</b>\n\n";
      message += "Available parameters:\n";
      message += "• <code>tilt_warning</code> - Tilt warning level (°)\n";
      message += "• <code>tilt_danger</code> - Tilt danger level (°)\n";
      message += "• <code>soil_warning</code> - Soil warning level (%)\n";
      message += "• <code>soil_danger</code> - Soil danger level (%)\n";
      message += "• <code>hourly_warning</code> - Hourly warning level (mm)\n";
      message += "• <code>hourly_danger</code> - Hourly danger level (mm)\n";
      message += "• <code>daily_warning</code> - Daily warning level (mm))\n";
      message += "• <code>daily_danger</code> - Daily danger level (mm)\n";
      message += "• <code>humidity_warning</code> - Humidity warning level (%)\n\n";
      message += "• <code>displacement_warning</code> - Displacement warning level (cm)\n";
      message += "• <code>displacement_danger</code> - Displacement danger level (cm)\n";
      message += "Example: <code>/threshold tilt_warning 4.5</code>";
    }
    
    xSemaphoreGive(thresholdMutex);
    sendTelegramMessage(chat_id, message);
    
    // Jika berhasil update, kirim juga status thresholds terkini
    if (updated) {
      vTaskDelay(pdMS_TO_TICKS(1000));
      sendCurrentThresholds(chat_id);
    }
  }
}

void sendCurrentThresholds(String chat_id) {
  if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
    String thresholdMsg = "<b>CURRENT THRESHOLD SETTINGS</b>\n";
    thresholdMsg += "┌──────────────────────────────┐\n";
    thresholdMsg += "│ 🎯 <b>TILT SENSOR</b>\n";
    thresholdMsg += "│ ├ Warning:  <code>" + String(TILT_WARNING, 1) + "°</code>\n";
    thresholdMsg += "│ └ Danger:   <code>" + String(TILT_DANGER, 1) + "°</code>\n";
    thresholdMsg += "│ \n";
    thresholdMsg += "│ 🌱 <b>SOIL MOISTURE</b>\n";
    thresholdMsg += "│ ├ Warning:  <code>" + String(SOIL_WARNING) + "%</code>\n";
    thresholdMsg += "│ └ Danger:   <code>" + String(SOIL_DANGER) + "%</code>\n";
    thresholdMsg += "│ \n";
    thresholdMsg += "│ 🌡️ <b>HUMIDITY</b>\n";
    thresholdMsg += "│ └ Warning:  <code>" + String(HUMIDITY_WARNING) + "%</code>\n";
    thresholdMsg += "│ \n";
    thresholdMsg += "│ 🌡️ <b>WEATHER DATA</b>\n";
    thresholdMsg += "│ ├ Hourly Warning:  <code>" + String(HOURLY_WARNING, 1) + "°</code>\n";
    thresholdMsg += "│ ├ Hourly Danger:   <code>" + String(HOURLY_DANGER, 1) + "°</code>\n";
    thresholdMsg += "│ ├ Daily Warning:  <code>" + String(DAILY_WARNING) + "%</code>\n";
    thresholdMsg += "│ └ Daily Danger:   <code>" + String(DAILY_DANGER) + "%</code>\n";
    thresholdMsg += "│ \n";
    thresholdMsg += "│ 📏 <b>DISPLACEMENT</b>\n";
    thresholdMsg += "│ └ Warning:  <code>" + String(DISPLACEMENT_WARNING) + "%</code>\n";
    thresholdMsg += "│ └ Danger:  <code>" + String(DISPLACEMENT_DANGER) + "%</code>\n";
    thresholdMsg += "└──────────────────────────────┘\n\n";
    
    thresholdMsg += "⚙️ <b>To update thresholds:</b>\n";
    thresholdMsg += "<code>/threshold [parameter] [value]</code>\n\n";
    thresholdMsg += "📋 <b>Parameters:</b> tilt_warning, tilt_danger, soil_warning, soil_danger, humidity_warning, displacement_warning, displacement_danger";
    
    xSemaphoreGive(thresholdMutex);
    sendTelegramMessage(chat_id, thresholdMsg);
  }
}

void resetThresholdsToDefault(String chat_id) {
  if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
    // Reset ke nilai default
    TILT_WARNING = 3.0;
    TILT_DANGER = 6.0;
    SOIL_WARNING = 70;
    SOIL_DANGER = 85;
    HUMIDITY_WARNING = 85;
    DISPLACEMENT_WARNING = 5;
    DISPLACEMENT_WARNING = 10;
    HOURLY_WARNING = 40;
    HOURLY_DANGER = 60;
    DAILY_WARNING = 70;
    DAILY_DANGER = 85;
    
    xSemaphoreGive(thresholdMutex);
    
    String message = "🔄 <b>Thresholds Reset to Default</b>\n\n";
    message += "All threshold values have been reset to factory defaults.\n\n";
    message += "✅ <b>Default Values:</b>\n";
    message += "• Tilt Warning: <code>3.0°</code>\n";
    message += "• Tilt Danger: <code>6.0°</code>\n";
    message += "• Soil Warning: <code>70%</code>\n";
    message += "• Soil Danger: <code>85%</code>\n";
    message += "• Hourly Warning: <code>40mm</code>\n";
    message += "• Hourly Danger: <code>60mm°</code>\n";
    message += "• Daily Warning: <code>70mm</code>\n";
    message += "• Daily Danger: <code>85mm</code>\n";
    message += "• Displacement Warning: <code>5cm</code>\n";
    message += "• Displacement Danger: <code>10cm</code>\n";
    message += "• Humidity Warning: <code>85%</code>";
    
    sendTelegramMessage(chat_id, message);
  }
}

void handleTelegramCommand(String chat_id, String text) {
  text.trim();
  
  Serial.println("🎯 Handling command: " + text + " for chat: " + chat_id);

  static unsigned long lastRestartTime = 0;
  const unsigned long RESTART_COOLDOWN = 30000; // 30 detik cooldown
  
  if (text == "/start") {
    String welcome = "👋 <b>Hello! Welcome to Early Warning System</b>\n\n";
    welcome += "🤖 <b>Bot Status: Connected</b>\n";
    welcome += "📍 <b>Device:</b> " + deviceID + "\n";
    welcome += "🏠 <b>Location:</b> " + location + "\n";
    welcome += "🔧 <b>Firmware:</b> " + firmwareVersion + "\n\n";
    
    welcome += "📊 <b>Available Commands:</b>\n";
    welcome += "• /status - Current sensor data\n";
    welcome += "• /alerts - Alert status & thresholds\n";
    welcome += "• /thresholds - View current thresholds\n";
    welcome += "• /threshold [param] [value] - Update threshold settings\n";
    welcome += "• /reset_thresholds - Reset to default values\n";
    welcome += "• /info - System information\n";
    welcome += "• /restart - Restart system\n\n";
    
    welcome += "🚨 <b>Automatic Alerts:</b>\n";
    welcome += "• I will send automatic alerts when dangerous conditions are detected\n";
    welcome += "• Alerts are sent to the group chat\n";
    
    sendTelegramMessage(chat_id, welcome);
  }
  else if (text == "/status") {
    SensorData_t data;
    if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
      data = currentSensorData;
      xSemaphoreGive(thresholdMutex);
    }
    
    String statusMsg = "📊 <b>REAL-TIME SENSOR STATUS</b>\n";
    statusMsg += "┌────────────────────────┐\n";
    statusMsg += "│ <b>Device:</b> " + deviceID + "\n";
    statusMsg += "│ <b>Location:</b> " + location + "\n";
    statusMsg += "│ <b>Uptime:</b> " + String(millis() / 1000) + "s\n";
    statusMsg += "└────────────────────────┘\n\n";
    
    statusMsg += "🎯 <b>TILT SENSOR</b>\n";
    statusMsg += "├ Roll: <code>" + String(data.roll, 1) + "°</code>\n";
    statusMsg += "└ Pitch: <code>" + String(data.pitch, 1) + "°</code>\n\n";
    
    statusMsg += "🌱 <b>SOIL MOISTURE</b>\n";
    statusMsg += "└ Level: <code>" + String(data.soil_moisture) + "%</code>\n\n";
    
    statusMsg += "🌡️ <b>WEATHER DATA</b>\n";
    statusMsg += "├ Temperature: <code>" + String(data.temperature, 1) + "°C</code>\n";
    statusMsg += "├ Humidity: <code>" + String(data.humidity, 1) + "%</code>\n";
    statusMsg += "├ Rain Today: <code>" + String(data.dailyRain, 1) + "mm</code>\n";
    statusMsg += "└ Rain Last Hour: <code>" + String(data.hourlyRain, 1) + "mm</code>\n\n";

    statusMsg += "📏 <b>DISPLACEMENT SENSOR</b>\n";
    statusMsg += "├ Displacement x: <code>" + String(data.displacement_x, 1) + "cm</code>\n";
    statusMsg += "├ Displacement y: <code>" + String(data.displacement_y, 1) + "cm</code>\n";
    statusMsg += "└ Displacement total: <code>" + String(data.total_displacement, 1) + "cm</code>\n\n";
    
    // Status dengan warna dan emoji
    statusMsg += "🚨 <b>SYSTEM STATUS</b>\n";
    if (data.status == 2) {
      statusMsg += "🔴 <b>CRITICAL - DANGER LEVEL</b>\n";
    } else if (data.status == 1) {
      statusMsg += "🟡 <b>WARNING - MONITOR CLOSELY</b>\n";
    } else {
      statusMsg += "🟢 <b>NORMAL - STABLE CONDITION</b>\n";
    }
    
    statusMsg += "└ Risk Score: <code>" + String(data.risk_score) + "/7</code>";
    
    sendTelegramMessage(chat_id, statusMsg);
  }
  else if (text == "/alerts") {
    SensorData_t data;
    if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
      data = currentSensorData;
      xSemaphoreGive(thresholdMutex);
    }
    
    String alertMsg = "⚠️ <b>ALERT SYSTEM STATUS</b>\n";
    alertMsg += "┌────────────────────────┐\n";
    alertMsg += "│ <b>Current Status:</b> " + getStatusText(data.status) + "\n";
    alertMsg += "│ <b>Risk Score:</b> " + String(data.risk_score) + "/7\n";
    alertMsg += "└────────────────────────┘\n\n";
    
    alertMsg += "📏 <b>THRESHOLD SETTINGS</b>\n";
    alertMsg += "├ Tilt Warning: <code>" + String(TILT_WARNING, 1) + "°</code>\n";
    alertMsg += "├ Tilt Danger: <code>" + String(TILT_DANGER, 1) + "°</code>\n";
    alertMsg += "├ Soil Warning: <code>" + String(SOIL_WARNING) + "%</code>\n";
    alertMsg += "├ Soil Danger: <code>" + String(SOIL_DANGER) + "%</code>\n";
    alertMsg += "├ Hourly Warning: <code>" + String(HOURLY_WARNING, 1) + "°</code>\n";
    alertMsg += "├ Hourly Danger: <code>" + String(HOURLY_DANGER, 1) + "°</code>\n";
    alertMsg += "├ Daily Warning: <code>" + String(DAILY_WARNING) + "%</code>\n";
    alertMsg += "├ Daily Danger: <code>" + String(DAILY_DANGER) + "%</code>\n";
    alertMsg += "├ Humidity Warning: <code>" + String(HUMIDITY_WARNING) + "%</code>\n";
    alertMsg += "├ Displacement Warning: <code>" + String(DISPLACEMENT_WARNING) + "%</code>\n";
    alertMsg += "└ Displacement Danger: <code>" + String(DISPLACEMENT_DANGER) + "%</code>\n\n";
    
    alertMsg += "📈 <b>CURRENT VALUES</b>\n";
    alertMsg += "├ Max Tilt: <code>" + String(max(abs(data.roll), abs(data.pitch)), 1) + "°</code>\n";
    alertMsg += "├ Soil Moisture: <code>" + String(data.soil_moisture) + "%</code>\n";
    alertMsg += "├ Humidity: <code>" + String(data.humidity, 1) + "%</code>";
    alertMsg += "├ Displacement: <code>" + String(data.total_displacement) + "cm</code>\n";
    alertMsg += "├ Hourly Raining: <code>" + String(data.hourlyRain, 2) + " mm</code>\n";
    alertMsg += "└ Daily Raining: <code>" + String(data.dailyRain, 2) + " mm</code>\n\n";

    alertMsg += "⚙️ <b>Manage Thresholds:</b>\n";
    alertMsg += "• Use <code>/thresholds</code> to view details\n";
    alertMsg += "• Use <code>/threshold [param] [value]</code> to update\n";
    alertMsg += "• Use <code>/reset_thresholds</code> to reset defaults";
    
    sendTelegramMessage(chat_id, alertMsg);
  }
  else if (text == "/thresholds"){
    sendCurrentThresholds(chat_id);
  }
  else if (text.startsWith("/threshold")){
    handleThresholdUpdate(chat_id, text);
  }
  else if (text == "/reset_thresholds") {
    // Konfirmasi reset
    String confirmMsg = "⚠️ <b>CONFIRM RESET THRESHOLDS</b>\n\n";
    confirmMsg += "Are you sure you want to reset ALL thresholds to default values?\n\n";
    confirmMsg += "This action cannot be undone!\n\n";
    confirmMsg += "Type <code>/confirm_reset</code> to proceed or /cancel_reset to abort.";
    
    sendTelegramMessage(chat_id, confirmMsg);
  }
  else if (text == "/confirm_reset") {
    resetThresholdsToDefault(chat_id);
  }
  else if (text == "/cancel") {
    sendTelegramMessage(chat_id, "❌ <b>Operation cancelled.</b>\nNo changes were made to the thresholds.");
  }
  else if (text == "/info") {
    String infoMsg = "ℹ️ <b>SYSTEM INFORMATION</b>\n";
    infoMsg += "┌────────────────────────┐\n";
    infoMsg += "│ <b>Device ID:</b> " + deviceID + "\n";
    infoMsg += "│ <b>Location:</b> " + location + "\n";
    infoMsg += "│ <b>Firmware:</b> " + firmwareVersion + "\n";
    infoMsg += "│ <b>IP Address:</b> " + WiFi.localIP().toString() + "\n";
    infoMsg += "│ <b>WiFi Signal:</b> " + String(WiFi.RSSI()) + " dBm\n";
    infoMsg += "│ <b>MQTT:</b> " + String(mqttConnected ? "✅ Connected" : "❌ Disconnected") + "\n";
    infoMsg += "│ <b>OTA Updates:</b> " + String(otaInProgress ? "🔄 In Progress" : "✅ Ready") + "\n";
    infoMsg += "│ <b>System Uptime:</b> " + String(millis() / 1000) + " seconds\n";
    infoMsg += "└────────────────────────┘\n\n";
    
    infoMsg += "🖥️ <b>SYSTEM HEALTH</b>\n";
    infoMsg += "├ Sensor Task: <code>" + String(uxTaskGetStackHighWaterMark(taskSensorHandle)) + "</code>\n";
    infoMsg += "├ MQTT Task: <code>" + String(uxTaskGetStackHighWaterMark(taskMQTTHandle)) + "</code>\n";
    infoMsg += "├ Telegram Task: <code>" + String(uxTaskGetStackHighWaterMark(taskTelegramHandle)) + "</code>\n";
    infoMsg += "└ Status Task: <code>" + String(uxTaskGetStackHighWaterMark(taskStatusHandle)) + "</code>";
    
    sendTelegramMessage(chat_id, infoMsg);
  }
  else if (text == "/restart") {
    unsigned long now = millis();
    if (now - lastRestartTime < RESTART_COOLDOWN) {
      String cooldownMsg = "⏰ <b>RESTART COOLDOWN ACTIVE</b>\n\n";
      cooldownMsg += "Please wait " + String((RESTART_COOLDOWN - (now - lastRestartTime)) / 1000) + " seconds before restarting again.";
      sendTelegramMessage(chat_id, cooldownMsg);
      return;
    }
    lastRestartTime = now;

    String restartMsg = "🔄 <b>SYSTEM RESTART INITIATED</b>\n\n";
    restartMsg += "The EWS system is restarting...\n";
    restartMsg += "Please wait 10-15 seconds for the system to reboot and reconnect.\n\n";
    restartMsg += "✅ All services will restart automatically";
    
    sendTelegramMessage(chat_id, restartMsg);

    vTaskDelay(pdMS_TO_TICKS(5000));
    
    // Clear queues sebelum restart
    xQueueReset(mqttQueue);
    xQueueReset(telegramSendQueue);
    
    // Delay lalu restart
    vTaskDelay(pdMS_TO_TICKS(3000));
    ESP.restart();
  }
  else if (text != "") {
    String help = "❓ <b>UNKNOWN COMMAND</b>\n\n";
    help += "I don't recognize the command: <code>" + text + "</code>\n\n";
    help += "📋 <b>Available Commands:</b>\n";
    help += "• /start - Show welcome message\n";
    help += "• /status - Current sensor readings\n";
    help += "• /alerts - Alert system status\n";
    help += "• /thresholds - View current thresholds\n";
    help += "• /threshold [param] [value] - Update threshold\n";
    help += "• /reset_thresholds - Reset to defaults\n";
    help += "• /info - System information\n";
    help += "• /restart - Restart the system\n\n";
    help += "Type /start to see the full menu";
    
    sendTelegramMessage(chat_id, help);
  }
}

void sendTelegramAlert(SensorData_t data) {
  if (data.status == 0) return; // Skip normal status
  
  String alertMsg = "🚨🚨🚨 <b>LANDSLIDE EARLY WARNING</b> 🚨🚨🚨\n\n";
  
  if (data.status == 2) {
    alertMsg += "🔴 <b>DANGER LEVEL: CRITICAL</b> 🔴\n";
    alertMsg += "<b>Immediate attention required!</b>\n\n";
  } else {
    alertMsg += "🟡 <b>WARNING LEVEL: MODERATE</b> 🟡\n";
    alertMsg += "<b>Monitor situation closely</b>\n\n";
  }
  
  alertMsg += "📊 <b>SENSOR READINGS</b>\n";
  alertMsg += "├ Maximum Tilt: <code>" + String(max(abs(data.roll), abs(data.pitch)), 1) + "°</code>\n";
  alertMsg += "├ Soil Moisture: <code>" + String(data.soil_moisture) + "%</code>\n";
  alertMsg += "├ Humidity: <code>" + String(data.humidity, 1) + "%</code>\n";
  alertMsg += "├ Total Pergeseran: <code>" + String(data.total_displacement, 2) + " cm</code>\n";
  alertMsg += "├ Hourly Raining: <code>" + String(data.hourlyRain, 2) + " cm</code>\n";
  alertMsg += "├ Daily Raining: <code>" + String(data.dailyRain, 2) + " cm</code>\n";
  alertMsg += "└ Risk Score: <code>" + String(data.risk_score) + "/7</code>\n\n";
  
  alertMsg += "🛡️ <b>RECOMMENDED ACTIONS</b>\n";
  if (data.status == 2) {
    alertMsg += "• 🚨 Evacuate the area if necessary\n";
    alertMsg += "• 📞 Alert local authorities immediately\n";
    alertMsg += "• 👁️ Monitor continuously\n";
    alertMsg += "• 🚧 Secure the perimeter\n";
  } else {
    alertMsg += "• ⚠️ Increase monitoring frequency\n";
    alertMsg += "• 🌧️ Check drainage systems\n";
    alertMsg += "• 📋 Prepare evacuation plan\n";
    alertMsg += "• 🔔 Stay alert for changes\n";
  }
  
  alertMsg += "\n📍 <b>Device:</b> " + deviceID + "\n";
  alertMsg += "🏠 <b>Location:</b> " + location + "\n";
  alertMsg += "⏰ <b>Time:</b> " + String(millis() / 1000) + "s after startup\n";
  alertMsg += "🔢 <b>Alert ID:</b> " + String(random(1000, 9999));
  
  // Kirim ke group chat untuk alerts
  sendTelegramMessage(CHAT_ID, alertMsg);
}

// ============================
// FUNGSI INITIALIZATION
// ============================
void setup() {
  Serial.begin(115200);
  // rtc.begin(DateTime(__DATE__, __TIME__)); 
  setCpuFrequencyMhz(240);
  
  // Inisialisasi GPIO
  pinMode(BUZZER_PIN1, OUTPUT);
  pinMode(BUZZER_PIN2, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  
  // Buat RTOS objects
  sensorDataQueue = xQueueCreate(20, sizeof(SensorData_t));
  mqttQueue = xQueueCreate(30, sizeof(MQTTMessage_t));
  alertQueue = xQueueCreate(10, sizeof(SensorData_t));
  otaQueue = xQueueCreate(10, sizeof(OTAStatus_t));
  telegramSendQueue = xQueueCreate(20, sizeof(TelegramMessage_t));
  
  i2cMutex = xSemaphoreCreateMutex();
  mqttMutex = xSemaphoreCreateMutex();
  thresholdMutex = xSemaphoreCreateMutex();
  otaMutex = xSemaphoreCreateMutex();
  telegramMutex = xSemaphoreCreateMutex();

  // connectToWiFi();
  Serial.println("=== EWS dengan RTOS & OTA Started ===");

  // Buat tasks
  xTaskCreatePinnedToCore(
    taskSensor,
    "Task_Sensor",
    4096,
    NULL,
    3,
    &taskSensorHandle,
    0
  );

  xTaskCreatePinnedToCore(
    taskMQTT,
    "Task_MQTT",
    8192,
    NULL,
    2,
    &taskMQTTHandle,
    1
  );

  xTaskCreatePinnedToCore( 
    taskTelegram,
    "Task_Telegram",
    8192, 
    NULL,
    2,
    &taskTelegramHandle,
    1
  );

  xTaskCreatePinnedToCore(
    taskStatus,
    "Task_Status",
    2048,
    NULL,
    1,
    &taskStatusHandle,
    1
  );

  xTaskCreatePinnedToCore(
    taskMonitor,
    "Task_Monitor",
    4096,  // Increased stack for OTA
    NULL,
    0,
    &taskMonitorHandle,
    1
  );

  // Buat software timer
  mqttTimer = xTimerCreate("MQTT Timer", pdMS_TO_TICKS(MQTT_INTERVAL), pdTRUE, NULL, mqttTimerCallback);

  // Start MQTT timer
  if (mqttTimer != NULL) {
    xTimerStart(mqttTimer, pdMS_TO_TICKS(10000));
    Serial.println("✅ MQTT timer started");
  }

  // Hapus task setup
  vTaskDelete(NULL);
}

void loop() {
  // Empty - RTOS mengelola semua tasks
}

// ============================
// FUNGSI SENSOR
// ============================

void initializeSensors() {
  // Wire.begin();
  // if(!myMPU9250.init()){
  //   Serial.println("MPU9250 tidak terdeteksi!");
  //   while(1);
  // }
  
  // myMPU9250.autoOffsets();
  // myMPU9250.setSampleRateDivider(5);
  // myMPU9250.setAccRange(MPU9250_ACC_RANGE_2G);
  // myMPU9250.enableAccDLPF(true);
  // myMPU9250.setAccDLPF(MPU9250_DLPF_6);
  
  // dht.begin();
  // pinMode(RainPin, INPUT_PULLUP); 
  Serial.println("Semua sensor diinisialisasi!");
}

void resetDisplacement() {
  displacementX = 0.0;
  displacementY = 0.0;
  displacementZ = 0.0;
  totalDisplacement = 0.0;
  velocity = {0, 0, 0};
  firstIntegration = true;
}

void calculateDisplacement(xyzFloat currentAccel){
  unsigned long currentTime = millis();
  
  if (firstIntegration) {
    // Inisialisasi pertama kali
    lastAccel = currentAccel;
    lastIntegrationTime = currentTime;
    firstIntegration = false;
    return;
  }
  
  // Hitung delta time (dalam detik)
  float deltaTime = (currentTime - lastIntegrationTime) / 1000.0;
  
  if (deltaTime <= 0) return;
  
  // Konversi dari g ke m/s² (1g = 9.81 m/s²)
  float accelX = currentAccel.x * 9.81;
  float accelY = currentAccel.y * 9.81; 
  float accelZ = (currentAccel.z - 1.0) * 9.81; // Remove gravity
  
  // Apply high-pass filter sederhana untuk menghilangkan drift
  const float HIGH_PASS_ALPHA = 0.98;
  static xyzFloat bias = {0, 0, 0};
  
  // Remove bias (high-pass filter)
  accelX = HIGH_PASS_ALPHA * (accelX - bias.x);
  accelY = HIGH_PASS_ALPHA * (accelY - bias.y);
  accelZ = HIGH_PASS_ALPHA * (accelZ - bias.z);
  
  // Update bias
  bias.x = currentAccel.x * 9.81 - accelX;
  bias.y = currentAccel.y * 9.81 - accelY;
  bias.z = (currentAccel.z - 1.0) * 9.81 - accelZ;
  
  // Integrasi pertama: acceleration → velocity
  velocity.x += accelX * deltaTime;
  velocity.y += accelY * deltaTime;
  velocity.z += accelZ * deltaTime;
  
  // Apply damping untuk mengurangi drift velocity
  const float VELOCITY_DAMPING = 0.995;
  velocity.x *= VELOCITY_DAMPING;
  velocity.y *= VELOCITY_DAMPING;
  velocity.z *= VELOCITY_DAMPING;
  
  // Integrasi kedua: velocity → displacement
  displacementX += velocity.x * deltaTime * 100; // Convert to cm
  displacementY += velocity.y * deltaTime * 100;
  displacementZ += velocity.z * deltaTime * 100;
  
  // Hitung total displacement
  totalDisplacement = sqrt(displacementX * displacementX + 
                          displacementY * displacementY + 
                          displacementZ * displacementZ);
  
  // Update untuk iterasi berikutnya
  lastAccel = currentAccel;
  lastIntegrationTime = currentTime;
  
  // Reset displacement jika terlalu besar (mencegah overflow)
  if (totalDisplacement > 1000.0) {
    resetDisplacement();
  }
  totalDisplacement = 0;
}

void readMPU9250() {
  xyzFloat accel; //myMPU9250.getGValues();
  // xSemaphoreGive(i2cMutex);
  
  roll = 0; //atan2(accel.y, accel.z) * 180.0 / PI;
  pitch = 0;//atan2(-accel.x, sqrt(accel.y * accel.y + accel.z * accel.z)) * 180.0 / PI;
  
  filteredRoll = ALPHA * filteredRoll + (1 - ALPHA) * roll;
  filteredPitch = ALPHA * filteredPitch + (1 - ALPHA) * pitch;

  calculateDisplacement(accel);
}

void readSoilMoisture() {
  int rawValue = 5; //analogRead(SOIL_MOISTURE_PIN);
  soilMoisture = map(rawValue, SOIL_WET, SOIL_DRY, 0, 100);
  soilMoisture = 5; //constrain(soilMoisture, 0, 100);
}

void readDHT22() {
  temperature = 30; //dht.readTemperature();
  humidity = 50; //dht.readHumidity();
  
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Gagal membaca DHT22!");
    temperature = 0;
    humidity = 0;
  }
}

void rainGauge(){
  // DateTime now = rtc.now();
  // if ((bucketPositionA==false)&&(digitalRead(RainPin)==LOW)){
  //   bucketPositionA=true;
  //   dailyRain+=bucketAmount;
  // }
  
  // if ((bucketPositionA==true)&&(digitalRead(RainPin)==HIGH)){
  //   bucketPositionA=false;  
  // } 
  // if(now.minute() != 0) first = true;                     // 
  // if(now.minute() == 0 && first == true){
  //   hourlyRain = dailyRain - dailyRain_till_LastHour; 
  //   dailyRain_till_LastHour = dailyRain;
    
  //   first = false; 
  // }
  
  // if(now.hour()== 0) {
  //   dailyRain = 0.0;   
  //   dailyRain_till_LastHour = 0.0; 
  // }  

  // int data = dailyRain;
  dailyRain = 0.0;
  hourlyRain = 0.0;  
}

int analyzeRisk() {
  int riskScore = 0;
  
  float maxTilt = max(abs(filteredRoll), abs(filteredPitch));
  if (maxTilt > TILT_DANGER) riskScore += 3;
  else if (maxTilt > TILT_WARNING) riskScore += 1;
  
  if (soilMoisture > SOIL_DANGER) riskScore += 3;
  else if (soilMoisture > SOIL_WARNING) riskScore += 1;
  
  if (humidity > HUMIDITY_WARNING) riskScore += 1;

  if (totalDisplacement > DISPLACEMENT_DANGER) riskScore += 3;
  else if (totalDisplacement > DISPLACEMENT_WARNING) riskScore += 2;

  if (hourlyRain > HOURLY_DANGER) riskScore += 3;
  else if (hourlyRain > HOURLY_WARNING) riskScore += 1;

  if (dailyRain > DAILY_DANGER) riskScore += 3;
  else if (dailyRain > DAILY_WARNING) riskScore += 1;
  
  if (riskScore >= 4) return 2;
  else if (riskScore >= 2) return 1;
  else return 0;
}

int calculateRiskScore() {
  int score = 0;
  float maxTilt = max(abs(filteredRoll), abs(filteredPitch));
  
  if (maxTilt > TILT_DANGER) score += 3;
  else if (maxTilt > TILT_WARNING) score += 1;
  
  if (soilMoisture > SOIL_DANGER) score += 3;
  else if (soilMoisture > SOIL_WARNING) score += 1;
  
  if (humidity > HUMIDITY_WARNING) score += 1;

  if (totalDisplacement > DISPLACEMENT_DANGER) score += 3;
  else if (totalDisplacement > DISPLACEMENT_WARNING) score += 2;

  if (hourlyRain > HOURLY_DANGER) score += 3;
  else if (hourlyRain > HOURLY_WARNING) score += 1;

  if (dailyRain > DAILY_DANGER) score += 3;
  else if (dailyRain > DAILY_WARNING) score += 1;
  
  return score;
}

// ============================
// FUNGSI MQTT (DIMODIFIKASI UNTUK RTOS)
// ============================
void connectToWiFi() {
  Serial.print("Menghubungkan ke WiFi");
  // WiFi.begin(ssid, password);
  WiFiManager wm;
  wm.setConfigPortalTimeout(180);
  wm.setConnectTimeout(30);

  if (!wm.autoConnect("AutoConnectAP", "00000000")) {
    Serial.println("WiFi Failed");
    wifiConnected = false;
    // ESP.restart();
    vTaskDelay(pdMS_TO_TICKS(10000));
  }else{
    wifiConnected = true;
  }
  
  // int attempts = 0;
  // while (WiFi.status() != WL_CONNECTED && attempts < 20) {
  //   delay(500);
  //   Serial.print(".");
  //   attempts++;
  // }
  
  // if (WiFi.status() == WL_CONNECTED) {
  //   Serial.println("\nWiFi terhubung!");
  //   wifiConnected = true;
  // } else {
  //   Serial.println("\nGagal terkoneksi WiFi!");
  //   wifiConnected = false;
  // }
}

void setupMQTT() {
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(2048);
  mqttClient.setKeepAlive(60);
  mqttClient.setSocketTimeout(30);
}

void reconnectMQTT() {
  if (xSemaphoreTake(mqttMutex, portMAX_DELAY) == pdTRUE) {
    if (!mqttClient.connected()) {
      Serial.print("Menghubungkan ke MQTT Broker...");
      
      String clientId = "EWS-RTOS-" + String(random(0xffff), HEX);

      mqttClient.setSocketTimeout(30);
      mqttClient.setKeepAlive(60);
      
      if (mqttClient.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
        Serial.println("Terhubung!");
        mqttConnected = true;
        
        mqttClient.subscribe(topic_control);
        sendConnectionStatus(true);
        
        // Kirim firmware info setelah connect
        sendFirmwareInfo();
      } else {
        Serial.print("Gagal, rc=");
        Serial.println(mqttClient.state());
        mqttConnected = false;

        vTaskDelay(pdMS_TO_TICKS(5000));
      }
    }
    xSemaphoreGive(mqttMutex);
  }
}

void sendFirmwareInfo() {
  DynamicJsonDocument doc(256);
  doc["device_id"] = deviceID;
  doc["firmware_version"] = firmwareVersion;
  doc["type"] = "firmware_info";
  doc["ota_enabled"] = true;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  MQTTMessage_t mqttMsg;
  mqttMsg.topic = "rzkink_2554/ews/device/info";
  mqttMsg.message = jsonString;
  
  xQueueSend(mqttQueue, &mqttMsg, 0);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (payload == nullptr || length == 0) {
    Serial.println("❌ MQTT callback: Invalid payload");
    return;
  }

  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  handleMQTTMessage(topic, message);
}

void handleMQTTMessage(char* topic, String message) {
  if (String(topic) == "rzkink_2554/ews/control/threshold") {
    updateThresholds(message);
  }
  else if (String(topic) == "rzkink_2554/ews/control/interval") {
    updateInterval(message);
  }
  else if (String(topic) == "rzkink_2554/ews/control/request_data") {
    if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
      SensorData_t data = currentSensorData;
      xSemaphoreGive(thresholdMutex);
      sendSensorDataMQTT(data);
    }
  }
  else if (String(topic) == "rzkink_2554/ews/control/ota_check") {
    sendFirmwareInfo();
  }
}

void updateThresholds(String message) {
  DynamicJsonDocument doc(512);
  DeserializationError error = deserializeJson(doc, message);
  
  if (!error) {
    if (xSemaphoreTake(thresholdMutex, portMAX_DELAY) == pdTRUE) {
      if (doc.containsKey("tilt_warning")) TILT_WARNING = doc["tilt_warning"];
      if (doc.containsKey("tilt_danger")) TILT_DANGER = doc["tilt_danger"];
      if (doc.containsKey("soil_warning")) SOIL_WARNING = doc["soil_warning"];
      if (doc.containsKey("soil_danger")) SOIL_DANGER = doc["soil_danger"];
      if (doc.containsKey("humidity_warning")) HUMIDITY_WARNING = doc["humidity_warning"];
      if (doc.containsKey("displacement_warning")) DISPLACEMENT_WARNING = doc["displacement_warning"];
      if (doc.containsKey("displacement_danger")) DISPLACEMENT_DANGER = doc["displacement_danger"];
      xSemaphoreGive(thresholdMutex);
      
      Serial.println("Thresholds updated via MQTT");
    }
  }
}

void updateInterval(String message) {
  long newInterval = message.toInt();
  if (newInterval >= 5000) {
    MQTT_INTERVAL = newInterval;
    xTimerChangePeriod(mqttTimer, pdMS_TO_TICKS(MQTT_INTERVAL), 0);
    Serial.println("MQTT interval updated to: " + String(MQTT_INTERVAL));
  }
}

void sendSensorDataMQTT(SensorData_t data) {
  DynamicJsonDocument doc(1024);
  
  doc["device_id"] = deviceID;
  doc["location"] = location;
  doc["timestamp"] = millis();
  doc["firmware"] = firmwareVersion;
  
  doc["sensors"]["tilt_roll"] = data.roll;
  doc["sensors"]["tilt_pitch"] = data.pitch;
  doc["sensors"]["soil_moisture"] = data.soil_moisture;
  doc["sensors"]["temperature"] = data.temperature;
  doc["sensors"]["humidity"] = data.humidity;
  doc["sensors"]["dailyrain"] = data.dailyRain;
  doc["sensors"]["hourlyrain"] = data.hourlyRain;
  doc["sensors"]["displacement_x"] = data.displacement_x;
  doc["sensors"]["displacement_y"] = data.displacement_y;
  doc["sensors"]["displacement_z"] = data.displacement_z;
  doc["sensors"]["total_displacement"] = data.total_displacement;
  doc["sensors"]["acceleration_x"] = data.acceleration_x;
  doc["sensors"]["acceleration_y"] = data.acceleration_y;
  doc["sensors"]["acceleration_z"] = data.acceleration_z;
  
  doc["status"]["code"] = data.status;
  doc["status"]["text"] = getStatusText(data.status);
  doc["status"]["risk_score"] = data.risk_score;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  MQTTMessage_t mqttMsg;
  mqttMsg.topic = topic_data;
  mqttMsg.message = jsonString;
  
  xQueueSend(mqttQueue, &mqttMsg, 0);
}

void sendAlertMQTT(SensorData_t data) {
  DynamicJsonDocument doc(512);
  
  doc["device_id"] = deviceID;
  doc["location"] = location;
  doc["alert_level"] = data.status;
  doc["alert_message"] = getAlertMessage(data.status);
  doc["timestamp"] = millis();
  
  doc["sensor_readings"]["tilt_roll"] = data.roll;
  doc["sensor_readings"]["tilt_pitch"] = data.pitch;
  doc["sensor_readings"]["soil_moisture"] = data.soil_moisture;
  doc["sensor_readings"]["displacement_x"] = data.displacement_x;
  doc["sensor_readings"]["displacement_y"] = data.displacement_y;
  doc["sensor_readings"]["displacement_z"] = data.displacement_z;
  doc["sensor_readings"]["total_displacement"] = data.total_displacement;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  MQTTMessage_t mqttMsg;
  mqttMsg.topic = topic_alerts;
  mqttMsg.message = jsonString;
  
  xQueueSend(mqttQueue, &mqttMsg, 0);
}

void sendConnectionStatus(bool connected) {
  DynamicJsonDocument doc(256);
  
  doc["device_id"] = deviceID;
  doc["location"] = location;
  doc["status"] = connected ? "connected" : "disconnected";
  doc["timestamp"] = millis();
  doc["ip_address"] = WiFi.localIP().toString();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  MQTTMessage_t mqttMsg;
  mqttMsg.topic = "rzkink_2554/ews/connection";
  mqttMsg.message = jsonString;
  
  xQueueSend(mqttQueue, &mqttMsg, 0);
}

// ============================
// FUNGSI STATUS & LED
// ============================
String getStatusText(int status) {
  switch(status) {
    case 0: return "NORMAL";
    case 1: return "WARNING";
    case 2: return "DANGER";
    default: return "UNKNOWN";
  }
}

String getAlertMessage(int status) {
  switch(status) {
    case 1: return "WARNING: Terdeteksi kondisi tidak stabil";
    case 2: return "DANGER: Kondisi kritis! Kemungkinan longsor!";
    default: return "NORMAL: Kondisi stabil";
  }
}

void handleStatus(int status) {
  digitalWrite(BUZZER_PIN1, HIGH);
  
  switch(status) {
    case 1: // WARNING
      tone(BUZZER_PIN1, 2000);
      break;
      
    case 2: // DANGER
      digitalWrite(BUZZER_PIN2, HIGH);
      break;
  }
}

void handleConnectionLEDs() {
  static unsigned long lastBlink = 0;
  static bool ledState = false;
  
  if (millis() - lastBlink > 1000) {
    ledState = !ledState;
    lastBlink = millis();
    
    if (!wifiConnected || otaInProgress) {
      digitalWrite(LED_GREEN, ledState);
    } else if (!mqttConnected) {
      digitalWrite(LED_GREEN, ledState);
    } else {
      digitalWrite(LED_GREEN, HIGH);
    }
  }
}

void displaySensorData(SensorData_t data) {
  static unsigned long lastDisplay = 0;
  static int displayPhase = 0; // 0: Phase A, 1: Phase B, 2: Phase C
  
  if (millis() - lastDisplay > 3000) {
    switch (displayPhase) {
      case 0:
        // Phase A - Tampilan utama
        displayPhaseA(data);
        displayPhase = 1;
        break;
        
      case 1:
        // Phase B - Tampilan data sensor 1
        displayPhaseB(data);
        displayPhase = 2;
        break;
        
      case 2:
        // Phase C - Tampilan data sensor 2
        displayPhaseC(data);
        displayPhase = 0; // Kembali ke phase A
        break;
    }
    
    lastDisplay = millis();
  }
}

void displayPhaseA(SensorData_t data) {
  Serial.println("\n=== DATA SENSOR RTOS ===");
  Serial.printf("Tilt - Roll: %.2f°, Pitch: %.2f°\n", data.roll, data.pitch);
  Serial.printf("Soil Moisture: %d%%\n", data.soil_moisture);
  Serial.printf("Suhu: %.1f°C, Kelembaban: %.1f%%\n", data.temperature, data.humidity);
  Serial.printf("Pergeseran Tanah: X=%.2fcm, Y=%.2fcm, Z=%.2fcm\n", data.displacement_x, data.displacement_y, data.displacement_z);
  Serial.printf("Total Pergeseran: %.2fcm\n", data.total_displacement);
  Serial.printf("Status: %s, Risk Score: %d\n", getStatusText(data.status).c_str(), data.risk_score);
  Serial.printf("Firmware: %s, OTA: %s\n", firmwareVersion.c_str(), otaInProgress ? "IN PROGRESS" : "READY");
  Serial.println("========================\n");

  lcd.clear();
  lcd.setCursor(5, 0);
  lcd.print("EWS IoT:");
  lcd.setCursor(0, 1);
  lcd.print("S:"); lcd.print(getStatusText(data.status).c_str());
  lcd.print("R:"); lcd.print(data.risk_score);
}

void displayPhaseB(SensorData_t data) {
  Serial.println("\n=== CEK AJA INI MAH ===");
  Serial.println("========================\n");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("R:"); lcd.print(data.roll);
  lcd.print("P:"); lcd.print(data.pitch);
  lcd.print("S:"); lcd.print(data.soil_moisture);
  lcd.setCursor(0, 1);
  lcd.print("T:"); lcd.print(data.temperature);
  lcd.print("H:"); lcd.print(data.humidity);
  lcd.print("X:"); lcd.print(data.displacement_x);
}

void displayPhaseC(SensorData_t data) {
  Serial.println("\n=== UHUUYY POKONA ===");
  Serial.println("========================\n");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Y:"); lcd.print(data.displacement_y);
  lcd.print("Z:"); lcd.print(data.displacement_z);
  lcd.print("T:"); lcd.print(data.total_displacement);
  lcd.setCursor(0, 1);
  lcd.print("H:"); lcd.print(data.hourlyRain);
  lcd.print("D:"); lcd.print(data.dailyRain);
}