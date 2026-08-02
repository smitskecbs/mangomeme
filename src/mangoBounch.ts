/**
 * ManGo Bounch — Bounce-style platformer V1.
 * Local best level always works; optional API submit on successful clears.
 */

import { resolveBounchContinueLevel } from "./bounchContinue.ts";
import {
  isBounchHighScoreSharingEnabled,
  submitBounchHighscore,
} from "./bounchHighscoreSubmit.ts";
import {
  BOUNCH_PLAYER_NAME_KEY,
  validateBounchPlayerName,
} from "./bounchPlayerName.ts";
import {
  formatBounchScoreResult,
  isBounchHighscoreApiResponse,
} from "./bounchScoreResult.ts";

const CONFIG = {
  storageKey: "mango-bounch-best-level",
  playerNameKey: BOUNCH_PLAYER_NAME_KEY,
  worldHeight: 420,
  gravity: 1400,
  bounceSpeed: 520,
  moveAccel: 1800,
  maxMoveSpeed: 260,
  moveFriction: 1400,
  mangoRadius: 16,
  colors: {
    ground: "#0b4f6c",
    platform: "#1a7a9e",
    platformTop: "#4ecdc4",
    spike: "#e88fa8",
    spikeEdge: "rgba(255, 255, 255, 0.25)",
    movingHazard: "#ff6b8a",
    movingHazardEdge: "rgba(255, 255, 255, 0.35)",
    ring: "#ffb347",
    ringInner: "#0b4f6c",
    finish: "#5ed9a0",
    finishPole: "rgba(255, 255, 255, 0.35)",
  },
} as const;

type GameState = "idle" | "naming" | "ready" | "playing" | "won" | "over";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RingDef {
  x: number;
  y: number;
  r: number;
}

interface LevelDef {
  id: number;
  name: string;
  worldWidth: number;
  startX: number;
  platforms: Rect[];
  spikes: Rect[];
  rings: RingDef[];
  finish: Rect;
  movingHazards?: MovingHazardDef[];
  readyHint?: string;
}

interface MovingHazardDef {
  x: number;
  w: number;
  h: number;
  yMin: number;
  yMax: number;
  speed: number;
  startY: number;
}

interface MovingHazard extends MovingHazardDef {
  y: number;
  direction: 1 | -1;
}

interface Ring extends RingDef {
  collected: boolean;
}

interface Mango {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  onGround: boolean;
}

const GROUND_Y = CONFIG.worldHeight - 48;

const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: "Level 1",
    worldWidth: 1800,
    startX: 90,
    platforms: [
      { x: 0, y: GROUND_Y, w: 1800, h: 48 },
      { x: 480, y: GROUND_Y - 28, w: 240, h: 24 },
      { x: 1100, y: GROUND_Y - 28, w: 260, h: 24 },
    ],
    spikes: [
      { x: 780, y: GROUND_Y - 18, w: 36, h: 18 },
      { x: 1400, y: GROUND_Y - 18, w: 36, h: 18 },
    ],
    rings: [
      { x: 260, y: GROUND_Y - 72, r: 14 },
      { x: 580, y: GROUND_Y - 88, r: 14 },
      { x: 1050, y: GROUND_Y - 88, r: 14 },
      { x: 1550, y: GROUND_Y - 78, r: 14 },
    ],
    finish: { x: 1680, y: GROUND_Y - 96, w: 36, h: 96 },
  },
  {
    id: 2,
    name: "Level 2",
    worldWidth: 2400,
    startX: 90,
    readyHint: "Ready for a tougher bounce?",
    platforms: [
      { x: 0, y: GROUND_Y, w: 520, h: 48 },
      { x: 560, y: GROUND_Y - 40, w: 180, h: 24 },
      { x: 820, y: GROUND_Y, w: 260, h: 48 },
      { x: 1120, y: GROUND_Y - 70, w: 160, h: 24 },
      { x: 1360, y: GROUND_Y - 20, w: 220, h: 24 },
      { x: 1640, y: GROUND_Y, w: 280, h: 48 },
      { x: 1980, y: GROUND_Y - 55, w: 180, h: 24 },
      { x: 2200, y: GROUND_Y, w: 200, h: 48 },
    ],
    spikes: [
      { x: 470, y: GROUND_Y - 18, w: 54, h: 18 },
      { x: 980, y: GROUND_Y - 18, w: 70, h: 18 },
      { x: 1480, y: GROUND_Y - 38, w: 56, h: 18 },
      { x: 1860, y: GROUND_Y - 18, w: 64, h: 18 },
    ],
    rings: [
      { x: 250, y: GROUND_Y - 90, r: 14 },
      { x: 640, y: GROUND_Y - 120, r: 14 },
      { x: 1180, y: GROUND_Y - 140, r: 14 },
      { x: 1450, y: GROUND_Y - 100, r: 14 },
      { x: 2050, y: GROUND_Y - 130, r: 14 },
    ],
    finish: { x: 2280, y: GROUND_Y - 96, w: 36, h: 96 },
  },
  {
    id: 3,
    name: "Level 3",
    worldWidth: 2200,
    startX: 90,
    readyHint: "Watch the moving hazards.",
    platforms: [
      { x: 0, y: GROUND_Y, w: 2200, h: 48 },
      { x: 1000, y: GROUND_Y - 28, w: 280, h: 28 },
    ],
    spikes: [
      { x: 1280, y: GROUND_Y - 46, w: 40, h: 18 },
    ],
    movingHazards: [
      {
        x: 620,
        w: 72,
        h: 18,
        yMin: GROUND_Y - 150,
        yMax: GROUND_Y - 18,
        speed: 85,
        startY: GROUND_Y - 18,
      },
      {
        x: 1120,
        w: 80,
        h: 18,
        yMin: GROUND_Y - 170,
        yMax: GROUND_Y - 46,
        speed: 100,
        startY: GROUND_Y - 170,
      },
      {
        x: 1580,
        w: 72,
        h: 18,
        yMin: GROUND_Y - 155,
        yMax: GROUND_Y - 18,
        speed: 95,
        startY: GROUND_Y - 90,
      },
    ],
    rings: [
      { x: 240, y: GROUND_Y - 80, r: 14 },
      { x: 700, y: GROUND_Y - 110, r: 14 },
      { x: 1140, y: GROUND_Y - 130, r: 14 },
      { x: 1480, y: GROUND_Y - 90, r: 14 },
      { x: 1900, y: GROUND_Y - 85, r: 14 },
    ],
    finish: { x: 2080, y: GROUND_Y - 96, w: 36, h: 96 },
  },
  {
    id: 4,
    name: "Level 4",
    worldWidth: 2800,
    startX: 90,
    readyHint: "Final stretch. Time the hazards.",
    platforms: [
      { x: 0, y: GROUND_Y, w: 2800, h: 48 },
      { x: 700, y: GROUND_Y - 32, w: 220, h: 24 },
      { x: 1400, y: GROUND_Y - 40, w: 200, h: 24 },
      { x: 2100, y: GROUND_Y - 32, w: 240, h: 24 },
    ],
    spikes: [
      { x: 520, y: GROUND_Y - 18, w: 40, h: 18 },
      { x: 1180, y: GROUND_Y - 18, w: 44, h: 18 },
      { x: 1850, y: GROUND_Y - 18, w: 40, h: 18 },
    ],
    movingHazards: [
      {
        x: 640,
        w: 70,
        h: 18,
        yMin: GROUND_Y - 160,
        yMax: GROUND_Y - 18,
        speed: 90,
        startY: GROUND_Y - 18,
      },
      {
        x: 1050,
        w: 76,
        h: 18,
        yMin: GROUND_Y - 175,
        yMax: GROUND_Y - 18,
        speed: 105,
        startY: GROUND_Y - 175,
      },
      {
        x: 1550,
        w: 72,
        h: 18,
        yMin: GROUND_Y - 165,
        yMax: GROUND_Y - 50,
        speed: 100,
        startY: GROUND_Y - 90,
      },
      {
        x: 2000,
        w: 78,
        h: 18,
        yMin: GROUND_Y - 170,
        yMax: GROUND_Y - 18,
        speed: 110,
        startY: GROUND_Y - 18,
      },
    ],
    rings: [
      { x: 280, y: GROUND_Y - 80, r: 14 },
      { x: 780, y: GROUND_Y - 120, r: 14 },
      { x: 1120, y: GROUND_Y - 130, r: 14 },
      { x: 1480, y: GROUND_Y - 120, r: 14 },
      { x: 1750, y: GROUND_Y - 90, r: 14 },
      { x: 2300, y: GROUND_Y - 110, r: 14 },
    ],
    finish: { x: 2650, y: GROUND_Y - 96, w: 36, h: 96 },
  },
  {
    id: 5,
    name: "Level 5",
    worldWidth: 3100,
    startX: 90,
    readyHint: "Final challenge. Collect every ring and reach the finish.",
    platforms: [
      { x: 0, y: GROUND_Y, w: 3100, h: 48 },
      { x: 860, y: GROUND_Y - 34, w: 250, h: 24 },
      { x: 1680, y: GROUND_Y - 42, w: 230, h: 24 },
      { x: 2420, y: GROUND_Y - 34, w: 270, h: 24 },
    ],
    spikes: [
      { x: 460, y: GROUND_Y - 18, w: 38, h: 18 },
      { x: 1240, y: GROUND_Y - 18, w: 42, h: 18 },
      { x: 1960, y: GROUND_Y - 18, w: 40, h: 18 },
      { x: 2680, y: GROUND_Y - 18, w: 38, h: 18 },
    ],
    movingHazards: [
      {
        x: 700,
        w: 70,
        h: 18,
        yMin: GROUND_Y - 155,
        yMax: GROUND_Y - 18,
        speed: 88,
        startY: GROUND_Y - 18,
      },
      {
        x: 1120,
        w: 74,
        h: 18,
        yMin: GROUND_Y - 175,
        yMax: GROUND_Y - 18,
        speed: 100,
        startY: GROUND_Y - 175,
      },
      {
        x: 1520,
        w: 76,
        h: 18,
        yMin: GROUND_Y - 170,
        yMax: GROUND_Y - 48,
        speed: 108,
        startY: GROUND_Y - 90,
      },
      {
        x: 2080,
        w: 78,
        h: 18,
        yMin: GROUND_Y - 180,
        yMax: GROUND_Y - 18,
        speed: 112,
        startY: GROUND_Y - 18,
      },
      {
        x: 2520,
        w: 74,
        h: 18,
        yMin: GROUND_Y - 165,
        yMax: GROUND_Y - 18,
        speed: 106,
        startY: GROUND_Y - 165,
      },
    ],
    rings: [
      { x: 280, y: GROUND_Y - 80, r: 14 },
      { x: 780, y: GROUND_Y - 110, r: 14 },
      { x: 1180, y: GROUND_Y - 125, r: 14 },
      { x: 1760, y: GROUND_Y - 130, r: 14 },
      { x: 2280, y: GROUND_Y - 100, r: 14 },
      { x: 2850, y: GROUND_Y - 110, r: 14 },
    ],
    finish: { x: 2960, y: GROUND_Y - 96, w: 36, h: 96 },
  },
  {
    id: 6,
    name: "Level 6",
    worldWidth: 3300,
    startX: 90,
    readyHint: "Stay in control. Time the hazards carefully.",
    platforms: [
      { x: 0, y: GROUND_Y, w: 3300, h: 48 },
      { x: 920, y: GROUND_Y - 36, w: 240, h: 24 },
      { x: 1620, y: GROUND_Y - 44, w: 230, h: 24 },
      { x: 2360, y: GROUND_Y - 36, w: 260, h: 24 },
    ],
    spikes: [
      { x: 470, y: GROUND_Y - 18, w: 40, h: 18 },
      { x: 1280, y: GROUND_Y - 18, w: 44, h: 18 },
      { x: 1980, y: GROUND_Y - 18, w: 40, h: 18 },
      { x: 2760, y: GROUND_Y - 18, w: 42, h: 18 },
    ],
    movingHazards: [
      {
        x: 700,
        w: 72,
        h: 18,
        yMin: GROUND_Y - 160,
        yMax: GROUND_Y - 18,
        speed: 92,
        startY: GROUND_Y - 18,
      },
      {
        x: 1080,
        w: 74,
        h: 18,
        yMin: GROUND_Y - 175,
        yMax: GROUND_Y - 48,
        speed: 102,
        startY: GROUND_Y - 175,
      },
      {
        x: 1500,
        w: 76,
        h: 18,
        yMin: GROUND_Y - 170,
        yMax: GROUND_Y - 18,
        speed: 108,
        startY: GROUND_Y - 90,
      },
      {
        x: 1880,
        w: 74,
        h: 18,
        yMin: GROUND_Y - 180,
        yMax: GROUND_Y - 18,
        speed: 110,
        startY: GROUND_Y - 18,
      },
      {
        x: 2220,
        w: 78,
        h: 18,
        yMin: GROUND_Y - 175,
        yMax: GROUND_Y - 50,
        speed: 114,
        startY: GROUND_Y - 175,
      },
      {
        x: 2580,
        w: 74,
        h: 18,
        yMin: GROUND_Y - 165,
        yMax: GROUND_Y - 18,
        speed: 106,
        startY: GROUND_Y - 18,
      },
    ],
    rings: [
      { x: 280, y: GROUND_Y - 80, r: 14 },
      { x: 780, y: GROUND_Y - 110, r: 14 },
      { x: 1020, y: GROUND_Y - 120, r: 14 },
      { x: 1700, y: GROUND_Y - 130, r: 14 },
      { x: 2100, y: GROUND_Y - 100, r: 14 },
      { x: 2480, y: GROUND_Y - 120, r: 14 },
      { x: 3000, y: GROUND_Y - 100, r: 14 },
    ],
    finish: { x: 3160, y: GROUND_Y - 96, w: 36, h: 96 },
  },
  {
    id: 7,
    name: "Level 7",
    worldWidth: 3650,
    startX: 90,
    readyHint: "Final challenge. Collect every ring and reach the finish.",
    platforms: [
      { x: 0, y: GROUND_Y, w: 3650, h: 48 },
      { x: 780, y: GROUND_Y - 34, w: 230, h: 24 },
      { x: 1480, y: GROUND_Y - 42, w: 220, h: 24 },
      { x: 2180, y: GROUND_Y - 36, w: 240, h: 24 },
      { x: 2920, y: GROUND_Y - 40, w: 250, h: 24 },
    ],
    spikes: [
      { x: 430, y: GROUND_Y - 18, w: 36, h: 18 },
      { x: 1120, y: GROUND_Y - 18, w: 40, h: 18 },
      { x: 1800, y: GROUND_Y - 18, w: 38, h: 18 },
      { x: 2520, y: GROUND_Y - 18, w: 40, h: 18 },
      { x: 3220, y: GROUND_Y - 18, w: 36, h: 18 },
    ],
    movingHazards: [
      {
        x: 620,
        w: 70,
        h: 18,
        yMin: GROUND_Y - 155,
        yMax: GROUND_Y - 18,
        speed: 90,
        startY: GROUND_Y - 18,
      },
      {
        x: 980,
        w: 74,
        h: 18,
        yMin: GROUND_Y - 175,
        yMax: GROUND_Y - 48,
        speed: 102,
        startY: GROUND_Y - 175,
      },
      {
        x: 1340,
        w: 76,
        h: 18,
        yMin: GROUND_Y - 170,
        yMax: GROUND_Y - 18,
        speed: 108,
        startY: GROUND_Y - 90,
      },
      {
        x: 1700,
        w: 74,
        h: 18,
        yMin: GROUND_Y - 180,
        yMax: GROUND_Y - 18,
        speed: 112,
        startY: GROUND_Y - 18,
      },
      {
        x: 2060,
        w: 78,
        h: 18,
        yMin: GROUND_Y - 175,
        yMax: GROUND_Y - 50,
        speed: 115,
        startY: GROUND_Y - 175,
      },
      {
        x: 2480,
        w: 76,
        h: 18,
        yMin: GROUND_Y - 185,
        yMax: GROUND_Y - 18,
        speed: 110,
        startY: GROUND_Y - 100,
      },
      {
        x: 3080,
        w: 78,
        h: 18,
        yMin: GROUND_Y - 170,
        yMax: GROUND_Y - 18,
        speed: 114,
        startY: GROUND_Y - 18,
      },
    ],
    rings: [
      { x: 260, y: GROUND_Y - 80, r: 14 },
      { x: 700, y: GROUND_Y - 110, r: 14 },
      { x: 1060, y: GROUND_Y - 120, r: 14 },
      { x: 1560, y: GROUND_Y - 130, r: 14 },
      { x: 1940, y: GROUND_Y - 100, r: 14 },
      { x: 2320, y: GROUND_Y - 120, r: 14 },
      { x: 3000, y: GROUND_Y - 125, r: 14 },
    ],
    finish: { x: 3500, y: GROUND_Y - 96, w: 36, h: 96 },
  },
];

let activeClose: (() => void) | null = null;

export function closeMangoBounch(): void {
  activeClose?.();
}

export function initMangoBounch(): void {
  const canvas = document.getElementById("mb-canvas") as HTMLCanvasElement | null;
  const scoreNode = document.getElementById("mb-score");
  const highNode = document.getElementById("mb-high-score");
  const hudBestNode = document.getElementById("mb-hud-best");
  const msgNode = document.getElementById("mb-message");
  const restartNode = document.getElementById("mb-restart") as HTMLButtonElement | null;
  const startPlayBtn = document.getElementById("mb-start-play") as HTMLButtonElement | null;
  const openGameBtn = document.getElementById("mb-open-game") as HTMLButtonElement | null;
  const gameModal = document.getElementById("mb-game-modal");
  const overlayScoreNode = document.getElementById("mb-overlay-score");
  const closeGameBtn = document.getElementById("mb-close-game") as HTMLButtonElement | null;
  const leftBtn = document.getElementById("mb-left");
  const rightBtn = document.getElementById("mb-right");
  const controls = document.getElementById("mb-controls");
  const howtoNode = document.getElementById("mb-howto");
  const levelReadyNode = document.getElementById("mb-level-ready");
  const levelReadyTitleNode = document.getElementById("mb-level-ready-title");
  const levelReadyTextNode = document.getElementById("mb-level-ready-text");
  const nameSetupNode = document.getElementById("mb-name-setup");
  const setupPlayerNameInput = document.getElementById(
    "mb-setup-player-name"
  ) as HTMLInputElement | null;
  const savePlayerNameBtn = document.getElementById(
    "mb-save-player-name"
  ) as HTMLButtonElement | null;
  const nameSetupStatusNode = document.getElementById("mb-name-setup-status");
  const nextLevelBtn = document.getElementById("mb-next-level") as HTMLButtonElement | null;
  const playAgainBtn = document.getElementById("mb-play-again") as HTMLButtonElement | null;
  const titleNode = document.getElementById("mb-game-modal-title");
  const levelLabelNode = document.getElementById("mb-level-label");
  const apiResultNode = document.getElementById("mb-api-result");
  const shareModal = document.getElementById("mb-share-modal");
  const shareLevelNode = document.getElementById("mb-share-level");
  const shareStatusNode = document.getElementById("mb-share-status");
  const playerNameInput = document.getElementById("mb-player-name") as HTMLInputElement | null;
  const submitScoreBtn = document.getElementById("mb-submit-score") as HTMLButtonElement | null;
  const skipScoreBtn = document.getElementById("mb-skip-score") as HTMLButtonElement | null;

  if (!canvas || !scoreNode || !highNode || !msgNode || !restartNode || !startPlayBtn) {
    return;
  }

  const gfx = canvas.getContext("2d");

  if (!gfx) {
    return;
  }

  runMangoBounch(
    canvas,
    gfx,
    scoreNode,
    highNode,
    hudBestNode,
    msgNode,
    restartNode,
    startPlayBtn,
    openGameBtn,
    gameModal,
    overlayScoreNode,
    closeGameBtn,
    leftBtn,
    rightBtn,
    controls,
    howtoNode,
    levelReadyNode,
    levelReadyTitleNode,
    levelReadyTextNode,
    nameSetupNode,
    setupPlayerNameInput,
    savePlayerNameBtn,
    nameSetupStatusNode,
    nextLevelBtn,
    playAgainBtn,
    titleNode,
    levelLabelNode,
    apiResultNode,
    shareModal,
    shareLevelNode,
    shareStatusNode,
    playerNameInput,
    submitScoreBtn,
    skipScoreBtn
  );
}

function runMangoBounch(
  cnv: HTMLCanvasElement,
  gfx: CanvasRenderingContext2D,
  scoreNode: HTMLElement,
  highNode: HTMLElement,
  hudBestNode: HTMLElement | null,
  msgNode: HTMLElement,
  restartNode: HTMLButtonElement,
  startPlayBtn: HTMLButtonElement,
  openGameBtn: HTMLButtonElement | null,
  gameModal: HTMLElement | null,
  overlayScoreNode: HTMLElement | null,
  closeGameBtn: HTMLButtonElement | null,
  leftBtn: HTMLElement | null,
  rightBtn: HTMLElement | null,
  controls: HTMLElement | null,
  howtoNode: HTMLElement | null,
  levelReadyNode: HTMLElement | null,
  levelReadyTitleNode: HTMLElement | null,
  levelReadyTextNode: HTMLElement | null,
  nameSetupNode: HTMLElement | null,
  setupPlayerNameInput: HTMLInputElement | null,
  savePlayerNameBtn: HTMLButtonElement | null,
  nameSetupStatusNode: HTMLElement | null,
  nextLevelBtn: HTMLButtonElement | null,
  playAgainBtn: HTMLButtonElement | null,
  titleNode: HTMLElement | null,
  levelLabelNode: HTMLElement | null,
  apiResultNode: HTMLElement | null,
  shareModal: HTMLElement | null,
  shareLevelNode: HTMLElement | null,
  shareStatusNode: HTMLElement | null,
  playerNameInput: HTMLInputElement | null,
  submitScoreBtn: HTMLButtonElement | null,
  skipScoreBtn: HTMLButtonElement | null
): void {
  let state: GameState = "idle";
  let levelIndex = 0;
  let ringsCollected = 0;
  let clearedLevel = 0;
  let highScore = loadHighScore();
  let viewW = 0;
  let viewH = 0;
  let scale = 1;
  let cameraX = 0;
  let animationId = 0;
  let lastTs = 0;
  let moveLeft = false;
  let moveRight = false;
  let pendingSubmitLevel = 0;
  let submitClearToken = 0;
  let lastSubmittedClearToken = 0;
  let isSubmittingScore = false;
  const releaseMobileHolds: Array<() => void> = [];

  function clearMovementInput(): void {
    moveLeft = false;
    moveRight = false;

    for (const release of releaseMobileHolds) {
      release();
    }
  }

  const arena = cnv.parentElement;
  let platforms: Rect[] = [];
  let spikes: Rect[] = [];
  let rings: Ring[] = [];
  let movingHazards: MovingHazard[] = [];
  let finish: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let worldWidth = LEVELS[0].worldWidth;
  let mango: Mango = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: CONFIG.mangoRadius,
    onGround: false,
  };

  const rootStyles = getComputedStyle(document.documentElement);
  const playfieldStart = rootStyles.getPropertyValue("--ocean-mid").trim() || "#1a7a9e";
  const playfieldEnd = rootStyles.getPropertyValue("--ocean-deep").trim() || "#0b4f6c";

  function activeLevel(): LevelDef {
    return LEVELS[levelIndex] ?? LEVELS[0];
  }

  function totalRings(): number {
    return rings.length;
  }

  function loadHighScore(): number {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      const parsed = raw ? Number.parseInt(raw, 10) : 0;
      if (!Number.isFinite(parsed)) {
        return 0;
      }

      return Math.max(0, Math.min(LEVELS.length, parsed));
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

  function loadPlayerName(): string {
    try {
      const raw = localStorage.getItem(CONFIG.playerNameKey) || "";
      const validated = validateBounchPlayerName(raw);
      return validated.ok ? validated.name : "";
    } catch {
      return "";
    }
  }

  function hasValidSavedPlayerName(): boolean {
    return loadPlayerName().length > 0;
  }

  function savePlayerName(name: string): void {
    const validated = validateBounchPlayerName(name);
    if (!validated.ok) {
      return;
    }

    try {
      localStorage.setItem(CONFIG.playerNameKey, validated.name);
    } catch {
      // ignore storage failures
    }
  }

  function setNameSetupStatus(message: string): void {
    if (nameSetupStatusNode) {
      nameSetupStatusNode.textContent = message;
    }
  }

  function hideNameSetup(): void {
    setNodeVisible(nameSetupNode, false);
    setNameSetupStatus("");
  }

  function setApiResult(message: string | null): void {
    if (!apiResultNode) {
      return;
    }

    if (!message) {
      apiResultNode.textContent = "";
      apiResultNode.hidden = true;
      return;
    }

    apiResultNode.textContent = message;
    apiResultNode.hidden = false;
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

  function resetShareModal(): void {
    if (playerNameInput) {
      playerNameInput.disabled = false;
      playerNameInput.readOnly = false;
    }

    if (submitScoreBtn) {
      submitScoreBtn.disabled = false;
      submitScoreBtn.textContent = "Submit clear";
    }

    if (skipScoreBtn) {
      skipScoreBtn.disabled = false;
    }

    setShareStatus("");
  }

  function closeShareModal(): void {
    shareModal?.setAttribute("hidden", "");
    document.body.classList.remove("labs-share-modal-open");
    pendingSubmitLevel = 0;
    resetShareModal();
  }

  function openShareModal(levelId: number): void {
    if (!isBounchHighScoreSharingEnabled() || !shareModal) {
      return;
    }

    pendingSubmitLevel = levelId;
    shareModal.removeAttribute("hidden");
    document.body.classList.add("labs-share-modal-open");
    resetShareModal();

    if (shareLevelNode) {
      shareLevelNode.textContent = String(levelId);
    }

    if (playerNameInput) {
      playerNameInput.value = loadPlayerName();
    }

    window.requestAnimationFrame(() => {
      playerNameInput?.focus();
      playerNameInput?.select();
    });
  }

  function maybeRaiseLocalBest(apiBestLevel: number): void {
    if (!Number.isFinite(apiBestLevel) || apiBestLevel <= highScore) {
      return;
    }

    const capped = Math.max(0, Math.min(LEVELS.length, Math.floor(apiBestLevel)));
    if (capped <= highScore) {
      return;
    }

    highScore = capped;
    saveHighScore(highScore);
    updateHud();
  }

  async function submitClearedLevel(levelId: number, name: string, clearToken: number): Promise<void> {
    if (!isBounchHighScoreSharingEnabled()) {
      return;
    }

    if (isSubmittingScore || clearToken !== submitClearToken || lastSubmittedClearToken === clearToken) {
      return;
    }

    isSubmittingScore = true;
    lastSubmittedClearToken = clearToken;
    setApiResult(null);

    const result = await submitBounchHighscore(levelId, name);

    isSubmittingScore = false;

    // Player may already have left this win screen.
    if (clearToken !== submitClearToken || state !== "won") {
      return;
    }

    if (result.ok) {
      savePlayerName(name);

      if (isBounchHighscoreApiResponse(result.body)) {
        const bestLevel =
          typeof result.body.bestLevel === "number" ? result.body.bestLevel : levelId;
        maybeRaiseLocalBest(bestLevel);
        setApiResult(formatBounchScoreResult(result.body, levelId));
        return;
      }

      setApiResult(`Best: Level ${Math.max(highScore, levelId)}`);
      return;
    }

    if (result.skipped) {
      return;
    }

    setApiResult("Score sharing unavailable");
  }

  function scheduleHighscoreSubmit(levelId: number): void {
    if (!isBounchHighScoreSharingEnabled()) {
      return;
    }

    if (levelId < 1 || levelId > LEVELS.length) {
      return;
    }

    const clearToken = ++submitClearToken;
    const name = loadPlayerName();

    if (!name) {
      openShareModal(levelId);
      return;
    }

    void submitClearedLevel(levelId, name, clearToken);
  }

  async function sharePendingClear(): Promise<void> {
    if (pendingSubmitLevel <= 0 || isSubmittingScore) {
      return;
    }

    const levelId = pendingSubmitLevel;
    const clearToken = submitClearToken;
    const name = playerNameInput?.value.trim() || "ManGo Player";
    pendingSubmitLevel = 0;

    if (submitScoreBtn) {
      submitScoreBtn.disabled = true;
    }

    if (skipScoreBtn) {
      skipScoreBtn.disabled = true;
    }

    setShareStatus("Submitting clear...");
    savePlayerName(name);
    shareModal?.setAttribute("hidden", "");
    document.body.classList.remove("labs-share-modal-open");
    resetShareModal();

    await submitClearedLevel(levelId, name, clearToken);
  }

  function recordLevelClear(levelId: number): void {
    clearedLevel = Math.max(clearedLevel, levelId);

    if (clearedLevel > highScore) {
      highScore = clearedLevel;
      saveHighScore(highScore);
    }
  }

  function updateHud(): void {
    scoreNode.textContent = String(activeLevel().id);
    highNode.textContent = String(highScore);

    if (hudBestNode) {
      hudBestNode.textContent = String(highScore);
    }

    const levelName = activeLevel().name;

    if (titleNode) {
      titleNode.textContent = `🥭 Bounch · ${levelName}`;
    }

    if (levelLabelNode) {
      levelLabelNode.textContent = levelName;
    }
  }

  function setModalPhase(phase: "idle" | "playing" | "over"): void {
    if (!gameModal) {
      return;
    }

    gameModal.classList.remove(
      "labs-game-modal--idle",
      "labs-game-modal--playing",
      "labs-game-modal--over"
    );
    gameModal.classList.add(`labs-game-modal--${phase}`);

    window.requestAnimationFrame(() => {
      resize();
    });
  }

  function setOverlayScore(value: number | null): void {
    if (!overlayScoreNode) {
      return;
    }

    const scoreEl = overlayScoreNode.querySelector("strong");

    if (value === null) {
      overlayScoreNode.hidden = true;
      return;
    }

    overlayScoreNode.hidden = false;

    if (scoreEl) {
      scoreEl.textContent = String(value);
    }
  }

  function setNodeVisible(node: HTMLElement | null, visible: boolean): void {
    if (!node) {
      return;
    }

    if (visible) {
      node.removeAttribute("hidden");
    } else {
      node.setAttribute("hidden", "");
    }
  }

  function setEndActions(mode: "idle" | "over" | "next-level" | "play-again"): void {
    if (mode === "idle") {
      startPlayBtn.hidden = false;
      restartNode.hidden = true;
      setNodeVisible(nextLevelBtn, false);
      setNodeVisible(playAgainBtn, false);
      return;
    }

    startPlayBtn.hidden = true;
    restartNode.hidden = false;
    setNodeVisible(nextLevelBtn, mode === "next-level");
    setNodeVisible(playAgainBtn, mode === "play-again");
  }

  function setIdleOverlay(): void {
    setModalPhase("idle");
    setEndActions("idle");
    setOverlayScore(null);
    setApiResult(null);
    hideNameSetup();
    setNodeVisible(howtoNode, false);
    setNodeVisible(levelReadyNode, false);
    msgNode.textContent = "Collect every ring, avoid the spikes, reach the finish!";
  }

  function setNamingView(): void {
    setModalPhase("playing");
    setEndActions("idle");
    startPlayBtn.hidden = true;
    setOverlayScore(null);
    setApiResult(null);
    setNodeVisible(howtoNode, false);
    setNodeVisible(levelReadyNode, false);
    setNodeVisible(nameSetupNode, true);
    setNameSetupStatus("");

    if (setupPlayerNameInput) {
      setupPlayerNameInput.value = "";
      setupPlayerNameInput.disabled = false;
    }

    if (savePlayerNameBtn) {
      savePlayerNameBtn.disabled = false;
    }
  }

  function setReadyView(): void {
    setModalPhase("playing");
    setEndActions("idle");
    startPlayBtn.hidden = true;
    setOverlayScore(null);
    setApiResult(null);
    hideNameSetup();

    const level = activeLevel();
    const isFirstLevel = level.id === 1;
    setNodeVisible(howtoNode, isFirstLevel);
    setNodeVisible(levelReadyNode, !isFirstLevel);

    if (!isFirstLevel) {
      if (levelReadyTitleNode) {
        levelReadyTitleNode.textContent = level.name;
      }

      if (levelReadyTextNode) {
        levelReadyTextNode.textContent = level.readyHint || "Press left or right to start.";
      }
    }
  }

  function setEndOverlay(message: string, mode: "over" | "next-level" | "play-again"): void {
    setModalPhase("over");
    setEndActions(mode);
    setOverlayScore(clearedLevel);
    hideNameSetup();
    setNodeVisible(howtoNode, false);
    setNodeVisible(levelReadyNode, false);
    msgNode.textContent = message;
  }

  function openGameModal(): void {
    gameModal?.removeAttribute("hidden");
    document.body.classList.add("labs-game-modal-open");
    window.requestAnimationFrame(() => {
      resize();
    });
  }

  function closeGameModal(): void {
    stopLoop();
    clearMovementInput();
    closeShareModal();
    hideNameSetup();
    state = "idle";
    levelIndex = 0;
    clearedLevel = 0;
    submitClearToken += 1;
    gameModal?.setAttribute("hidden", "");
    document.body.classList.remove("labs-game-modal-open");
    resetLevel();
    setIdleOverlay();
  }

  activeClose = closeGameModal;

  function beginContinueSession(): void {
    highScore = loadHighScore();
    clearedLevel = 0;
    submitClearToken += 1;
    const startLevelId = resolveBounchContinueLevel(highScore, LEVELS.length);
    levelIndex = Math.max(0, Math.min(LEVELS.length - 1, startLevelId - 1));

    if (!hasValidSavedPlayerName()) {
      enterNaming();
      return;
    }

    goToLevel(levelIndex);
  }

  function prepareGameModal(): void {
    closeShareModal();
    openGameModal();
    beginContinueSession();
  }

  function buildLevel(): void {
    const level = activeLevel();
    worldWidth = level.worldWidth;

    platforms = level.platforms.map((platform) => ({ ...platform }));
    spikes = level.spikes.map((spike) => ({ ...spike }));
    rings = level.rings.map((ring) => ({ ...ring, collected: false }));
    finish = { ...level.finish };
    movingHazards = (level.movingHazards ?? []).map((hazard) => ({
      ...hazard,
      y: hazard.startY,
      direction: hazard.startY <= (hazard.yMin + hazard.yMax) / 2 ? 1 : -1,
    }));

    mango = {
      x: level.startX,
      y: GROUND_Y - CONFIG.mangoRadius - 2,
      vx: 0,
      vy: 0,
      r: CONFIG.mangoRadius,
      onGround: true,
    };

    ringsCollected = 0;
    cameraX = 0;
  }

  function resetLevel(): void {
    buildLevel();
    updateHud();
    updateCamera();
  }

  function enterNaming(): void {
    resetLevel();
    clearMovementInput();
    state = "naming";
    lastTs = 0;
    setNamingView();
    ensureLoop();
    window.requestAnimationFrame(() => {
      setupPlayerNameInput?.focus();
    });
  }

  function submitSetupPlayerName(): void {
    if (state !== "naming") {
      return;
    }

    const raw = setupPlayerNameInput?.value ?? "";
    const validated = validateBounchPlayerName(raw);

    if (!validated.ok) {
      setNameSetupStatus(validated.error);
      setupPlayerNameInput?.focus();
      return;
    }

    savePlayerName(validated.name);

    if (setupPlayerNameInput) {
      setupPlayerNameInput.value = validated.name;
    }

    hideNameSetup();
    enterReady();
  }

  function enterReady(): void {
    resetLevel();
    clearMovementInput();
    state = "ready";
    lastTs = 0;
    setReadyView();
    ensureLoop();
  }

  function goToLevel(index: number): void {
    levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    enterReady();
  }

  function beginPlaying(): void {
    if (state !== "ready") {
      return;
    }

    state = "playing";
    lastTs = 0;
    hideNameSetup();
    setNodeVisible(howtoNode, false);
    setNodeVisible(levelReadyNode, false);
  }

  function finishGame(message: string, next: "won" | "over"): void {
    if (state !== "playing") {
      return;
    }

    state = next;
    clearMovementInput();
    mango.vx = 0;
    mango.vy = 0;

    if (next === "won") {
      const clearedId = activeLevel().id;
      recordLevelClear(clearedId);
      updateHud();

      const hasNextLevel = levelIndex < LEVELS.length - 1;

      if (hasNextLevel) {
        setEndOverlay(`${activeLevel().name} complete! 🥭`, "next-level");
        window.requestAnimationFrame(() => {
          nextLevelBtn?.focus();
        });
      } else {
        setEndOverlay(`${activeLevel().name} complete! 🥭`, "play-again");
        window.requestAnimationFrame(() => {
          playAgainBtn?.focus();
        });
      }

      scheduleHighscoreSubmit(clearedId);
      return;
    }

    updateHud();
    setApiResult(null);
    setEndOverlay(message, "over");
    window.requestAnimationFrame(() => {
      restartNode.focus();
    });
  }

  function circleHitsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
    const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy <= r * r;
  }

  function resolvePlatformCollisions(): void {
    mango.onGround = false;

    for (const platform of platforms) {
      if (!circleHitsRect(mango.x, mango.y, mango.r, platform)) {
        continue;
      }

      const nearestX = Math.max(platform.x, Math.min(mango.x, platform.x + platform.w));
      const nearestY = Math.max(platform.y, Math.min(mango.y, platform.y + platform.h));
      const dx = mango.x - nearestX;
      const dy = mango.y - nearestY;

      if (Math.abs(dx) > Math.abs(dy)) {
        const push = mango.r - Math.abs(dx) + 0.5;
        mango.x += dx >= 0 ? push : -push;
        mango.vx = 0;
      } else if (dy < 0 || mango.vy >= 0) {
        mango.y = platform.y - mango.r;
        mango.vy = -CONFIG.bounceSpeed;
        mango.onGround = true;
      } else {
        mango.y = platform.y + platform.h + mango.r;
        mango.vy = Math.abs(mango.vy) * 0.2;
      }
    }
  }

  function collectRings(): void {
    for (const ring of rings) {
      if (ring.collected) {
        continue;
      }

      const dx = mango.x - ring.x;
      const dy = mango.y - ring.y;
      const reach = mango.r + ring.r;

      if (dx * dx + dy * dy > reach * reach) {
        continue;
      }

      ring.collected = true;
      ringsCollected += 1;
      updateHud();
    }
  }

  function checkHazardsAndFinish(): void {
    for (const spike of spikes) {
      if (circleHitsRect(mango.x, mango.y, mango.r * 0.85, spike)) {
        finishGame("Ouch! Spike hit. Try again.", "over");
        return;
      }
    }

    for (const hazard of movingHazards) {
      if (circleHitsRect(mango.x, mango.y, mango.r * 0.85, hazard)) {
        finishGame("Ouch! Moving hazard hit. Try again.", "over");
        return;
      }
    }

    if (circleHitsRect(mango.x, mango.y, mango.r, finish)) {
      if (ringsCollected >= totalRings()) {
        finishGame("Level complete! All rings collected. 🥭", "won");
      }
    }

    if (mango.y - mango.r > CONFIG.worldHeight + 40) {
      finishGame("The mango fell. Try again.", "over");
    }
  }

  function updateMovingHazards(dt: number): void {
    for (const hazard of movingHazards) {
      hazard.y += hazard.direction * hazard.speed * dt;

      if (hazard.y <= hazard.yMin) {
        hazard.y = hazard.yMin;
        hazard.direction = 1;
      } else if (hazard.y >= hazard.yMax) {
        hazard.y = hazard.yMax;
        hazard.direction = -1;
      }
    }
  }

  function updateCamera(): void {
    const viewWorldW = viewW > 0 && scale > 0 ? viewW / scale : worldWidth;
    const target = mango.x - viewWorldW * 0.35;
    cameraX = Math.max(0, Math.min(worldWidth - viewWorldW, target));
  }

  function update(dt: number): void {
    if (state !== "playing") {
      return;
    }

    if (moveLeft && !moveRight) {
      mango.vx -= CONFIG.moveAccel * dt;
    } else if (moveRight && !moveLeft) {
      mango.vx += CONFIG.moveAccel * dt;
    } else if (mango.onGround) {
      const friction = CONFIG.moveFriction * dt;
      if (Math.abs(mango.vx) <= friction) {
        mango.vx = 0;
      } else {
        mango.vx -= Math.sign(mango.vx) * friction;
      }
    }

    mango.vx = Math.max(-CONFIG.maxMoveSpeed, Math.min(CONFIG.maxMoveSpeed, mango.vx));
    mango.vy += CONFIG.gravity * dt;

    mango.x += mango.vx * dt;
    mango.y += mango.vy * dt;

    mango.x = Math.max(mango.r, Math.min(worldWidth - mango.r, mango.x));

    updateMovingHazards(dt);
    resolvePlatformCollisions();
    collectRings();
    checkHazardsAndFinish();
    updateCamera();
  }

  function drawBackground(): void {
    const gradient = gfx.createLinearGradient(0, 0, 0, viewH);
    gradient.addColorStop(0, playfieldStart);
    gradient.addColorStop(1, playfieldEnd);
    gfx.fillStyle = gradient;
    gfx.fillRect(0, 0, viewW, viewH);
  }

  function drawPlatforms(): void {
    for (const platform of platforms) {
      gfx.fillStyle = CONFIG.colors.platform;
      gfx.fillRect(platform.x, platform.y, platform.w, platform.h);
      gfx.fillStyle = CONFIG.colors.platformTop;
      gfx.fillRect(platform.x, platform.y, platform.w, 5);
    }
  }

  function drawSpikes(): void {
    for (const spike of spikes) {
      drawSpikeShape(spike, CONFIG.colors.spike, CONFIG.colors.spikeEdge);
    }
  }

  function drawMovingHazards(): void {
    for (const hazard of movingHazards) {
      drawSpikeShape(hazard, CONFIG.colors.movingHazard, CONFIG.colors.movingHazardEdge);

      gfx.fillStyle = "rgba(255, 255, 255, 0.18)";
      gfx.fillRect(hazard.x, hazard.y + hazard.h * 0.35, hazard.w, 3);
    }
  }

  function drawSpikeShape(rect: Rect, fill: string, edge: string): void {
    const tips = Math.max(2, Math.floor(rect.w / 14));
    const tipW = rect.w / tips;

    gfx.beginPath();
    gfx.moveTo(rect.x, rect.y + rect.h);

    for (let i = 0; i < tips; i += 1) {
      const left = rect.x + i * tipW;
      gfx.lineTo(left + tipW * 0.5, rect.y);
      gfx.lineTo(left + tipW, rect.y + rect.h);
    }

    gfx.closePath();
    gfx.fillStyle = fill;
    gfx.fill();
    gfx.strokeStyle = edge;
    gfx.lineWidth = 1;
    gfx.stroke();
  }

  function drawRings(): void {
    for (const ring of rings) {
      if (ring.collected) {
        continue;
      }

      gfx.beginPath();
      gfx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      gfx.strokeStyle = CONFIG.colors.ring;
      gfx.lineWidth = 4;
      gfx.stroke();

      gfx.beginPath();
      gfx.arc(ring.x, ring.y, ring.r * 0.45, 0, Math.PI * 2);
      gfx.strokeStyle = CONFIG.colors.ringInner;
      gfx.lineWidth = 2;
      gfx.stroke();
    }
  }

  function drawFinish(): void {
    gfx.fillStyle = CONFIG.colors.finishPole;
    gfx.fillRect(finish.x + finish.w * 0.45, finish.y, 4, finish.h);

    gfx.fillStyle = CONFIG.colors.finish;
    gfx.beginPath();
    gfx.moveTo(finish.x + finish.w * 0.45 + 4, finish.y + 8);
    gfx.lineTo(finish.x + finish.w, finish.y + 22);
    gfx.lineTo(finish.x + finish.w * 0.45 + 4, finish.y + 36);
    gfx.closePath();
    gfx.fill();
  }

  function drawMango(): void {
    const glow = gfx.createRadialGradient(mango.x, mango.y, mango.r * 0.2, mango.x, mango.y, mango.r * 1.7);
    glow.addColorStop(0, "rgba(255, 179, 71, 0.5)");
    glow.addColorStop(1, "rgba(255, 179, 71, 0)");
    gfx.fillStyle = glow;
    gfx.beginPath();
    gfx.arc(mango.x, mango.y, mango.r * 1.7, 0, Math.PI * 2);
    gfx.fill();

    gfx.font = `${Math.floor(mango.r * 2.15)}px serif`;
    gfx.textAlign = "center";
    gfx.textBaseline = "middle";
    gfx.fillText("🥭", mango.x, mango.y + 1);
    gfx.textAlign = "left";
    gfx.textBaseline = "alphabetic";
  }

  function draw(): void {
    if (viewW < 1 || viewH < 1) {
      return;
    }

    drawBackground();

    gfx.save();
    gfx.scale(scale, scale);
    gfx.translate(-cameraX, 0);

    drawPlatforms();
    drawSpikes();
    drawMovingHazards();
    drawRings();
    drawFinish();
    drawMango();

    gfx.restore();
  }

  function loop(timestamp: number): void {
    if (!lastTs) {
      lastTs = timestamp;
    }

    const dt = Math.min(0.033, (timestamp - lastTs) / 1000);
    lastTs = timestamp;

    update(dt);
    draw();
    animationId = window.requestAnimationFrame(loop);
  }

  function stopLoop(): void {
    if (animationId) {
      window.cancelAnimationFrame(animationId);
      animationId = 0;
    }

    lastTs = 0;
  }

  function ensureLoop(): void {
    if (animationId) {
      return;
    }

    lastTs = 0;
    animationId = window.requestAnimationFrame(loop);
  }

  function resize(): void {
    const parent = arena;

    if (!parent) {
      return;
    }

    const displayW = Math.floor(parent.clientWidth);
    const displayH = Math.floor(parent.clientHeight);

    if (displayW < 1 || displayH < 1) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    viewW = displayW;
    viewH = displayH;
    scale = viewH / CONFIG.worldHeight;

    cnv.width = Math.floor(viewW * dpr);
    cnv.height = Math.floor(viewH * dpr);
    gfx.setTransform(dpr, 0, 0, dpr, 0, 0);

    updateCamera();
    draw();
  }

  function isBounchModalOpen(): boolean {
    return Boolean(gameModal && !gameModal.hasAttribute("hidden"));
  }

  function handleDirectionInput(dir: "left" | "right", pressed: boolean): void {
    // Always allow releases so a direction cannot stick after close/game-over.
    if (!pressed) {
      if (dir === "left") {
        moveLeft = false;
      } else {
        moveRight = false;
      }
      return;
    }

    if (!isBounchModalOpen()) {
      return;
    }

    if (state === "over" || state === "won" || state === "idle" || state === "naming") {
      return;
    }

    if (dir === "left") {
      moveLeft = true;
    } else {
      moveRight = true;
    }

    if (state === "ready") {
      beginPlaying();
    }
  }

  function bindHoldButton(btn: HTMLElement | null, dir: "left" | "right"): void {
    if (!btn) {
      return;
    }

    let activePointerId: number | null = null;

    const endHold = (pointerId: number | null = null): void => {
      if (activePointerId === null) {
        handleDirectionInput(dir, false);
        return;
      }

      if (pointerId !== null && pointerId !== activePointerId) {
        return;
      }

      const capturedId = activePointerId;
      activePointerId = null;

      try {
        if (btn.hasPointerCapture(capturedId)) {
          btn.releasePointerCapture(capturedId);
        }
      } catch {
        // ignore capture release failures
      }

      handleDirectionInput(dir, false);
    };

    releaseMobileHolds.push(() => {
      endHold();
    });

    btn.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (activePointerId !== null && activePointerId !== event.pointerId) {
        return;
      }

      activePointerId = event.pointerId;

      try {
        btn.setPointerCapture(event.pointerId);
      } catch {
        // capture is best-effort; hold still works via up/cancel
      }

      handleDirectionInput(dir, true);
    });

    const onPointerEnd = (event: PointerEvent): void => {
      if (activePointerId !== null && event.pointerId !== activePointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      endHold(event.pointerId);
    };

    btn.addEventListener("pointerup", onPointerEnd);
    btn.addEventListener("pointercancel", onPointerEnd);
    btn.addEventListener("lostpointercapture", () => {
      if (activePointerId === null) {
        return;
      }

      activePointerId = null;
      handleDirectionInput(dir, false);
    });
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  if (controls) {
    const guard = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    controls.addEventListener("pointerdown", guard);
    controls.addEventListener("pointerup", guard);
    controls.addEventListener("pointercancel", guard);
    controls.addEventListener("click", guard);
  }

  bindHoldButton(leftBtn, "left");
  bindHoldButton(rightBtn, "right");

  window.addEventListener("keydown", (event) => {
    if (!isBounchModalOpen()) {
      return;
    }

    if (state === "naming") {
      return;
    }

    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      event.preventDefault();
      handleDirectionInput("left", true);
      return;
    }

    if (event.code === "ArrowRight" || event.code === "KeyD") {
      event.preventDefault();
      handleDirectionInput("right", true);
      return;
    }

    if (event.code === "Space") {
      if (state === "idle") {
        event.preventDefault();
        beginContinueSession();
      } else if (state === "over") {
        event.preventDefault();
        closeShareModal();
        enterReady();
      } else if (state === "won") {
        event.preventDefault();
        closeShareModal();
        if (levelIndex < LEVELS.length - 1) {
          goToLevel(levelIndex + 1);
        } else {
          clearedLevel = 0;
          goToLevel(0);
        }
      }
    }
  });

  window.addEventListener("keyup", (event) => {
    if (!isBounchModalOpen()) {
      return;
    }

    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      handleDirectionInput("left", false);
    }

    if (event.code === "ArrowRight" || event.code === "KeyD") {
      handleDirectionInput("right", false);
    }
  });

  restartNode.addEventListener("click", () => {
    closeShareModal();
    enterReady();
  });

  nextLevelBtn?.addEventListener("click", () => {
    if (state !== "won") {
      return;
    }

    if (levelIndex >= LEVELS.length - 1) {
      return;
    }

    closeShareModal();
    goToLevel(levelIndex + 1);
  });

  playAgainBtn?.addEventListener("click", () => {
    if (state !== "won") {
      return;
    }

    if (levelIndex !== LEVELS.length - 1) {
      return;
    }

    closeShareModal();
    clearedLevel = 0;
    goToLevel(0);
  });

  startPlayBtn.addEventListener("click", () => {
    closeShareModal();
    beginContinueSession();
  });

  openGameBtn?.addEventListener("click", () => {
    prepareGameModal();
  });

  closeGameBtn?.addEventListener("click", () => {
    closeGameModal();
  });

  savePlayerNameBtn?.addEventListener("click", () => {
    submitSetupPlayerName();
  });

  setupPlayerNameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitSetupPlayerName();
    }
  });

  submitScoreBtn?.addEventListener("click", () => {
    void sharePendingClear();
  });

  skipScoreBtn?.addEventListener("click", () => {
    if (isSubmittingScore) {
      return;
    }

    closeShareModal();
  });

  playerNameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void sharePendingClear();
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    if (isBounchModalOpen()) {
      resize();
    }
  });

  const stageElement = arena?.parentElement;

  if (stageElement) {
    resizeObserver.observe(stageElement);
  } else if (arena) {
    resizeObserver.observe(arena);
  }

  window.addEventListener("resize", () => {
    if (isBounchModalOpen()) {
      resize();
    }
  });

  highScore = loadHighScore();
  levelIndex = 0;
  resetLevel();
  updateHud();
  setIdleOverlay();

  window.addEventListener("beforeunload", () => {
    stopLoop();
    resizeObserver.disconnect();
    activeClose = null;
  });
}
