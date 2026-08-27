import { el, randInt, shuffle, renderStars } from "../ui.js";
import { say, playChime, playBuzz } from "../sound.js";

const ROUNDS = 5;

export function renderNumberRecognition(screen, navigate) {
  const panel = el("div", { class: "panel" });
  const scoreLine = el("div", { class: "score" }, "Round 1 of " + ROUNDS);
  const stars = el("div");
  renderStars(stars, 0, ROUNDS);
  const prompt = el("div", { class: "prompt" });
  const big = el("div", { style: "font-size:6rem;font-weight:bold;margin:10px 0" });
  const choices = el("div", { class: "choices" });
  const feedback = el("div", { class: "feedback" });
  const back = el("button", { class: "btn", onclick: () => navigate("menu") }, "⬅ Home");

  panel.append(
    el("h2", {}, "🔢 Number Hunt"),
    scoreLine,
    stars,
    prompt,
    big,
    choices,
    feedback,
    el("div", { class: "row" }, back)
  );
  screen.append(panel);

  let round = 0;
  let earned = 0;

  function nextRound() {
    if (round >= ROUNDS) {
      finish();
      return;
    }
    round++;
    scoreLine.textContent = "Round " + round + " of " + ROUNDS;
    renderStars(stars, earned, ROUNDS);

    const target = randInt(1, 9);
    prompt.textContent = "Tap the number that looks like this:";
    big.textContent = target;
    big.className = "pop";
    say("Find the number " + target);
    setTimeout(() => (big.className = ""), 400);

    const wrong = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n !== target)).slice(0, 2);
    const opts = shuffle([target, ...wrong]);

    choices.innerHTML = "";
    opts.forEach((n) => {
      choices.append(
        el(
          "button",
          {
            class: "btn choice",
            onclick: () => check(n, target),
          },
          String(n)
        )
      );
    });
    feedback.textContent = "";
    feedback.className = "feedback";
  }

  function check(picked, target) {
    if (picked === target) {
      earned++;
      feedback.textContent = "🎉 Correct! Great job!";
      feedback.className = "feedback good";
      playChime();
      say("Correct!");
      setTimeout(nextRound, 1100);
    } else {
      feedback.textContent = "Try again! 💪";
      feedback.className = "feedback bad";
      playBuzz();
      say("Try again");
    }
  }

  function finish() {
    choices.innerHTML = "";
    big.textContent = "🏆";
    prompt.textContent =
      earned === ROUNDS
        ? "You are a number superstar! ⭐"
        : "You earned " + earned + " star" + (earned === 1 ? "" : "s") + "! Play again?";
    renderStars(stars, earned, ROUNDS);
    feedback.textContent = "";
    choices.append(
      el("button", { class: "btn primary big", onclick: () => renderNumberRecognition(screen, navigate) }, "🔁 Play Again")
    );
  }

  nextRound();
}
