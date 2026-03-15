// script.js

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const kpInput = document.getElementById('kp');
    const kpVal = document.getElementById('kp-val');
    
    const kiInput = document.getElementById('ki');
    const kiVal = document.getElementById('ki-val');
    
    const kdInput = document.getElementById('kd');
    const kdVal = document.getElementById('kd-val');
    
    const setpointInput = document.getElementById('setpoint');
    const setpointVal = document.getElementById('setpoint-val');
    
    const densityInput = document.getElementById('density');
    const densityVal = document.getElementById('density-val');
    
    const depthEffectInput = document.getElementById('depth-effect');
    const depthEffectVal = document.getElementById('depth-effect-val');
    
    const startBtn = document.getElementById('start-btn');
    const resetBtn = document.getElementById('reset-btn');
    let isRunning = false;

    // Canvas & Drawing Settings
    const simCanvas = document.getElementById('simCanvas');
    const ctx = simCanvas.getContext('2d');
    
    // Resize sim canvas logically to internal resolution
    simCanvas.width = 600;
    simCanvas.height = 400;

    // Simulation Parameters
    let targetAltitudePercent = parseFloat(setpointInput.value); 
    let currentKp = parseFloat(kpInput.value);
    let currentKi = parseFloat(kiInput.value);
    let currentKd = parseFloat(kdInput.value);
    let currentDensity = parseFloat(densityInput.value);
    let currentDepthEffect = parseFloat(depthEffectInput.value);

    // ROV state
    let rov = {
        y: 20, // Starts near surface (0 is top)
        v: 0,
        m: 5.0,      // Mass (Büyütüldü: Atalet/aşım artsın diye)
        volume: 0.98,// Volume (determines buoyancy relative to density)
        g: 9.81,     // Gravity logic
        d: 0.2,      // Base Drag (Küçültüldü: Daha kolay kontrolden çıksın diye)
        thrust: 0,
        maxThrust: 400 // Max vertical force
    };

    // PID Variables
    let errorSum = 0;
    let lastError = 0;
    let lastTime = 0;
    
    // Physics constants
    const CANVAS_TO_SIM_RATIO = 10; // For visual scaling
    
    // Graph Data
    const chartCanvas = document.getElementById('chartCanvas');
    let timeIndex = 0;
    const maxDataPoints = 150;
    let timeLabels = [];
    let setpointData = [];
    let processData = [];

    // Initialize Chart.js
    const ctxChart = chartCanvas.getContext('2d');
    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.font.family = 'Inter';
    
    const pidChart = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [
                {
                    label: 'Hedef (Setpoint)',
                    data: setpointData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'Gerçek Derinlik',
                    data: processData,
                    borderColor: '#0ea5e9',
                    backgroundColor: 'rgba(14, 165, 233, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: {
                    display: false // Hide x-axis labels to avoid clutter
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#f8fafc'
                    }
                }
            }
        }
    });

    // Update UI on Input change
    function updateValues() {
        currentKp = parseFloat(kpInput.value);
        kpVal.textContent = currentKp.toFixed(3);
        
        currentKi = parseFloat(kiInput.value);
        kiVal.textContent = currentKi.toFixed(3);
        
        currentKd = parseFloat(kdInput.value);
        kdVal.textContent = currentKd.toFixed(3);
        
        targetAltitudePercent = parseFloat(setpointInput.value);
        setpointVal.textContent = targetAltitudePercent.toFixed(0) + "%";
        
        currentDensity = parseFloat(densityInput.value);
        densityVal.textContent = currentDensity.toFixed(2);
        
        currentDepthEffect = parseFloat(depthEffectInput.value);
        depthEffectVal.textContent = currentDepthEffect.toFixed(2);
    }

    kpInput.addEventListener('input', updateValues);
    kiInput.addEventListener('input', updateValues);
    kdInput.addEventListener('input', updateValues);
    setpointInput.addEventListener('input', updateValues);
    densityInput.addEventListener('input', updateValues);
    depthEffectInput.addEventListener('input', updateValues);

    startBtn.addEventListener('click', () => {
        isRunning = !isRunning;
        startBtn.textContent = isRunning ? "Duraklat" : "Başlat";
        startBtn.style.backgroundColor = isRunning ? "var(--danger)" : "var(--success)";
        startBtn.style.boxShadow = isRunning ? "0 4px 15px rgba(239, 68, 68, 0.4)" : "0 4px 15px rgba(16, 185, 129, 0.4)";
        if(isRunning) lastTime = performance.now(); // avoid big dt jump
    });

    resetBtn.addEventListener('click', () => {
        isRunning = false;
        startBtn.textContent = "Başlat";
        startBtn.style.backgroundColor = "var(--success)";
        startBtn.style.boxShadow = "0 4px 15px rgba(16, 185, 129, 0.4)";
        
        // Reset Simulation State
        rov.y = 20;
        rov.v = 0;
        rov.thrust = 0;
        errorSum = 0;
        lastError = 0;
        
        // Reset Chart Data
        timeLabels.length = 0;
        setpointData.length = 0;
        processData.length = 0;
        timeIndex = 0;
        pidChart.update();
    });

    // Drawing the simulation scene
    function drawSimulation(targetY, currentY, thrust) {
        // Clear canvas
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, simCanvas.width, simCanvas.height);
        
        // Draw Grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for(let i=0; i<simCanvas.height; i+=40) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(simCanvas.width, i);
            ctx.stroke();
        }

        // Draw Target Line
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(0, targetY);
        ctx.lineTo(simCanvas.width, targetY);
        ctx.stroke();
        ctx.setLineDash([]); // reset
        
        // Target Text
        ctx.fillStyle = '#10b981';
        ctx.font = '14px Inter';
        ctx.fillText("HEDEF DERİNLİK", simCanvas.width - 120, targetY - 10);

        // Draw ROV (Submarine shape)
        const rovWidth = 50;
        const rovHeight = 25;
        const rovX = simCanvas.width / 2 - rovWidth / 2;
        
        // Propeller / Thruster bubbles
        if (Math.abs(thrust) > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            for(let i=0; i<4; i++) {
                ctx.beginPath();
                // If thrust is positive (diving), bubbles go up from top
                // If thrust is negative (surfacing), bubbles go down from bottom
                let bx = rovX + rovWidth/2 + (Math.random()*16 - 8);
                let by = thrust > 0 ? currentY - 5 - Math.random()*15 : currentY + rovHeight + 5 + Math.random()*15;
                ctx.arc(bx, by, Math.random()*4 + 1, 0, Math.PI*2);
                ctx.fill();
            }
        }

        // Hull
        ctx.fillStyle = '#f59e0b'; // Yellow submarine
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(rovX, currentY, rovWidth, rovHeight, 10) : ctx.fillRect(rovX, currentY, rovWidth, rovHeight);
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Conning tower (kulesi)
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(rovX + 15, currentY - 10, 15, 10);
        
        // Viewport
        ctx.fillStyle = '#bae6fd';
        ctx.beginPath();
        ctx.arc(rovX + 40, currentY + 12, 4, 0, Math.PI*2);
        ctx.fill();
        
        // Metrics Display on Canvas
        ctx.fillStyle = '#f8fafc';
        ctx.font = '12px monospace';
        ctx.fillText(`Derinlik: ${(currentY / simCanvas.height * 100).toFixed(1)}%`, 10, 20);
        ctx.fillText(`Motor İtme Gücü: ${thrust.toFixed(1)}`, 10, 40);
        ctx.fillText(`Belirlenen Su Yoğunluğu: ${currentDensity.toFixed(2)}`, 10, 60);
    }

    // Main Simulation Loop
    function simulate(timestamp) {
        if (!lastTime) lastTime = timestamp;
        let dt = (timestamp - lastTime) / 1000; // seconds
        lastTime = timestamp;

        // Prevent large jumps if tab is inactive
        if (dt > 0.1) dt = 0.1;

        // Fluid Dynamics Update (0% is Surface Y=0, 100% is Bottom Y=height)
        const targetCanvasY = (targetAltitudePercent / 100 * simCanvas.height);
        
        if (isRunning) {
            let currentPercent = (rov.y / simCanvas.height * 100);
            
            // --- PID CONTROLLER LOGIC ---
            // Target - Current. Positive error means we need to go DEEPER (y increases).
            let error = targetAltitudePercent - currentPercent;
            
            let p_out = currentKp * error;
            
            errorSum += error * dt;
            const maxIntegral = 2000; // Artırıldı ki I daha fazla güç toplayabilsin
            if(errorSum > maxIntegral) errorSum = maxIntegral;
            if(errorSum < -maxIntegral) errorSum = -maxIntegral;
            let i_out = currentKi * errorSum;
            
            let derivative = (error - lastError) / dt;
            let d_out = currentKd * derivative;
            lastError = error;
            
            // Çıktıyı 10 katı güçlendirelim ki verilen değerler motorda daha hissedilir olsun
            let output = (p_out + i_out + d_out) * 10;
            
            // Bidirectional thrust for submersibles.
            // Positive output -> positive thrust -> dive deeper.
            // İtici motorların tepki hızı ve gücü
            rov.thrust = Math.max(-rov.maxThrust, Math.min(rov.maxThrust, output));

            // --- PHYSICS SIMULATION (FLUID DYNAMICS) ---
            // Gravity (Downward, constant)
            let f_gravity = rov.m * rov.g * 5; 
            
            // Buoyancy (Upward, depends on volume and fluid density)
            // Daha gerçeğe yakın bir batmazlık (Neredeyse askıda kalıyor ama hafif batıyor)
            let f_buoyancy = -rov.volume * currentDensity * rov.g * 4.9; 
            
            // Drag
            let depthMultiplier = 1 + (currentPercent / 100) * currentDepthEffect;
            let f_drag = -Math.sign(rov.v) * (rov.d * currentDensity * depthMultiplier) * (rov.v * rov.v) * 0.05;
            f_drag += -rov.v * (0.8 * currentDensity); // Linear damping biraz artırıldı ki sonsuz salınmasın
            
            // Akıntı (Aşağı iten ekstra kuvvet, I'nın değerini anlamak için)
            let f_current = 25 * currentDepthEffect; 
            
            // Total acceleration
            // PID Thrust'ını sisteme dahil ediyoruz
            let acceleration = (rov.thrust + f_gravity + f_buoyancy + f_drag + f_current) / rov.m;
            
            rov.v += acceleration * dt; 
            currentPercent += rov.v * dt;
            
            // Surface collision
            if (currentPercent <= 0) {
                currentPercent = 0;
                if (rov.v < 0) rov.v = 0;
            }
            
            // Seabed collision
            if (currentPercent >= 100) {
                currentPercent = 100;
                if (rov.v > 0) rov.v = 0;
            }
            
            rov.y = (currentPercent / 100 * simCanvas.height);

            // Chart Update (add a point roughly every few frames to not overload)
            if (Math.random() < 0.2) { // 20% of frames
                timeLabels.push(timeIndex++);
                setpointData.push(targetAltitudePercent);
                processData.push(currentPercent);
                
                if(timeLabels.length > maxDataPoints) {
                    timeLabels.shift();
                    setpointData.shift();
                    processData.shift();
                }
                pidChart.update();
            }
        }

        // Visuals update
        drawSimulation(targetCanvasY, rov.y, rov.thrust);

        requestAnimationFrame(simulate);
    }

    // Start
    updateValues();
    requestAnimationFrame(simulate);
});
