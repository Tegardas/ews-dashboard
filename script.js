class EWSDashboard {
    // ulala uhuuyy
    // eeffb
    // efnefef
    constructor() {
        this.mqttClient = null;
        this.isConnected = false;
        this.sensorData = {};
        this.historyData = {
            timestamps: [],
            tilt: { roll: [], pitch: [] },
            soil: [],
            displacement: { x: [], y: [], z: [], total: [] },
            weather: { humd: [], temp: [], daily: [], hourly: [] },
            risk: []
        };
        this.charts = {};
        this.logEntries = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectInterval = 5000;
        
        this.init();
    }

    init() {
        console.log('🚀 Initializing EWS Dashboard...');
        
        if (typeof mqtt === 'undefined') {
            console.error('❌ MQTT.js not loaded!');
            this.addLog('connection', 'error', 'MQTT.js library failed to load');
            return;
        }

        // Initialize components
        this.initializeCharts();
        this.setupEventListeners();
        this.loadFromLocalStorage();
        
        // Start MQTT connection
        this.connectMQTT();
        
        // Add initial log
        this.addLog('connection', 'info', 'Dashboard initialized successfully');
    }

    initializeCharts() {
        console.log('📊 Initializing charts...');
        
        // Wait for DOM to be fully ready
        setTimeout(() => {
            try {
                // Tilt Chart
                const tiltCanvas = document.getElementById('tiltChart');
                if (tiltCanvas && typeof Chart !== 'undefined') {
                    this.charts.tilt = new Chart(tiltCanvas, {
                        type: 'line',
                        data: {
                            labels: [],
                            datasets: [
                                {
                                    label: 'Roll',
                                    data: [],
                                    borderColor: 'rgba(231, 76, 60, 0.8)',
                                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                                    tension: 0.4,
                                    fill: true
                                },
                                {
                                    label: 'Pitch',
                                    data: [],
                                    borderColor: 'rgba(52, 152, 219, 0.8)',
                                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
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
                                y: {
                                    title: {
                                        display: true,
                                        text: 'Angle (°)'
                                    }
                                }
                            }
                        }
                    });
                    console.log('✅ Tilt chart initialized');
                }

                // Soil Moisture Chart
                const soilCanvas = document.getElementById('soilChart');
                if (soilCanvas && typeof Chart !== 'undefined') {
                    this.charts.soil = new Chart(soilCanvas, {
                        type: 'line',
                        data: {
                            labels: [],
                            datasets: [{
                                label: 'Soil Moisture',
                                data: [],
                                borderColor: 'rgba(39, 174, 96, 0.8)',
                                backgroundColor: 'rgba(39, 174, 96, 0.1)',
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
                                y: {
                                    title: {
                                        display: true,
                                        text: 'Moisture (%)'
                                    },
                                    min: 0,
                                    max: 100
                                }
                            }
                        }
                    });
                    console.log('✅ Soil chart initialized');
                }

                // Displacement Chart
                const displacementCanvas = document.getElementById('displacementChart');
                if (displacementCanvas && typeof Chart !== 'undefined') {
                    this.charts.displacement = new Chart(displacementCanvas, {
                        type: 'line',
                        data: {
                            labels: [],
                            datasets: [
                                {
                                    label: 'X Axis',
                                    data: [],
                                    borderColor: 'rgba(155, 89, 182, 0.8)',
                                    backgroundColor: 'rgba(155, 89, 182, 0.1)',
                                    tension: 0.4,
                                    fill: false
                                },
                                {
                                    label: 'Y Axis',
                                    data: [],
                                    borderColor: 'rgba(241, 196, 15, 0.8)',
                                    backgroundColor: 'rgba(241, 196, 15, 0.1)',
                                    tension: 0.4,
                                    fill: false
                                },
                                {
                                    label: 'Z Axis',
                                    data: [],
                                    borderColor: 'rgba(230, 126, 34, 0.8)',
                                    backgroundColor: 'rgba(230, 126, 34, 0.1)',
                                    tension: 0.4,
                                    fill: false
                                },
                                {
                                    label: 'Total',
                                    data: [],
                                    borderColor: 'rgba(52, 73, 94, 0.8)',
                                    backgroundColor: 'rgba(52, 73, 94, 0.1)',
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
                                y: {
                                    title: {
                                        display: true,
                                        text: 'Displacement (cm)'
                                    }
                                }
                            }
                        }
                    });
                    console.log('✅ Displacement chart initialized');
                }

                const humptempCanvas = document.getElementById('humtempChart');
                if (humptempCanvas && typeof Chart !== 'undefined') {
                    this.charts.humptemp = new Chart(humptempCanvas, {
                        type: 'line',
                        data: {
                            labels: [],
                            datasets: [
                                {
                                    label: 'Humidity',
                                    data: [],
                                    borderColor: 'rgba(13, 201, 230, 0.8)',
                                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                                    tension: 0.4,
                                    fill: true
                                },
                                {
                                    label: 'Temperature',
                                    data: [],
                                    borderColor: 'rgba(237, 234, 15, 0.8)',
                                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
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
                                y: {
                                    title: {
                                        display: true,
                                        text: 'Celcius dan %'
                                    }
                                }
                            }
                        }
                    });
                    console.log('✅ HumTempChart initialized');
                }

                const rainCanvas = document.getElementById('rainChart');
                if (rainCanvas && typeof Chart !== 'undefined') {
                    this.charts.rain = new Chart(rainCanvas, {
                        type: 'line',
                        data: {
                            labels: [],
                            datasets: [
                                {
                                    label: 'Daily Rain',
                                    data: [],
                                    borderColor: 'rgba(150, 13, 230, 0.8)',
                                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                                    tension: 0.4,
                                    fill: true
                                },
                                {
                                    label: 'Hourly Rain',
                                    data: [],
                                    borderColor: 'rgba(15, 22, 237, 0.8)',
                                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
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
                                y: {
                                    title: {
                                        display: true,
                                        text: 'mm'
                                    }
                                }
                            }
                        }
                    });
                    console.log('✅ RainChart initialized');
                }

                // Risk Chart
                const riskCanvas = document.getElementById('riskChart');
                if (riskCanvas && typeof Chart !== 'undefined') {
                    this.charts.risk = new Chart(riskCanvas, {
                        type: 'line',
                        data: {
                            labels: [],
                            datasets: [{
                                label: 'Risk Score',
                                data: [],
                                borderColor: 'rgba(241, 196, 15, 0.8)',
                                backgroundColor: 'rgba(241, 196, 15, 0.1)',
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
                                y: {
                                    title: {
                                        display: true,
                                        text: 'Risk Score'
                                    },
                                    min: 0,
                                    max: 7
                                }
                            }
                        }
                    });
                    console.log('✅ Risk chart initialized');
                }

            } catch (error) {
                console.error('❌ Chart initialization error:', error);
                this.addLog('system', 'error', `Chart initialization failed: ${error.message}`);
            }
        }, 100);
    }

    setupEventListeners() {
        // Control buttons
        document.getElementById('updateThresholds').addEventListener('click', () => this.updateThresholds());
        document.getElementById('requestData').addEventListener('click', () => this.requestData());
        document.getElementById('resetDisplacement').addEventListener('click', () => this.resetDisplacement());
        
        // Log controls
        document.getElementById('clearLogs').addEventListener('click', () => this.clearLogs());
        document.getElementById('exportLogs').addEventListener('click', () => this.exportLogs());
        
        // Manual reconnect button (tambahkan di HTML nanti)
        const reconnectBtn = document.getElementById('reconnectBtn');
        if (reconnectBtn) {
            reconnectBtn.addEventListener('click', () => this.manualReconnect());
        }
        
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
    }

    connectMQTT() {
        try {
            console.log('🔌 Attempting MQTT connection with MQTT.js...');
            
            if (this.mqttClient) {
                this.mqttClient.end(true); // Force disconnect
                this.mqttClient = null;
            }
            
            const options = {
                username: MQTT_CONFIG.username,
                password: MQTT_CONFIG.password,
                clientId: MQTT_CONFIG.clientId,
                clean: true,
                reconnectPeriod: 0, // We handle reconnection manually
                connectTimeout: 10000,
                keepalive: 30,
                protocolVersion: 4, // MQTT 3.1.1
                properties: {
                    sessionExpiryInterval: 3600 // 1 hour
                }
            };

            // Connect using WebSocket
            const url = `wss://${MQTT_CONFIG.broker}:${MQTT_CONFIG.port}/mqtt`;
            this.mqttClient = mqtt.connect(url, options);
            // this.mqttClient = new WebSocket(url);

            this.mqttClient.on('connect', () => {
                console.log('✅ MQTT Connected successfully');
                this.handleConnectSuccess();
            });

            this.mqttClient.on('message', (topic, message) => {
                this.handleMQTTMessage(topic, message);
            });

            this.mqttClient.on('close', () => {
                console.log('🔌 MQTT Connection closed');
                this.handleConnectionLost({ errorMessage: 'MQTT connection closed' });
            });

            this.mqttClient.on('error', (error) => {
                console.log('❌ MQTT Connection error:', error);
                this.handleConnectFailure(error);
            });

            this.mqttClient.on('reconnect', () => {
                console.log('🔄 MQTT Reconnecting...');
                this.addLog('connection', 'info', 'MQTT client attempting reconnect');
            });

            this.mqttClient.on('offline', () => {
                console.log('🔴 MQTT Offline');
                this.updateConnectionStatus('offline', 'Offline');
            });

            this.mqttClient.on('end', () => {
                console.log('🔚 MQTT Connection ended');
                this.addLog('connection', 'info', 'MQTT connection ended');
            });

            this.updateConnectionStatus('connecting', 'Connecting to MQTT Broker...');
            this.addLog('connection', 'info', `Attempting MQTT connection to ${url}`);

        } catch (error) {
            console.error('❌ MQTT Connection Error:', error);
            this.addLog('connection', 'error', `Connection failed: ${error.message}`);
            this.updateConnectionStatus('offline', 'Connection Failed');
            this.scheduleReconnect();
        }
    }

    handleMQTTMessage(topic, message) {
        try {
            const payload = JSON.parse(message.toString());
            console.log('📨 MQTT Message received:', topic);
            
            this.handleMessage({
                destinationName: topic,
                payloadString: message.toString()
            });
            
        } catch (error) {
            console.error('Error processing MQTT message:', error);
            this.addLog('sensor', 'error', `Failed to process MQTT message: ${error.message}`);
        }
    }

    handleConnectSuccess() {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateConnectionStatus('connected', 'Connected to EWS');
        this.addLog('connection', 'success', 'Successfully connected to MQTT broker');
        
        // Subscribe to topics
        Object.values(MQTT_CONFIG.topics).forEach(topic => {
            this.mqttClient.subscribe(topic, { qos: 0 }, (error) => {
                if (error) {
                    console.error(`❌ Failed to subscribe to ${topic}:`, error);
                    this.addLog('connection', 'error', `Failed to subscribe to ${topic}: ${error.message}`);
                } else {
                    console.log(`✅ Subscribed to: ${topic}`);
                    this.addLog('connection', 'info', `Subscribed to: ${topic}`);
                }
            });
        });
    }

    publishMessage(topic, message) {
        if (this.mqttClient && this.isConnected) {
            try {
                this.mqttClient.publish(topic, message, { qos: 0 }, (error) => {
                    if (error) {
                        console.error('❌ Publish error:', error);
                        this.addLog('control', 'error', `Failed to publish to ${topic}: ${error.message}`);
                    } else {
                        this.addLog('control', 'info', `Message published to ${topic}`);
                    }
                });
            } catch (error) {
                console.error('❌ Publish exception:', error);
                this.addLog('control', 'error', `Publish failed: ${error.message}`);
            }
        } else {
            this.addLog('control', 'error', 'Cannot publish - MQTT not connected');
        }
    }

    subscribe(topic) {
        // MQTT SUBSCRIBE packet
        let packet = [];
        
        // Fixed header
        packet.push(0x82); // SUBSCRIBE packet type + QoS 1
        
        // Variable header - Packet Identifier
        const packetId = 1;
        packet.push(packetId >> 8, packetId & 0xFF);
        
        // Payload - Topic filter
        packet.push(topic.length >> 8, topic.length & 0xFF);
        packet.push(...Array.from(topic).map(c => c.charCodeAt(0)));
        packet.push(0); // QoS 0
        
        // Set remaining length
        const remainingLength = packet.length - 1;
        packet[1] = remainingLength;
        
        const buffer = new Uint8Array(packet);
        this.mqttClient.send(buffer);
    }

    handleConnectFailure(error) {
        this.isConnected = false;
        this.reconnectAttempts++;
        
        const errorMessage = error.errorMessage || 'Unknown error';
        this.updateConnectionStatus('offline', `Connection Failed (Attempt ${this.reconnectAttempts})`);
        this.addLog('connection', 'error', `Connection failed: ${errorMessage}`);
        
        this.scheduleReconnect();
    }

    handleConnectionLost(response) {
        this.isConnected = false;
        this.reconnectAttempts++;
        
        this.updateConnectionStatus('offline', `Connection Lost (Attempt ${this.reconnectAttempts})`);
        this.addLog('connection', 'warning', `Connection lost: ${response.errorMessage}`);
        
        this.scheduleReconnect();
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.addLog('connection', 'error', `Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping auto-reconnect.`);
            this.updateConnectionStatus('offline', 'Max Reconnect Attempts Reached');
            return;
        }

        // Calculate next reconnect delay with exponential backoff
        const delay = Math.min(this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1), 30000); // Max 30 seconds
        
        this.addLog('connection', 'info', `Scheduling reconnect in ${delay / 1000} seconds (Attempt ${this.reconnectAttempts + 1})`);
        
        setTimeout(() => {
            this.addLog('connection', 'info', `Executing auto-reconnect attempt ${this.reconnectAttempts + 1}`);
            this.connectMQTT();
        }, delay);
    }

    manualReconnect() {
        this.reconnectAttempts = 0; // Reset attempts on manual reconnect
        this.addLog('connection', 'info', 'Manual reconnect requested by user');
        this.connectMQTT();
    }

    handleMessage(message) {
        try {
            const topic = message.destinationName;
            const payload = JSON.parse(message.payloadString);
            
            this.addLog('sensor', 'info', `Data received from: ${topic}`);
            
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
            this.historyData.weather.humd.shift();
            this.historyData.weather.temp.shift();
            this.historyData.weather.daily.shift();
            this.historyData.weather.hourly.shift();
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
            this.historyData.weather.humd.push(data.sensors.humidity || 0);
            this.historyData.weather.temp.push(data.sensors.temperature || 0);
            this.historyData.weather.daily.push(data.sensors.dailyrain || 0);
            this.historyData.weather.hourly.push(data.sensors.hourlyrain || 0);
        }
        
        if (data.status?.risk_score !== undefined) {
            this.historyData.risk.push(data.status.risk_score);
        }
    }

    updateCharts() {
        // Update tilt chart
        if (this.charts.tilt) {
            this.charts.tilt.data.labels = this.historyData.timestamps;
            this.charts.tilt.data.datasets[0].data = this.historyData.tilt.roll;
            this.charts.tilt.data.datasets[1].data = this.historyData.tilt.pitch;
            this.charts.tilt.update('none');
        }
        
        // Update soil chart
        if (this.charts.soil) {
            this.charts.soil.data.labels = this.historyData.timestamps;
            this.charts.soil.data.datasets[0].data = this.historyData.soil;
            this.charts.soil.update('none');
        }
        
        // Update displacement chart
        if (this.charts.displacement) {
            this.charts.displacement.data.labels = this.historyData.timestamps;
            this.charts.displacement.data.datasets[0].data = this.historyData.displacement.x;
            this.charts.displacement.data.datasets[1].data = this.historyData.displacement.y;
            this.charts.displacement.data.datasets[2].data = this.historyData.displacement.z;
            this.charts.displacement.data.datasets[3].data = this.historyData.displacement.total;
            this.charts.displacement.update('none');
        }

        if (this.charts.humptemp) {
            this.charts.humptemp.data.labels = this.historyData.timestamps;
            this.charts.humptemp.data.datasets[0].data = this.historyData.weather.humd;
            this.charts.humptemp.data.datasets[1].data = this.historyData.weather.temp;
            this.charts.humptemp.update('none');
        }

        if (this.charts.rain) {
            this.charts.rain.data.labels = this.historyData.timestamps;
            this.charts.rain.data.datasets[0].data = this.historyData.weather.dailyrain;
            this.charts.rain.data.datasets[1].data = this.historyData.weather.hourlyrain;
            this.charts.rain.update('none');
        }
        
        // Update risk chart
        if (this.charts.risk) {
            this.charts.risk.data.labels = this.historyData.timestamps;
            this.charts.risk.data.datasets[0].data = this.historyData.risk;
            this.charts.risk.update('none');
        }
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
        if (this.mqttClient && this.mqttClient.readyState === WebSocket.OPEN) {
            // MQTT PUBLISH packet
            let packet = [];
            
            // Fixed header
            packet.push(0x30); // PUBLISH packet type + QoS 0
            
            // Variable header - Topic name
            packet.push(topic.length >> 8, topic.length & 0xFF);
            packet.push(...Array.from(topic).map(c => c.charCodeAt(0)));
            
            // Payload
            packet.push(...Array.from(message).map(c => c.charCodeAt(0)));
            
            // Set remaining length
            const remainingLength = packet.length - 1;
            packet[1] = remainingLength;
            
            const buffer = new Uint8Array(packet);
            this.mqttClient.send(buffer);
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
            logs: this.logEntries.slice(0, 50)
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
