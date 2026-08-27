import { el } from "../ui.js";

export function renderMenu(screen, navigate) {
  const panel = el("div", { class: "panel" });

  panel.append(
    el("h2", {}, "Pick an Adventure! 🎈"),
    el(
      "p",
      { class: "prompt" },
      "Hello little explorer! What would you like to play today?"
    )
  );

  const menu = el("div", { class: "menu" });

  const games = [
    {
      emoji: "🔢",
      label: "Number Hunt",
      desc: "Find the number!",
      view: "number",
    },
    {
      emoji: "➕",
      label: "Add It Up",
      desc: "Put things together",
      view: "addition",
    },
    {
      emoji: "➖",
      label: "Take Away",
      desc: "Take things away",
      view: "subtraction",
    },
  ];

  games.forEach((g) => {
    menu.append(
      el(
        "button",
        { class: "btn big", onclick: () => navigate(g.view) },
        el("span", { class: "emoji" }, g.emoji),
        el("span", {}, g.label),
        el("span", { style: "font-size:1rem;opacity:.7" }, g.desc)
      )
    );
  });

  panel.append(menu);
  screen.append(panel);
}
