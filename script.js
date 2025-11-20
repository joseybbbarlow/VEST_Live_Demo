// ============================================================================
// WEB BLUETOOTH DOG VEST MONITOR
// Real-time sensor data visualization using Web Bluetooth API
// ============================================================================

// Global Variables
let bluetoothDevice = null;
let characteristic = null;
let isConnected = false;

// Chart.js chart instances
let charts = {
    heartRate: null,
    temperature: null,
    respiratory: null,
    activity: null,
    stretch: null,
    accel: null
};

// Data buffers for charts (store last N data points)
const MAX_DATA_POINTS = 30;
let chartData = {
    heartRate: [],
    temperature: [],
    respiratory: [],
    activity: [],
    stretch: [],
    accelX: [],
    accelY: [],
    accelZ: []
};

// ============================================================================
// INITIALIZATION - Run when page loads
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🐕 Dog Vest Monitor initialized');
    
    // Check if Web Bluetooth is supported
    if (!navigator.bluetooth) {
        showAlert('❌ Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera on desktop/Android.');
        document.getElementById('connectBtn').disabled = true;
        return;
    }
    
    // Set up event listeners
    document.getElementById('connectBtn').addEventListener('click', toggleConnection);
    document.getElementById('clearLog').addEventListener('click', clearDataLog);
    document.getElementById('dismissAlert').addEventListener('click', hideAlert);
    
    // Initialize all charts
    initializeCharts();
    
    console.log('✅ All systems ready');
});

// ============================================================================
// WEB BLUETOOTH CONNECTION
// ============================================================================
async function toggleConnection() {
    if (isConnected) {
        disconnect();
    } else {
        await connect();
    }
}

async function connect() {
    try {
        showLoading(true);
        updateConnectionStatus('connecting', '⏳ Connecting...');
        
        console.log('🔍 Requesting Bluetooth device...');
        
        // Request Bluetooth device with Serial Port Profile
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { name: 'DogVest_Medical' }  // Match the name in Arduino code
            ],
            optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb'] // ESP32 SPP UUID
        });
        
        console.log('✅ Device selected:', bluetoothDevice.name);
        
        // Add disconnect listener
        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
        
        // Connect to GATT server
        console.log('🔌 Connecting to GATT server...');
        const server = await bluetoothDevice.gatt.connect();
        console.log('✅ GATT server connected');
        
        // Get the service (ESP32 Serial Port Profile UUID)
        console.log('📡 Getting service...');
        const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
        console.log('✅ Service obtained');
        
        // Get the characteristic for receiving data
        console.log('📊 Getting characteristic...');
        characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
        console.log('✅ Characteristic obtained');
        
        // Start receiving notifications
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
        console.log('✅ Notifications started');
        
        // Update UI
        isConnected = true;
        updateConnectionStatus('connected', '✅ Connected to ' + bluetoothDevice.name);
        document.getElementById('btnText').textContent = 'Disconnect';
        showLoading(false);
        
        addToLog('Connected to Dog Vest successfully!');
        
    } catch (error) {
        console.error('❌ Connection error:', error);
        showAlert('Connection failed: ' + error.message);
        updateConnectionStatus('disconnected', '⚠️ Not Connected');
        showLoading(false);
    }
}

function disconnect() {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        console.log('🔌 Disconnecting...');
        bluetoothDevice.gatt.disconnect();
    }
    onDisconnected();
}

function onDisconnected() {
    console.log('❌ Disconnected from device');
    isConnected = false;
    characteristic = null;
    
    updateConnectionStatus('disconnected', '⚠️ Not Connected');
    document.getElementById('btnText').textContent = 'Connect to Dog Vest';
    
    addToLog('Disconnected from Dog Vest');
}

// ============================================================================
// DATA RECEIVING & PARSING
// ============================================================================
function handleDataReceived(event) {
    // Convert the received data to text
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(value);
    
    console.log('📩 Received:', text);
    
    // Try to parse as JSON
    try {
        const data = JSON.parse(text);
        processData(data);
    } catch (error) {
        console.warn('⚠️ Could not parse JSON:', text);
        // If it's not JSON, log it as raw data
        addToLog('Raw data: ' + text);
    }
}

function processData(data) {
    console.log('📊 Processing data:', data);
    
    // Update heart rate
    if (data.heartRate !== undefined) {
        updateHeartRate(data.heartRate);
    }
    
    // Update temperature
    if (data.temperature !== undefined) {
        updateTemperature(data.temperature);
    }
    
    // Update respiratory rate
    if (data.respiratoryRate !== undefined) {
        updateRespiratoryRate(data.respiratoryRate);
    }
    
    // Update activity level
    if (data.activityLevel !== undefined) {
        updateActivityLevel(data.activityLevel, data.steps || 0);
    }
    
    // Update stretch sensor
    if (data.stretchPercent !== undefined) {
        updateStretch(data.stretchPercent);
    }
    
    // Update accelerometer
    if (data.accelX !== undefined && data.accelY !== undefined && data.accelZ !== undefined) {
        updateAccelerometer(data.accelX, data.accelY, data.accelZ);
    }
    
    // Update last update time
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    
    // Add to log
    addToLog(`HR: ${data.heartRate} | Temp: ${data.temperature?.toFixed(1)}°C | Activity: ${data.activityLevel?.toFixed(2)}G`);
}

// ============================================================================
// UI UPDATE FUNCTIONS
// ============================================================================
function updateHeartRate(value) {
    document.getElementById('heartRate').textContent = value.toFixed(0);
    
    // Determine status
    const statusElement = document.getElementById('hrStatus');
    if (value < 40 || value > 250) {
        statusElement.textContent = '⚠️ Abnormal heart rate';
        statusElement.className = 'metric-status danger';
    } else if (value < 60 || value > 180) {
        statusElement.textContent = '⚠️ Elevated heart rate';
        statusElement.className = 'metric-status warning';
    } else {
        statusElement.textContent = '✅ Normal range';
        statusElement.className = 'metric-status normal';
    }
    
    // Update chart
    updateChart('heartRate', value);
}

function updateTemperature(value) {
    document.getElementById('temperature').textContent = value.toFixed(1);
    
    // Convert to Fahrenheit
    const fahrenheit = (value * 9/5) + 32;
    document.getElementById('temperatureF').textContent = fahrenheit.toFixed(1);
    
    // Determine status (dog normal: 38.3-39.2°C)
    const statusElement = document.getElementById('tempStatus');
    if (value < 37.2 || value > 40.0) {
        statusElement.textContent = '⚠️ Abnormal temperature';
        statusElement.className = 'metric-status danger';
        showAlert(`⚠️ Temperature alert: ${value.toFixed(1)}°C`);
    } else if (value < 38.0 || value > 39.5) {
        statusElement.textContent = '⚠️ Temperature slightly off';
        statusElement.className = 'metric-status warning';
    } else {
        statusElement.textContent = '✅ Normal range';
        statusElement.className = 'metric-status normal';
    }
    
    // Update chart
    updateChart('temperature', value);
}

function updateRespiratoryRate(value) {
    document.getElementById('respiratoryRate').textContent = value.toFixed(0);
    
    // Determine status (dog normal: 10-30 breaths/min at rest)
    const statusElement = document.getElementById('respStatus');
    if (value < 8 || value > 80) {
        statusElement.textContent = '⚠️ Abnormal breathing rate';
        statusElement.className = 'metric-status danger';
    } else if (value < 10 || value > 40) {
        statusElement.textContent = '⚠️ Elevated breathing';
        statusElement.className = 'metric-status warning';
    } else {
        statusElement.textContent = '✅ Normal range';
        statusElement.className = 'metric-status normal';
    }
    
    // Update chart
    updateChart('respiratory', value);
}

function updateActivityLevel(value, steps) {
    document.getElementById('activityLevel').textContent = value.toFixed(2);
    document.getElementById('stepCount').textContent = steps;
    
    // Determine activity state
    const stateElement = document.getElementById('activityState');
    if (value < 1.1) {
        stateElement.textContent = '😴 Resting';
        stateElement.style.background = '#95a5a6';
    } else if (value < 1.3) {
        stateElement.textContent = '🚶 Walking';
        stateElement.style.background = '#3498db';
    } else if (value < 1.6) {
        stateElement.textContent = '🏃 Running';
        stateElement.style.background = '#e74c3c';
    } else {
        stateElement.textContent = '⚡ High Activity';
        stateElement.style.background = '#9b59b6';
    }
    
    // Update chart
    updateChart('activity', value);
}

function updateStretch(value) {
    document.getElementById('stretchPercent').textContent = value.toFixed(1);
    
    // Update chart
    updateChart('stretch', value);
}

function updateAccelerometer(x, y, z) {
    document.getElementById('accelX').textContent = x.toFixed(2);
    document.getElementById('accelY').textContent = y.toFixed(2);
    document.getElementById('accelZ').textContent = z.toFixed(2);
    
    // Update chart with all three values
    updateAccelChart(x, y, z);
}

// ============================================================================
// CHART MANAGEMENT
// ============================================================================
function initializeCharts() {
    // Heart Rate Chart
    charts.heartRate = createLineChart('heartRateChart', 'Heart Rate (BPM)', '#E74C3C', 40, 200);
    
    // Temperature Chart
    charts.temperature = createLineChart('temperatureChart', 'Temperature (°C)', '#E67E22', 35, 42);
    
    // Respiratory Chart
    charts.respiratory = createLineChart('respiratoryChart', 'Breaths/Min', '#3498DB', 0, 50);
    
    // Activity Chart
    charts.activity = createLineChart('activityChart', 'Activity (G)', '#9B59B6', 0, 3);
    
    // Stretch Chart
    charts.stretch = createLineChart('stretchChart', 'Stretch (%)', '#16A085', -10, 30);
    
    // Accelerometer Chart (multi-line)
    charts.accel = createAccelChart('accelChart');
}

function createLineChart(canvasId, label, color, minY, maxY) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 300
            },
            scales: {
                y: {
                    min: minY,
                    max: maxY,
                    ticks: {
                        font: { size: 10 }
                    }
                },
                x: {
                    display: false
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function createAccelChart(canvasId) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'X',
                    data: [],
                    borderColor: '#E74C3C',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Y',
                    data: [],
                    borderColor: '#3498DB',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Z',
                    data: [],
                    borderColor: '#2ECC71',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 300
            },
            scales: {
                y: {
                    min: -2,
                    max: 2,
                    ticks: {
                        font: { size: 10 }
                    }
                },
                x: {
                    display: false
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        boxWidth: 10,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

function updateChart(chartName, value) {
    const chart = charts[chartName];
    if (!chart) return;
    
    // Add new data point
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(value);
    
    // Keep only last MAX_DATA_POINTS
    if (chart.data.labels.length > MAX_DATA_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    
    chart.update('none'); // Update without animation for smoothness
}

function updateAccelChart(x, y, z) {
    const chart = charts.accel;
    if (!chart) return;
    
    // Add new data points
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(x); // X axis
    chart.data.datasets[1].data.push(y); // Y axis
    chart.data.datasets[2].data.push(z); // Z axis
    
    // Keep only last MAX_DATA_POINTS
    if (chart.data.labels.length > MAX_DATA_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
        chart.data.datasets[2].data.shift();
    }
    
    chart.update('none');
}

// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================
function updateConnectionStatus(state, text) {
    const statusElement = document.getElementById('connectionStatus');
    statusElement.className = 'status ' + state;
    statusElement.textContent = text;
}

function showAlert(message) {
    const banner = document.getElementById('alertBanner');
    const messageElement = document.getElementById('alertMessage');
    
    messageElement.textContent = message;
    banner.classList.remove('hidden');
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        hideAlert();
    }, 5000);
}

function hideAlert() {
    document.getElementById('alertBanner').classList.add('hidden');
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function addToLog(message) {
    const logElement = document.getElementById('dataLog');
    const timestamp = new Date().toLocaleTimeString();
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
    
    logElement.appendChild(entry);
    
    // Auto-scroll to bottom
    logElement.scrollTop = logElement.scrollHeight;
    
    // Keep only last 50 entries
    while (logElement.children.length > 50) {
        logElement.removeChild(logElement.firstChild);
    }
}

function clearDataLog() {
    document.getElementById('dataLog').innerHTML = '';
    addToLog('Log cleared');
}

// ============================================================================
// DEBUGGING & TESTING
// ============================================================================

// Test function to simulate data (for development without hardware)
function simulateData() {
    const testData = {
        heartRate: 75 + Math.random() * 20,
        temperature: 38.5 + Math.random() * 0.5,
        respiratoryRate: 18 + Math.random() * 4,
        activityLevel: 1.0 + Math.random() * 0.5,
        steps: Math.floor(Math.random() * 1000),
        stretchPercent: Math.random() * 10 - 5,
        accelX: Math.random() * 0.4 - 0.2,
        accelY: Math.random() * 0.4 - 0.2,
        accelZ: 1.0 + Math.random() * 0.2 - 0.1,
        timestamp: Date.now()
    };
    
    processData(testData);
}

// Expose simulate function to console for testing
window.simulateData = simulateData;

console.log('💡 Tip: Use simulateData() in console to test UI without hardware');
