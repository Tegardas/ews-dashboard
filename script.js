// Global error handler untuk catch semua error
window.addEventListener('error', function(e) {
    console.error('Global error caught:', e.error);
    
    // Force hide loading overlay jika ada error
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
});

class EWSDashboard {
    constructor() {
        this.mqttClient = null;
        this.isConnected = false;
        this.sensorData = {};
        this.historyData = {
            timestamps: [],
            tilt: { roll: [], pitch: [] },
            soil: [],
            displacement: { x: [], y: [], z: [], total: [] },
            risk: []
        };
        this.charts = {};
        this.logEntries = [];

        setTimeout(() => {
            this.hideLoading();
        }, 8000);
        
        this.init();
    }

    init() {
        console.log('🚀 Initializing EWS Dashboard...');
        
        // Langsung initialize tanpa delay
        this.initializeCharts();
        this.setupEventListeners();
        this.loadFromLocalStorage();
        
        // Hide loading overlay immediately
        this.hideLoading();
        
        // Connect MQTT tanpa blocking UI
        this.connectMQTT();
    }

    initializeCharts() {
        // Tilt Chart
        this.charts.tilt = new Chart(document.getElementById('tiltChart'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Roll',
                        data: [],
                        borderColor: CHART_CONFIG.tilt.colors.roll,
                        backgroundColor: CHART_CONFIG.tilt.colors.roll.replace('0.8', '0.1'),
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Pitch',
                        data: [],
                        borderColor: CHART_CONFIG.tilt.colors.pitch,
                        backgroundColor: CHART_CONFIG.tilt.colors.pitch.replace('0.8', '0.1'),
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { 
                        title: { display: true, text: 'Time' },
                        grid: { color: 'rgba(0,0,0,0.1)' }
                    },
                    y: { 
                        title: { display: true, text: 'Angle (°)' },
                        grid: { color: 'rgba(0,0,0,0.1)' }
                    }
                }
            }
        });

        // Soil Moisture Chart
        this.charts.soil = new Chart(document.getElementById('soilChart'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Soil Moisture',
                    data: [],
                    borderColor: CHART_CONFIG.soil.color,
                    backgroundColor: CHART_CONFIG.soil.color.replace('0.8', '0.1'),
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    x: { 
                        title: { display: true, text: 'Time' },
                        grid: { color: 'rgba(0,0,0,0.1)' }
                    },
                    y: { 
                        title: { display: true, text: 'Moisture (%)' },
                        min: 0,
                        max: 100,
                        grid: { color: 'rgba(0,0,0,0.1)' }
                    }
                }
            }
        });

        // Displacement Chart
        this.charts.displacement = new Chart(document.getElementById('displacementChart'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'X Axis',
                        data: [],
                        borderColor: CHART_CONFIG.displacement.colors.x,
                        backgroundColor: CHART_CONFIG.displacement.colors.x.replace('0.8', '0.1'),
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Y Axis',
                        data: [],
                        borderColor: CHART_CONFIG.displacement.colors.y,
                        backgroundColor: CHART_CONFIG.displacement.colors.y.replace('0.8', '0.1'),
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Z Axis',
                        data: [],
                        borderColor: CHART_CONFIG.displacement.colors.z,
                        backgroundColor: CHART_CONFIG.displacement.colors.z.replace('0.8', '0.1'),
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Total',
                        data: [],
                        borderColor: CHART_CONFIG.displacement.colors.total,
                        backgroundColor: CHART_CONFIG.displacement.colors.total.replace('0.8', '0.1'),
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    x: { 
                        title: { display: true, text: 'Time' },
                        grid: { color: 'rgba(0,0,0,0.1)' }
                    },
                    y: { 
                        title: { display: true, text: 'Displacement (cm)' },
                        grid: { color: 'rgba(0,0,0,0.1)' }
                    }
                }
            }
        });

        // Risk Score Chart
        this.charts.risk = new Chart(document.getElementById('riskChart'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Risk Score',
                    data: [],
                    borderColor: CHART_CONFIG.risk.colors.medium,
                    backgroundColor: CHART_CONFIG.risk.colors.medium.replace('0.8', '0.1'),
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    x: { 
                        title: { display: true, text: 'Time' },
                        grid: { color: 'rgba(0,0,0,0.1)' }
                    },
                    y: { 
                        title: { display: true, text: 'Risk Score' },
                        min: 0,
                        max: 7,
                        grid: { color: 'rgba(0,0,0,0.1)' }
                    }
                }
            }
        });
    }

    setupEventListeners() {
        // Control buttons
        document.getElementById('updateThresholds').addEventListener('click', () => this.updateThresholds());
        document.getElementById('requestData').addEventListener('click', () => this.requestData());
        document.getElementById('resetDisplacement').addEventListener('click', () => this.resetDisplacement());
        
        // Log controls
        document.getElementById('clearLogs').addEventListener('click', () => this.clearLogs());
        document.getElementById('exportLogs').addEventListener('click', () => this.exportLogs());
        
        // Modal controls
        document.querySelector('.close').addEventListener('click', () => this.hideAlert());
        document.getElementById('acknowledgeAlert').addEventListener('click', () => this.hideAlert());
        
        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('alertModal');
            if (event.target === modal) {
                this.hideAlert();
            }
        });

        // Auto-save when inputs change
        document.querySelectorAll('.input-group input').forEach(input => {
            input.addEventListener('change', () => this.saveToLocalStorage());
        });
    }

    connectMQTT() {
        try {
            this.mqttClient = new Paho.MQTT.Client(
                MQTT_CONFIG.broker,
                MQTT_CONFIG.port,
                MQTT_CONFIG.clientId
            );

            this.mqttClient.onConnectionLost = (response) => {
                this.handleConnectionLost(response);
            };

            this.mqttClient.onMessageArrived = (message) => {
                this.handleMessage(message);
            };

            const options = {
                useSSL: true,
                userName: MQTT_CONFIG.username,
                password: MQTT_CONFIG.password,
                onSuccess: () => this.handleConnectSuccess(),
                onFailure: (error) => this.handleConnectFailure(error),
                timeout: 3,
                keepAliveInterval: 30,
                cleanSession: true
            };

            this.updateConnectionStatus('connecting', 'Connecting to MQTT...');
            this.mqttClient.connect(options);

        } catch (error) {
            console.error('MQTT Connection Error:', error);
            this.addLog('connection', 'error', `Connection failed: ${error.message}`);
            this.updateConnectionStatus('offline', 'Connection failed');
        }
    }

    handleConnectSuccess() {
        this.isConnected = true;
        this.updateConnectionStatus('connected', 'Connected to EWS');
        this.addLog('connection', 'success', 'Successfully connected to MQTT broker');
        
        // Subscribe to topics
        Object.values(MQTT_CONFIG.topics).forEach(topic => {
            this.mqttClient.subscribe(topic, { qos: 0 });
            this.addLog('connection', 'info', `Subscribed to: ${topic}`);
        });
    }

    handleConnectFailure(error) {
        this.isConnected = false;
        this.updateConnectionStatus('offline', 'Connection failed');
        this.addLog('connection', 'error', `Connection failed: ${error.errorMessage}`);
        
        // Auto-retry connection after 5 seconds
        setTimeout(() => {
            this.connectMQTT();
        }, 5000);
    }

    handleConnectionLost(response) {
        this.isConnected = false;
        this.updateConnectionStatus('offline', 'Connection lost');
        this.addLog('connection', 'warning', `Connection lost: ${response.errorMessage}`);
        
        // Auto-reconnect after 3 seconds
        setTimeout(() => {
            this.connectMQTT();
        }, 3000);
    }

    hideLoading() {
        try {
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
                console.log('✅ Loading overlay hidden');
            }
        } catch (error) {
            console.error('Error hiding loading overlay:', error);
        }
    }

    handleMessage(message) {
        try {
            const topic = message.destinationName;
            const payload = JSON.parse(message.payloadString);
            
            this.addLog('sensor', 'info', `Message received from: ${topic}`);
            
            switch(topic) {
                case MQTT_CONFIG.topics.sensorData:
                    this.handleSensorData(payload);
                    break;
                case MQTT_CONFIG.topics.alerts:
                    this.handleAlertData(payload);
                    break;
                case MQTT_CONFIG.topics.connection:
                    this.handleConnectionData(payload);
                    break;
                case MQTT_CONFIG.topics.ota:
                    this.handleOTAData(payload);
                    break;
            }
            
            this.saveToLocalStorage();
            
        } catch (error) {
            console.error('Error processing message:', error);
            this.addLog('sensor', 'error', `Failed to process message: ${error.message}`);
        }
    }

    handleSensorData(data) {
        this.sensorData = data;
        this.updateSensorDisplay(data);
        this.updateHistoryData(data);
        this.updateCharts();
        this.updateLastUpdate();
        
        // Check for alerts
        if (data.status && data.status > 0) {
            this.showAlert(data);
        }
    }

    handleAlertData(data) {
        this.addLog('alert', 'warning', `Alert: ${data.alert_message} - Level: ${data.alert_level}`);
        this.showAlert(data);
    }

    handleConnectionData(data) {
        if (data.status === 'connected') {
            this.addLog('connection', 'success', `Device connected: ${data.device_id} (${data.ip_address})`);
        } else {
            this.addLog('connection', 'warning', `Device disconnected: ${data.device_id}`);
        }
    }

    handleOTAData(data) {
        this.addLog('control', 'info', `OTA Update: ${data.message}`);
    }

    updateSensorDisplay(data) {
        // Device Information
        if (data.device_id) document.getElementById('deviceId').textContent = data.device_id;
        if (data.location) document.getElementById('deviceLocation').textContent = data.location;
        if (data.firmware) document.getElementById('firmwareVersion').textContent = data.firmware;
        
        // Sensor Data
        if (data.sensors) {
            const s = data.sensors;
            
            // Tilt data
            document.getElementById('tiltRoll').textContent = `${s.tilt_roll?.toFixed(1) || 0}°`;
            document.getElementById('tiltPitch').textContent = `${s.tilt_pitch?.toFixed(1) || 0}°`;
            
            // Tilt gauge (max of roll and pitch absolute values)
            const maxTilt = Math.max(Math.abs(s.tilt_roll || 0), Math.abs(s.tilt_pitch || 0));
            const tiltPercent = Math.min((maxTilt / 10) * 100, 100);
            document.getElementById('tiltGauge').style.width = `${tiltPercent}%`;
            
            // Soil moisture
            document.getElementById('soilMoisture').textContent = `${s.soil_moisture || 0}%`;
            document.getElementById('soilMoistureBar').style.width = `${s.soil_moisture || 0}%`;
            
            // Weather data
            document.getElementById('temperature').textContent = `${s.temperature?.toFixed(1) || 0}°C`;
            document.getElementById('humidity').textContent = `${s.humidity?.toFixed(1) || 0}%`;
            document.getElementById('dailyRain').textContent = `${s.dailyrain?.toFixed(1) || 0}mm`;
            document.getElementById('hourlyRain').textContent = `${s.hourlyrain?.toFixed(1) || 0}mm`;
            
            // Displacement data
            document.getElementById('displacementX').textContent = `${s.displacement_x?.toFixed(2) || 0}cm`;
            document.getElementById('displacementY').textContent = `${s.displacement_y?.toFixed(2) || 0}cm`;
            document.getElementById('displacementZ').textContent = `${s.displacement_z?.toFixed(2) || 0}cm`;
            document.getElementById('totalDisplacement').textContent = `${s.total_displacement?.toFixed(2) || 0}cm`;
        }
        
        // Status and risk
        if (data.status) {
            const statusElement = document.getElementById('riskLevel');
            statusElement.textContent = data.status.text || this.getStatusText(data.status.code);
            statusElement.className = `risk-${this.getStatusClass(data.status.code)}`;
        }
        
        if (data.status?.risk_score !== undefined) {
            // Risk score is already handled above
        }
    }

    updateHistoryData(data) {
        const now = new Date();
        const timestamp = now.toLocaleTimeString();
        
        // Keep only last N data points
        if (this.historyData.timestamps.length >= CHART_CONFIG.tilt.maxDataPoints) {
            this.historyData.timestamps.shift();
            this.historyData.tilt.roll.shift();
            this.historyData.tilt.pitch.shift();
            this.historyData.soil.shift();
            this.historyData.displacement.x.shift();
            this.historyData.displacement.y.shift();
            this.historyData.displacement.z.shift();
            this.historyData.displacement.total.shift();
            this.historyData.risk.shift();
        }
        
        // Add new data
        this.historyData.timestamps.push(timestamp);
        
        if (data.sensors) {
            this.historyData.tilt.roll.push(data.sensors.tilt_roll || 0);
            this.historyData.tilt.pitch.push(data.sensors.tilt_pitch || 0);
            this.historyData.soil.push(data.sensors.soil_moisture || 0);
            this.historyData.displacement.x.push(data.sensors.displacement_x || 0);
            this.historyData.displacement.y.push(data.sensors.displacement_y || 0);
            this.historyData.displacement.z.push(data.sensors.displacement_z || 0);
            this.historyData.displacement.total.push(data.sensors.total_displacement || 0);
        }
        
        if (data.status?.risk_score !== undefined) {
            this.historyData.risk.push(data.status.risk_score);
        }
    }

    updateCharts() {
        // Update tilt chart
        this.charts.tilt.data.labels = this.historyData.timestamps;
        this.charts.tilt.data.datasets[0].data = this.historyData.tilt.roll;
        this.charts.tilt.data.datasets[1].data = this.historyData.tilt.pitch;
        this.charts.tilt.update('none');
        
        // Update soil chart
        this.charts.soil.data.labels = this.historyData.timestamps;
        this.charts.soil.data.datasets[0].data = this.historyData.soil;
        this.charts.soil.update('none');
        
        // Update displacement chart
        this.charts.displacement.data.labels = this.historyData.timestamps;
        this.charts.displacement.data.datasets[0].data = this.historyData.displacement.x;
        this.charts.displacement.data.datasets[1].data = this.historyData.displacement.y;
        this.charts.displacement.data.datasets[2].data = this.historyData.displacement.z;
        this.charts.displacement.data.datasets[3].data = this.historyData.displacement.total;
        this.charts.displacement.update('none');
        
        // Update risk chart
        this.charts.risk.data.labels = this.historyData.timestamps;
        this.charts.risk.data.datasets[0].data = this.historyData.risk;
        this.charts.risk.update('none');
    }

    updateThresholds() {
        if (!this.isConnected) {
            alert('Not connected to MQTT broker');
            return;
        }

        const thresholds = {
            tilt_warning: parseFloat(document.getElementById('tiltWarning').value) || DEFAULT_THRESHOLDS.tiltWarning,
            tilt_danger: parseFloat(document.getElementById('tiltDanger').value) || DEFAULT_THRESHOLDS.tiltDanger,
            soil_warning: parseInt(document.getElementById('soilWarning').value) || DEFAULT_THRESHOLDS.soilWarning,
            soil_danger: parseInt(document.getElementById('soilDanger').value) || DEFAULT_THRESHOLDS.soilDanger,
            humidity_warning: parseInt(document.getElementById('humidityWarning').value) || DEFAULT_THRESHOLDS.humidityWarning,
            displacement_warning: parseFloat(document.getElementById('displacementWarning').value) || DEFAULT_THRESHOLDS.displacementWarning,
            displacement_danger: parseFloat(document.getElementById('displacementDanger').value) || DEFAULT_THRESHOLDS.displacementDanger
        };

        const message = {
            ...thresholds,
            timestamp: Date.now()
        };

        this.publishMessage(MQTT_CONFIG.topics.control + '/threshold', JSON.stringify(message));
        this.addLog('control', 'info', `Thresholds updated: ${JSON.stringify(thresholds)}`);
        
        // Update MQTT interval if changed
        const mqttInterval = parseInt(document.getElementById('mqttInterval').value);
        if (mqttInterval && mqttInterval !== DEFAULT_THRESHOLDS.mqttInterval) {
            this.publishMessage(MQTT_CONFIG.topics.control + '/interval', mqttInterval.toString());
            this.addLog('control', 'info', `MQTT interval updated: ${mqttInterval}ms`);
        }
    }

    requestData() {
        if (!this.isConnected) {
            alert('Not connected to MQTT broker');
            return;
        }
        
        this.publishMessage(MQTT_CONFIG.topics.control + '/request_data', '{}');
        this.addLog('control', 'info', 'Requested sensor data update');
    }

    resetDisplacement() {
        if (!this.isConnected) {
            alert('Not connected to MQTT broker');
            return;
        }
        
        this.publishMessage(MQTT_CONFIG.topics.control + '/reset_displacement', '{}');
        this.addLog('control', 'info', 'Requested displacement reset');
    }

    publishMessage(topic, message) {
        if (this.mqttClient && this.isConnected) {
            const mqttMessage = new Paho.MQTT.Message(message);
            mqttMessage.destinationName = topic;
            mqttMessage.qos = 0;
            this.mqttClient.send(mqttMessage);
        }
    }

    showAlert(data) {
        const alertMessage = document.getElementById('alertMessage');
        let message = '';
        
        if (data.alert_message) {
            message = `
                <div class="alert-level ${data.alert_level === 2 ? 'danger' : 'warning'}">
                    <h4>${data.alert_level === 2 ? '🚨 CRITICAL ALERT' : '⚠️ WARNING ALERT'}</h4>
                    <p>${data.alert_message}</p>
                </div>
            `;
        } else if (data.status) {
            const statusText = data.status.text || this.getStatusText(data.status.code);
            message = `
                <div class="alert-level ${data.status.code === 2 ? 'danger' : 'warning'}">
                    <h4>${data.status.code === 2 ? '🚨 DANGER LEVEL' : '⚠️ WARNING LEVEL'}</h4>
                    <p>Device: ${data.device_id || 'Unknown'}</p>
                    <p>Location: ${data.location || 'Unknown'}</p>
                    <p>Status: ${statusText}</p>
                    <p>Risk Score: ${data.status.risk_score || 0}/7</p>
                </div>
            `;
        }
        
        alertMessage.innerHTML = message;
        document.getElementById('alertModal').style.display = 'block';
    }

    hideAlert() {
        document.getElementById('alertModal').style.display = 'none';
    }

    addLog(type, level, message) {
        const timestamp = new Date().toLocaleString();
        const logEntry = {
            timestamp,
            type,
            level,
            message,
            details: ''
        };
        
        this.logEntries.unshift(logEntry);
        
        // Keep only last 100 logs
        if (this.logEntries.length > 100) {
            this.logEntries.pop();
        }
        
        this.updateLogDisplay();
    }

    updateLogDisplay() {
        const tbody = document.getElementById('logTableBody');
        tbody.innerHTML = '';
        
        this.logEntries.forEach(entry => {
            const row = document.createElement('tr');
            row.className = `log-${entry.type}`;
            
            row.innerHTML = `
                <td>${entry.timestamp}</td>
                <td>
                    <span class="log-badge log-${entry.type}">${entry.type.toUpperCase()}</span>
                    <span class="log-level ${entry.level}">${entry.level}</span>
                </td>
                <td>${entry.message}</td>
                <td>${entry.details}</td>
            `;
            
            tbody.appendChild(row);
        });
    }

    clearLogs() {
        this.logEntries = [];
        this.updateLogDisplay();
        this.addLog('control', 'info', 'Logs cleared by user');
    }

    exportLogs() {
        const logText = this.logEntries.map(entry => 
            `[${entry.timestamp}] ${entry.type.toUpperCase()} ${entry.level}: ${entry.message}`
        ).join('\n');
        
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ews-logs-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.addLog('control', 'info', 'Logs exported to file');
    }

    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connectionStatus');
        statusElement.className = `status-${status}`;
        statusElement.innerHTML = `<i class="fas fa-wifi"></i> ${message}`;
    }

    updateLastUpdate() {
        const now = new Date().toLocaleTimeString();
        document.getElementById('lastUpdate').textContent = `Last update: ${now}`;
    }

    getStatusText(statusCode) {
        switch(statusCode) {
            case 0: return 'NORMAL';
            case 1: return 'WARNING';
            case 2: return 'DANGER';
            default: return 'UNKNOWN';
        }
    }

    getStatusClass(statusCode) {
        switch(statusCode) {
            case 0: return 'normal';
            case 1: return 'warning';
            case 2: return 'danger';
            default: return 'normal';
        }
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    saveToLocalStorage() {
        const saveData = {
            thresholds: {
                tiltWarning: document.getElementById('tiltWarning').value,
                tiltDanger: document.getElementById('tiltDanger').value,
                soilWarning: document.getElementById('soilWarning').value,
                soilDanger: document.getElementById('soilDanger').value,
                humidityWarning: document.getElementById('humidityWarning').value,
                displacementWarning: document.getElementById('displacementWarning').value,
                displacementDanger: document.getElementById('displacementDanger').value,
                mqttInterval: document.getElementById('mqttInterval').value
            },
            history: this.historyData,
            logs: this.logEntries.slice(0, 50) // Save only recent logs
        };
        
        localStorage.setItem('ewsDashboard', JSON.stringify(saveData));
    }

    loadFromLocalStorage() {
        try {
            const saved = JSON.parse(localStorage.getItem('ewsDashboard'));
            if (saved) {
                // Load thresholds
                if (saved.thresholds) {
                    Object.keys(saved.thresholds).forEach(key => {
                        const element = document.getElementById(key);
                        if (element && saved.thresholds[key]) {
                            element.value = saved.thresholds[key];
                        }
                    });
                }
                
                // Load history
                if (saved.history) {
                    this.historyData = saved.history;
                    this.updateCharts();
                }
                
                // Load logs
                if (saved.logs) {
                    this.logEntries = saved.logs;
                    this.updateLogDisplay();
                }
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.ewsDashboard = new EWSDashboard();
});

// Add some CSS for log badges
const style = document.createElement('style');
style.textContent = `
    .log-badge {
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: bold;
    }
    .log-connection { background: var(--secondary-color); color: white; }
    .log-sensor { background: var(--success-color); color: white; }
    .log-alert { background: var(--danger-color); color: white; }
    .log-control { background: var(--warning-color); color: white; }
    .log-level.success { color: var(--success-color); }
    .log-level.warning { color: var(--warning-color); }
    .log-level.error { color: var(--danger-color); }
    .log-level.info { color: var(--secondary-color); }
    
    .alert-level.danger {
        background: #ffeaea;
        border-left: 4px solid var(--danger-color);
        padding: 1rem;
        border-radius: 4px;
    }
    .alert-level.warning {
        background: #fff4e6;
        border-left: 4px solid var(--warning-color);
        padding: 1rem;
        border-radius: 4px;
    }
`;
document.head.appendChild(style);