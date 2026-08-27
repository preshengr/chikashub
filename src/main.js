import { renderMenu } from "./screens/menu.js";
import { renderNumberRecognition } from "./screens/numberRecognition.js";
import { renderAddition } from "./screens/addition.js";
import { renderSubtraction } from "./screens/subtraction.js";
import { initSound, say, playChime, playBuzz } from "./sound.js";

const screen = document.getElementById("screen");
const soundToggle = document.getElementById("sound-toggle");

let soundOn = true;

export function navigate(view) {
  screen.innerHTML = "";
  switch (view) {
    case "menu":
      renderMenu(screen, navigate);
      break;
    case "number":
      renderNumberRecognition(screen, navigate);
      break;
    case "addition":
      renderAddition(screen, navigate);
      break;
    case "subtraction":
      renderSubtraction(screen, navigate);
      break;
  }
}

soundToggle.addEventListener("click", () => {
  soundOn = !soundOn;
  soundToggle.textContent = soundOn ? "🔊" : "🔇";
});

initSound(() => soundOn);
say;
playChime;
playBuzz;

navigate("menu");