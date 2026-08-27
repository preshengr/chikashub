import { useState, useEffect, useCallback, useRef } from "react";

// ── Palette ───────────────────────────────────────────────
// Sky-candy: deep violet sky, neon-coral accent, mint reward,
// golden banana highlight — chosen to feel like a Saturday-
// morning cartoon rather than an edtech dashboard.
const COLORS = {
  sky: "#1a0a3c",
  cloud: "#f0eaff",
  coral: "#ff5c5c",
  mint: "#3dffa0",
  banana: "#ffe94a",
  lavender: "#c4aeff",
  blue: "#5bc8ff",
  white: "#ffffff",
};

const LEVELS = [
  { label: "Easy",   ops: ["+"],       max: 10,  time: 20 },
  { label: "Medium", ops: ["+", "-"],  max: 20,  time: 15 },
  { label: "Hard",   ops: ["+", "-", "×"], max: 12, time: 10 },
];

const REWARDS = ["🌟", "🎉", "🦄", "🍭", "🚀", "🏆", "🎈", "⚡"];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateQuestion(level) {
  const { ops, max } = LEVELS[level];
  const op = ops[randomInt(0, ops.length - 1)];
  let a, b, answer;

  if (op === "+") {
    a = randomInt(1, max); b = randomInt(1, max);
    answer = a + b;
  } else if (op === "-") {
    a = randomInt(1, max); b = randomInt(1, a);
    answer = a - b;
  } else {
    a = randomInt(1, 10); b = randomInt(1, 10);
    answer = a * b;
  }

  // Build 4 unique choices
  const wrongSet = new Set();
  while (wrongSet.size < 3) {
    const w = answer + randomInt(-5, 5) * (Math.random() > 0.5 ? 1 : -1);
    if (w !== answer && w >= 0) wrongSet.add(w);
  }
  const choices = [...wrongSet, answer].sort(() => Math.random() - 0.5);

  return { a, b, op, answer, choices };
}

// ── Floating star particles ───────────────────────────────
function Particle({ x, y, color, onDone }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); onDone(); }, 900);
    return () => clearTimeout(t);
  }, [onDone]);
  if (!visible) return null;
  return (
    <div style={{
      position: "fixed", left: x, top: y, pointerEvents: "none", zIndex: 999,
      fontSize: 28, animation: "floatUp 0.9s ease-out forwards",
    }}>{color}</div>
  );
}

// ── Timer ring ────────────────────────────────────────────
function TimerRing({ pct }) {
  const r = 30, circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const color = pct > 0.5 ? COLORS.mint : pct > 0.25 ? COLORS.banana : COLORS.coral;
  return (
    <svg width={80} height={80} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={40} cy={40} r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth={7} />
      <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.3s, stroke 0.3s" }} />
    </svg>
  );
}

// ── Answer Button ─────────────────────────────────────────
function ChoiceBtn({ value, onClick, state }) {
  const bg =
    state === "correct" ? COLORS.mint :
    state === "wrong"   ? COLORS.coral :
    "rgba(255,255,255,0.10)";
  const border =
    state === "correct" ? `2px solid ${COLORS.mint}` :
    state === "wrong"   ? `2px solid ${COLORS.coral}` :
    `2px solid rgba(255,255,255,0.20)`;
  const scale = state ? "scale(0.95)" : "scale(1)";
  return (
    <button onClick={onClick} style={{
      background: bg, border, borderRadius: 18,
      color: COLORS.white, fontSize: 28, fontWeight: 800,
      fontFamily: "'Nunito', 'Fredoka One', system-ui, sans-serif",
      padding: "18px 0", width: "100%", cursor: "pointer",
      transform: scale, transition: "all 0.18s ease",
      boxShadow: state ? "none" : "0 4px 20px rgba(0,0,0,0.25)",
      letterSpacing: 1,
    }}>{value}</button>
  );
}

// ── Main Game ─────────────────────────────────────────────
export default function NumberCrunch() {
  const [screen, setScreen]       = useState("home"); // home | game | result
  const [levelIdx, setLevelIdx]   = useState(0);
  const [question, setQuestion]   = useState(null);
  const [score, setScore]         = useState(0);
  const [streak, setStreak]       = useState(0);
  const [lives, setLives]         = useState(3);
  const [round, setRound]         = useState(0);
  const [timeLeft, setTimeLeft]   = useState(0);
  const [chosen, setChosen]       = useState(null); // { idx, correct }
  const [particles, setParticles] = useState([]);
  const [shake, setShake]         = useState(false);
  const [reward, setReward]       = useState("");
  const [highScore, setHighScore] = useState(0);

  const TOTAL_ROUNDS = 10;
  const timerRef = useRef(null);
  const pid = useRef(0);

  const nextQuestion = useCallback((lvl) => {
    setQuestion(generateQuestion(lvl));
    setChosen(null);
    setTimeLeft(LEVELS[lvl].time);
  }, []);

  const startGame = (lvl) => {
    setScore(0); setStreak(0); setLives(3); setRound(1); setLevelIdx(lvl);
    setScreen("game");
    setQuestion(generateQuestion(lvl));
    setTimeLeft(LEVELS[lvl].time);
    setChosen(null);
  };

  // ── Timer countdown ──────────────────────────────────────
  useEffect(() => {
    if (screen !== "game" || chosen !== null) return;
    if (timeLeft <= 0) {
      handleTimeout();
      return;
    }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [timeLeft, screen, chosen]);

  const handleTimeout = () => {
    setLives(l => {
      const next = l - 1;
      if (next <= 0) endGame();
      else advance(false);
      return next;
    });
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const addParticle = (emoji, x, y) => {
    const id = pid.current++;
    setParticles(ps => [...ps, { id, emoji, x, y }]);
  };

  const handleChoice = (choice, idx, e) => {
    if (chosen !== null) return;
    clearTimeout(timerRef.current);
    const correct = choice === question.answer;
    setChosen({ idx, correct });

    if (correct) {
      const bonus = streak >= 2 ? 2 : 1;
      setScore(s => s + 10 * bonus);
      setStreak(s => s + 1);
      const r = REWARDS[Math.floor(Math.random() * REWARDS.length)];
      setReward(r);
      if (e?.currentTarget) {
        const rect = e.currentTarget.getBoundingClientRect();
        addParticle(r, rect.left + rect.width / 2 - 14, rect.top - 20);
      }
    } else {
      setStreak(0);
      setLives(l => {
        if (l - 1 <= 0) { setTimeout(endGame, 600); return 0; }
        return l - 1;
      });
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }

    setTimeout(() => {
      if (round >= TOTAL_ROUNDS) endGame();
      else { setRound(r => r + 1); advance(correct); }
    }, 700);
  };

  const advance = (wasCorrect) => {
    setQuestion(generateQuestion(levelIdx));
    setChosen(null);
    setTimeLeft(LEVELS[levelIdx].time);
    setReward("");
  };

  const endGame = () => {
    setHighScore(h => Math.max(h, score));
    setScreen("result");
  };

  const opLabel = { "+": "+", "-": "−", "×": "×" };

  // ── Stars background ──────────────────────────────────────
  const stars = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1.5,
    delay: Math.random() * 3,
  }));

  return (
    <div style={{
      minHeight: "100vh", background: `linear-gradient(160deg, ${COLORS.sky} 0%, #2d1060 100%)`,
      fontFamily: "'Nunito', 'Fredoka One', system-ui, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: 16, overflow: "hidden", position: "relative",
    }}>

      {/* CSS animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap');
        @keyframes floatUp { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-80px) scale(1.4)} }
        @keyframes pop { 0%{transform:scale(1)} 50%{transform:scale(1.18)} 100%{transform:scale(1)} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-10px)} 40%{transform:translateX(10px)} 60%{transform:translateX(-8px)} 80%{transform:translateX(8px)} }
        @keyframes twinkle { 0%,100%{opacity:.3} 50%{opacity:1} }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        .choice-btn:hover { transform: scale(1.06) !important; background: rgba(255,255,255,0.18) !important; }
      `}</style>

      {/* Star particles */}
      {stars.map(s => (
        <div key={s.id} style={{
          position: "fixed", left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size, borderRadius: "50%",
          background: COLORS.lavender, pointerEvents: "none",
          animation: `twinkle ${2 + s.delay}s ease-in-out infinite`,
          animationDelay: `${s.delay}s`, opacity: 0.5,
        }} />
      ))}

      {/* Floating emoji particles */}
      {particles.map(p => (
        <Particle key={p.id} x={p.x} y={p.y} color={p.emoji}
          onDone={() => setParticles(ps => ps.filter(x => x.id !== p.id))} />
      ))}

      {/* ── HOME SCREEN ─────────────────────────────── */}
      {screen === "home" && (
        <div style={{ textAlign: "center", animation: "slideUp 0.5s ease", maxWidth: 420, width: "100%" }}>
          <div style={{ fontSize: 72, marginBottom: 50, animation: "pulse 2s ease-in-out infinite" }}>🔢</div>
          <h1 style={{
            fontSize: 48, fontWeight: 900, color: COLORS.banana, margin: "0 0 6px",
            textShadow: "0 4px 24px rgba(255,233,74,0.5)", letterSpacing: -1,
          }}>Number Crunch!</h1>
          <p style={{ color: COLORS.lavender, fontSize: 17, margin: "0 0 36px", fontWeight: 700 }}>
            Pick the right answer before time runs out! 🚀
          </p>

          {highScore > 0 && (
            <div style={{ color: COLORS.banana, marginBottom: 20, fontWeight: 800, fontSize: 16 }}>
              🏆 Best Score: {highScore}
            </div>
          )}

          <p style={{ color: COLORS.cloud, fontWeight: 800, fontSize: 14, marginBottom: 14, letterSpacing: 2, textTransform: "uppercase" }}>Choose Level</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {LEVELS.map((lv, i) => {
              const icons = ["🌱", "⚡", "🔥"];
              const accent = [COLORS.mint, COLORS.blue, COLORS.coral][i];
              return (
                <button key={i} onClick={() => startGame(i)} style={{
                  background: `linear-gradient(120deg, ${accent}22, ${accent}44)`,
                  border: `2px solid ${accent}`,
                  borderRadius: 18, padding: "16px 24px",
                  color: COLORS.white, fontSize: 20, fontWeight: 800,
                  cursor: "pointer", transition: "all 0.18s ease",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span>{icons[i]} {lv.label}</span>
                  <span style={{ fontSize: 13, color: accent, fontWeight: 700 }}>
                    {lv.ops.join(" ")} · ⏱ {lv.time}s
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── GAME SCREEN ─────────────────────────────── */}
      {screen === "game" && question && (
        <div style={{
          width: "100%", maxWidth: 420,
          animation: shake ? "shake 0.4s ease" : "slideUp 0.3s ease",
        }}>
          {/* HUD */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            {/* Score */}
            <div style={{ textAlign: "center" }}>
              <div style={{ color: COLORS.banana, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{score}</div>
              <div style={{ color: COLORS.lavender, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>SCORE</div>
            </div>

            {/* Timer ring */}
            <div style={{ position: "relative", width: 80, height: 80 }}>
              <TimerRing pct={timeLeft / LEVELS[levelIdx].time} />
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                color: COLORS.white, fontSize: 22, fontWeight: 900,
              }}>{timeLeft}</div>
            </div>

            {/* Lives & round */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, letterSpacing: 2 }}>{"❤️".repeat(lives)}{"🖤".repeat(3 - lives)}</div>
              <div style={{ color: COLORS.lavender, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
                {round}/{TOTAL_ROUNDS}
              </div>
            </div>
          </div>

          {/* Streak badge */}
          {streak >= 2 && (
            <div style={{
              textAlign: "center", marginBottom: 10,
              color: COLORS.banana, fontWeight: 900, fontSize: 14,
              animation: "pop 0.3s ease",
            }}>🔥 {streak}x STREAK! Double points!</div>
          )}

          {/* Question card */}
          <div style={{
            background: "rgba(255,255,255,0.08)", borderRadius: 28,
            border: "2px solid rgba(255,255,255,0.15)",
            padding: "32px 24px 28px", textAlign: "center", marginBottom: 24,
            backdropFilter: "blur(12px)",
          }}>
            <div style={{ color: COLORS.lavender, fontSize: 13, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>
              WHAT IS...
            </div>
            <div style={{
              color: COLORS.white, fontSize: 52, fontWeight: 900, letterSpacing: -1,
              textShadow: "0 0 30px rgba(255,255,255,0.3)",
            }}>
              {question.a} {opLabel[question.op]} {question.b} = ?
            </div>
            {reward && (
              <div style={{ fontSize: 32, marginTop: 10, animation: "pop 0.3s ease" }}>{reward}</div>
            )}
          </div>

          {/* Answer choices */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {question.choices.map((c, i) => {
              let state = null;
              if (chosen !== null) {
                if (c === question.answer) state = "correct";
                else if (i === chosen.idx) state = "wrong";
              }
              return (
                <div key={i} className="choice-btn">
                  <ChoiceBtn value={c} state={state}
                    onClick={(e) => handleChoice(c, i, e)} />
                </div>
              );
            })}
          </div>

          {/* Quit */}
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button onClick={() => setScreen("home")} style={{
              background: "transparent", border: "none",
              color: COLORS.lavender, fontSize: 13, fontWeight: 700,
              cursor: "pointer", letterSpacing: 1,
            }}>✕ QUIT GAME</button>
          </div>
        </div>
      )}

      {/* ── RESULT SCREEN ───────────────────────────── */}
      {screen === "result" && (
        <div style={{ textAlign: "center", animation: "slideUp 0.5s ease", maxWidth: 400, width: "100%" }}>
          <div style={{ fontSize: 72, marginBottom: 8 }}>
            {score >= 80 ? "🏆" : score >= 50 ? "⭐" : "💪"}
          </div>
          <h2 style={{ fontSize: 38, fontWeight: 900, color: COLORS.banana, margin: "0 0 8px" }}>
            {score >= 80 ? "Amazing!" : score >= 50 ? "Well Done!" : "Keep Going!"}
          </h2>
          <p style={{ color: COLORS.lavender, fontWeight: 700, marginBottom: 28 }}>
            {score >= 80
              ? "You're a Number Crunch champion! 🚀"
              : score >= 50
              ? "Great maths skills! Try again for more! ✨"
              : "Practice makes perfect! You can do it! 🌱"}
          </p>

          {/* Stats */}
          <div style={{
            background: "rgba(255,255,255,0.08)", borderRadius: 24,
            border: "2px solid rgba(255,255,255,0.15)",
            padding: "24px", marginBottom: 28,
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16,
          }}>
            {[
              { label: "Score", value: score, emoji: "🎯" },
              { label: "Best", value: Math.max(highScore, score), emoji: "🏆" },
              { label: "Level", value: LEVELS[levelIdx].label, emoji: "📊" },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 22 }}>{s.emoji}</div>
                <div style={{ color: COLORS.white, fontSize: 24, fontWeight: 900 }}>{s.value}</div>
                <div style={{ color: COLORS.lavender, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => startGame(levelIdx)} style={{
              background: `linear-gradient(120deg, ${COLORS.coral}, #ff8c42)`,
              border: "none", borderRadius: 18, padding: "16px",
              color: COLORS.white, fontSize: 20, fontWeight: 900,
              cursor: "pointer", boxShadow: `0 6px 24px ${COLORS.coral}66`,
            }}>🔄 Play Again</button>
            <button onClick={() => setScreen("home")} style={{
              background: "rgba(255,255,255,0.10)", border: "2px solid rgba(255,255,255,0.2)",
              borderRadius: 18, padding: "14px",
              color: COLORS.white, fontSize: 17, fontWeight: 800,
              cursor: "pointer",
            }}>🏠 Home</button>
          </div>
        </div>
      )}
    </div>
  );
}