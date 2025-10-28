// MQTT Configuration
const MQTT_CONFIG = {
    broker: "wss://103.127.97.247:8084/mqtt", // Gunakan WebSocket Secure
    port: 8084,
    username: "rzkink_2554",
    password: "rizkink1234",
    clientId: "ews-dashboard-" + Math.random().toString(16).substr(2, 8),
    topics: {
        sensorData: "rzkink_2554/ews/sensor/data",
        alerts: "rzkink_2554/ews/sensor/alerts",
        control: "rzkink_2554/ews/control",
        connection: "rzkink_2554/ews/connection",
        ota: "rzkink_2554/ews/ota/status"
    }
};

const DEMO_DATA = {
    device_id: "EWS_001",
    location: "Lokasi_A", 
    firmware: "1.0.0",
    sensors: {
        tilt_roll: 1.5,
        tilt_pitch: 2.1,
        soil_moisture: 45,
        temperature: 28.5,
        humidity: 65.2,
        dailyrain: 12.5,
        hourlyrain: 2.3,
        displacement_x: 1.2,
        displacement_y: 0.8,
        displacement_z: 0.3,
        total_displacement: 1.5
    },
    status: {
        code: 0,
        text: "NORMAL",
        risk_score: 1
    }
};

// Default Thresholds (will be updated from device)
const DEFAULT_THRESHOLDS = {
    tiltWarning: 3.0,
    tiltDanger: 6.0,
    soilWarning: 70,
    soilDanger: 85,
    humidityWarning: 85,
    displacementWarning: 5.0,
    displacementDanger: 10.0,
    mqttInterval: 10000
};

// Chart Configuration
const CHART_CONFIG = {
    tilt: {
        maxDataPoints: 50,
        colors: {
            roll: 'rgba(231, 76, 60, 0.8)',
            pitch: 'rgba(52, 152, 219, 0.8)'
        }
    },
    soil: {
        maxDataPoints: 50,
        color: 'rgba(39, 174, 96, 0.8)'
    },
    displacement: {
        maxDataPoints: 50,
        colors: {
            x: 'rgba(155, 89, 182, 0.8)',
            y: 'rgba(241, 196, 15, 0.8)',
            z: 'rgba(230, 126, 34, 0.8)',
            total: 'rgba(52, 73, 94, 0.8)'
        }
    },
    risk: {
        maxDataPoints: 50,
        colors: {
            low: 'rgba(39, 174, 96, 0.8)',
            medium: 'rgba(241, 196, 15, 0.8)',
            high: 'rgba(231, 76, 60, 0.8)'
        }
    }
};

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MQTT_CONFIG, DEFAULT_THRESHOLDS, CHART_CONFIG };
}