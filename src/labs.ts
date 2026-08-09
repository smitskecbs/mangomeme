import { closeMangoSnake, initMangoSnake } from "./mangoSnake.ts";
import { closeMangoBounch, initMangoBounch } from "./mangoBounch.ts";
import { initMangoAchievements } from "./mangoAchievements.ts";
import { captureGameIdentityFromLocation } from "./mangoGameIdentity.ts";
import { openLabsGameFromDeepLink } from "./mangoLabsDeepLink.ts";

captureGameIdentityFromLocation();
initMangoSnake();
initMangoBounch();
initMangoAchievements();

document.getElementById("ms-open-game")?.addEventListener(
  "click",
  () => {
    closeMangoBounch();
  },
  true
);

document.getElementById("mb-open-game")?.addEventListener(
  "click",
  () => {
    closeMangoSnake();
  },
  true
);

// After identity capture + game controls/listeners are ready: same path as manual Start game.
openLabsGameFromDeepLink();
