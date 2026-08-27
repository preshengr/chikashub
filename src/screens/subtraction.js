import { el, randInt, shuffle, renderStars } from "../ui.js";
import { say, playChime, playBuzz } from "../sound.js";

const ROUNDS = 5;
const ITEMS = ["🍪", "🍓", "🐟", "🍬", "🐞", "🌸", "🥕", "🍇"];

export function renderSubtraction(screen, navigate) {
  const panel = el("div", { class: "panel" });
  const scoreLine = el("div", { class: "score" }, "Round 1 of " + ROUNDS);
  const stars = el("div");
  renderStars(stars, 0, ROUNDS);
  const prompt = el("div", { class: "prompt" });
  const group = el("div", { class: "objects" });
  const choices = el("div", { class: "choices" });
  const feedback = el("div", { class: "feedback" });
  const back = el("button", { class: "btn", onclick: () => navigate("menu") }, "⬅ Home");

  panel.append(
    el("h2", {}, "➖ Take Away"),
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

  function nextRound() {
    if (round >= ROUNDS) {
      finish();
      return;
    }
    round++;
    scoreLine.textContent = "Round " + round + " of " + ROUNDS;
    renderStars(stars, earned, ROUNDS);

    a = randInt(4, 10);
    b = randInt(1, a - 1);
    const left = a - b;

    group.innerHTML = "";
    const item = ITEMS[randInt(0, ITEMS.length - 1)];
    for (let i = 0; i < a; i++) {
      const gone = i >= left;
      group.append(el("span", { class: gone ? "gone" : "pop" }, item));
    }

    prompt.innerHTML = "";
    prompt.append(
      "There were " + a + " ",
      el("span", {}, item),
      ". " + b + " went away. How many are left?"
    );
    say(a + " take away " + b + " equals how many?");

    const wrong = shuffle(
      [left - 1, left + 1, left - 2, left + 2].filter((n) => n >= 0 && n !== left)
    ).slice(0, 2);
    const opts = shuffle([left, ...wrong]);

    choices.innerHTML = "";
    opts.forEach((n) => {
      choices.append(
        el("button", { class: "btn choice", onclick: () => check(n, left, a, b) }, String(n))
      );
    });
    feedback.textContent = "";
    feedback.className = "feedback";
  }

  function check(picked, left, a, b) {
    if (picked === left) {
      earned++;
      feedback.textContent = "🎉 " + a + " − " + b + " = " + left + "! Nice!";
      feedback.className = "feedback good";
      playChime();
      say("Correct! " + left);
      setTimeout(nextRound, 1200);
    } else {
      feedback.textContent = "Look at the ones left! 💪";
      feedback.className = "feedback bad";
      playBuzz();
    }
  }

  function finish() {
    group.style.display = "none";
    choices.innerHTML = "";
    prompt.textContent =
      earned === ROUNDS
        ? "Super star! You took away like a champ! 🌟"
        : "You earned " + earned + " star" + (earned === 1 ? "" : "s") + "! Try again?";
    renderStars(stars, earned, ROUNDS);
    choices.append(
      el("button", { class: "btn primary big", onclick: () => renderSubtraction(screen, navigate) }, "🔁 Play Again")
    );
  }

  nextRound();
}
