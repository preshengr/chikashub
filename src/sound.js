let enabled = true;

export function initSound(isEnabled) {
  enabled = isEnabled();
}

export function say(text) {
  if (!enabled || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.pitch = 1.2;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function playChime() {
  if (!enabled) return;
  beep([523.25, 659.25, 783.99], 0.18);
}

export function playBuzz() {
  if (!enabled) return;
  beep([220, 180], 0.22, "sawtooth");
}

function beep(freqs, duration, type = "sine") {
  if (!("AudioContext" in window)) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let start = ctx.currentTime;
  freqs.forEach((f) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
    start += duration;
  });
  setTimeout(() => ctx.close(), (duration * freqs.length + 0.1) * 1000);
}