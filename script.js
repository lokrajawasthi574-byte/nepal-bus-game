const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

// ---------- Route: Nepal ko stops ----------
const STOPS = [
  { name: "Kathmandu",   x: 300 },
  { name: "Thankot",     x: 2300 },
  { name: "Malekhu",     x: 4800 },
  { name: "Mugling",     x: 7300 },
  { name: "Narayanghat", x: 9600 },
  { name: "Pokhara",     x: 12500 },
];
const END_X = STOPS[STOPS.length - 1].x;

// 1500 unit ko har tesro block offroad
function surfaceAt(x) {
  const block = Math.floor(x / 1500);
  return (block % 3 === 1) ? "offroad" : "road";
}

// Bhui ko unchai (screen Y)
function groundY(x) {
  return 380 + 45 * Math.sin(x / 320) + 22 * Math.sin(x / 97) + 10 * Math.sin(x / 41);
}

// ---------- Game state ----------
let game;
let started = false;

function reset() {
  game = {
    x: 0, v: 0,
    fuel: 100, damage: 0, money: 0,
    passengers: 0, capacity: 45,
    served: new Set(),
    waiting: STOPS.map(() => 4 + Math.floor(Math.random() * 12)),
    wheelAngle: 0,
    message: "",
    msgTimer: 0,
    state: "playing", // playing | win | lose
    time: 0,
  };
  game.waiting[0] = 15; // Kathmandu ma dherai yatri
}
reset();

// ---------- Input ----------
const keys = {};
addEventListener("keydown", e => {
  keys[e.code] = true;

  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }

  if (!started && e.code === "Enter") {
    started = true;
    return;
  }
  if (e.code === "KeyR" && game.state !== "playing") {
    reset();
    started = true;
  }
  if (e.code === "KeyE" && started) tryStopAction(true);
});
addEventListener("keyup", e => keys[e.code] = false);

// ---------- Stop logic ----------
function currentStopIndex() {
  for (let i = 0; i < STOPS.length; i++) {
    if (Math.abs(game.x - STOPS[i].x) < 70 && Math.abs(game.v) < 35) return i;
  }
  return -1;
}

function showMsg(text) {
  game.message = text;
  game.msgTimer = 2.5;
}

// refuelOnly = true: E dabaudaa diesel matra bharne
// refuelOnly = false: stop ma pugda auto ma yatri oraune/chadne
function tryStopAction(refuelOnly = false) {
  const i = currentStopIndex();
  if (i < 0) return;

  if (!refuelOnly) {
    if (game.served.has(i)) return; // ek stop ma ek choti matra
    game.served.add(i);

    // Yatri oraune
    const dropped = Math.floor(game.passengers * (0.3 + Math.random() * 0.4));
    if (dropped > 0) {
      game.passengers -= dropped;
      game.money += dropped * 15;
    }

    // Yatri chadne
    const canTake = game.capacity - game.passengers;
    const boarding = Math.min(canTake, game.waiting[i]);
    game.passengers += boarding;
    game.waiting[i] -= boarding;
    game.money += boarding * 10;

    showMsg(`${STOPS[i].name}: ${dropped} oralya, ${boarding} chadhe!`);
  }

  // Refuel
  if (refuelOnly && game.fuel < 100) {
    const cost = Math.ceil(100 - game.fuel) * 2;
    if (game.money >= cost) {
      game.money -= cost;
      game.fuel = 100;
      showMsg(`Diesel bharyo (Rs ${cost})`);
    } else {
      showMsg("Paisa pugena!");
    }
  }
}

// ---------- Update ----------
function update(dt) {
  if (!started || game.state !== "playing") return;

  game.time += dt;
  if (game.msgTimer > 0) game.msgTimer -= dt;

  const surf = surfaceAt(game.x);
  const grip = surf === "road" ? 1.0 : 0.55;
  const maxV = surf === "road" ? 260 : 130;

  const throttle = keys["ArrowRight"] || keys["KeyD"];
  const brake = keys["ArrowLeft"] || keys["KeyA"] || keys["ArrowDown"] || keys["KeyS"];
  const handbrake = keys["Space"];

  // Dhalan: uphill ma sust, downhill ma tej
  const slope = (groundY(game.x + 6) - groundY(game.x - 6)) / 12;
  const gravityAccel = slope * 420;

  // Accelerate
  if (throttle && game.fuel > 0 && game.v < maxV) {
    game.v += 110 * grip * dt * (1 - game.v / maxV);
  }
  // Brake
  if (brake && game.v > 0) game.v -= 260 * dt;
  // Handbrake
  if (handbrake) game.v *= (1 - 2.5 * dt);

  game.v += gravityAccel * dt;
  game.v *= (1 - 0.12 * dt);
  if (Math.abs(game.v) < 0.5 && !throttle) game.v = 0;
  if (game.v < 0) game.v = 0;

  // Offroad ma bump ra damage
  if (surf === "offroad" && game.v > 90) {
    game.damage += (game.v / 300) * dt * 6;
    if (Math.random() < 0.01) showMsg("Khadda! Bus hallyo...");
  }

  // Diesel kharcha
  if (game.v > 1) game.fuel -= (0.25 + game.v / 500) * dt;
  if (game.fuel < 0) game.fuel = 0;

  // Position
  game.x += game.v * dt;
  game.wheelAngle += game.v * dt * 0.05;

  // Win / lose
  if (game.x >= END_X) {
    game.x = END_X;
    game.state = "win";
    return;
  }
  if (game.damage >= 100) {
    game.damage = 100;
    game.state = "lose";
    showMsg("Bus bigryo! Game over");
    return;
  }
  if (game.fuel <= 0 && game.v < 2) {
    game.state = "lose";
    showMsg("Diesel sakiyo! Game over");
    return;
  }

  // Stop ma pugda auto ma action
  if (game.v < 2) {
    const i = currentStopIndex();
    if (i >= 0 && !game.served.has(i)) tryStopAction(false);
  }
}

// ---------- Draw ----------
let camX = 0;

function draw() {
  // Aakash
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#5fa8e0");
  sky.addColorStop(1, "#cfe9ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  camX = Math.max(0, game.x - W * 0.35);

  // Himal (parallax)
  ctx.fillStyle = "#7d8fa6";
  for (let i = 0; i < 12; i++) {
    const mx = i * 220 - (camX * 0.2) % 220;
    ctx.beginPath();
    ctx.moveTo(mx, 260);
    ctx.lineTo(mx + 110, 130 + (i % 3) * 25);
    ctx.lineTo(mx + 220, 260);
    ctx.fill();
  }

  // Pahad
  ctx.fillStyle = "#4e7a3a";
  for (let i = 0; i < 14; i++) {
    const mx = i * 180 - (camX * 0.45) % 180;
    ctx.beginPath();
    ctx.moveTo(mx, 320);
    ctx.lineTo(mx + 90, 240 + (i % 2) * 20);
    ctx.lineTo(mx + 180, 320);
    ctx.fill();
  }

  // Bhui ra sadak
  for (let sx = 0; sx < W; sx += 4) {
    const wx = sx + camX;
    const gy = groundY(wx);
    const surf = surfaceAt(wx);
    ctx.fillStyle = surf === "road" ? "#3a3a3a" : "#6b4f2a";
    ctx.fillRect(sx, gy, 4, H - gy);

    if (surf === "road") {
      if (Math.floor(wx / 60) % 2 === 0) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(sx, gy + 4, 4, 3);
      }
    } else {
      ctx.fillStyle = "#4a7c2a";
      ctx.fillRect(sx, gy, 4, 3);
    }
  }

  // Stop ko bord
  for (let i = 0; i < STOPS.length; i++) {
    const sx = STOPS[i].x - camX;
    if (sx < -100 || sx > W + 100) continue;
    const gy = groundY(STOPS[i].x);

    ctx.fillStyle = "#333";
    ctx.fillRect(sx - 3, gy - 70, 6, 70);

    ctx.fillStyle = game.served.has(i) ? "#2e8b57" : "#e8b600";
    ctx.fillRect(sx - 70, gy - 90, 140, 24);

    ctx.fillStyle = "#000";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(STOPS[i].name, sx, gy - 73);

    ctx.fillStyle = "#fff";
    ctx.fillRect(sx - 40, gy - 60, 80, 18);
    ctx.fillStyle = "#000";
    ctx.font = "12px Arial";
    ctx.fillText(`Yatri: ${game.waiting[i]}`, sx, gy - 47);
  }

  drawBus();
  drawHUD();

  if (!started) drawStartScreen();
  else if (game.state !== "playing") drawEndScreen();
}

function drawBus() {
  const bx = game.x - camX;
  const by = groundY(game.x);
  const slope = (groundY(game.x + 6) - groundY(game.x - 6)) / 12;
  const angle = Math.atan(slope) * 0.6;

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(angle);

  // Sharir
  ctx.fillStyle = "#e63946";
  ctx.fillRect(-90, -70, 180, 55);
  ctx.fillStyle = "#ffd60a";
  ctx.fillRect(-90, -20, 180, 8);
  ctx.fillStyle = "#c1121f";
  ctx.fillRect(-90, -80, 180, 12);

  // Windows
  ctx.fillStyle = "#a8dadc";
  for (let i = -80; i < 60; i += 28) ctx.fillRect(i, -62, 22, 26);
  ctx.fillRect(65, -62, 20, 24);

  // Front light
  ctx.fillStyle = "#fff3b0";
  ctx.fillRect(82, -40, 8, 10);

  // Naam
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("NEPAL BUS", 0, -30);

  // Pangra
  ctx.fillStyle = "#111";
  for (const wx of [-60, 55]) {
    ctx.save();
    ctx.translate(wx, -12);
    ctx.rotate(game.wheelAngle);
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(10, 10, 300, 135);
  ctx.fillStyle = "#fff";
  ctx.font = "16px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Speed: ${Math.round(game.v * 0.3)} km/h`, 20, 36);
  ctx.fillText(`Diesel: ${Math.round(game.fuel)}%`, 20, 60);
  ctx.fillText(`Damage: ${Math.round(game.damage)}%`, 20, 84);
  ctx.fillText(`Yatri: ${game.passengers}/${game.capacity}`, 20, 108);
  ctx.fillText(`Paisa: Rs ${game.money}`, 20, 132);

  // Progress bar
  const pct = Math.min(1, game.x / END_X);
  ctx.fillStyle = "#333";
  ctx.fillRect(W - 320, 20, 300, 12);
  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(W - 320, 20, 300 * pct, 12);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "right";
  ctx.font = "13px Arial";
  ctx.fillText(`${Math.round(pct * 100)}%`, W - 20, 45);

  // Surface
  const surf = surfaceAt(game.x) === "road" ? "Pakko sadak" : "Off-road (khadda)";
  ctx.textAlign = "center";
  ctx.fillText(surf, W / 2, 30);

  // Controls
  ctx.textAlign = "left";
  ctx.font = "12px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("→ Gas | ← Brake | Space: Handbrake | E: Diesel", 20, H - 12);

  // Message
  if (game.msgTimer > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(W / 2 - 170, H - 90, 340, 34);
    ctx.fillStyle = "#ffd60a";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(game.message, W / 2, H - 67);
  }
}

function drawStartScreen() {
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 40px Arial";
  ctx.fillText("Nepal Bus Simulator", W / 2, H / 2 - 40);
  ctx.font = "18px Arial";
  ctx.fillText("Kathmandu bata Pokhara samma pugnus!", W / 2, H / 2);
  ctx.fillText("Enter dabaunu = suru garnu", W / 2, H / 2 + 40);
}

function drawEndScreen() {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 36px Arial";
  ctx.fillText(game.state === "win" ? "Pokhara pugyo! Shabash!" : "Game Over", W / 2, H / 2 - 20);
  ctx.font = "18px Arial";
  ctx.fillText(`Kamai: Rs ${game.money} | Samay: ${Math.floor(game.time)}s`, W / 2, H / 2 + 15);
  ctx.fillText("R dabaunu = fer suru", W / 2, H / 2 + 45);
}

// ---------- Loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop); 
