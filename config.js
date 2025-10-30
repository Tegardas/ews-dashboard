// MQTT Configuration for WebSocket Secure (WSS) port 8085
const MQTT_CONFIG = {
    broker: "broker.avisha.id",
    port: 8085,
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

// Default Thresholds
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
        maxDataPoints: 50
    },
    soil: {
        maxDataPoints: 50
    },
    displacement: {
        maxDataPoints: 50
    },
    risk: {
        maxDataPoints: 50
    }
};