import { closeMangoSnake, initMangoSnake } from "./mangoSnake.ts";
import { closeMangoBounch, initMangoBounch } from "./mangoBounch.ts";

initMangoSnake();
initMangoBounch();

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
