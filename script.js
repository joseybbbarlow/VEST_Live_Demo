// Canine Vital Signs Monitoring System - Main JavaScript

// BLE UUIDs (must match Arduino code)
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const TEMP_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const PPG_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a9';
const ACCEL_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26aa';

// Global variables
let device, server, service;
let tempCharacteristic, ppgCharacteristic, accelCharacteristic;
let isActiveMode = false;
let autoModeEnabled = true;
let previousMagnitude = 1.0;
let movementHistory = [];

// Health ranges based on breed/size/activity
let healthRanges = {
    tempRest: { min: 101.0, max: 102.5 },
    tempActive: { min: 102.0, max: 103.5 },
    hrRest: { min: 60, max: 100 },
    hrActive: { min: 100, max: 180 }
};

// Breed-specific data
const breedData = {
    labrador: { size: 'large', baseHR: 70, tempAdjust: 0 },
    german_shepherd: { size: 'large', baseHR: 65, tempAdjust: 0 },
    golden_retriever: { size: 'large', baseHR: 70, tempAdjust: 0 },
    beagle: { size: 'medium', baseHR: 80, tempAdjust: 0 },
    bulldog: { size: 'medium', baseHR: 75, tempAdjust: 0.2 },
    poodle: { size: 'medium', baseHR: 75, tempAdjust: 0 },
    husky: { size: 'large', baseHR: 65, tempAdjust: -0.3 },
    boxer: { size: 'large', baseHR: 70, tempAdjust: 0.1 }
};

/**
 * Initialize the application
 */
function initializeApp() {
    // Check if Web Bluetooth is available
    if (!navigator.bluetooth) {
        alert('Web Bluetooth API is not available in this browser. Please use Chrome, Edge, or Opera.');
        return;
    }

    // Initialize health ranges
    updateHealthRanges();
    
    console.log('Application initialized');
}

/**
 * Connect to Bluetooth device
 */
async function connectBluetooth() {
    try {
        console.log('Requesting Bluetooth Device...');
        device = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'VEST' }],
            optionalServices: [SERVICE_UUID]
        });

        console.log('Connecting to GATT Server...');
        server = await device.gatt.connect();
        service = await server.getPrimaryService(SERVICE_UUID);

        // Get all characteristics
        tempCharacteristic = await service.getCharacteristic(TEMP_CHAR_UUID);
        ppgCharacteristic = await service.getCharacteristic(PPG_CHAR_UUID);
        accelCharacteristic = await service.getCharacteristic(ACCEL_CHAR_UUID);

        // Start notifications
        await tempCharacteristic.startNotifications();
        tempCharacteristic.addEventListener('characteristicvaluechanged', handleTemperatureData);

        await ppgCharacteristic.startNotifications();
        ppgCharacteristic.addEventListener('characteristicvaluechanged', handlePPGData);

        await accelCharacteristic.startNotifications();
        accelCharacteristic.addEventListener('characteristicvaluechanged', handleAccelData);

        // Update UI
        updateConnectionUI(true);

        console.log('Connected successfully!');
    } catch (error) {
        console.error('Connection failed:', error);
        alert('Failed to connect: ' + error.message);
    }
}

/**
 * Disconnect from Bluetooth device
 */
function disconnectBluetooth() {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
        updateConnectionUI(false);
        console.log('Disconnected');
    }
}

/**
 * Update connection status in UI
 */
function updateConnectionUI(isConnected) {
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const statusIndicator = document.getElementById('statusIndicator');

    if (isConnected) {
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-block';
        statusIndicator.className = 'status-indicator connected';
        statusIndicator.innerHTML = '<span class="status-dot green"></span><span>Connected</span>';
    } else {
        connectBtn.style.display = 'inline-block';
        disconnectBtn.style.display = 'none';
        statusIndicator.className = 'status-indicator disconnected';
        statusIndicator.innerHTML = '<span class="status-dot red"></span><span>Disconnected</span>';
    }
}

/**
 * Handle temperature data from BLE
 */
function handleTemperatureData(event) {
    const value = event.target.value;
    const temp1F = value.getFloat32(0, true);
    const temp2F = value.getFloat32(4, true);
    
    const avgTemp = (temp1F + temp2F) / 2;
    const delta = Math.abs(temp1F - temp2F);

    // Update display
    document.getElementById('temp1').textContent = temp1F.toFixed(1) + '°F';
    document.getElementById('temp2').textContent = temp2F.toFixed(1) + '°F';
    document.getElementById('tempValue').textContent = avgTemp.toFixed(1);
    document.getElementById('tempDelta').textContent = delta.toFixed(1) + '°F';

    // Check health status
    updateTemperatureStatus(avgTemp);
}

/**
 * Update temperature health status
 */
function updateTemperatureStatus(avgTemp) {
    const tempRange = isActiveMode ? healthRanges.tempActive : healthRanges.tempRest;
    const tempStatus = document.getElementById('tempStatus');
    
    if (avgTemp >= tempRange.min && avgTemp <= tempRange.max) {
        tempStatus.textContent = 'Normal';
        tempStatus.className = 'health-status normal';
    } else if (avgTemp < tempRange.min - 1 || avgTemp > tempRange.max + 1) {
        tempStatus.textContent = 'Alert';
        tempStatus.className = 'health-status danger';
    } else {
        tempStatus.textContent = 'Monitor';
        tempStatus.className = 'health-status warning';
    }
}

/**
 * Handle PPG data from BLE
 */
function handlePPGData(event) {
    const value = event.target.value;
    const ppgSignal = value.getUint8(0) | (value.getUint8(1) << 8);
    
    document.getElementById('ppgRaw').textContent = ppgSignal;
    
    // Estimate heart rate from PPG signal (simplified)
    // In real implementation, this would use peak detection algorithm
    const estimatedHR = Math.round(60 + (ppgSignal - 500) / 10);
    document.getElementById('hrValue').textContent = estimatedHR;

    // Signal quality assessment
    const quality = ppgSignal > 400 && ppgSignal < 700 ? 'Good' : 'Poor';
    document.getElementById('ppgQuality').textContent = quality;

    // Check health status
    updateHeartRateStatus(estimatedHR);
}

/**
 * Update heart rate health status
 */
function updateHeartRateStatus(estimatedHR) {
    const hrRange = isActiveMode ? healthRanges.hrActive : healthRanges.hrRest;
    const hrStatus = document.getElementById('hrStatus');
    
    if (estimatedHR >= hrRange.min && estimatedHR <= hrRange.max) {
        hrStatus.textContent = 'Normal';
        hrStatus.className = 'health-status normal';
    } else if (estimatedHR < hrRange.min - 10 || estimatedHR > hrRange.max + 10) {
        hrStatus.textContent = 'Alert';
        hrStatus.className = 'health-status danger';
    } else {
        hrStatus.textContent = 'Monitor';
        hrStatus.className = 'health-status warning';
    }
}

/**
 * Handle accelerometer data from BLE
 */
function handleAccelData(event) {
    const value = event.target.value;
    const accelX = value.getFloat32(0, true);
    const accelY = value.getFloat32(4, true);
    const accelZ = value.getFloat32(8, true);
    const accelMag = value.getFloat32(12, true);

    // Update display
    document.getElementById('accelX').textContent = accelX.toFixed(3);
    document.getElementById('accelY').textContent = accelY.toFixed(3);
    document.getElementById('accelZ').textContent = accelZ.toFixed(3);
    document.getElementById('accelMag').textContent = accelMag.toFixed(3);

    // Detect movement
    detectMovement(accelMag);
}

/**
 * Detect movement and update activity state
 */
function detectMovement(currentMagnitude) {
    const magnitudeChange = Math.abs(currentMagnitude - previousMagnitude);
    
    // Add to movement history (keep last 10 readings)
    movementHistory.push(magnitudeChange);
    if (movementHistory.length > 10) {
        movementHistory.shift();
    }

    // Calculate average movement
    const avgMovement = movementHistory.reduce((a, b) => a + b, 0) / movementHistory.length;
    
    // Adjustable threshold - can be modified if too sensitive
    const baseThreshold = 0.15;
    const threshold = isActiveMode ? baseThreshold * 0.7 : baseThreshold;
    
    const movementStatus = document.getElementById('movementStatus');
    const isMoving = avgMovement > threshold;

    // Update movement display
    if (isMoving) {
        movementStatus.textContent = 'Active Movement Detected';
        movementStatus.className = 'movement-status moving';
        
        // Auto-switch to active mode if enabled
        if (autoModeEnabled && !isActiveMode) {
            setMode('active');
        }
    } else {
        movementStatus.textContent = 'Subject at Rest';
        movementStatus.className = 'movement-status rest';
        
        // Auto-switch to rest mode if enabled and movement consistently low
        if (autoModeEnabled && isActiveMode && avgMovement < threshold * 0.5) {
            setMode('rest');
        }
    }

    previousMagnitude = currentMagnitude;
}

/**
 * Set activity mode (rest or active)
 */
function setMode(mode) {
    isActiveMode = (mode === 'active');
    
    const modeDisplay = document.getElementById('modeDisplay');
    const modeLabel = document.getElementById('modeLabel');
    
    if (isActiveMode) {
        modeLabel.textContent = 'ACTIVE';
        modeLabel.className = 'mode-label active';
        modeDisplay.className = 'mode-display active';
        modeDisplay.innerHTML = '<span class="mode-label active">ACTIVE</span><span>Biometric thresholds adjusted for exercise state</span>';
    } else {
        modeLabel.textContent = 'AT REST';
        modeLabel.className = 'mode-label';
        modeDisplay.className = 'mode-display';
        modeDisplay.innerHTML = '<span class="mode-label">AT REST</span><span>Biometric thresholds adjusted for resting state</span>';
    }
    
    console.log('Mode switched to:', mode);
}

/**
 * Toggle automatic mode detection
 */
function toggleAutoMode() {
    autoModeEnabled = document.getElementById('autoModeToggle').checked;
    console.log('Automatic mode detection:', autoModeEnabled ? 'enabled' : 'disabled');
}

/**
 * Update health ranges based on breed, weight, age, size
 */
function updateHealthRanges() {
    const breed = document.getElementById('breedSelect').value;
    const weight = parseInt(document.getElementById('weightInput').value);
    const age = parseInt(document.getElementById('ageInput').value);
    const size = document.getElementById('sizeSelect').value;

    const breedInfo = breedData[breed];
    
    // Calculate heart rate ranges based on size and breed
    let hrRestMin, hrRestMax, hrActiveMin, hrActiveMax;
    
    if (size === 'small') {
        hrRestMin = 90;
        hrRestMax = 140;
        hrActiveMin = 140;
        hrActiveMax = 220;
    } else if (size === 'medium') {
        hrRestMin = 70;
        hrRestMax = 110;
        hrActiveMin = 110;
        hrActiveMax = 180;
    } else if (size === 'large') {
        hrRestMin = 60;
        hrRestMax = 100;
        hrActiveMin = 100;
        hrActiveMax = 160;
    } else { // giant
        hrRestMin = 50;
        hrRestMax = 90;
        hrActiveMin = 90;
        hrActiveMax = 140;
    }

    // Adjust for age (puppies and seniors have higher resting rates)
    if (age < 2 || age > 10) {
        hrRestMin += 10;
        hrRestMax += 10;
    }

    // Temperature ranges (less variable by breed, but some adjustment)
    const tempAdjust = breedInfo.tempAdjust;
    const tempRestMin = 101.0 + tempAdjust;
    const tempRestMax = 102.5 + tempAdjust;
    const tempActiveMin = 102.0 + tempAdjust;
    const tempActiveMax = 103.5 + tempAdjust;

    // Update global ranges
    healthRanges = {
        tempRest: { min: tempRestMin, max: tempRestMax },
        tempActive: { min: tempActiveMin, max: tempActiveMax },
        hrRest: { min: hrRestMin, max: hrRestMax },
        hrActive: { min: hrActiveMin, max: hrActiveMax }
    };

    // Update display
    document.getElementById('tempRestRange').textContent = 
        `${tempRestMin.toFixed(1)} - ${tempRestMax.toFixed(1)}°F`;
    document.getElementById('tempActiveRange').textContent = 
        `${tempActiveMin.toFixed(1)} - ${tempActiveMax.toFixed(1)}°F`;
    document.getElementById('hrRestRange').textContent = 
        `${hrRestMin} - ${hrRestMax} BPM`;
    document.getElementById('hrActiveRange').textContent = 
        `${hrActiveMin} - ${hrActiveMax} BPM`;

    console.log('Health ranges updated:', healthRanges);
}

// Initialize application when page loads
window.addEventListener('DOMContentLoaded', initializeApp);
