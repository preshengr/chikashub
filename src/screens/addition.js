import { el, randInt, shuffle, renderStars } from "../ui.js";
import { say, playChime, playBuzz } from "../sound.js";

const ROUNDS = 5;
const ITEMS = ["🍎", "⭐", "🐱", "🍉", "🌟", "🚀", "🐥", "🌈"];

export function renderAddition(screen, navigate) {
  const panel = el("div", { class: "panel" });
  const scoreLine = el("div", { class: "score" }, "Round 1 of " + ROUNDS);
  const stars = el("div");
  renderStars(stars, 0, ROUNDS);
  const prompt = el("div", { class: "prompt" });
  const group = el("div", { style: "display:flex;gap:24px;justify-content:center;flex-wrap:wrap" });
  const g1 = el("div", { class: "objects" });
  const g2 = el("div", { class: "objects" });
  const plus = el("div", { style: "font-size:3rem;align-self:center" }, "+");
  const choices = el("div", { class: "choices" });
  const feedback = el("div", { class: "feedback" });
  const back = el("button", { class: "btn", onclick: () => navigate("menu") }, "⬅ Home");

  group.append(g1, plus, g2);
  panel.append(
    el("h2", {}, "➕ Add It Up"),
    scoreLine,
    stars,
    prompt,
    group,
    choices,
    feedback,
    el("div", { class: "row" }, back)
  );
  screen.append(panel);

  let round = 0;
  let earned = 0;
  let a = 0;
  let b = 0;

  function makeObjects(container, count) {
    container.innerHTML = "";
    const item = ITEMS[randInt(0, ITEMS.length - 1)];
    for (let i = 0; i < count; i++) container.append(el("span", { class: "pop" }, item));
  }

  function nextRound() {
    if (round >= ROUNDS) {
      finish();
      return;
    }
    round++;
    scoreLine.textContent = "Round " + round + " of " + ROUNDS;
    renderStars(stars, earned, ROUNDS);

    a = randInt(1, 9);
    b = randInt(1, 9);
    const sum = a + b;
    makeObjects(g1, a);
    makeObjects(g2, b);
    prompt.textContent = "How many in total?";
    say(a + " plus " + b + " equals how many?");

    const wrong = shuffle(
      [sum - 1, sum + 1, sum - 2, sum + 2].filter((n) => n > 0 && n !== sum)
    ).slice(0, 2);
    const opts = shuffle([sum, ...wrong]);

    choices.innerHTML = "";
    opts.forEach((n) => {
      choices.append(
        el("button", { class: "btn choice", onclick: () => check(n, sum) }, String(n))
      );
    });
    feedback.textContent = "";
    feedback.className = "feedback";
  }

  function check(picked, sum) {
    if (picked === sum) {
      earned++;
      feedback.textContent = "🎉 " + a + " + " + b + " = " + sum + "! Perfect!";
      feedback.className = "feedback good";
      playChime();
      say("Correct! " + sum);
      setTimeout(nextRound, 1200);
    } else {
      feedback.textContent = "Count again! 💪";
      feedback.className = "feedback bad";
      playBuzz();
    }
  }

  function finish() {
    group.style.display = "none";
    choices.innerHTML = "";
    prompt.textContent =
      earned === ROUNDS
        ? "Math wizard! You added like a pro! 🧙"
        : "You earned " + earned + " star" + (earned === 1 ? "" : "s") + "! Try again?";
    renderStars(stars, earned, ROUNDS);
    choices.append(
      el("button", { class: "btn primary big", onclick: () => renderAddition(screen, navigate) }, "🔁 Play Again")
    );
  }

  nextRound();
}
