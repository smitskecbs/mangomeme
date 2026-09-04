/**
 * ManGo Labs Achievements V1 — local unlocks, gallery, and share-to-X.
 * Fully client-side; no backend.
 */

export const ACHIEVEMENTS_STORAGE_KEY = "mango-labs-achievements";
export const LABS_PAGE_URL = "https://www.mangomeme.fun/mango-labs";

export type AchievementGame = "snake" | "bounch";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  game: AchievementGame;
}

export interface UnlockedRecord {
  unlockedAt: number;
  /** Set when the player clicked Share on X (intent opened); not proof of a published post. */
  sharedAt?: number;
}

export type AchievementsMap = Record<string, UnlockedRecord>;

/** Consistent label shown after a local Share on X click. */
export const ACHIEVEMENT_SHARED_LABEL = "📣 Shared";

export type AchievementShareUiState = "share" | "shared" | "none";

export interface AchievementStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface UnlockOptions {
  storage?: AchievementStorage;
  now?: number;
  /** When false, skip toast/gallery side effects (tests). Default true. */
  notify?: boolean;
  /**
   * Persist unlock + refresh gallery, but queue toasts until
   * flushDeferredAchievementToasts() — keeps share/submit UI unblocked.
   */
  deferToast?: boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: "snake-first-game",
    title: "First Snake Run",
    description: "Play your first ManGo Snake game.",
    icon: "🐍",
    game: "snake",
  },
  {
    id: "snake-score-100",
    title: "Snake Starter",
    description: "Score 100 points in ManGo Snake.",
    icon: "🌱",
    game: "snake",
  },
  {
    id: "snake-score-500",
    title: "Snake Climber",
    description: "Score 500 points in ManGo Snake.",
    icon: "🥭",
    game: "snake",
  },
  {
    id: "snake-score-1500",
    title: "Snake Master",
    description: "Score 1,500 points in ManGo Snake.",
    icon: "👑",
    game: "snake",
  },
  {
    id: "bounch-level-1",
    title: "First Bounch",
    description: "Complete Level 1 in Bounch.",
    icon: "🥭",
    game: "bounch",
  },
  {
    id: "bounch-level-3",
    title: "Bounch Explorer",
    description: "Complete Level 3 in Bounch.",
    icon: "🏅",
    game: "bounch",
  },
  {
    id: "bounch-level-5",
    title: "Bounch Challenger",
    description: "Complete Level 5 in Bounch.",
    icon: "🏆",
    game: "bounch",
  },
  {
    id: "bounch-level-7",
    title: "Bounch Master",
    description: "Complete Level 7 in Bounch.",
    icon: "👑",
    game: "bounch",
  },
] as const;

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((item) => [item.id, item]));

const BOUNCH_LEVEL_ACHIEVEMENTS: Readonly<Record<number, string>> = {
  1: "bounch-level-1",
  3: "bounch-level-3",
  5: "bounch-level-5",
  7: "bounch-level-7",
};

const browserStorage: AchievementStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore storage failures
    }
  },
};

type NewlyUnlockedListener = (achievements: AchievementDef[]) => void;

let newlyUnlockedListener: NewlyUnlockedListener | null = null;
let toastQueue: AchievementDef[] = [];
let deferredToastQueue: AchievementDef[] = [];
let toastActive: AchievementDef | null = null;
let toastBound = false;

export function getAchievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_BY_ID.get(id);
}

export function parseAchievementsStorage(raw: string | null): AchievementsMap {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: AchievementsMap = {};

    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id !== "string" || !id) {
        continue;
      }

      if (!value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }

      const unlockedAt = (value as { unlockedAt?: unknown }).unlockedAt;

      if (typeof unlockedAt !== "number" || !Number.isFinite(unlockedAt)) {
        continue;
      }

      const record: UnlockedRecord = { unlockedAt };
      const sharedAt = (value as { sharedAt?: unknown }).sharedAt;

      if (typeof sharedAt === "number" && Number.isFinite(sharedAt)) {
        record.sharedAt = sharedAt;
      }

      result[id] = record;
    }

    return result;
  } catch {
    return {};
  }
}

function resolveStorage(storage?: AchievementStorage): AchievementStorage {
  return storage ?? browserStorage;
}

export function loadAchievementsMap(storage?: AchievementStorage): AchievementsMap {
  return parseAchievementsStorage(resolveStorage(storage).getItem(ACHIEVEMENTS_STORAGE_KEY));
}

export function saveAchievementsMap(map: AchievementsMap, storage?: AchievementStorage): void {
  resolveStorage(storage).setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(map));
}

export function getUnlockedAchievements(
  storage?: AchievementStorage
): Array<AchievementDef & { unlockedAt: number; sharedAt?: number }> {
  const map = loadAchievementsMap(storage);
  const unlocked: Array<AchievementDef & { unlockedAt: number; sharedAt?: number }> = [];

  for (const def of ACHIEVEMENTS) {
    const record = map[def.id];

    if (record) {
      unlocked.push({
        ...def,
        unlockedAt: record.unlockedAt,
        ...(record.sharedAt !== undefined ? { sharedAt: record.sharedAt } : {}),
      });
    }
  }

  return unlocked;
}

export function isAchievementUnlocked(id: string, storage?: AchievementStorage): boolean {
  return Boolean(loadAchievementsMap(storage)[id]);
}

export function isAchievementShared(id: string, storage?: AchievementStorage): boolean {
  const sharedAt = loadAchievementsMap(storage)[id]?.sharedAt;
  return typeof sharedAt === "number" && Number.isFinite(sharedAt);
}

/**
 * Gallery/toast share control model for one achievement id.
 * Locked, unknown, or Bounch → none (Bounch does not offer Share on X).
 * Snake unlocked unshared → share; Snake unlocked shared → shared.
 */
export function getAchievementShareUiState(
  id: string,
  storage?: AchievementStorage
): AchievementShareUiState {
  const def = getAchievementById(id);

  if (!def || def.game !== "snake" || !isAchievementUnlocked(id, storage)) {
    return "none";
  }

  return isAchievementShared(id, storage) ? "shared" : "share";
}

/**
 * Mark an unlocked achievement as locally shared after Share on X was clicked.
 * Unknown / locked ids are ignored. Re-marking is safe and keeps unlockedAt.
 */
export function markAchievementShared(
  id: string,
  options: { storage?: AchievementStorage; now?: number } = {}
): boolean {
  if (!getAchievementById(id)) {
    return false;
  }

  const storage = resolveStorage(options.storage);
  const map = loadAchievementsMap(storage);
  const record = map[id];

  if (!record) {
    return false;
  }

  if (typeof record.sharedAt === "number" && Number.isFinite(record.sharedAt)) {
    return true;
  }

  map[id] = {
    unlockedAt: record.unlockedAt,
    sharedAt: options.now ?? Date.now(),
  };
  saveAchievementsMap(map, storage);
  return true;
}

/**
 * Achievement ids earned by a completed Snake run with the given final score.
 * Always includes first-run; score badges when thresholds are met.
 */
export function snakeAchievementsForRun(score: number): string[] {
  const safeScore = Number.isFinite(score) ? Math.max(0, score) : 0;
  const ids = ["snake-first-game"];

  if (safeScore >= 100) {
    ids.push("snake-score-100");
  }

  if (safeScore >= 500) {
    ids.push("snake-score-500");
  }

  if (safeScore >= 1500) {
    ids.push("snake-score-1500");
  }

  return ids;
}

/**
 * Achievement id for a successful Bounch level clear, or null when that level has none.
 */
export function bounchAchievementForLevelClear(levelId: number): string | null {
  if (!Number.isFinite(levelId)) {
    return null;
  }

  return BOUNCH_LEVEL_ACHIEVEMENTS[levelId] ?? null;
}

export function buildAchievementShareText(achievement: AchievementDef): string {
  const leadingEmoji = achievement.game === "snake" ? "🥭🐍" : `🥭${achievement.icon}`;
  const challenge =
    achievement.game === "snake" ? "Think you can beat it?" : "Can you clear it too?";

  return `I just unlocked "${achievement.title}" in ManGo Labs ${leadingEmoji}\n\n${challenge}\n\n${LABS_PAGE_URL}`;
}

export function buildAchievementShareUrl(achievement: AchievementDef): string {
  const text = buildAchievementShareText(achievement);
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

export function openAchievementShare(achievement: AchievementDef): void {
  window.open(buildAchievementShareUrl(achievement), "_blank", "noopener,noreferrer");
}

/**
 * Open the X intent and mark the achievement as locally shared.
 * Returns false when the id is unknown or not unlocked.
 */
export function shareAchievementOnX(
  id: string,
  options: { storage?: AchievementStorage; now?: number } = {}
): boolean {
  const def = getAchievementById(id);

  if (!def || def.game !== "snake" || !isAchievementUnlocked(id, options.storage)) {
    return false;
  }

  openAchievementShare(def);
  markAchievementShared(id, options);
  renderGallery();
  syncActiveToastShareUi();
  return true;
}

/**
 * Unlock a single achievement. Returns the definition when newly unlocked, otherwise null.
 * Unknown ids are ignored.
 */
export function unlockAchievement(id: string, options: UnlockOptions = {}): AchievementDef | null {
  const newly = unlockAchievements([id], options);
  return newly[0] ?? null;
}

/**
 * Unlock many achievements. Returns only those that were newly unlocked (in input order).
 */
export function unlockAchievements(ids: string[], options: UnlockOptions = {}): AchievementDef[] {
  const storage = resolveStorage(options.storage);
  const map = loadAchievementsMap(storage);
  const now = options.now ?? Date.now();
  const newly: AchievementDef[] = [];

  for (const id of ids) {
    const def = getAchievementById(id);

    if (!def || map[id]) {
      continue;
    }

    map[id] = { unlockedAt: now };
    newly.push(def);
  }

  if (newly.length === 0) {
    return [];
  }

  saveAchievementsMap(map, storage);

  if (options.notify === false) {
    return newly;
  }

  if (options.deferToast) {
    renderGallery();
    deferredToastQueue.push(...newly);
    return newly;
  }

  newlyUnlockedListener?.([...newly]);
  return newly;
}

/** Show any achievement toasts queued with deferToast (e.g. after Snake share closes). */
export function flushDeferredAchievementToasts(): void {
  if (deferredToastQueue.length === 0) {
    return;
  }

  const pending = deferredToastQueue;
  deferredToastQueue = [];
  newlyUnlockedListener?.([...pending]);
}

function renderGallery(): void {
  if (typeof document === "undefined") {
    return;
  }

  const grid = document.getElementById("ma-gallery");

  if (!grid) {
    return;
  }

  const map = loadAchievementsMap();
  const parts: string[] = [];

  for (const def of ACHIEVEMENTS) {
    const unlocked = Boolean(map[def.id]);
    const status = unlocked ? "Unlocked" : "Locked";
    const shareUi = getAchievementShareUiState(def.id);
    let shareControl = "";

    if (shareUi === "share") {
      shareControl = `<button type="button" class="btn btn-copy labs-achievement-card__share" data-achievement-id="${def.id}">Share on X</button>`;
    } else if (shareUi === "shared") {
      shareControl = `<span class="labs-achievement-card__shared">${ACHIEVEMENT_SHARED_LABEL}</span>`;
    }

    parts.push(`
      <article class="labs-achievement-card${unlocked ? "" : " labs-achievement-card--locked"}" data-achievement-id="${def.id}">
        <div class="labs-achievement-card__header">
          <span class="labs-achievement-card__icon" aria-hidden="true">${def.icon}</span>
          <span class="labs-achievement-card__status">${status}</span>
        </div>
        <h3 class="labs-achievement-card__title">${def.title}</h3>
        <p class="labs-achievement-card__desc">${def.description}</p>
        ${shareControl}
      </article>
    `);
  }

  grid.innerHTML = parts.join("");
}

function getToastElements(): {
  root: HTMLElement;
  icon: HTMLElement;
  title: HTMLElement;
  desc: HTMLElement;
  share: HTMLButtonElement;
  shared: HTMLElement;
  close: HTMLButtonElement;
} | null {
  const root = document.getElementById("ma-toast");
  const icon = document.getElementById("ma-toast-icon");
  const title = document.getElementById("ma-toast-title");
  const desc = document.getElementById("ma-toast-desc");
  const share = document.getElementById("ma-toast-share") as HTMLButtonElement | null;
  const shared = document.getElementById("ma-toast-shared");
  const close = document.getElementById("ma-toast-close") as HTMLButtonElement | null;

  if (!root || !icon || !title || !desc || !share || !shared || !close) {
    return null;
  }

  return { root, icon, title, desc, share, shared, close };
}

function syncActiveToastShareUi(): void {
  const els = getToastElements();

  if (!els || !toastActive) {
    return;
  }

  const shareUi = getAchievementShareUiState(toastActive.id);

  if (shareUi === "share") {
    els.share.hidden = false;
    els.shared.hidden = true;
    return;
  }

  if (shareUi === "shared") {
    els.share.hidden = true;
    els.shared.hidden = false;
    els.shared.textContent = ACHIEVEMENT_SHARED_LABEL;
    return;
  }

  els.share.hidden = true;
  els.shared.hidden = true;
}

function showToast(achievement: AchievementDef): void {
  const els = getToastElements();

  if (!els) {
    return;
  }

  toastActive = achievement;
  els.icon.textContent = achievement.icon;
  els.title.textContent = achievement.title;
  els.desc.textContent = achievement.description;
  syncActiveToastShareUi();
  els.root.removeAttribute("hidden");
  document.body.classList.add("labs-achievement-toast-open");

  // Keep toast above game/result overlays; focus after paint so it isn't stolen immediately.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (toastActive === achievement) {
        els.close.focus();
      }
    });
  });
}

function hideToastShell(): void {
  const els = getToastElements();
  toastActive = null;

  if (els) {
    els.root.setAttribute("hidden", "");
  }

  document.body.classList.remove("labs-achievement-toast-open");
}

function advanceToastQueue(): void {
  hideToastShell();
  const next = toastQueue.shift();

  if (next) {
    showToast(next);
  }
}

function enqueueAchievementToasts(achievements: AchievementDef[]): void {
  if (achievements.length === 0) {
    return;
  }

  toastQueue.push(...achievements);

  if (!toastActive) {
    const next = toastQueue.shift();

    if (next) {
      showToast(next);
    }
  }
}

function bindToastControls(): void {
  if (toastBound) {
    return;
  }

  const els = getToastElements();

  if (!els) {
    return;
  }

  toastBound = true;

  els.close.addEventListener("click", () => {
    advanceToastQueue();
  });

  els.share.addEventListener("click", () => {
    if (!toastActive) {
      return;
    }

    shareAchievementOnX(toastActive.id);
  });

  els.root.addEventListener("click", (event) => {
    if (event.target === els.root) {
      advanceToastQueue();
    }
  });
}

function bindGalleryShares(): void {
  const grid = document.getElementById("ma-gallery");

  if (!grid || grid.dataset.maBound === "1") {
    return;
  }

  grid.dataset.maBound = "1";

  grid.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("button.labs-achievement-card__share");

    if (!button || button.disabled) {
      return;
    }

    const id = button.getAttribute("data-achievement-id");

    if (!id) {
      return;
    }

    shareAchievementOnX(id);
  });
}

/**
 * Dismiss the current toast and clear any queued notifications.
 * Safe to call when closing game modals; does not wipe unlocked storage.
 */
export function dismissAchievementNotifications(): void {
  toastQueue = [];
  deferredToastQueue = [];
  hideToastShell();
}

export function initMangoAchievements(): void {
  newlyUnlockedListener = (achievements) => {
    renderGallery();
    enqueueAchievementToasts(achievements);
  };

  bindToastControls();
  bindGalleryShares();
  renderGallery();
}
