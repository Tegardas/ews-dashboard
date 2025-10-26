// MQTT Configuration - SESUAI DENGAN PROGRAM ESP32 ANDA
const MQTT_CONFIG = {
    host: '103.127.97.247',
    hosts: [
        { host: '103.127.97.247', port: 8084, protocol: 'wss' }, // Secure WebSocket
        { host: '103.127.97.247', port: 8083, protocol: 'ws' }   // Fallback to WS
    ],
    clientId: 'ews-dashboard-' + Math.random().toString(16).substr(2, 8),
    username: 'rzkink_2554',
    password: 'rizkink1234',
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

// MQTT Connection
function connectMQTT() {
    let currentHostIndex = 0;
    
    function tryConnect() {
        if (currentHostIndex >= MQTT_CONFIG.hosts.length) {
            addLog('❌ All connection attempts failed. Please check MQTT broker configuration.', 'danger');
            updateStatus('mqtt', 'error');
            return;
        }
        
        const currentHost = MQTT_CONFIG.hosts[currentHostIndex];
        const url = `${currentHost.protocol}://${currentHost.host}:${currentHost.port}/mqtt`;
        
        addLog(`🔄 Trying ${currentHost.protocol.toUpperCase()} connection (${currentHost.host}:${currentHost.port})...`, 'warning');
        
        try {
            // Close existing connection if any
            if (mqttClient) {
                mqttClient.end();
            }
            
            mqttClient = mqtt.connect(url, {
                clientId: MQTT_CONFIG.clientId,
                username: MQTT_CONFIG.username,
                password: MQTT_CONFIG.password,
                reconnectPeriod: 5000,
                connectTimeout: 8000,
                rejectUnauthorized: false // Allow self-signed certificates
            });

            mqttClient.on('connect', function() {
                updateStatus('mqtt', 'connected');
                
                // Subscribe to all topics
                Object.values(MQTT_CONFIG.topics).forEach(topic => {
                    mqttClient.subscribe(topic);
                });
                
                addLog(`✅ Connected via ${currentHost.protocol.toUpperCase()}`, 'normal');
                sendCommand('request_data');
            });

            mqttClient.on('message', function(topic, message) {
                handleMQTTMessage(topic, message.toString());
            });

            mqttClient.on('error', function(error) {
                console.error('MQTT Error:', error);
                addLog(`❌ ${currentHost.protocol.toUpperCase()} failed: ${error.message}`, 'danger');
                
                // Try next host after delay
                currentHostIndex++;
                setTimeout(tryConnect, 3000);
            });

            mqttClient.on('close', function() {
                if (currentHostIndex < MQTT_CONFIG.hosts.length - 1) {
                    updateStatus('mqtt', 'disconnected');
                    addLog(`🔌 ${currentHost.protocol.toUpperCase()} connection closed`, 'danger');
                }
            });

        } catch (error) {
            console.error('Connection failed:', error);
            addLog(`❌ ${currentHost.protocol.toUpperCase()} connection failed: ${error.message}`, 'danger');
            currentHostIndex++;
            setTimeout(tryConnect, 3000);
        }
    }
    
    tryConnect();
}

// Handle MQTT Messages
function handleMQTTMessage(topic, message) {
    try {
        const data = JSON.parse(message);
        const timestamp = new Date().toLocaleTimeString();

        // Update last update time
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

        addLog(`[${getTopicName(topic)}] Data from ${data.device_id || 'unknown'}`, 'normal');

    } catch (error) {
        console.error('Error parsing message:', error);
        addLog('Error parsing MQTT message from ' + topic, 'danger');
    }
}

function getTopicName(fullTopic) {
    const parts = fullTopic.split('/');
    return parts[parts.length - 1];
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
    
    addLog(`OTA: ${otaMessage}`, inProgress ? 'warning' : 'normal');
    
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
            topic = MQTT_CONFIG.topics.control.replace('#', 'request_data');
            message = JSON.stringify({ command: 'request_data' });
            break;
    }

    mqttClient.publish(topic, message);
    addLog(`Sent command: ${command}`, 'normal');
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
        const topic = MQTT_CONFIG.topics.control.replace('#', 'threshold');
        mqttClient.publish(topic, JSON.stringify(thresholds));
        addLog('Updated thresholds: ' + JSON.stringify(thresholds), 'normal');
    }
}

// Check OTA
function checkOTA() {
    if (mqttClient && mqttClient.connected) {
        const topic = MQTT_CONFIG.topics.control.replace('#', 'ota_check');
        mqttClient.publish(topic, JSON.stringify({ command: 'ota_check' }));
        addLog('Requested OTA check', 'normal');
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
            icon: '/assets/icon.png', // Anda bisa menambahkan icon
            tag: 'ews-alert'
        });
    }
}

// Export functions for global access
window.sendCommand = sendCommand;
window.updateThresholds = updateThresholds;
window.checkOTA = checkOTA;