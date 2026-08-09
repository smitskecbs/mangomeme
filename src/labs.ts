import { closeMangoSnake, initMangoSnake } from "./mangoSnake.ts";
import { closeMangoBounch, initMangoBounch } from "./mangoBounch.ts";
import { initMangoAchievements } from "./mangoAchievements.ts";
import { captureGameIdentityFromLocation } from "./mangoGameIdentity.ts";

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
