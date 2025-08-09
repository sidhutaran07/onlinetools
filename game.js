// Penguin Dash - HTML5 Canvas Runner
// High-level architecture: Game (loop/state), Player, ObstaclePool, Audio, UI wiring

const CONFIG = {
  canvasHeight: 320,
  groundRatioY: 0.82, // ground position as ratio of canvas height
  player: {
    width: 50,
    height: 60,
    jumpVelocity: 780, // px/s
    gravity: 2200, // px/s^2
  },
  speed: {
    base: 300, // px/s
    accel: 38, // px/s^2 (increases base speed gradually)
    max: 1100,
  },
  spawn: {
    minInterval: 0.55, // seconds
    maxInterval: 1.6, // seconds
  },
  obstacle: {
    minHeight: 28,
    maxHeight: 70,
    minWidth: 18,
    maxWidth: 34,
  },
  fonts: {
    emoji: '72px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif',
    hud: '600 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  },
  colors: {
    ground: '#1b2847',
    sky: '#0b1220',
    obstacle: '#a3ffb0',
    obstacleShadow: 'rgba(163,255,176,0.2)',
    playerShadow: 'rgba(0,0,0,0.3)'
  }
};

const AVATARS = {
  penguin: { emoji: '🐧', color: '#9ed5ff' },
  bunny:   { emoji: '🐰', color: '#ffd4e2' },
  robot:   { emoji: '🤖', color: '#d6d6ff' },
};

class AudioManager {
  constructor() {
    this.ctx = null;
  }
  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  playJump() {
    try {
      this.ensure();
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch { /* no-op */ }
  }
  playGameOver() {
    try {
      this.ensure();
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.28);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } catch { /* no-op */ }
  }
}

class Player {
  constructor(getSelectedAvatar) {
    this.getSelectedAvatar = getSelectedAvatar;
    this.width = CONFIG.player.width;
    this.height = CONFIG.player.height;
    this.reset();
  }
  reset() {
    this.x = 90;
    this.y = 0; // will be set on first update via groundY
    this.vy = 0;
    this.onGround = false;
  }
  setGroundY(groundY) {
    if (!this._groundY) {
      this._groundY = groundY;
      this.y = groundY - this.height;
      this.onGround = true;
    } else {
      this._groundY = groundY;
    }
  }
  jump() {
    if (this.onGround) {
      this.vy = -CONFIG.player.jumpVelocity;
      this.onGround = false;
      return true;
    }
    return false;
  }
  update(dt) {
    this.vy += CONFIG.player.gravity * dt;
    this.y += this.vy * dt;
    if (this.y + this.height >= this._groundY) {
      this.y = this._groundY - this.height;
      this.vy = 0;
      this.onGround = true;
    }
  }
  getBounds() {
    return { x: this.x, y: this.y, w: this.width, h: this.height };
  }
  draw(ctx) {
    // shadow
    ctx.fillStyle = CONFIG.colors.playerShadow;
    const shadowW = this.width * 0.9;
    const shadowH = 8;
    ctx.beginPath();
    ctx.ellipse(
      this.x + this.width / 2,
      this._groundY + 2,
      shadowW / 2,
      shadowH,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // body (rounded rectangle)
    ctx.fillStyle = AVATARS[this.getSelectedAvatar()].color;
    roundRect(ctx, this.x, this.y, this.width, this.height, 12);
    ctx.fill();

    // emoji face overlay
    ctx.save();
    ctx.font = CONFIG.fonts.emoji;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const emoji = AVATARS[this.getSelectedAvatar()].emoji;
    ctx.fillText(emoji, this.x + this.width / 2, this.y + this.height / 2 + 4);
    ctx.restore();
  }
}

class ObstaclePool {
  constructor() {
    this.items = [];
    this._spawnTimer = 0;
  }
  reset() {
    this.items = [];
    this._spawnTimer = 0;
  }
  update(dt, speed, groundY) {
    const interval = mapRange(speed, CONFIG.speed.base, CONFIG.speed.max, CONFIG.spawn.maxInterval, CONFIG.spawn.minInterval);
    this._spawnTimer += dt;
    if (this._spawnTimer >= interval) {
      this._spawnTimer = 0;
      const h = randInt(CONFIG.obstacle.minHeight, CONFIG.obstacle.maxHeight);
      const w = randInt(CONFIG.obstacle.minWidth, CONFIG.obstacle.maxWidth);
      const y = groundY - h;
      const spawnX = ctxRef.canvas.width / gameDpr - (-10);
      this.items.push({ x: spawnX, y, w, h });
    }

    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const o = this.items[i];
      o.x -= speed * dt;
      if (o.x + o.w < -60) this.items.splice(i, 1);
    }
  }
  draw(ctx) {
    for (const o of this.items) {
      // soft glow
      ctx.fillStyle = CONFIG.colors.obstacleShadow;
      roundRect(ctx, o.x - 4, o.y + 4, o.w + 8, o.h + 8, 6);
      ctx.fill();
      // body
      ctx.fillStyle = CONFIG.colors.obstacle;
      roundRect(ctx, o.x, o.y, o.w, o.h, 6);
      ctx.fill();
    }
  }
}

class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    ctxRef = this.ctx; // set global reference for obstacle pool spawn width

    this.ui = ui;

    this.player = new Player(() => this.selectedAvatar);
    this.obstacles = new ObstaclePool();
    this.audio = new AudioManager();

    this.running = false;
    this.gameOver = false;

    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.resize();

    this._bindControls();
    this._showOverlay('Press Start', 'Choose an avatar, then start the run!');

    this.highScore = Number(localStorage.getItem('pdash-highscore') || 0);
    this.ui.highScore.textContent = String(Math.floor(this.highScore));
  }

  _bindControls() {
    const onJump = () => {
      if (!this.running) return;
      const did = this.player.jump();
      if (did) this.audio.playJump();
    };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        onJump();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.restart();
      }
    });

    this.canvas.addEventListener('pointerdown', () => onJump());

    this.ui.startBtn.addEventListener('click', () => this.start());
    this.ui.restartBtn.addEventListener('click', () => this.restart());
  }

  resize() {
    // Fit canvas width to element CSS size while maintaining height
    const cssWidth = this.canvas.clientWidth || this.canvas.width;
    const cssHeight = CONFIG.canvasHeight;

    const displayWidth = Math.floor(cssWidth * this.dpr);
    const displayHeight = Math.floor(cssHeight * this.dpr);

    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
    }

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    gameDpr = this.dpr;

    this.groundY = CONFIG.canvasHeight * CONFIG.groundRatioY;
    this.player.setGroundY(this.groundY);

    this._drawStaticBackground();
  }

  _drawStaticBackground() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, CONFIG.canvasHeight);
    grad.addColorStop(0, '#0d1630');
    grad.addColorStop(1, '#0a1124');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.canvas.width, CONFIG.canvasHeight);

    // Ground
    ctx.fillStyle = CONFIG.colors.ground;
    ctx.fillRect(0, this.groundY, this.canvas.width, CONFIG.canvasHeight - this.groundY);

    // subtle stars
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const x = (i * 127) % (this.canvas.width / this.dpr);
      const y = 30 + (i * 71) % (this.groundY - 50);
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
  }

  start() {
    if (this.running) return;
    this.audio.ensure();
    this.selectedAvatar = this._getSelectedAvatarFromUI();

    this.elapsed = 0;
    this.score = 0;
    this.speed = CONFIG.speed.base;
    this.player.reset();
    this.player.setGroundY(this.groundY);
    this.obstacles.reset();
    this.running = true;
    this.gameOver = false;
    this._hideOverlay();

    this.lastTs = performance.now();
    this._raf = requestAnimationFrame((ts) => this._loop(ts));
  }

  restart() {
    if (!this.running && !this.gameOver) {
      this.start();
      return;
    }
    this.running = false;
    cancelAnimationFrame(this._raf);
    this._showOverlay('Restarted', 'Press Start to run again!');
    this.start();
  }

  _loop(ts) {
    const dt = Math.min(0.033, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.elapsed += dt;

    // Increase speed over time
    this.speed = Math.min(CONFIG.speed.max, CONFIG.speed.base + CONFIG.speed.accel * this.elapsed);

    this.update(dt);
    this.draw();

    if (this.running) this._raf = requestAnimationFrame((t) => this._loop(t));
  }

  update(dt) {
    this.player.update(dt);
    this.obstacles.update(dt, this.speed, this.groundY);

    // collision
    const p = this.player.getBounds();
    for (const o of this.obstacles.items) {
      if (intersects(p, { x: o.x, y: o.y, w: o.w, h: o.h })) {
        this._onGameOver();
        return;
      }
    }

    // score proportional to distance
    this.score += this.speed * dt * 0.1;

    // HUD
    this.ui.score.textContent = String(Math.floor(this.score));
    this.ui.speed.textContent = `${Math.round(this.speed)} px/s`;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.ui.highScore.textContent = String(Math.floor(this.highScore));
      localStorage.setItem('pdash-highscore', String(Math.floor(this.highScore)));
    }
  }

  draw() {
    this._drawStaticBackground();

    // draw ground stripes parallax
    const ctx = this.ctx;
    const stripeY = this.groundY + 6;
    const stripeH = 3;
    const offset = (performance.now() / 1000 * this.speed) % 40;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = -offset; x < this.canvas.width / this.dpr; x += 40) {
      ctx.fillRect(x, stripeY, 20, stripeH);
    }

    this.obstacles.draw(ctx);
    this.player.draw(ctx);

    if (!this.running && !this.gameOver) {
      // idle hint
      ctx.save();
      ctx.font = CONFIG.fonts.hud;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('Press Start to play', 20, 28);
      ctx.restore();
    }
  }

  _onGameOver() {
    this.running = false;
    this.gameOver = true;
    cancelAnimationFrame(this._raf);
    this.audio.playGameOver();

    const score = Math.floor(this.score);
    const hs = Math.floor(this.highScore);

    this._showOverlay(
      'Game Over',
      `Score: ${score}  •  High: ${hs}`,
      true
    );
  }

  _showOverlay(title, desc, showRestart = false) {
    const node = this.ui.overlay;
    node.classList.remove('hidden');
    node.innerHTML = `
      <div>
        <div class="title">${title}</div>
        <div class="desc">${desc}</div>
        <div class="btns">
          <button class="btn primary" id="ovStart">Start</button>
          ${showRestart ? '<button class="btn" id="ovRestart">Restart</button>' : ''}
        </div>
        <div class="big">Choose avatar: 🐧 / 🐰 / 🤖</div>
      </div>
    `;
    node.querySelector('#ovStart')?.addEventListener('click', () => this.start());
    node.querySelector('#ovRestart')?.addEventListener('click', () => this.restart());
  }

  _hideOverlay() {
    this.ui.overlay.classList.add('hidden');
  }

  _getSelectedAvatarFromUI() {
    const checked = document.querySelector('input[name="avatar"]:checked');
    const value = checked?.value || 'penguin';
    return AVATARS[value] ? value : 'penguin';
  }
}

// Utilities
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  const clamped = Math.max(inMin, Math.min(inMax, value));
  const t = (clamped - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * t;
}

// global context reference used inside ObstaclePool for spawn X width
let ctxRef = null;
let gameDpr = 1;

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  const game = new Game(canvas, {
    startBtn: document.getElementById('startBtn'),
    restartBtn: document.getElementById('restartBtn'),
    score: document.getElementById('score'),
    highScore: document.getElementById('highScore'),
    speed: document.getElementById('speed'),
    overlay: document.getElementById('overlay'),
  });

  // Update selected avatar live
  document.querySelectorAll('input[name="avatar"]').forEach((el) => {
    el.addEventListener('change', () => {
      // Simply redraw background and player with the new selection if idle
      if (!game.running) game.draw();
    });
  });
});