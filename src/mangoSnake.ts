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
  bonusEvery: 5,
  bonusPoints: 50,
  bonusLifetimeMs: 4000,
  growthGlowMs: 420,
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
    bonusGlow: "rgba(255, 214, 102, 0.65)",
    playfield: "#062a3a",
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

interface BonusMango {
  x: number;
  y: number;
  spawnedAt: number;
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
  const gameModal = document.getElementById("ms-game-modal");
  const shareModal = document.getElementById("ms-share-modal");
  const closeGameBtn = document.getElementById("ms-close-game") as HTMLButtonElement | null;
  const shareScoreNode = document.getElementById("ms-share-score");
  const shareStatusNode = document.getElementById("ms-share-status");
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
    gameModal,
    shareModal,
    closeGameBtn,
    shareScoreNode,
    shareStatusNode,
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
  gameModal: HTMLElement | null,
  shareModal: HTMLElement | null,
  closeGameBtn: HTMLButtonElement | null,
  shareScoreNode: HTMLElement | null,
  shareStatusNode: HTMLElement | null,
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
  let bonusMango: BonusMango | null = null;
  let mangoesEaten = 0;
  let score = 0;
  let highScore = loadHighScore();
  let highScoreAtGameStart = highScore;
  let pendingShareScore = 0;
  let isSubmittingScore = false;
  let lastTick = 0;
  let animationId = 0;
  let gridCols = CONFIG.gridCells;
  let gridRows = CONFIG.gridCells;
  let cellW = 0;
  let cellH = 0;
  let width = 0;
  let height = 0;
  let endTimeoutId = 0;
  let growthGlowUntil = 0;

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

  function setShareStatus(message: string, tone: "default" | "success" | "error" = "default"): void {
    if (!shareStatusNode) {
      return;
    }

    shareStatusNode.textContent = message;
    shareStatusNode.classList.remove(
      "labs-highscore-share__status--success",
      "labs-highscore-share__status--error"
    );

    if (tone === "success") {
      shareStatusNode.classList.add("labs-highscore-share__status--success");
    } else if (tone === "error") {
      shareStatusNode.classList.add("labs-highscore-share__status--error");
    }
  }

  function openGameModal(): void {
    gameModal?.removeAttribute("hidden");
    document.body.classList.add("labs-game-modal-open");
    window.requestAnimationFrame(() => {
      resize();
    });
  }

  function closeGameModal(): void {
    gameModal?.setAttribute("hidden", "");
    document.body.classList.remove("labs-game-modal-open");
  }

  function openShareModal(newScore: number): void {
    if (!isHighScoreSharingEnabled() || !shareModal) {
      return;
    }

    pendingShareScore = newScore;
    shareModal.removeAttribute("hidden");
    document.body.classList.add("labs-share-modal-open");

    if (shareScoreNode) {
      shareScoreNode.textContent = String(newScore);
    }

    if (playerNameInput) {
      playerNameInput.value = loadPlayerName();
      playerNameInput.disabled = false;
      playerNameInput.readOnly = false;
    }

    if (submitScoreBtn) {
      submitScoreBtn.disabled = false;
    }

    setShareStatus("");

    window.requestAnimationFrame(() => {
      playerNameInput?.focus();
      playerNameInput?.select();
    });
  }

  function closeShareModal(): void {
    shareModal?.setAttribute("hidden", "");
    document.body.classList.remove("labs-share-modal-open");
    pendingShareScore = 0;
    isSubmittingScore = false;

    if (submitScoreBtn) {
      submitScoreBtn.disabled = false;
    }

    if (skipScoreBtn) {
      skipScoreBtn.disabled = false;
    }

    setShareStatus("");
  }

  function updateHud(): void {
    scoreNode.textContent = String(score);
    highNode.textContent = String(highScore);
  }

  function occupiedCells(): Set<string> {
    const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
    occupied.add(`${food.x},${food.y}`);

    if (bonusMango) {
      occupied.add(`${bonusMango.x},${bonusMango.y}`);
    }

    return occupied;
  }

  function spawnAtRandomFreeCell(): Point {
    const occupied = occupiedCells();
    let candidate: Point;

    do {
      candidate = {
        x: Math.floor(Math.random() * gridCols),
        y: Math.floor(Math.random() * gridRows),
      };
    } while (occupied.has(`${candidate.x},${candidate.y}`));

    return candidate;
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
    mangoesEaten = 0;
    bonusMango = null;
    spawnFood();
    updateHud();
  }

  function spawnFood(): void {
    food = spawnAtRandomFreeCell();
    foodPopStart = performance.now();
  }

  function spawnBonusMango(): void {
    const occupied = occupiedCells();

    let candidate: Point;
    do {
      candidate = {
        x: Math.floor(Math.random() * gridCols),
        y: Math.floor(Math.random() * gridRows),
      };
    } while (occupied.has(`${candidate.x},${candidate.y}`));

    bonusMango = {
      x: candidate.x,
      y: candidate.y,
      spawnedAt: performance.now(),
    };
  }

  function clearExpiredBonus(now: number): void {
    if (!bonusMango) {
      return;
    }

    if (now - bonusMango.spawnedAt >= CONFIG.bonusLifetimeMs) {
      bonusMango = null;
    }
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

    closeShareModal();
    clearArenaEffects();
    openGameModal();
    highScoreAtGameStart = highScore;
    resetSnake();
    state = "playing";
    lastTick = 0;
    msgNode.textContent = "Eat mangos. Stay inside the border!";
    restartNode.hidden = true;
  }

  function finalizeGameOver(message: string): void {
    const isNewPersonalBest = score > highScoreAtGameStart;

    state = "over";

    if (score > highScore) {
      highScore = score;
      saveHighScore(highScore);
    }

    msgNode.textContent = message;
    restartNode.hidden = false;
    updateHud();

    if (isNewPersonalBest) {
      openShareModal(score);
    }
  }

  async function sharePendingScore(): Promise<void> {
    if (pendingShareScore <= 0 || isSubmittingScore) {
      return;
    }

    const name = playerNameInput?.value.trim() || "ManGo Player";
    isSubmittingScore = true;

    if (submitScoreBtn) {
      submitScoreBtn.disabled = true;
    }

    if (skipScoreBtn) {
      skipScoreBtn.disabled = true;
    }

    setShareStatus("Sharing score...");

    const result = await submitSnakeHighscore(pendingShareScore, name);

    isSubmittingScore = false;

    if (skipScoreBtn) {
      skipScoreBtn.disabled = false;
    }

    if (result.ok) {
      savePlayerName(name);
      setShareStatus("Score shared successfully!", "success");
      if (submitScoreBtn) {
        submitScoreBtn.disabled = true;
      }
      return;
    }

    if (submitScoreBtn) {
      submitScoreBtn.disabled = false;
    }

    if (result.mixedContent) {
      setShareStatus("Could not share: API must use HTTPS on mangomeme.fun.", "error");
      return;
    }

    setShareStatus(result.error || "Could not share score. Try again.", "error");
  }

  function isShareFormTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(target.closest("#ms-share-modal"));
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

  function step(now: number): void {
    clearExpiredBonus(now);
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

    const willEatFood = nextHead.x === food.x && nextHead.y === food.y;
    const willEatBonus =
      bonusMango !== null && nextHead.x === bonusMango.x && nextHead.y === bonusMango.y;
    const willGrow = willEatFood || willEatBonus;
    const bodyToCheck = willGrow ? snake : snake.slice(0, -1);

    if (bodyToCheck.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y)) {
      triggerGameOver("Game over — you bit yourself!", "self");
      return;
    }

    snake.unshift(nextHead);

    if (willEatFood) {
      score += CONFIG.pointsPerMango;
      mangoesEaten += 1;
      growthGlowUntil = now + CONFIG.growthGlowMs;

      if (mangoesEaten % CONFIG.bonusEvery === 0) {
        spawnBonusMango();
      }

      spawnFood();
    } else if (willEatBonus) {
      score += CONFIG.bonusPoints;
      bonusMango = null;
      growthGlowUntil = now + CONFIG.growthGlowMs;
    } else {
      snake.pop();
    }

    if (score > highScore) {
      highScore = score;
      saveHighScore(highScore);
    }

    updateHud();
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
    gfx.fillStyle = CONFIG.colors.playfield;
    gfx.fillRect(0, 0, width, height);
  }

  function drawGrowthGlow(now: number): void {
    if (snake.length === 0 || now >= growthGlowUntil) {
      return;
    }

    const remaining = growthGlowUntil - now;
    const strength = Math.max(0, remaining / CONFIG.growthGlowMs);
    const head = segmentCenter(snake[0]);
    const glowR = Math.min(cellW, cellH) * 2.4;
    const alpha = strength * 0.38;

    const glow = gfx.createRadialGradient(head.cx, head.cy, glowR * 0.1, head.cx, head.cy, glowR);
    glow.addColorStop(0, `rgba(94, 217, 160, ${alpha})`);
    glow.addColorStop(0.55, `rgba(94, 217, 160, ${alpha * 0.45})`);
    glow.addColorStop(1, "rgba(94, 217, 160, 0)");
    gfx.fillStyle = glow;
    gfx.beginPath();
    gfx.arc(head.cx, head.cy, glowR, 0, Math.PI * 2);
    gfx.fill();
  }

  function drawMangoEmoji(
    cx: number,
    cy: number,
    cell: number,
    scale: number,
    alpha: number,
    glowColor: string,
    glowScale: number
  ): void {
    const fontSize = Math.floor(cell * 0.82 * scale);
    const glowR = cell * glowScale;

    const glow = gfx.createRadialGradient(cx, cy, glowR * 0.1, cx, cy, glowR);
    glow.addColorStop(0, glowColor);
    glow.addColorStop(0.55, CONFIG.colors.mangoGlowSoft);
    glow.addColorStop(1, "rgba(255, 179, 71, 0)");
    gfx.fillStyle = glow;
    gfx.beginPath();
    gfx.arc(cx, cy, glowR, 0, Math.PI * 2);
    gfx.fill();

    gfx.save();
    gfx.globalAlpha = alpha;
    gfx.translate(cx, cy);
    gfx.font = `${fontSize}px serif`;
    gfx.textAlign = "center";
    gfx.textBaseline = "middle";
    gfx.fillText("🥭", 0, 1);
    gfx.restore();

    gfx.textAlign = "left";
    gfx.textBaseline = "alphabetic";
    gfx.globalAlpha = 1;
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

    if (t < 1) {
      const ringR = cell * (0.3 + ease * 0.5);
      gfx.strokeStyle = CONFIG.colors.mangoGlow;
      gfx.lineWidth = 2.5 * (1 - t);
      gfx.beginPath();
      gfx.arc(cx, cy, ringR, 0, Math.PI * 2);
      gfx.stroke();
    }

    drawMangoEmoji(cx, cy, cell, scale, alpha, CONFIG.colors.mangoGlow, 0.55 + ease * 0.15);
  }

  function drawBonusMango(now: number): void {
    if (!bonusMango) {
      return;
    }

    const cx = (bonusMango.x + 0.5) * cellW;
    const cy = (bonusMango.y + 0.5) * cellH;
    const cell = Math.min(cellW, cellH);
    const elapsed = now - bonusMango.spawnedAt;
    const lifeT = Math.min(1, elapsed / CONFIG.bonusLifetimeMs);
    const pulse = 1 + Math.sin(elapsed / 120) * 0.08;
    const alpha = 0.75 + (1 - lifeT) * 0.2;

    drawMangoEmoji(cx, cy, cell, 1.35 * pulse, alpha, CONFIG.colors.bonusGlow, 0.85);
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
    drawBonusMango(now);
    drawGrowthGlow(now);
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
        step(timestamp);
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
      if (isShareFormTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setDirection(dir);
    });
  }

  function restartWithDirection(dir?: Direction): void {
    startGame();

    if (dir) {
      direction = dir;
      nextDirection = dir;
    }
  }

  window.addEventListener("keydown", (event) => {
    if (isShareFormTarget(event.target)) {
      return;
    }

    const dir = directionFromKey(event.code);

    if (state === "over" && dir) {
      event.preventDefault();
      restartWithDirection(dir);
      return;
    }

    if (!dir) {
      if (event.code === "Space" && state === "idle") {
        event.preventDefault();
        startGame();
      }
      return;
    }

    if (state !== "playing") {
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
    restartWithDirection();
  });

  startBtn?.addEventListener("click", () => {
    startGame();
  });

  closeGameBtn?.addEventListener("click", () => {
    if (isSubmittingScore) {
      return;
    }

    if (endTimeoutId) {
      window.clearTimeout(endTimeoutId);
      endTimeoutId = 0;
    }

    clearArenaEffects();
    closeShareModal();
    closeGameModal();
    state = "idle";
    restartNode.hidden = true;
    msgNode.textContent = "Eat mangos. Stay inside the border!";
  });

  submitScoreBtn?.addEventListener("click", () => {
    void sharePendingScore();
  });

  skipScoreBtn?.addEventListener("click", () => {
    if (!isSubmittingScore) {
      closeShareModal();
    }
  });

  bindDirectionButton(upBtn, "up");
  bindDirectionButton(downBtn, "down");
  bindDirectionButton(leftBtn, "left");
  bindDirectionButton(rightBtn, "right");

  const resizeObserver = new ResizeObserver(() => {
    if (!gameModal?.hasAttribute("hidden")) {
      resize();
    }
  });

  if (cnv.parentElement) {
    resizeObserver.observe(cnv.parentElement);
  }

  window.addEventListener("resize", () => {
    if (!gameModal?.hasAttribute("hidden")) {
      resize();
    }
  });

  highScore = loadHighScore();
  resetSnake();
  updateHud();
  animationId = requestAnimationFrame(loop);

  window.addEventListener("beforeunload", () => {
    if (endTimeoutId) {
      window.clearTimeout(endTimeoutId);
    }
    resizeObserver.disconnect();
    cancelAnimationFrame(animationId);
  });
}
