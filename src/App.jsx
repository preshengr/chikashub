import { useState } from "react";
import NumberCrunch from "./games/NumberCrunch";

// ── Import your games here ──────────────────────────────────
// As you build each new game, add its import line below.
// That's all you need to do at the top of this file.
// import NumberCrunch from "./games/NumberCrunch";
// import ShapeSorterPuzzle from "./games/ShapeSorterPuzzle";
// import CoinCollector      from "./games/CoinCollector";
// import BalloonPopMath    from "./games/BalloonPopMath";
// import PatternBuilder     from "./games/PatternBuilder";
// import WordScrambleJunior from "./games/WordScrambleJunior";
// import MissingLetter      from "./games/MissingLetter";
// import ABCBubblePop       from "./games/ABCBubblePop";
// import RhymeTime          from "./games/RhymeTime";
// import WordBuilder        from "./games/WordBuilder";
// import StoryQuest         from "./games/StoryQuest";
// import SentenceMaker      from "./games/SentenceMaker";
// import PictureDictionary  from "./games/PictureDictionary";
// import ReadAndDraw        from "./games/ReadAndDraw";
// import SightWordFlash     from "./games/SightWordFlash";

// ── Game Registry ───────────────────────────────────────────
// To add a new game: uncomment its import above, then add a
// new object entry here. The menu card appears automatically.
const GAMES = [
  {
    id: "number-crunch",
    name: "Number Crunch",
    emoji: "🔢",
    category: "Mathematics",
    description: "Timed addition & subtraction with animated rewards!",
    skills: "Arithmetic speed & accuracy",
    component: NumberCrunch,
    available: true,
  },
  {
    id: "shape-sorter-puzzle",
    name: "Shape Sorter",
    emoji: "🔷",
    category: "Mathematics",
    description: "Match displayed shapes into the correct slots by count.",
    skills: "Geometry & counting",
    component: ShapeSorterPuzzle,
    available: true,
  },
  {
    id: "coin-collector",
    name: "Coin Collector",
    emoji: "🪙",
    category: "Mathematics",
    description: "Pick the right coins to match the price tag!",
    skills: "Money math & addition",
    component: CoinCollector,
    available: true,
  },
  {
    id: "balloon-pop-math",
    name: "Balloon Pop Math",
    emoji: "🎈",
    category: "Mathematics",
    description: "Pop the balloon showing the correct answer!",
    skills: "Mental math & reflexes",
    component: null, // replace null with BalloonPopMath when built
    available: false,
  },
  {
    id: "pattern-builder",
    name: "Pattern Builder",
    emoji: "🎨",
    category: "Mathematics",
    description: "Complete number & color sequences before time runs out!",
    skills: "Pattern recognition & logic",
    component: null,
    available: false,
  },
  {
    id: "word-scramble-junior",
    name: "Word Scramble Jr.",
    emoji: "🔤",
    category: "Language",
    description: "Unscramble shuffled letters to form simple words!",
    skills: "Spelling & vocabulary",
    component: null,
    available: false,
  },
  {
    id: "missing-letter",
    name: "Missing Letter",
    emoji: "🔡",
    category: "Language",
    description: "Fill in the blank letter to complete the word!",
    skills: "Phonics & spelling",
    component: null,
    available: false,
  },
  {
    id: "abc-bubble-pop",
    name: "ABC Bubble Pop",
    emoji: "🫧",
    category: "Language",
    description: "Pop bubbles in alphabetical order!",
    skills: "Letter recognition & sequencing",
    component: null,
    available: false,
  },
  {
    id: "rhyme-time",
    name: "Rhyme Time",
    emoji: "🎵",
    category: "Language",
    description: "Choose the word that rhymes with the one shown!",
    skills: "Phonemic awareness",
    component: null,
    available: false,
  },
  {
    id: "word-builder",
    name: "Word Builder",
    emoji: "🧱",
    category: "Language",
    description: "Drag letters to build words from picture clues!",
    skills: "Vocabulary & spelling",
    component: null,
    available: false,
  },
  {
    id: "story-quest",
    name: "Story Quest",
    emoji: "📖",
    category: "Reading",
    description: "Read a short story, then answer 3 fun questions!",
    skills: "Reading comprehension",
    component: null,
    available: false,
  },
  {
    id: "sentence-maker",
    name: "Sentence Maker",
    emoji: "✏️",
    category: "Reading",
    description: "Drag words into the correct order to build a sentence!",
    skills: "Grammar & sentence structure",
    component: null,
    available: false,
  },
  {
    id: "picture-dictionary",
    name: "Picture Dictionary",
    emoji: "🖼️",
    category: "Reading",
    description: "Match images to their correct word label!",
    skills: "Vocabulary & word recognition",
    component: null,
    available: false,
  },
  {
    id: "read-and-draw",
    name: "Read & Draw",
    emoji: "🎨",
    category: "Reading",
    description: "Read a sentence and pick the matching illustration!",
    skills: "Reading comprehension",
    component: null,
    available: false,
  },
  {
    id: "sight-word-flash",
    name: "Sight Word Flash",
    emoji: "⚡",
    category: "Reading",
    description: "Tap the sight word before it fades away!",
    skills: "Reading fluency & speed",
    component: null,
    available: false,
  },
];

// ── Category config ──────────────────────────────────────────
const CATEGORIES = [
  { id: "All",         emoji: "🎮", color: "#c4aeff" },
  { id: "Mathematics", emoji: "🔢", color: "#ffe94a" },
  { id: "Language",    emoji: "🔤", color: "#3dffa0" },
  { id: "Reading",     emoji: "📖", color: "#5bc8ff" },
];

// ── Game Card ────────────────────────────────────────────────
function GameCard({ game, onPlay }) {
  const catColor = CATEGORIES.find(c => c.id === game.category)?.color || "#c4aeff";
  return (
    <div style={{
      background: "rgba(255,255,255,0.07)",
      border: `2px solid ${game.available ? catColor + "66" : "rgba(255,255,255,0.1)"}`,
      borderRadius: 20,
      padding: "20px 18px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: 8,
      transition: "all 0.2s ease",
      opacity: game.available ? 1 : 0.55,
      cursor: game.available ? "pointer" : "default",
      position: "relative",
      overflow: "hidden",
    }}
      onClick={() => game.available && onPlay(game)}
      onMouseEnter={e => {
        if (game.available) e.currentTarget.style.transform = "translateY(-4px)";
      }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Coming soon ribbon */}
      {!game.available && (
        <div style={{
          position: "absolute", top: 12, right: -22,
          background: "#ff5c5c", color: "#fff",
          fontSize: 10, fontWeight: 800, padding: "3px 28px",
          transform: "rotate(45deg)", letterSpacing: 1,
        }}>SOON</div>
      )}

      <div style={{ fontSize: 36 }}>{game.emoji}</div>
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{game.name}</div>
      <div style={{
        background: catColor + "22", border: `1px solid ${catColor}55`,
        borderRadius: 8, padding: "2px 8px", display: "block",
        color: catColor, fontSize: 11, fontWeight: 700, width: "fit-content", alignSelf: "center",
      }}>{game.category}</div>
      <div style={{ color: "#c4aeff", fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
        {game.description}
      </div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>
        🧠 {game.skills}
      </div>

      {game.available && (
        <button style={{
          marginTop: 8, background: catColor, border: "none",
          borderRadius: 12, padding: "10px 0", color: "#1a0a3c",
          fontSize: 14, fontWeight: 900, cursor: "pointer", width: "100%",
          fontFamily: "inherit",
        }}>▶ Play Now</button>
      )}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function App() {
  const [activeGame, setActiveGame] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered = GAMES.filter(g =>
    activeCategory === "All" || g.category === activeCategory
  );

  const totalAvailable = GAMES.filter(g => g.available).length;

  // If a game is selected and its component exists, render it full screen
  if (activeGame && activeGame.component) {
    const GameComponent = activeGame.component;
    return (
      <div style={{ position: "relative" }}>
        {/* Back button overlaid on top of the game */}
        <button
          onClick={() => setActiveGame(null)}
          style={{
            position: "fixed", top: 16, left: 16, zIndex: 1000,
            background: "rgba(26,10,60,0.85)", border: "2px solid rgba(255,255,255,0.3)",
            borderRadius: 12, padding: "8px 16px",
            color: "#fff", fontSize: 13, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
            backdropFilter: "blur(8px)",
          }}
        >← Back to Menu</button>
        <GameComponent />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #1a0a3c 0%, #2d1060 100%)",
      fontFamily: "'Nunito', 'Segoe UI', system-ui, sans-serif",
      padding: "24px 16px 48px",
    }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 52, marginBottom: 6 }}>🎮</div>
        <h1 style={{
          color: "#ffe94a", fontSize: 36, fontWeight: 900,
          margin: "0 0 6px", letterSpacing: -1,
        }}>Kids IQ Games</h1>
        <p style={{ color: "#c4aeff", fontSize: 14, fontWeight: 700, margin: 0 }}>
          Fun learning games for ages 5–10 &nbsp;·&nbsp; {totalAvailable} game{totalAvailable !== 1 ? "s" : ""} available
        </p>
      </div>

      {/* Category Filter */}
      <div style={{
        display: "flex", gap: 10, justifyContent: "center",
        flexWrap: "wrap", marginBottom: 28,
      }}>
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
            background: activeCategory === cat.id
              ? cat.color : "rgba(255,255,255,0.08)",
            border: `2px solid ${activeCategory === cat.id ? cat.color : "rgba(255,255,255,0.15)"}`,
            borderRadius: 24, padding: "8px 18px",
            color: activeCategory === cat.id ? "#1a0a3c" : "#fff",
            fontSize: 13, fontWeight: 800, cursor: "pointer",
            fontFamily: "inherit", transition: "all 0.18s ease",
          }}>
            {cat.emoji} {cat.id}
          </button>
        ))}
      </div>

      {/* Game Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 16,
        maxWidth: 1100,
        margin: "0 auto",
      }}>
        {filtered.map(game => (
          <GameCard key={game.id} game={game} onPlay={setActiveGame} />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        textAlign: "center", marginTop: 48,
        color: "rgba(255,255,255,0.25)", fontSize: 12, fontWeight: 600,
      }}>
        More games coming soon! 🚀
      </div>
    </div>
  );
}
