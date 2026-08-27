import { useState, useEffect, useRef, useCallback } from "react";

// ── Design tokens (consistent with Number Crunch) ─────────────
const C = {
  sky:      "#1a0a3c",
  deep:     "#2d1060",
  lavender: "#c4aeff",
  banana:   "#ffe94a",
  mint:     "#3dffa0",
  coral:    "#ff5c5c",
  blue:     "#5bc8ff",
  white:    "#ffffff",
  cloud:    "#f0eaff",
};

// ── Shape definitions ─────────────────────────────────────────
const SHAPES = [
  { id: "circle",   label: "Circles",   emoji: "🔵", color: "#5bc8ff" },
  { id: "star",     label: "Stars",     emoji: "⭐", color: "#ffe94a" },
  { id: "heart",    label: "Hearts",    emoji: "❤️",  color: "#ff5c5c" },
  { id: "triangle", label: "Triangles", emoji: "🔺", color: "#3dffa0" },
  { id: "diamond",  label: "Diamonds",  emoji: "💎", color: "#c4aeff" },
  { id: "square",   label: "Squares",   emoji: "🟧", color: "#ffaa33" },
];

const REWARDS = ["🌟", "🎉", "🦄", "🍭", "🚀", "🏆", "🎈", "⚡", "🌈", "🍦"];

const LEVELS = [
  { label: "Easy",   icon: "🌱", color: C.mint,   maxCount: 5,  choices: 3, time: 20 },
  { label: "Medium", icon: "⚡", color: C.blue,   maxCount: 8,  choices: 4, time: 15 },
  { label: "Hard",   icon: "🔥", color: C.coral,  maxCount: 12, choices: 4, time: 10 },
];

const TOTAL_ROUNDS = 10;

function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pickRandom(arr) { return arr[rand(0, arr.length - 1)]; }

// Build one question: pick a shape, a target count, and wrong choices
function generateQuestion(levelIdx) {
  const lv = LEVELS[levelIdx];
  const shape = pickRandom(SHAPES);
  const correct = rand(1, lv.maxCount);

  const wrongSet = new Set();
  while (wrongSet.size < lv.choices - 1) {
    const w = rand(1, lv.maxCount);
    if (w !== correct) wrongSet.add(w);
  }
  const choices = [...wrongSet, correct].sort(() => Math.random() - 0.5);

  return { shape, correct, choices };
}

// ── Render a group of shape emojis in a grid ──────────────────
function ShapeGroup({ shape, count, size = 22 }) {
  const cols = count <= 4 ? count : count <= 6 ? 3 : count <= 9 ? 3 : 4;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, ${size}px)`,
      gap: 4,
      justifyContent: "center",
      alignItems: "center",
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{ fontSize: size, lineHeight: 1, textAlign: "center" }}>
          {shape.emoji}
        </span>
      ))}
    </div>
  );
}

// ── Timer SVG ring (identical to Number Crunch) ───────────────
function TimerRing({ pct }) {
  const r = 28, circ = 2 * Math.PI * r;
  const color = pct > 0.5 ? C.mint : pct > 0.25 ? C.banana : C.coral;
  return (
    <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth={6} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray .3s, stroke .3s" }} />
    </svg>
  );
}

// ── Floating reward particle ──────────────────────────────────
function Particle({ x, y, emoji, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 950);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "fixed", left: x, top: y, fontSize: 28,
      pointerEvents: "none", zIndex: 9999,
      animation: "floatUp .95s ease-out forwards",
    }}>{emoji}</div>
  );
}

// ── Choice Card ───────────────────────────────────────────────
function ChoiceCard({ shape, count, state, onClick, disabled }) {
  const bg =
    state === "correct" ? `${C.mint}33` :
    state === "wrong"   ? `${C.coral}33` :
    "rgba(255,255,255,0.07)";
  const border =
    state === "correct" ? `2px solid ${C.mint}` :
    state === "wrong"   ? `2px solid ${C.coral}` :
    "2px solid rgba(255,255,255,0.15)";
  const glow =
    state === "correct" ? `0 0 20px ${C.mint}55` :
    state === "wrong"   ? `0 0 20px ${C.coral}55` : "none";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg, border, borderRadius: 20,
        padding: "16px 12px", cursor: disabled ? "default" : "pointer",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 10,
        transition: "all 0.2s ease",
        boxShadow: glow,
        minHeight: 110,
        width: "100%",
      }}
    >
      <ShapeGroup shape={shape} count={count} size={20} />
      <div style={{
        color: state === "correct" ? C.mint : state === "wrong" ? C.coral : C.lavender,
        fontSize: 13, fontWeight: 800, letterSpacing: 1,
      }}>
        {count} {count === 1 ? shape.label.replace(/s$/, "") : shape.label}
      </div>
    </button>
  );
}

// ── Main Game Component ───────────────────────────────────────
export default function ShapeSorterPuzzle() {
  const [screen, setScreen]     = useState("home");   // home | game | result
  const [levelIdx, setLevelIdx] = useState(0);
  const [question, setQuestion] = useState(null);
  const [score, setScore]       = useState(0);
  const [streak, setStreak]     = useState(0);
  const [lives, setLives]       = useState(3);
  const [round, setRound]       = useState(1);
  const [timeLeft, setTimeLeft] = useState(0);
  const [chosen, setChosen]     = useState(null);     // index chosen
  const [particles, setParticles] = useState([]);
  const [shake, setShake]       = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [pulseQ, setPulseQ]     = useState(false);

  const timerRef = useRef(null);
  const pidRef   = useRef(0);

  const addParticle = (x, y) => {
    const id = pidRef.current++;
    const emoji = REWARDS[Math.floor(Math.random() * REWARDS.length)];
    setParticles(ps => [...ps, { id, emoji, x, y }]);
  };

  const removeParticle = useCallback((id) => {
    setParticles(ps => ps.filter(p => p.id !== id));
  }, []);

  const startGame = (lvl) => {
    clearTimeout(timerRef.current);
    setLevelIdx(lvl);
    setScore(0); setStreak(0); setLives(3); setRound(1);
    setChosen(null); setShake(false);
    const q = generateQuestion(lvl);
    setQuestion(q);
    setTimeLeft(LEVELS[lvl].time);
    setScreen("game");
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const advance = useCallback((lvl, rnd) => {
    setChosen(null);
    setShake(false);
    const q = generateQuestion(lvl);
    setQuestion(q);
    setTimeLeft(LEVELS[lvl].time);
    setPulseQ(true);
    setTimeout(() => setPulseQ(false), 400);
    setRound(rnd);
  }, []);

  const endGame = useCallback((finalScore) => {
    clearTimeout(timerRef.current);
    setHighScore(h => Math.max(h, finalScore ?? score));
    setScreen("result");
  }, [score]);

  // ── Timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "game" || chosen !== null) return;
    if (timeLeft <= 0) {
      // Timeout = lose a life
      triggerShake();
      setLives(l => {
        const next = l - 1;
        if (next <= 0) {
          setTimeout(() => endGame(score), 400);
        } else {
          setStreak(0);
          setTimeout(() => {
            setRound(r => {
              const nextR = r + 1;
              if (nextR > TOTAL_ROUNDS) { endGame(score); return r; }
              advance(levelIdx, nextR);
              return nextR;
            });
          }, 600);
        }
        return next;
      });
      return;
    }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [timeLeft, screen, chosen, levelIdx, advance, endGame, score]);

  const handleChoice = (idx, val, e) => {
    if (chosen !== null || screen !== "game") return;
    clearTimeout(timerRef.current);
    setChosen(idx);

    const correct = val === question.correct;
    if (correct) {
      const bonus = streak >= 2 ? 2 : 1;
      const gained = 10 * bonus;
      setScore(s => s + gained);
      setStreak(s => s + 1);
      if (e?.currentTarget) {
        const rect = e.currentTarget.getBoundingClientRect();
        addParticle(rect.left + rect.width / 2 - 14, rect.top - 10);
      }
    } else {
      setStreak(0);
      triggerShake();
      setLives(l => {
        const next = l - 1;
        if (next <= 0) { setTimeout(() => endGame(score), 700); return 0; }
        return next;
      });
    }

    setTimeout(() => {
      if (round >= TOTAL_ROUNDS) { endGame(score + (correct ? 10 * (streak >= 2 ? 2 : 1) : 0)); return; }
      advance(levelIdx, round + 1);
    }, 750);
  };

  const lv = LEVELS[levelIdx];

  // ── Stars (static bg decoration) ─────────────────────────────
  const stars = Array.from({ length: 26 }, (_, i) => ({
    id: i, x: (i * 37.3) % 100, y: (i * 53.7) % 100,
    size: 1.5 + (i % 3), delay: (i * 0.37) % 3,
  }));

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(160deg, #1a0a3c 0%, #2d1060 100%)`,
      fontFamily: "'Nunito','Segoe UI',system-ui,sans-serif",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 16, overflow: "hidden", position: "relative",
    }}>

      {/* Global keyframes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap');
        @keyframes floatUp   { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-90px) scale(1.5)} }
        @keyframes pop       { 0%{transform:scale(1)} 40%{transform:scale(1.22)} 100%{transform:scale(1)} }
        @keyframes shake     { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-9px)} 40%{transform:translateX(9px)} 60%{transform:translateX(-7px)} 80%{transform:translateX(7px)} }
        @keyframes twinkle   { 0%,100%{opacity:.2} 50%{opacity:.85} }
        @keyframes pulse     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.09)} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bounceIn  { 0%{transform:scale(0.7);opacity:0} 60%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }
        .choice-card:hover:not(:disabled) { transform:scale(1.05) translateY(-3px) !important; background:rgba(255,255,255,0.14) !important; }
      `}</style>

      {/* Stars */}
      {stars.map(s => (
        <div key={s.id} style={{
          position: "fixed", left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size, borderRadius: "50%",
          background: C.lavender, pointerEvents: "none",
          animation: `twinkle ${2 + s.delay}s ease-in-out infinite`,
          animationDelay: `${s.delay}s`,
        }} />
      ))}

      {/* Particles */}
      {particles.map(p => (
        <Particle key={p.id} x={p.x} y={p.y} emoji={p.emoji}
          onDone={() => removeParticle(p.id)} />
      ))}

      {/* ══════════ HOME SCREEN ══════════ */}
      {screen === "home" && (
        <div style={{ textAlign: "center", animation: "slideUp .45s ease", maxWidth: 420, width: "100%" }}>
          <div style={{ fontSize: 70, animation: "pulse 2.2s ease-in-out infinite", marginBottom: 60}}>🔷</div>
          <h1 style={{
            fontSize: 42, fontWeight: 900, color: C.blue,
            margin: "0 0 6px", letterSpacing: -1,
            textShadow: `0 4px 24px ${C.blue}66`,
          }}>Shape Sorter!</h1>
          <p style={{ color: C.lavender, fontSize: 15, fontWeight: 700, margin: "0 0 10px" }}>
            Count the shapes and pick the right group! 🔷⭐❤️
          </p>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 700, margin: "0 0 28px" }}>
            Ages 5–10 · Geometry & Counting
          </p>

          {highScore > 0 && (
            <div style={{ color: C.banana, fontSize: 15, fontWeight: 800, marginBottom: 20 }}>
              🏆 Best Score: {highScore}
            </div>
          )}

          <p style={{
            color: C.lavender, fontSize: 12, fontWeight: 800,
            letterSpacing: 2, textTransform: "uppercase", marginBottom: 14,
          }}>Choose Level</p>

          {LEVELS.map((lv, i) => (
            <button key={i} onClick={() => startGame(i)} style={{
              width: "100%", marginBottom: 12,
              background: `${lv.color}22`, border: `2px solid ${lv.color}`,
              borderRadius: 18, padding: "15px 22px",
              color: C.white, fontSize: 18, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              transition: "all .18s ease",
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.filter = "brightness(1.2)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.filter = ""; }}
            >
              <span>{lv.icon} {lv.label}</span>
              <span style={{ fontSize: 12, color: lv.color, fontWeight: 700 }}>
                Up to {lv.maxCount} shapes · ⏱ {lv.time}s
              </span>
            </button>
          ))}

          {/* How to play */}
          <div style={{
            marginTop: 24, background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16, padding: "14px 18px", textAlign: "left",
          }}>
            <p style={{ color: C.banana, fontSize: 12, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>HOW TO PLAY</p>
            <p style={{ color: C.lavender, fontSize: 13, fontWeight: 600, margin: "4px 0" }}>1️⃣ &nbsp;Look at the shape and number shown</p>
            <p style={{ color: C.lavender, fontSize: 13, fontWeight: 600, margin: "4px 0" }}>2️⃣ &nbsp;Find the group with exactly that many shapes</p>
            <p style={{ color: C.lavender, fontSize: 13, fontWeight: 600, margin: "4px 0" }}>3️⃣ &nbsp;Tap the right card before time runs out!</p>
          </div>
        </div>
      )}

      {/* ══════════ GAME SCREEN ══════════ */}
      {screen === "game" && question && (
        <div style={{
          width: "100%", maxWidth: 440,
          animation: shake ? "shake .42s ease" : "slideUp .32s ease",
        }}>

          {/* HUD */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: C.banana, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{score}</div>
              <div style={{ color: C.lavender, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>SCORE</div>
            </div>

            <div style={{ position: "relative", width: 72, height: 72 }}>
              <TimerRing pct={timeLeft / lv.time} />
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.white, fontSize: 20, fontWeight: 900,
              }}>{timeLeft}</div>
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, letterSpacing: 2 }}>
                {"❤️".repeat(lives)}{"🖤".repeat(3 - lives)}
              </div>
              <div style={{ color: C.lavender, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
                {round}/{TOTAL_ROUNDS}
              </div>
            </div>
          </div>

          {/* Streak badge */}
          {streak >= 2 && (
            <div style={{
              textAlign: "center", marginBottom: 10,
              color: C.banana, fontWeight: 900, fontSize: 13,
              animation: "pop .3s ease",
            }}>🔥 {streak}× STREAK — Double points!</div>
          )}

          {/* Question card */}
          <div style={{
            background: "rgba(255,255,255,0.08)",
            border: `2px solid ${question.shape.color}55`,
            borderRadius: 26, padding: "24px 20px",
            textAlign: "center", marginBottom: 20,
            backdropFilter: "blur(10px)",
            animation: pulseQ ? "bounceIn .38s ease" : "none",
          }}>
            <div style={{ color: C.lavender, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>
              HOW MANY {question.shape.label.toUpperCase()}?
            </div>

            {/* Big target number */}
            <div style={{
              fontSize: 76, fontWeight: 900, color: question.shape.color,
              lineHeight: 1, margin: "0 0 10px",
              textShadow: `0 0 30px ${question.shape.color}66`,
              animation: "bounceIn .4s ease",
            }}>
              {question.correct}
            </div>

            {/* Show one example of the shape */}
            <div style={{ fontSize: 32 }}>{question.shape.emoji}</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, marginTop: 6 }}>
              Find the group with exactly {question.correct} {question.correct === 1 ? question.shape.label.replace(/s$/, "") : question.shape.label}
            </div>
          </div>

          {/* Answer choices grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: lv.choices === 3 ? "1fr 1fr 1fr" : "1fr 1fr",
            gap: 12,
          }}>
            {question.choices.map((count, i) => {
              let state = null;
              if (chosen !== null) {
                if (count === question.correct) state = "correct";
                else if (i === chosen) state = "wrong";
              }
              return (
                <div key={i} className="choice-card" style={{ transition: "transform .18s, background .18s" }}>
                  <ChoiceCard
                    shape={question.shape}
                    count={count}
                    state={state}
                    disabled={chosen !== null}
                    onClick={(e) => handleChoice(i, count, e)}
                  />
                </div>
              );
            })}
          </div>

          <button onClick={() => { clearTimeout(timerRef.current); setScreen("home"); }} style={{
            display: "block", margin: "18px auto 0",
            background: "transparent", border: "none",
            color: C.lavender, fontSize: 12, fontWeight: 700,
            letterSpacing: 1, cursor: "pointer", fontFamily: "inherit",
          }}>✕ QUIT GAME</button>
        </div>
      )}

      {/* ══════════ RESULT SCREEN ══════════ */}
      {screen === "result" && (
        <div style={{ textAlign: "center", animation: "slideUp .45s ease", maxWidth: 400, width: "100%" }}>
          <div style={{ fontSize: 68, marginBottom: 8 }}>
            {score >= 80 ? "🏆" : score >= 50 ? "⭐" : "💪"}
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: C.banana, margin: "0 0 8px" }}>
            {score >= 80 ? "Shape Champion!" : score >= 50 ? "Well Counted!" : "Keep Practising!"}
          </h2>
          <p style={{ color: C.lavender, fontWeight: 700, fontSize: 14, marginBottom: 28 }}>
            {score >= 80
              ? "You counted every shape perfectly! 🔷🌟"
              : score >= 50
              ? "Great counting skills! Try again to beat your score! ✨"
              : "Counting shapes takes practice — you'll get it! 🌱"}
          </p>

          {/* Stats */}
          <div style={{
            background: "rgba(255,255,255,0.08)",
            border: "2px solid rgba(255,255,255,0.15)",
            borderRadius: 22, padding: "22px",
            marginBottom: 26,
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14,
          }}>
            {[
              { emoji: "🎯", val: score,                  label: "SCORE" },
              { emoji: "🏆", val: highScore,              label: "BEST"  },
              { emoji: "📊", val: LEVELS[levelIdx].label, label: "LEVEL" },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 22 }}>{s.emoji}</div>
                <div style={{ color: C.white, fontSize: 22, fontWeight: 900 }}>{s.val}</div>
                <div style={{ color: C.lavender, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <button onClick={() => startGame(levelIdx)} style={{
            width: "100%", border: "none", borderRadius: 18,
            padding: "15px", marginBottom: 10,
            background: `linear-gradient(120deg, ${C.blue}, #7b5cff)`,
            color: C.white, fontSize: 18, fontWeight: 900,
            cursor: "pointer", fontFamily: "inherit",
            boxShadow: `0 6px 24px ${C.blue}55`,
          }}>🔄 Play Again</button>

          <button onClick={() => setScreen("home")} style={{
            width: "100%", border: "2px solid rgba(255,255,255,0.2)",
            borderRadius: 18, padding: "13px",
            background: "rgba(255,255,255,0.08)",
            color: C.white, fontSize: 16, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
          }}>🏠 Back to Menu</button>
        </div>
      )}
    </div>
  );
}
