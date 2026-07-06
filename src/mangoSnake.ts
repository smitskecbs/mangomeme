/**
 * ManGo Snake — tweak gameplay here.
 */
import { isHighScoreSharingEnabled, submitSnakeHighscore } from "./snakeHighscoreSubmit.ts";

const CONFIG = {
  gridCells: 18,
  tickMs: 130,
  initialLength: 3,
  pointsPerMango: 10,
  foodPopMs: 360,
  wallHitMs: 200,
  gameOverShakeMs: 200,
  storageKey: "mango-snake-high-score",
  playerNameKey: "mango-snake-player-name",
  bodyRadiusRatio: 0.36,
  headRadiusRatio: 0.46,
  colors: {
    snakeHead: "#5ed9a0",
    snakeHeadAccent: "#4ecf8e",
    snakeBody: "#2d9a6e",
    snakeBodyLight: "#3ecf8e",
    snakeStroke: "rgba(255, 255, 255, 0.2)",
    snakeHeadGlow: "rgba(94, 217, 160, 0.35)",
    mangoGlow: "rgba(255, 179, 71, 0.5)",
    mangoGlowSoft: "rgba(255, 214, 102, 0.22)",
    idleOverlay: "rgba(6, 42, 58, 0.22)",
  },
} as const;

type GameState = "idle" | "playing" | "ending" | "over";
type DeathReason = "wall" | "self";
type Direction = "up" | "down" | "left" | "right";

interface Point {
  x: number;
  y: number;
}

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export function initMangoSnake(): void {
  const canvas = document.getElementById("ms-canvas") as HTMLCanvasElement | null;
  const scoreNode = document.getElementById("ms-score");
  const highNode = document.getElementById("ms-high-score");
  const msgNode = document.getElementById("ms-message");
  const restartNode = document.getElementById("ms-restart") as HTMLButtonElement | null;
  const startBtn = document.getElementById("ms-start") as HTMLButtonElement | null;
  const sharePanel = document.getElementById("ms-highscore-share");
  const playerNameInput = document.getElementById("ms-player-name") as HTMLInputElement | null;
  const submitScoreBtn = document.getElementById("ms-submit-score") as HTMLButtonElement | null;
  const skipScoreBtn = document.getElementById("ms-skip-score") as HTMLButtonElement | null;

  if (!canvas || !scoreNode || !highNode || !msgNode || !restartNode) {
    return;
  }

  const gfx = canvas.getContext("2d");

  if (!gfx) {
    return;
  }

  runMangoSnake(
    canvas,
    gfx,
    scoreNode,
    highNode,
    msgNode,
    restartNode,
    startBtn,
    sharePanel,
    playerNameInput,
    submitScoreBtn,
    skipScoreBtn,
    document.getElementById("ms-up"),
    document.getElementById("ms-down"),
    document.getElementById("ms-left"),
    document.getElementById("ms-right")
  );
}

function runMangoSnake(
  cnv: HTMLCanvasElement,
  gfx: CanvasRenderingContext2D,
  scoreNode: HTMLElement,
  highNode: HTMLElement,
  msgNode: HTMLElement,
  restartNode: HTMLButtonElement,
  startBtn: HTMLButtonElement | null,
  sharePanel: HTMLElement | null,
  playerNameInput: HTMLInputElement | null,
  submitScoreBtn: HTMLButtonElement | null,
  skipScoreBtn: HTMLButtonElement | null,
  upBtn: HTMLElement | null,
  downBtn: HTMLElement | null,
  leftBtn: HTMLElement | null,
  rightBtn: HTMLElement | null
): void {
  let state: GameState = "idle";
  let snake: Point[] = [];
  let direction: Direction = "right";
  let nextDirection: Direction = "right";
  let food: Point = { x: 0, y: 0 };
  let foodPopStart = 0;
  let score = 0;
  let highScore = loadHighScore();
  let highScoreAtGameStart = highScore;
  let pendingShareScore = 0;
  let lastTick = 0;
  let animationId = 0;
  let gridCols = CONFIG.gridCells;
  let gridRows = CONFIG.gridCells;
  let cellW = 0;
  let cellH = 0;
  let width = 0;
  let height = 0;
  let endTimeoutId = 0;

  const keys = new Set<string>();
  const arena = cnv.parentElement;

  function loadHighScore(): number {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      const parsed = raw ? Number.parseInt(raw, 10) : 0;
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    } catch {
      return 0;
    }
  }

  function saveHighScore(value: number): void {
    try {
      localStorage.setItem(CONFIG.storageKey, String(value));
    } catch {
      // ignore storage failures
    }
  }

  function savePlayerName(name: string): void {
    try {
      localStorage.setItem(CONFIG.playerNameKey, name);
    } catch {
      // ignore storage failures
    }
  }

  function loadPlayerName(): string {
    try {
      return localStorage.getItem(CONFIG.playerNameKey) || "";
    } catch {
      return "";
    }
  }

  function hideSharePanel(): void {
    if (sharePanel) {
      sharePanel.hidden = true;
    }
    pendingShareScore = 0;
  }

  function showSharePanel(newScore: number): void {
    if (!isHighScoreSharingEnabled() || !sharePanel) {
      return;
    }

    pendingShareScore = newScore;
    sharePanel.hidden = false;

    if (playerNameInput) {
      playerNameInput.value = loadPlayerName();
    }
  }

  function updateHud(): void {
    scoreNode.textContent = String(score);
    highNode.textContent = String(highScore);
  }

  function resetSnake(): void {
    const midY = Math.floor(gridRows / 2);
    const midX = Math.floor(gridCols / 2);

    snake = Array.from({ length: CONFIG.initialLength }, (_, index) => ({
      x: midX - index,
      y: midY,
    }));

    direction = "right";
    nextDirection = "right";
    score = 0;
    spawnFood();
    updateHud();
  }

  function spawnFood(): void {
    const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
    let candidate: Point;

    do {
      candidate = {
        x: Math.floor(Math.random() * gridCols),
        y: Math.floor(Math.random() * gridRows),
      };
    } while (occupied.has(`${candidate.x},${candidate.y}`));

    food = candidate;
    foodPopStart = performance.now();
  }

  function isOutOfBounds(point: Point): boolean {
    return point.x < 0 || point.x >= gridCols || point.y < 0 || point.y >= gridRows;
  }

  function clearArenaEffects(): void {
    arena?.classList.remove("labs-game-wrap--wall-hit", "labs-game-wrap--shake");
  }

  function startGame(): void {
    if (endTimeoutId) {
      window.clearTimeout(endTimeoutId);
      endTimeoutId = 0;
    }

    clearArenaEffects();
    hideSharePanel();
    highScoreAtGameStart = highScore;
    resetSnake();
    state = "playing";
    lastTick = 0;
    msgNode.textContent = "Eat mangos. Stay inside the border!";
    restartNode.hidden = true;
    if (startBtn) {
      startBtn.hidden = true;
    }
  }

  function finalizeGameOver(message: string): void {
    const isNewPersonalBest = score > highScoreAtGameStart;

    state = "over";

    if (score > highScore) {
      highScore = score;
      saveHighScore(highScore);
    }

    if (isNewPersonalBest) {
      showSharePanel(score);
    }

    msgNode.textContent = message;
    restartNode.hidden = false;
    updateHud();
  }

  async function sharePendingScore(): Promise<void> {
    if (pendingShareScore <= 0) {
      hideSharePanel();
      return;
    }

    const name = playerNameInput?.value.trim() || "ManGo Player";
    savePlayerName(name);
    hideSharePanel();
    await submitSnakeHighscore(pendingShareScore, name);
  }

  function triggerGameOver(message: string, reason: DeathReason): void {
    if (state === "ending" || state === "over") {
      return;
    }

    state = "ending";

    if (reason === "wall") {
      clearArenaEffects();
      arena?.classList.add("labs-game-wrap--wall-hit");

      endTimeoutId = window.setTimeout(() => {
        arena?.classList.remove("labs-game-wrap--wall-hit");
        arena?.classList.add("labs-game-wrap--shake");
        finalizeGameOver(message);

        endTimeoutId = window.setTimeout(() => {
          arena?.classList.remove("labs-game-wrap--shake");
          endTimeoutId = 0;
        }, CONFIG.gameOverShakeMs);
      }, CONFIG.wallHitMs);

      return;
    }

    clearArenaEffects();
    arena?.classList.add("labs-game-wrap--shake");
    finalizeGameOver(message);

    endTimeoutId = window.setTimeout(() => {
      arena?.classList.remove("labs-game-wrap--shake");
      endTimeoutId = 0;
    }, CONFIG.gameOverShakeMs);
  }

  function resize(): void {
    const parent = cnv.parentElement;

    if (!parent) {
      return;
    }

    const displayWidth = Math.floor(parent.clientWidth);
    const displayHeight = Math.floor(parent.clientWidth);

    if (displayWidth < 1 || displayHeight < 1) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    width = displayWidth;
    height = displayHeight;
    gridCols = CONFIG.gridCells;
    gridRows = CONFIG.gridCells;
    cellW = width / gridCols;
    cellH = height / gridRows;

    cnv.width = Math.floor(width * dpr);
    cnv.height = Math.floor(height * dpr);

    gfx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }

  function setDirection(dir: Direction): void {
    if (state === "idle") {
      startGame();
    }

    if (state !== "playing") {
      return;
    }

    if (OPPOSITE[dir] === direction) {
      return;
    }

    nextDirection = dir;
  }

  function directionFromKey(code: string): Direction | null {
    switch (code) {
      case "ArrowUp":
      case "KeyW":
        return "up";
      case "ArrowDown":
      case "KeyS":
        return "down";
      case "ArrowLeft":
      case "KeyA":
        return "left";
      case "ArrowRight":
      case "KeyD":
        return "right";
      default:
        return null;
    }
  }

  function step(): void {
    direction = nextDirection;

    const head = snake[0];
    const nextHead: Point = { x: head.x, y: head.y };

    switch (direction) {
      case "up":
        nextHead.y -= 1;
        break;
      case "down":
        nextHead.y += 1;
        break;
      case "left":
        nextHead.x -= 1;
        break;
      case "right":
        nextHead.x += 1;
        break;
      default:
        break;
    }

    if (isOutOfBounds(nextHead)) {
      triggerGameOver("Game over — you hit the wall!", "wall");
      return;
    }

    const willEat = nextHead.x === food.x && nextHead.y === food.y;
    const bodyToCheck = willEat ? snake : snake.slice(0, -1);

    if (bodyToCheck.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y)) {
      triggerGameOver("Game over — you bit yourself!", "self");
      return;
    }

    snake.unshift(nextHead);

    if (willEat) {
      score += CONFIG.pointsPerMango;
      if (score > highScore) {
        highScore = score;
        saveHighScore(highScore);
      }
      spawnFood();
      updateHud();
    } else {
      snake.pop();
    }
  }

  function segmentCenter(segment: Point): { cx: number; cy: number } {
    return {
      cx: (segment.x + 0.5) * cellW,
      cy: (segment.y + 0.5) * cellH,
    };
  }

  function bodyColorAlongSnake(index: number): string {
    if (index === 0) {
      return CONFIG.colors.snakeHead;
    }

    return index % 2 === 0 ? CONFIG.colors.snakeBodyLight : CONFIG.colors.snakeBody;
  }

  function drawBackground(): void {
    gfx.clearRect(0, 0, width, height);
  }

  function drawSnake(): void {
    if (snake.length === 0) {
      return;
    }

    const bodyR = Math.min(cellW, cellH) * CONFIG.bodyRadiusRatio;
    const headR = Math.min(cellW, cellH) * CONFIG.headRadiusRatio;
    const points = snake.map(segmentCenter);

    gfx.lineCap = "round";
    gfx.lineJoin = "round";

    for (let index = points.length - 1; index > 0; index -= 1) {
      const from = points[index];
      const to = points[index - 1];

      gfx.strokeStyle = bodyColorAlongSnake(index);
      gfx.lineWidth = bodyR * 2.05;
      gfx.beginPath();
      gfx.moveTo(from.cx, from.cy);
      gfx.lineTo(to.cx, to.cy);
      gfx.stroke();
    }

    for (let index = snake.length - 1; index > 0; index -= 1) {
      const { cx, cy } = points[index];

      gfx.fillStyle = bodyColorAlongSnake(index);
      gfx.beginPath();
      gfx.arc(cx, cy, bodyR, 0, Math.PI * 2);
      gfx.fill();
    }

    const head = points[0];
    const headGlow = gfx.createRadialGradient(head.cx, head.cy, headR * 0.2, head.cx, head.cy, headR * 1.5);
    headGlow.addColorStop(0, CONFIG.colors.snakeHeadGlow);
    headGlow.addColorStop(1, "rgba(94, 217, 160, 0)");
    gfx.fillStyle = headGlow;
    gfx.beginPath();
    gfx.arc(head.cx, head.cy, headR * 1.5, 0, Math.PI * 2);
    gfx.fill();

    const headFill = gfx.createRadialGradient(
      head.cx - headR * 0.2,
      head.cy - headR * 0.25,
      headR * 0.1,
      head.cx,
      head.cy,
      headR
    );
    headFill.addColorStop(0, CONFIG.colors.snakeHead);
    headFill.addColorStop(1, CONFIG.colors.snakeHeadAccent);
    gfx.fillStyle = headFill;
    gfx.beginPath();
    gfx.arc(head.cx, head.cy, headR, 0, Math.PI * 2);
    gfx.fill();

    gfx.strokeStyle = CONFIG.colors.snakeStroke;
    gfx.lineWidth = 1.5;
    gfx.stroke();

    const eyeOffset = headR * 0.28;
    const eyeR = headR * 0.11;
    let eyeAx = head.cx;
    let eyeAy = head.cy;
    let eyeBx = head.cx;
    let eyeBy = head.cy;

    switch (direction) {
      case "up":
        eyeAx -= eyeOffset;
        eyeBx += eyeOffset;
        eyeAy -= eyeOffset * 0.35;
        eyeBy -= eyeOffset * 0.35;
        break;
      case "down":
        eyeAx -= eyeOffset;
        eyeBx += eyeOffset;
        eyeAy += eyeOffset * 0.35;
        eyeBy += eyeOffset * 0.35;
        break;
      case "left":
        eyeAx -= eyeOffset * 0.35;
        eyeBx -= eyeOffset * 0.35;
        eyeAy -= eyeOffset;
        eyeBy += eyeOffset;
        break;
      case "right":
        eyeAx += eyeOffset * 0.35;
        eyeBx += eyeOffset * 0.35;
        eyeAy -= eyeOffset;
        eyeBy += eyeOffset;
        break;
      default:
        break;
    }

    gfx.fillStyle = "rgba(255, 255, 255, 0.92)";
    gfx.beginPath();
    gfx.arc(eyeAx, eyeAy, eyeR, 0, Math.PI * 2);
    gfx.arc(eyeBx, eyeBy, eyeR, 0, Math.PI * 2);
    gfx.fill();

    gfx.fillStyle = "rgba(8, 52, 74, 0.85)";
    gfx.beginPath();
    gfx.arc(eyeAx, eyeAy, eyeR * 0.45, 0, Math.PI * 2);
    gfx.arc(eyeBx, eyeBy, eyeR * 0.45, 0, Math.PI * 2);
    gfx.fill();
  }

  function drawFood(now: number): void {
    const cx = (food.x + 0.5) * cellW;
    const cy = (food.y + 0.5) * cellH;
    const elapsed = now - foodPopStart;
    const t = Math.min(1, elapsed / CONFIG.foodPopMs);
    const ease = 1 - (1 - t) ** 3;
    const scale = 0.35 + ease * 0.65;
    const alpha = 0.55 + ease * 0.45;
    const cell = Math.min(cellW, cellH);
    const fontSize = Math.floor(cell * 0.82);
    const glowR = cell * (0.55 + ease * 0.15);

    const glow = gfx.createRadialGradient(cx, cy, glowR * 0.1, cx, cy, glowR);
    glow.addColorStop(0, CONFIG.colors.mangoGlow);
    glow.addColorStop(0.55, CONFIG.colors.mangoGlowSoft);
    glow.addColorStop(1, "rgba(255, 179, 71, 0)");
    gfx.fillStyle = glow;
    gfx.beginPath();
    gfx.arc(cx, cy, glowR, 0, Math.PI * 2);
    gfx.fill();

    if (t < 1) {
      const ringR = cell * (0.3 + ease * 0.5);
      gfx.strokeStyle = CONFIG.colors.mangoGlow;
      gfx.lineWidth = 2.5 * (1 - t);
      gfx.beginPath();
      gfx.arc(cx, cy, ringR, 0, Math.PI * 2);
      gfx.stroke();
    }

    gfx.save();
    gfx.globalAlpha = alpha;
    gfx.translate(cx, cy);
    gfx.scale(scale, scale);
    gfx.font = `${fontSize}px serif`;
    gfx.textAlign = "center";
    gfx.textBaseline = "middle";
    gfx.fillText("🥭", 0, 1);
    gfx.restore();

    gfx.textAlign = "left";
    gfx.textBaseline = "alphabetic";
    gfx.globalAlpha = 1;
  }

  function drawOverlay(): void {
    if (state !== "idle") {
      return;
    }

    gfx.fillStyle = CONFIG.colors.idleOverlay;
    gfx.fillRect(0, 0, width, height);

    gfx.fillStyle = "rgba(255, 255, 255, 0.92)";
    gfx.font = '600 15px "Nunito", sans-serif';
    gfx.textAlign = "center";
    gfx.fillText("Press Start to play", width / 2, height / 2);
    gfx.textAlign = "left";
  }

  function draw(now: number): void {
    drawBackground();
    drawFood(now);
    drawSnake();
    drawOverlay();
  }

  function loop(timestamp: number): void {
    if (state === "playing") {
      if (!lastTick) {
        lastTick = timestamp;
      }

      if (timestamp - lastTick >= CONFIG.tickMs) {
        lastTick = timestamp;
        step();
      }
    }

    draw(timestamp);
    animationId = requestAnimationFrame(loop);
  }

  function bindDirectionButton(btn: HTMLElement | null, dir: Direction): void {
    if (!btn) {
      return;
    }

    btn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      setDirection(dir);
    });
  }

  window.addEventListener("keydown", (event) => {
    const dir = directionFromKey(event.code);

    if (!dir) {
      if (event.code === "Space" && state === "idle") {
        event.preventDefault();
        startGame();
      }
      return;
    }

    event.preventDefault();
    keys.add(event.code);
    setDirection(dir);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  restartNode.addEventListener("click", () => {
    startGame();
  });

  startBtn?.addEventListener("click", () => {
    startGame();
  });

  submitScoreBtn?.addEventListener("click", () => {
    void sharePendingScore();
  });

  skipScoreBtn?.addEventListener("click", () => {
    hideSharePanel();
  });

  bindDirectionButton(upBtn, "up");
  bindDirectionButton(downBtn, "down");
  bindDirectionButton(leftBtn, "left");
  bindDirectionButton(rightBtn, "right");

  const resizeObserver = new ResizeObserver(() => {
    resize();
  });

  if (cnv.parentElement) {
    resizeObserver.observe(cnv.parentElement);
  }

  window.addEventListener("resize", resize);

  highScore = loadHighScore();
  resetSnake();
  resize();
  updateHud();
  msgNode.textContent = "Use arrow keys or WASD. On mobile, use the pad below.";
  animationId = requestAnimationFrame(loop);

  window.addEventListener("beforeunload", () => {
    if (endTimeoutId) {
      window.clearTimeout(endTimeoutId);
    }
    resizeObserver.disconnect();
    cancelAnimationFrame(animationId);
  });
}
