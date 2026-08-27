export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "onclick") node.addEventListener("click", v);
    else if (k.startsWith("data-")) node.setAttribute(k, v);
    else node[k] = v;
  });
  children.flat().forEach((c) => {
    if (c == null) return;
    node.append(c.nodeType ? c : document.createTextNode(c));
  });
  return node;
}

export function clear(node) {
  node.innerHTML = "";
}

export function renderStars(node, earned, total) {
  node.className = "stars";
  node.textContent = "⭐".repeat(earned) + "☆".repeat(Math.max(0, total - earned));
}
