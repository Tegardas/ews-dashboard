// MQTT Configuration - SESUAI BROKER ANDA
const MQTT_CONFIG = {
    connectionAttempts: [
        {
            name: "Secure WSS (Port 8084)",
            url: "wss://103.127.97.247:8084/mqtt",
            options: {
                clientId: 'ews-dashboard-' + Math.random().toString(16).substr(2, 8),
                username: 'rzkink_2554',
                password: 'rizkink1234',
                rejectUnauthorized: false // Important for self-signed certs
            }
        },
        {
            name: "WebSocket (Port 8083)", 
            url: "ws://103.127.97.247:8083/mqtt",
            options: {
                clientId: 'ews-dashboard-' + Math.random().toString(16).substr(2, 8),
                username: 'rzkink_2554',
                password: 'rizkink1234'
            }
        }
    ],
    topics: {
        data: 'rzkink_2554/ews/sensor/data',
        alerts: 'rzkink_2554/ews/sensor/alerts',
        control: 'rzkink_2554/ews/control/#',
        connection: 'rzkink_2554/ews/connection',
        ota: 'rzkink_2554/ews/ota/status',
        deviceInfo: 'rzkink_2554/ews/device/info'
    }
};

// Global variables
let mqttClient = null;
let connectedDevices = new Set();
let tiltHistory = {
    labels: [],
    roll: [],
    pitch: []
};
let rainHistory = {
    labels: [],
    hourly: [],
    daily: []
};
let tiltChart = null;
let rainChart = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    initializeCharts();
    connectMQTT();
    startTimeUpdate();
    requestNotificationPermission();
});

// Initialize Charts
function initializeCharts() {
    // Tilt Chart
    const tiltCtx = document.getElementById('tiltChart').getContext('2d');
    tiltChart = new Chart(tiltCtx, {
        type: 'line',
        data: {
            labels: tiltHistory.labels,
            datasets: [
                {
                    label: 'Tilt Roll (°)',
                    data: tiltHistory.roll,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2
                },
                {
                    label: 'Tilt Pitch (°)',
                    data: tiltHistory.pitch,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Degrees (°)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    ticks: {
                        maxTicksLimit: 8
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });

    // Rain Chart
    const rainCtx = document.getElementById('rainChart').getContext('2d');
    rainChart = new Chart(rainCtx, {
        type: 'bar',
        data: {
            labels: rainHistory.labels,
            datasets: [
                {
                    label: 'Hourly Rain (mm)',
                    data: rainHistory.hourly,
                    backgroundColor: 'rgba(155, 89, 182, 0.6)',
                    borderColor: 'rgba(155, 89, 182, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Rain (mm)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    ticks: {
                        maxTicksLimit: 6
                    }
                }
            }
        }
    });
}

// Enhanced MQTT Connection dengan retry logic
function connectMQTT() {
    let attemptIndex = 0;
    let isConnecting = false;
    
    function attemptConnection() {
        if (isConnecting) return;
        if (attemptIndex >= MQTT_CONFIG.connectionAttempts.length) {
            addLog('❌ All connection methods failed. Retrying in 10 seconds...', 'danger');
            attemptIndex = 0; // Reset untuk retry
            setTimeout(attemptConnection, 10000);
            return;
        }
        
        const attempt = MQTT_CONFIG.connectionAttempts[attemptIndex];
        isConnecting = true;
        addLog(`🔄 Attempting ${attempt.name}...`, 'warning');
        
        try {
            // Close existing connection
            if (mqttClient && mqttClient.connected) {
                mqttClient.end();
            }
            
            mqttClient = mqtt.connect(attempt.url, {
                ...attempt.options,
                reconnectPeriod: 0, // Manual reconnect
                connectTimeout: 10000,
                keepalive: 60,
                clean: true
            });
            
            // Connection timeout handler
            const connectionTimeout = setTimeout(() => {
                if (!mqttClient.connected) {
                    addLog(`⏰ ${attempt.name} timeout`, 'danger');
                    mqttClient.end();
                    isConnecting = false;
                    attemptIndex++;
                    setTimeout(attemptConnection, 2000);
                }
            }, 10000);
            
            mqttClient.on('connect', function() {
                clearTimeout(connectionTimeout);
                isConnecting = false;
                updateStatus('mqtt', 'connected');
                
                // Subscribe to all topics
                Object.values(MQTT_CONFIG.topics).forEach(topic => {
                    mqttClient.subscribe(topic, { qos: 0 }, (err) => {
                        if (err) {
                            console.error(`Subscribe error for ${topic}:`, err);
                        }
                    });
                });
                
                addLog(`✅ Connected via ${attempt.name}`, 'normal');
                sendCommand('request_data');
            });
            
            mqttClient.on('message', function(topic, message) {
                handleMQTTMessage(topic, message.toString());
            });
            
            mqttClient.on('error', function(error) {
                clearTimeout(connectionTimeout);
                isConnecting = false;
                addLog(`❌ ${attempt.name} error: ${error.message}`, 'danger');
                attemptIndex++;
                setTimeout(attemptConnection, 3000);
            });
            
            mqttClient.on('close', function() {
                clearTimeout(connectionTimeout);
                isConnecting = false;
                if (mqttClient && !mqttClient.connected) {
                    updateStatus('mqtt', 'disconnected');
                    addLog(`🔌 ${attempt.name} connection closed`, 'warning');
                    // Auto-reconnect setelah delay
                    setTimeout(attemptConnection, 5000);
                }
            });
            
            mqttClient.on('offline', function() {
                updateStatus('mqtt', 'disconnected');
                addLog('🔌 MQTT offline', 'warning');
            });
            
        } catch (error) {
            clearTimeout(connectionTimeout);
            isConnecting = false;
            addLog(`❌ ${attempt.name} exception: ${error.message}`, 'danger');
            attemptIndex++;
            setTimeout(attemptConnection, 3000);
        }
    }
    
    attemptConnection();
}

// Handle MQTT Messages
function handleMQTTMessage(topic, message) {
    try {
        const data = JSON.parse(message);
        const timestamp = new Date().toLocaleTimeString();

        document.getElementById('last-update').innerHTML = `⏰ Last: ${timestamp}`;

        if (topic.includes('sensor/data')) {
            handleSensorData(data);
        } else if (topic.includes('sensor/alerts')) {
            handleAlertData(data);
        } else if (topic.includes('connection')) {
            handleConnectionData(data);
        } else if (topic.includes('ota/status')) {
            handleOTAStatus(data);
        } else if (topic.includes('device/info')) {
            handleDeviceInfo(data);
        }

        addLog(`📡 [${getTopicName(topic)}] from ${data.device_id || 'unknown'}`, 'normal');

    } catch (error) {
        console.error('Error parsing message:', error);
        addLog(`❌ Parse error from ${topic}: ${error.message}`, 'danger');
    }
}

function getTopicName(fullTopic) {
    const parts = fullTopic.split('/');
    return parts.slice(-2).join('/'); // Ambil 2 bagian terakhir
}

// Handle Sensor Data
function handleSensorData(data) {
    // Update device count
    if (data.device_id) {
        connectedDevices.add(data.device_id);
        document.getElementById('status-devices').innerHTML = `📱 Devices: ${connectedDevices.size}`;
    }

    // Update sensor values
    if (data.sensors) {
        document.getElementById('tilt-roll').textContent = data.sensors.tilt_roll?.toFixed(2) + '°' || '0.0°';
        document.getElementById('tilt-pitch').textContent = data.sensors.tilt_pitch?.toFixed(2) + '°' || '0.0°';
        document.getElementById('soil-moisture').textContent = data.sensors.soil_moisture + '%' || '0%';
        document.getElementById('temperature').textContent = data.sensors.temperature?.toFixed(1) + '°C' || '0.0°C';
        document.getElementById('humidity').textContent = data.sensors.humidity?.toFixed(1) + '%' || '0%';
        document.getElementById('hourly-rain').textContent = data.sensors.hourlyrain?.toFixed(1) + ' mm' || '0.0 mm';
        document.getElementById('daily-rain').textContent = data.sensors.dailyrain?.toFixed(1) + ' mm' || '0.0 mm';
    }

    // Update risk status
    if (data.status) {
        document.getElementById('risk-score').textContent = data.status.risk_score || 0;
        updateRiskIndicator(data.status.code, data.status.text);
    }

    // Update device info
    updateDeviceInfo(data);

    // Update charts
    updateCharts(data);
}

// Handle Alert Data
function handleAlertData(data) {
    const alertMessage = data.alert_message || 'Alert triggered';
    addLog(`🚨 ALERT: ${alertMessage}`, 'danger');
    
    // Show browser notification
    showBrowserNotification('EWS Alert', alertMessage);
}

// Handle Connection Data
function handleConnectionData(data) {
    if (data.device_id) {
        if (data.status === 'connected') {
            connectedDevices.add(data.device_id);
        } else {
            connectedDevices.delete(data.device_id);
        }
        document.getElementById('status-devices').innerHTML = `📱 Devices: ${connectedDevices.size}`;
    }
}

// Handle OTA Status
function handleOTAStatus(data) {
    const otaMessage = data.message || 'OTA update';
    const inProgress = data.in_progress || false;
    
    document.getElementById('info-ota').textContent = inProgress ? 'In Progress' : 'Ready';
    document.getElementById('info-ota').style.color = inProgress ? '#f39c12' : '#27ae60';
    
    addLog(`🔄 OTA: ${otaMessage}`, inProgress ? 'warning' : 'normal');
    
    if (inProgress) {
        showBrowserNotification('OTA Update', otaMessage);
    }
}

// Handle Device Info
function handleDeviceInfo(data) {
    updateDeviceInfo(data);
}

function updateDeviceInfo(data) {
    if (data.device_id) {
        document.getElementById('info-device-id').textContent = data.device_id;
    }
    if (data.location) {
        document.getElementById('info-location').textContent = data.location;
    }
    if (data.firmware || data.firmware_version) {
        document.getElementById('info-firmware').textContent = data.firmware || data.firmware_version;
    }
    if (data.ip_address) {
        document.getElementById('info-ip').textContent = data.ip_address;
    }
}

// Update Risk Indicator
function updateRiskIndicator(statusCode, statusText) {
    const indicator = document.getElementById('risk-indicator');
    const status = statusText || getStatusText(statusCode);
    indicator.textContent = `STATUS: ${status}`;

    // Remove all classes
    indicator.className = 'risk-indicator';
    
    // Add appropriate class
    if (statusCode === 0 || status === 'NORMAL') {
        indicator.classList.add('risk-normal');
        indicator.style.animation = 'none';
    } else if (statusCode === 1 || status === 'WARNING') {
        indicator.classList.add('risk-warning');
        indicator.style.animation = 'none';
    } else if (statusCode === 2 || status === 'DANGER') {
        indicator.classList.add('risk-danger');
    }
}

function getStatusText(statusCode) {
    switch(statusCode) {
        case 0: return 'NORMAL';
        case 1: return 'WARNING';
        case 2: return 'DANGER';
        default: return 'UNKNOWN';
    }
}

// Update Charts
function updateCharts(data) {
    const now = new Date().toLocaleTimeString();
    
    // Update tilt chart
    if (tiltHistory.labels.length > 15) {
        tiltHistory.labels.shift();
        tiltHistory.roll.shift();
        tiltHistory.pitch.shift();
    }

    tiltHistory.labels.push(now);
    tiltHistory.roll.push(data.sensors?.tilt_roll || 0);
    tiltHistory.pitch.push(data.sensors?.tilt_pitch || 0);
    tiltChart.update();

    // Update rain chart
    if (rainHistory.labels.length > 10) {
        rainHistory.labels.shift();
        rainHistory.hourly.shift();
        rainHistory.daily.shift();
    }

    rainHistory.labels.push(now);
    rainHistory.hourly.push(data.sensors?.hourlyrain || 0);
    rainHistory.daily.push(data.sensors?.dailyrain || 0);
    rainChart.update();
}

// Send Commands to ESP32
function sendCommand(command) {
    if (!mqttClient || !mqttClient.connected) {
        addLog('MQTT not connected', 'danger');
        return;
    }

    let topic = '';
    let message = '';

    switch(command) {
        case 'request_data':
            topic = 'rzkink_2554/ews/control/request_data';
            message = JSON.stringify({ command: 'request_data', timestamp: Date.now() });
            break;
    }

    mqttClient.publish(topic, message, { qos: 0 }, (err) => {
        if (err) {
            addLog(`❌ Failed to send ${command}: ${err.message}`, 'danger');
        } else {
            addLog(`✅ Sent command: ${command}`, 'normal');
        }
    });
}

// Update Thresholds
function updateThresholds() {
    const thresholds = {
        tilt_warning: parseFloat(document.getElementById('tilt-warning').value) || 3.0,
        tilt_danger: parseFloat(document.getElementById('tilt-danger').value) || 6.0,
        soil_warning: parseInt(document.getElementById('soil-warning').value) || 70,
        soil_danger: parseInt(document.getElementById('soil-danger').value) || 85
    };

    if (mqttClient && mqttClient.connected) {
        const topic = 'rzkink_2554/ews/control/threshold';
        mqttClient.publish(topic, JSON.stringify(thresholds), { qos: 0 }, (err) => {
            if (err) {
                addLog(`❌ Failed to update thresholds: ${err.message}`, 'danger');
            } else {
                addLog('✅ Updated thresholds: ' + JSON.stringify(thresholds), 'normal');
            }
        });
    }
}

// Check OTA
function checkOTA() {
    if (mqttClient && mqttClient.connected) {
        const topic = 'rzkink_2554/ews/control/ota_check';
        mqttClient.publish(topic, JSON.stringify({ command: 'ota_check', timestamp: Date.now() }), { qos: 0 }, (err) => {
            if (err) {
                addLog(`❌ Failed to check OTA: ${err.message}`, 'danger');
            } else {
                addLog('✅ Requested OTA check', 'normal');
            }
        });
    }
}

// Utility Functions
function updateStatus(type, status) {
    const element = document.getElementById('status-' + type);
    if (element) {
        element.className = 'status-item ';
        if (status === 'connected') {
            element.classList.add('status-connected');
            element.innerHTML = '🔌 MQTT: Connected';
        } else if (status === 'error' || status === 'disconnected') {
            element.classList.add('status-disconnected');
            element.innerHTML = '🔌 MQTT: Disconnected';
        }
    }
}

function addLog(message, type = 'normal') {
    const logContainer = document.getElementById('data-log');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span class="log-${type}">${message}</span>
    `;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;

    // Keep only last 50 log entries
    const entries = logContainer.getElementsByClassName('log-entry');
    if (entries.length > 50) {
        logContainer.removeChild(entries[0]);
    }
}

function startTimeUpdate() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('last-update').innerHTML = 
            `⏰ Last: ${now.toLocaleTimeString()}`;
    }, 1000);
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚠️</text></svg>',
            tag: 'ews-alert'
        });
    }
}

// Export functions for global access
window.sendCommand = sendCommand;
window.updateThresholds = updateThresholds;
window.checkOTA = checkOTA;