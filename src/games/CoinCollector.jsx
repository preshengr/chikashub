import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";

// ── Design Tokens ─────────────────────────────────────────────
// Theme: warm treasure-vault / coin shop
// Background: deep mahogany dark → rich amber glow → dark base
// Signature: CSS-drawn price tag with torn edge + coin pile previews
const C = {
  // Backgrounds
  bgDeep:    "#0d0600",
  bgMid:     "#1a0c00",
  bgWarm:    "#2a1400",
  // Gold family
  gold:      "#FFD700",
  goldDark:  "#B8860B",
  goldDeep:  "#7B5E00",
  goldGlow:  "rgba(255,215,0,0.18)",
  // Coin metals
  copper:    "#CD853F",
  copperDk:  "#8B4513",
  silver:    "#C0C0C0",
  silverDk:  "#888",
  nickel:    "#A8A9AD",
  // UI
  success:   "#00C853",
  error:     "#FF3D00",
  warmWhite: "#FFF8E7",
  warmGray:  "#C8A96E",
  tag:       "#FFEFD5",
};

// ── Coin Denominations ────────────────────────────────────────
const COINS = [
  { name:"Quarter", value:25, label:"25$", bg:"linear-gradient(135deg,#e8c84a,#b8960b,#ffd700)", border:"#B8860B", size:50, textColor:"#5c3d00" },
  { name:"Dime",    value:10, label:"10$", bg:"linear-gradient(135deg,#e0e0e0,#a0a0a0,#d0d0d0)", border:"#888",    size:40, textColor:"#333" },
  { name:"Nickel",  value:5,  label:"5$",  bg:"linear-gradient(135deg,#c8c8b0,#909080,#bcbcaa)", border:"#808070", size:30, textColor:"#333" },
  { name:"Penny",   value:1,  label:"1$",  bg:"linear-gradient(135deg,#e8a060,#8b4513,#cd853f)", border:"#7a3a10", size:20, textColor:"#2d0a00" },
];

const LEVELS = [
  { label:"Easy",   icon:"🌱", color:"#00C853", max:50,  time:60, maxCoins:45  },
  { label:"Medium", icon:"⚡", color:"#FFD700", max:100,  time:40, maxCoins:95  },
  { label:"Hard",   icon:"🔥", color:"#FF3D00", max:150, time:30, maxCoins:145 },
];

const REWARDS = ["🌟","🎉","💰","🤑","🏆","💎","⭐","🪙","🎊","✨"];
const TOTAL_ROUNDS = 10;

function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// Build a coin breakdown for a given amount (greedy from largest)
function makeCoins(amount, maxCoins = 10) {
  const result = [];
  const denoms = [25, 10, 5, 1];
  let rem = amount;
  for (const d of denoms) {
    while (rem >= d && result.length < maxCoins) {
      result.push(COINS.find(c => c.value === d));
      rem -= d;
    }
    if (rem === 0) break;
  }
  return result;
}

// Generate question: target amount + 4 choices (one correct, 3 wrong)
function generateQuestion(levelIdx) {
  const lv = LEVELS[levelIdx];
  const correct = rand(5, lv.max);

  const wrongSet = new Set();
  while (wrongSet.size < 3) {
    const offset = rand(1, Math.min(15, Math.floor(lv.max * 0.3)));
    const w = Math.random() > 0.5 ? correct + offset : correct - offset;
    if (w !== correct && w > 0 && w <= lv.max + 20) wrongSet.add(w);
  }

  const choices = [...wrongSet, correct]
    .sort(() => Math.random() - 0.5)
    .map(amt => ({ amount: amt, coins: makeCoins(amt, lv.maxCoins) }));

  return { correct, choices };
}

// ── Pure helpers (outside component so React compiler is happy) ─
function pickRandomReward() {
  return REWARDS[Math.floor(Math.random() * REWARDS.length)];
}

// ── Coin Pile display ─────────────────────────────────────────
function CoinPile({ coins }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", alignItems: "center", minHeight: 52 }}>
      {coins.map((coin, i) => (
        <div key={i} style={{
          width: coin.size, height: coin.size, borderRadius: "50%",
          background: coin.bg, border: `2px solid ${coin.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: coin.size < 32 ? 7 : 8, fontWeight: 900,
          color: coin.textColor, flexShrink: 0,
          boxShadow: `0 2px 6px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.3)`,
        }}>
          {coin.label}
        </div>
      ))}
    </div>
  );
}

// ── Price Tag ─────────────────────────────────────────────────
function PriceTag({ amount }) {
  const dollars = Math.floor(amount / 100);
  const cents   = amount % 100;
  const display = dollars > 0
    ? `$${dollars}.${String(cents).padStart(2, "0")}`
    : `${cents}¢`;
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Tag body */}
      <div style={{
        background: "linear-gradient(135deg, #fff9f0 0%, #ffe8b0 100%)",
        border: `3px solid ${C.goldDark}`,
        borderRadius: "12px 12px 12px 12px",
        padding: "14px 28px 14px 20px",
        position: "relative",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 3px rgba(255,255,255,0.8)",
      }}>
        {/* Hole punch */}
        <div style={{
          position: "absolute", top: "50%", left: -10, transform: "translateY(-50%)",
          width: 18, height: 18, borderRadius: "50%",
          background: C.bgDeep, border: `2px solid ${C.goldDark}`,
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
        }} />
        {/* String */}
        <div style={{
          position: "absolute", top: "50%", left: -24, transform: "translateY(-50%)",
          width: 16, height: 2,
          background: `repeating-linear-gradient(90deg, ${C.goldDark} 0, ${C.goldDark} 4px, transparent 4px, transparent 7px)`,
        }} />
        <div style={{
          color: C.copperDk, fontSize: 10, fontWeight: 800,
          letterSpacing: 2, textTransform: "uppercase", marginBottom: 2,
        }}>PRICE</div>
        <div style={{
          color: "#5c3000", fontSize: 44, fontWeight: 900,
          lineHeight: 1, letterSpacing: -1,
          textShadow: "0 2px 4px rgba(0,0,0,0.15)",
        }}>{display}</div>
      </div>
    </div>
  );
}

// ── Timer Ring ────────────────────────────────────────────────
function TimerRing({ pct }) {
  const r = 28, circ = 2 * Math.PI * r;
  const color = pct > 0.5 ? C.success : pct > 0.25 ? C.gold : C.error;
  return (
    <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,215,0,0.12)" strokeWidth={6} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray .3s, stroke .3s" }} />
    </svg>
  );
}

// ── Floating Particle ─────────────────────────────────────────
function Particle({ x, y, emoji, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 950); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position: "fixed", left: x, top: y, fontSize: 28,
      pointerEvents: "none", zIndex: 9999,
      animation: "floatUp .95s ease-out forwards",
    }}>{emoji}</div>
  );
}

// ── Choice Card ───────────────────────────────────────────────
function ChoiceCard({ choice, state, onClick, disabled }) {
  const totalCents = choice.coins.reduce((s, c) => s + c.value, 0);
  const display = totalCents >= 100
    ? `$${Math.floor(totalCents / 100)}.${String(totalCents % 100).padStart(2, "0")}`
    : `${totalCents}¢`;

  const border =
    state === "correct" ? `2px solid ${C.success}` :
    state === "wrong"   ? `2px solid ${C.error}`   :
    `2px solid rgba(255,215,0,0.18)`;
  const bg =
    state === "correct" ? "rgba(0,200,83,0.18)"  :
    state === "wrong"   ? "rgba(255,61,0,0.18)"   :
    "rgba(255,215,0,0.05)";
  const glow =
    state === "correct" ? `0 0 20px rgba(0,200,83,0.4)`  :
    state === "wrong"   ? `0 0 20px rgba(255,61,0,0.35)` :
    "0 2px 12px rgba(0,0,0,0.4)";

  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: bg, border, borderRadius: 18,
      padding: "14px 10px 12px",
      display: "flex", flexDirection: "column",
      alignItems: "center", gap: 8,
      cursor: disabled ? "default" : "pointer",
      transition: "all .2s ease",
      boxShadow: glow,
      width: "100%", minHeight: 120,
      fontFamily: "inherit",
    }}>
      <CoinPile coins={choice.coins} />
      <div style={{
        color: state === "correct" ? C.success : state === "wrong" ? C.error : C.gold,
        fontSize: 15, fontWeight: 900, letterSpacing: 1,
        textShadow: state ? "none" : `0 0 8px ${C.goldGlow}`,
      }}>{display}</div>
    </button>
  );
}

// ── Background Decorations ────────────────────────────────────
function BgCoins() {
  const coins = [
    { top:"8%",  left:"5%",  size:44, rot:"-15deg", opacity:0.12, delay:"0s"    },
    { top:"15%", right:"7%", size:36, rot:"20deg",  opacity:0.1,  delay:"0.5s"  },
    { top:"35%", left:"3%",  size:28, rot:"8deg",   opacity:0.08, delay:"1.2s"  },
    { top:"60%", right:"4%", size:50, rot:"-25deg", opacity:0.11, delay:"0.8s"  },
    { top:"80%", left:"8%",  size:32, rot:"12deg",  opacity:0.09, delay:"1.8s"  },
    { top:"90%", right:"10%",size:40, rot:"-8deg",  opacity:0.1,  delay:"0.3s"  },
    { top:"70%", left:"45%", size:24, rot:"30deg",  opacity:0.07, delay:"2.1s"  },
  ];
  return (
    <>
      {coins.map((c, i) => (
        <div key={i} style={{
          position: "fixed",
          top: c.top, left: c.left, right: c.right,
          width: c.size, height: c.size, borderRadius: "50%",
          background: "linear-gradient(135deg, #ffd700, #b8860b, #ffd700)",
          border: "2px solid #B8860B",
          opacity: c.opacity,
          transform: `rotate(${c.rot})`,
          animation: `coinFloat 4s ease-in-out infinite`,
          animationDelay: c.delay,
          pointerEvents: "none",
          boxShadow: "0 0 12px rgba(255,215,0,0.3)",
        }} />
      ))}
    </>
  );
}

// ── Main Game ─────────────────────────────────────────────────
export default function CoinCollector() {
  const [screen,    setScreen]    = useState("home");
  const [levelIdx,  setLevelIdx]  = useState(0);
  const [question,  setQuestion]  = useState(null);
  const [score,     setScore]     = useState(0);
  const [streak,    setStreak]    = useState(0);
  const [lives,     setLives]     = useState(3);
  const [round,     setRound]     = useState(1);
  const [timeLeft,  setTimeLeft]  = useState(0);
  const [chosen,    setChosen]    = useState(null);
  const [particles, setParticles] = useState([]);
  const [shake,     setShake]     = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [pulseTag,  setPulseTag]  = useState(false);

  const timerRef = useRef(null);
  const pidRef   = useRef(0);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 480);
  }, []);

  const addParticle = useCallback((x, y) => {
    const id    = pidRef.current++;
    const emoji = pickRandomReward();          // pure helper lives outside component
    setParticles(ps => [...ps, { id, emoji, x, y }]);
  }, []);

  const removeParticle = useCallback(id => {
    setParticles(ps => ps.filter(p => p.id !== id));
  }, []);

  const advance = useCallback((lvl) => {
    setChosen(null);
    setQuestion(generateQuestion(lvl));
    setTimeLeft(LEVELS[lvl].time);
    setPulseTag(true);
    setTimeout(() => setPulseTag(false), 420);
  }, []);

  const endGame = useCallback((finalScore) => {
    clearTimeout(timerRef.current);
    setHighScore(h => Math.max(h, finalScore));
    setScreen("result");
  }, []);

  const startGame = useCallback((lvl) => {
    clearTimeout(timerRef.current);
    setLevelIdx(lvl);
    setScore(0);
    setStreak(0);
    setLives(3);
    setRound(1);
    setChosen(null);
    setQuestion(generateQuestion(lvl));
    setTimeLeft(LEVELS[lvl].time);
    setScreen("game");
  }, []);

  // ── Timeout handler ref — always current, never stale ─────────
  // useLayoutEffect (no dep array) runs after EVERY render, keeping
  // the ref pointing to a fresh closure with the latest state values.
  // This is the React team's canonical "latest ref" pattern — it is
  // the only way to update a ref without touching it during render.
  const onTimeoutRef = useRef(null);
  useLayoutEffect(() => {
    onTimeoutRef.current = () => {
      triggerShake();
      setStreak(0);
      const nextLives = lives - 1;
      setLives(nextLives);
      if (nextLives <= 0) {
        setTimeout(() => endGame(score), 400);
        return;
      }
      const nextRound = round + 1;
      setTimeout(() => {
        if (nextRound > TOTAL_ROUNDS) {
          endGame(score);
          return;
        }
        setRound(nextRound);
        advance(levelIdx);
      }, 650);
    };
  }); // ← intentionally no dependency array: must stay current after every render

  // ── Effect 1: countdown tick ───────────────────────────────────
  // Single setState call only — no cascading renders.
  useEffect(() => {
    if (screen !== "game" || chosen !== null || timeLeft <= 0) return;
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [screen, chosen, timeLeft]);

  // ── Effect 2: timeout detection — fully deferred ───────────────
  // setTimeout(..., 0) pushes all multi-setState work outside the
  // effect body, eliminating the cascading-render warning entirely.
  useEffect(() => {
    if (screen !== "game" || chosen !== null || timeLeft !== 0) return;
    const id = setTimeout(() => onTimeoutRef.current?.(), 0);
    return () => clearTimeout(id);
  }, [screen, chosen, timeLeft]);

  const handleChoice = useCallback((idx, amount, e) => {
    if (chosen !== null || screen !== "game") return;
    clearTimeout(timerRef.current);
    setChosen(idx);
    const correct = amount === question.correct;

    if (correct) {
      const bonus  = streak >= 2 ? 2 : 1;
      const gained = 10 * bonus;
      const newScore = score + gained;
      // Update score and streak as flat calls — no nesting
      setScore(newScore);
      setStreak(s => s + 1);
      if (e?.currentTarget) {
        const r = e.currentTarget.getBoundingClientRect();
        addParticle(r.left + r.width / 2 - 14, r.top - 10);
      }
      // Defer navigation so all state settles first
      setTimeout(() => {
        if (round >= TOTAL_ROUNDS) { endGame(newScore); }
        else { setRound(r => r + 1); advance(levelIdx); }
      }, 750);
    } else {
      setStreak(0);
      triggerShake();
      const nextLives = lives - 1;
      setLives(nextLives);
      // Defer navigation so shake animation plays first
      setTimeout(() => {
        if (nextLives <= 0) { endGame(score); return; }
        if (round >= TOTAL_ROUNDS) { endGame(score); return; }
        setRound(r => r + 1);
        advance(levelIdx);
      }, 750);
    }
  }, [chosen, screen, question, streak, score, lives, round,
      levelIdx, addParticle, advance, endGame, triggerShake]);

  const lv = LEVELS[levelIdx];

  return (
    <div style={{
      minHeight: "100vh",
      // Realistic coin-shop background: mahogany dark base + golden spotlight
      background: `
        radial-gradient(ellipse 90% 45% at 50% 0%, rgba(255,180,0,0.22) 0%, transparent 65%),
        radial-gradient(ellipse 60% 40% at 10% 100%, rgba(139,69,19,0.25) 0%, transparent 55%),
        radial-gradient(ellipse 50% 35% at 90% 80%, rgba(100,60,0,0.2) 0%, transparent 55%),
        linear-gradient(170deg, #1a0c00 0%, #0d0600 45%, #150a00 100%)
      `,
      fontFamily: "'Nunito','Segoe UI',system-ui,sans-serif",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "20px 16px 40px",
      overflow: "hidden", position: "relative",
      minWidth: 0,
    }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap');
        @keyframes floatUp   { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-90px) scale(1.5)} }
        @keyframes pop       { 0%{transform:scale(1)} 45%{transform:scale(1.24)} 100%{transform:scale(1)} }
        @keyframes shake     { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-9px)} 40%{transform:translateX(9px)} 60%{transform:translateX(-7px)} 80%{transform:translateX(7px)} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bounceIn  { 0%{transform:scale(.7);opacity:0} 60%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }
        @keyframes coinFloat { 0%,100%{transform:translateY(0) rotate(-15deg)} 50%{transform:translateY(-12px) rotate(-10deg)} }
        @keyframes shimmer   { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes pulse     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        .choice-wrap:hover:not([data-disabled="true"]) button { transform:translateY(-4px) scale(1.04); box-shadow:0 8px 28px rgba(255,215,0,0.25) !important; }
        .level-btn:hover { filter:brightness(1.2); transform:translateY(-2px) !important; }
      `}</style>

      {/* Realistic background decorative coins */}
      <BgCoins />

      {/* Particles */}
      {particles.map(p => (
        <Particle key={p.id} x={p.x} y={p.y} emoji={p.emoji}
          onDone={() => removeParticle(p.id)} />
      ))}

      {/* ══════════ HOME SCREEN ══════════ */}
      {screen === "home" && (
        <div style={{ animation: "slideUp .45s ease", maxWidth: 420, width: "100%", textAlign: "center" }}>
          {/* Shop sign */}
          <div style={{
            background: "linear-gradient(135deg, #2a1400, #1a0c00)",
            border: `3px solid ${C.goldDark}`,
            borderRadius: 20, padding: "22px 28px 18px",
            marginBottom: 24, position: "relative",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,215,0,0.1)",
          }}>
            {/* Decorative corner coins */}
            {["top:8px;left:8px", "top:8px;right:8px", "bottom:8px;left:8px", "bottom:8px;right:8px"].map((pos, i) => (
              <div key={i} style={{
                position: "absolute", [pos.split(";")[0].split(":")[0]]: pos.split(";")[0].split(":")[1],
                [pos.split(";")[1].split(":")[0]]: pos.split(";")[1].split(":")[1],
                width: 14, height: 14, borderRadius: "50%",
                background: "linear-gradient(135deg,#ffd700,#b8860b)",
                boxShadow: "0 0 6px rgba(255,215,0,0.5)",
              }} />
            ))}
            <div style={{ fontSize: 52, marginBottom: 6, animation: "pulse 2s ease-in-out infinite" }}>🪙</div>
            <h1 style={{
              fontSize: 38, fontWeight: 900, margin: "0 0 6px",
              background: "linear-gradient(135deg, #FFD700, #FFA500, #FFD700)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              letterSpacing: -1,
            }}>Coin Collector!</h1>
            <p style={{ color: C.warmGray, fontSize: 14, fontWeight: 700, margin: 0 }}>
              Pick the coins that match the price tag! 🏷️💰
            </p>
          </div>

          {highScore > 0 && (
            <div style={{ color: C.gold, fontSize: 15, fontWeight: 800, marginBottom: 18,
              textShadow: "0 0 12px rgba(255,215,0,0.4)" }}>
              🏆 Best Score: {highScore}
            </div>
          )}

          <p style={{ color: C.warmGray, fontSize: 12, fontWeight: 800, letterSpacing: 2,
            textTransform: "uppercase", marginBottom: 12 }}>Choose Level</p>

          {LEVELS.map((lv, i) => (
            <button key={i} className="level-btn" onClick={() => startGame(i)} style={{
              width: "100%", marginBottom: 12, fontFamily: "inherit",
              background: `linear-gradient(135deg, ${lv.color}18, ${lv.color}30)`,
              border: `2px solid ${lv.color}88`,
              borderRadius: 18, padding: "15px 22px",
              color: C.warmWhite, fontSize: 17, fontWeight: 800,
              cursor: "pointer", transition: "all .18s ease",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              boxShadow: `0 4px 16px rgba(0,0,0,0.4)`,
            }}>
              <span>{lv.icon} {lv.label}</span>
              <span style={{ fontSize: 11, color: lv.color, fontWeight: 700 }}>
                Up to {lv.max}¢ · ⏱ {lv.time}s
              </span>
            </button>
          ))}

          {/* How to play */}
          <div style={{
            marginTop: 20, background: "rgba(255,215,0,0.05)",
            border: "1px solid rgba(255,215,0,0.15)",
            borderRadius: 16, padding: "14px 18px", textAlign: "left",
          }}>
            <p style={{ color: C.gold, fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>HOW TO PLAY</p>
            <p style={{ color: C.warmGray, fontSize: 13, fontWeight: 600, margin: "4px 0" }}>1️⃣ &nbsp;Look at the price tag amount</p>
            <p style={{ color: C.warmGray, fontSize: 13, fontWeight: 600, margin: "4px 0" }}>2️⃣ &nbsp;Find the group of coins that adds up to it</p>
            <p style={{ color: C.warmGray, fontSize: 13, fontWeight: 600, margin: "4px 0" }}>3️⃣ &nbsp;Tap the correct pile before time runs out!</p>
          </div>

          {/* Coin legend */}
          <div style={{
            marginTop: 16, background: "rgba(255,215,0,0.05)",
            border: "1px solid rgba(255,215,0,0.12)",
            borderRadius: 16, padding: "12px 18px",
            display: "flex", justifyContent: "space-around", alignItems: "center",
          }}>
            {COINS.map(c => (
              <div key={c.name} style={{ textAlign: "center" }}>
                <div style={{
                  width: c.size * 0.85, height: c.size * 0.85, borderRadius: "50%",
                  background: c.bg, border: `2px solid ${c.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 900, color: c.textColor, margin: "0 auto 4px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                }}>{c.label}</div>
                <div style={{ color: C.warmGray, fontSize: 10, fontWeight: 700 }}>{c.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════ GAME SCREEN ══════════ */}
      {screen === "game" && question && (
        <div style={{
          width: "100%", maxWidth: 440,
          animation: shake ? "shake .45s ease" : "slideUp .32s ease",
        }}>

          {/* HUD */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: C.gold, fontSize: 26, fontWeight: 900, lineHeight: 1,
                textShadow: "0 0 12px rgba(255,215,0,0.5)" }}>{score}</div>
              <div style={{ color: C.warmGray, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>SCORE</div>
            </div>

            <div style={{ position: "relative", width: 72, height: 72 }}>
              <TimerRing pct={timeLeft / lv.time} />
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.warmWhite, fontSize: 20, fontWeight: 900,
              }}>{timeLeft}</div>
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, letterSpacing: 2 }}>
                {"❤️".repeat(lives)}{"🖤".repeat(3 - lives)}
              </div>
              <div style={{ color: C.warmGray, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
                {round}/{TOTAL_ROUNDS}
              </div>
            </div>
          </div>

          {/* Streak */}
          {streak >= 2 && (
            <div style={{ textAlign: "center", marginBottom: 10,
              color: C.gold, fontWeight: 900, fontSize: 13, animation: "pop .3s ease",
              textShadow: "0 0 10px rgba(255,215,0,0.6)" }}>
              🔥 {streak}× STREAK — Double points!
            </div>
          )}

          {/* Price tag */}
          <div style={{ textAlign: "center", marginBottom: 20,
            animation: pulseTag ? "bounceIn .38s ease" : "none" }}>
            <div style={{ color: C.warmGray, fontSize: 12, fontWeight: 700,
              letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
              Match This Price!
            </div>
            <PriceTag amount={question.correct} />
          </div>

          {/* Choices */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {question.choices.map((choice, i) => {
              let state = null;
              if (chosen !== null) {
                if (choice.amount === question.correct) state = "correct";
                else if (i === chosen) state = "wrong";
              }
              return (
                <div key={i} className="choice-wrap"
                  data-disabled={chosen !== null ? "true" : "false"}>
                  <ChoiceCard
                    choice={choice} state={state}
                    disabled={chosen !== null}
                    onClick={(e) => handleChoice(i, choice.amount, e)}
                  />
                </div>
              );
            })}
          </div>

          <button onClick={() => { clearTimeout(timerRef.current); setScreen("home"); }} style={{
            display: "block", margin: "18px auto 0",
            background: "transparent", border: "none",
            color: C.warmGray, fontSize: 12, fontWeight: 700,
            letterSpacing: 1, cursor: "pointer", fontFamily: "inherit",
          }}>✕ QUIT GAME</button>
        </div>
      )}

      {/* ══════════ RESULT SCREEN ══════════ */}
      {screen === "result" && (
        <div style={{ textAlign: "center", animation: "slideUp .45s ease", maxWidth: 400, width: "100%" }}>
          <div style={{ fontSize: 68, marginBottom: 8 }}>
            {score >= 80 ? "💰" : score >= 50 ? "🪙" : "💪"}
          </div>
          <h2 style={{
            fontSize: 34, fontWeight: 900, margin: "0 0 8px",
            background: "linear-gradient(135deg,#FFD700,#FFA500,#FFD700)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            {score >= 80 ? "Rich Kid!" : score >= 50 ? "Coin Pro!" : "Keep Counting!"}
          </h2>
          <p style={{ color: C.warmGray, fontWeight: 700, fontSize: 14, marginBottom: 28 }}>
            {score >= 80
              ? "Jackpot! You Matched Every Price Perfectly! 💰🌟"
              : score >= 50
              ? "Great Coin Counting! Try again for the Jackpot! ✨"
              : "Every Coin Master Started Somewhere! Keep going! 🌱"}
          </p>

          <div style={{
            background: "rgba(255,215,0,0.07)", border: "2px solid rgba(255,215,0,0.2)",
            borderRadius: 22, padding: "22px", marginBottom: 24,
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14,
          }}>
            {[
              { emoji: "🎯", val: score,                  label: "SCORE" },
              { emoji: "🏆", val: highScore,              label: "BEST"  },
              { emoji: "📊", val: LEVELS[levelIdx].label, label: "LEVEL" },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 22 }}>{s.emoji}</div>
                <div style={{ color: C.warmWhite, fontSize: 22, fontWeight: 900 }}>{s.val}</div>
                <div style={{ color: C.warmGray, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <button onClick={() => startGame(levelIdx)} style={{
            width: "100%", border: "none", borderRadius: 18, padding: "15px",
            marginBottom: 10,
            background: "linear-gradient(135deg, #FFD700, #FFA500)",
            color: "#3d1a00", fontSize: 18, fontWeight: 900,
            cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 6px 24px rgba(255,165,0,0.45)",
          }}>🔄 Play Again</button>

          <button onClick={() => setScreen("home")} style={{
            width: "100%", border: "2px solid rgba(255,215,0,0.25)",
            borderRadius: 18, padding: "13px",
            background: "rgba(255,215,0,0.07)",
            color: C.warmWhite, fontSize: 16, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
          }}>🏠 Back to Menu</button>
        </div>
      )}
    </div>
  );
}
