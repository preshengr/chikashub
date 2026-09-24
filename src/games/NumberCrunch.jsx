/* eslint-disable no-unused-vars */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Howl } from 'howler';

// Sound effect generation functions (no external libraries needed)
const createSuccessSound = () => {
  return new Howl({
    src: ['data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAAA='],
    preload: true,
    volume: 0.5,
  });
};

const createBuzzSound = () => {
  return new Howl({
    src: ['data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAAA='],
    preload: true,
    volume: 0.3,
  });
};

// Synthesized success sound effect
const playSuccessSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // Create a cheerful ascending tone
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    oscillator1.connect(gain);
    oscillator2.connect(gain);
    gain.connect(audioContext.destination);
    
    oscillator1.frequency.setValueAtTime(523.25, now); // C5
    oscillator2.frequency.setValueAtTime(659.25, now); // E5
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    oscillator1.start(now);
    oscillator2.start(now);
    oscillator1.stop(now + 0.15);
    oscillator2.stop(now + 0.15);
  } catch (e) {
    console.log('Audio context not available');
  }
};

const playBuzzSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // Create a soft buzz sound
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(200, now);
    oscillator.type = 'triangle';
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    oscillator.start(now);
    oscillator.stop(now + 0.1);
  } catch (e) {
    console.log('Audio context not available');
  }
};

// Particle component for success animation
const Particle = ({ delay, emoji }) => {
  return (
    <motion.div
      initial={{ y: 0, x: 0, opacity: 1, scale: 1 }}
      animate={{
        y: -150,
        // Derive a stable offset so re-renders do not change the animation.
        x: ((Math.round(delay * 1000) * 37 + emoji.length * 53) % 200) - 100,
        opacity: 0,
        scale: 0.5,
      }}
      transition={{ duration: 1, delay, ease: 'easeOut' }}
      style={{
        position: 'absolute',
        fontSize: '3rem',
        pointerEvents: 'none',
      }}
    >
      {emoji}
    </motion.div>
  );
};

// localStorage helper functions
const getStoredUsers = () => {
  const stored = localStorage.getItem('chikasHub_users');
  return stored ? JSON.parse(stored) : {};
};

const saveUser = (email, userData) => {
  const users = getStoredUsers();
  users[email] = userData;
  localStorage.setItem('chikasHub_users', JSON.stringify(users));
};

const userExists = (email) => {
  const users = getStoredUsers();
  return email in users;
};

const getUser = (email, password) => {
  const users = getStoredUsers();
  const user = users[email];
  return user && user.password === password ? user : null;
};

const saveGameProgress = (email, progress) => {
  const users = getStoredUsers();
  if (users[email]) {
    users[email].gameProgress = progress;
    localStorage.setItem('chikasHub_users', JSON.stringify(users));
  }
};

// Generate problems outside the component to keep rendering pure.
const generateProblem = (diff) => {
  let num1, num2, operator;

  if (diff === 'easy') {
    num1 = Math.floor(Math.random() * 10);
    num2 = Math.floor(Math.random() * 10);
    operator = '+';
  } else {
    num1 = Math.floor(Math.random() * 90) + 10;
    num2 = Math.floor(Math.random() * 90) + 10;
    operator = Math.random() > 0.5 ? '+' : '-';
  }

  const answer = operator === '+' ? num1 + num2 : num1 - num2;
  return {
    num1,
    num2,
    operator,
    answer,
    problem: `${num1} ${operator} ${num2}`,
  };
};

// Main Number Crunch Component
const NumberCrunch = () => {
  const [screen, setScreen] = useState('home'); // home, signup, login, difficultySelect, game, results
  const [currentUser, setCurrentUser] = useState(null);

  // Signup state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupError, setSignupError] = useState('');
  const [generatedCreds, setGeneratedCreds] = useState(null);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Game state
  const [difficulty, setDifficulty] = useState(null);
  const [gameState, setGameState] = useState({
    currentRound: 0,
    lives: 5,
    score: 0,
    correctStreak: 0,
    roundsData: [],
  });

  const [currentProblem, setCurrentProblem] = useState(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [feedback, setFeedback] = useState(null);
  const [showParticles, setShowParticles] = useState(false);
  const timerRef = useRef(null);

  // Generate signup credentials
  const generateCredentials = () => {
    const username = signupName.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 1000);
    const password = Math.random().toString(36).substring(2, 10);
    return { username, password };
  };

  // Handle signup
  const handleSignup = (e) => {
    e.preventDefault();
    setSignupError('');

    if (!signupName.trim() || !signupEmail.trim()) {
      setSignupError('Please enter your name and email.');
      return;
    }

    if (!signupEmail.includes('@')) {
      setSignupError('Please enter a valid email address.');
      return;
    }

    if (userExists(signupEmail)) {
      setSignupError('This email is already registered. Please log in instead.');
      return;
    }

    const creds = generateCredentials();
    const newUser = {
      name: signupName,
      email: signupEmail,
      username: creds.username,
      password: creds.password,
      gameProgress: { highScore: 0, gamesPlayed: 0 },
    };

    saveUser(signupEmail, newUser);
    setGeneratedCreds(creds);
    setCurrentUser(newUser);
  };

  // Confirm signup and go to difficulty select
  const handleSignupConfirm = () => {
    setSignupName('');
    setSignupEmail('');
    setGeneratedCreds(null);
    setScreen('difficultySelect');
  };

  // Handle login
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Please enter your email and password.');
      return;
    }

    const user = getUser(loginEmail, loginPassword);
    if (user) {
      setCurrentUser(user);
      setLoginEmail('');
      setLoginPassword('');
      setScreen('difficultySelect');
    } else {
      setLoginError('Invalid email or password.');
    }
  };

  // Start a new game
  const startGame = (selectedDifficulty) => {
    setDifficulty(selectedDifficulty);
    setGameState({
      currentRound: 0,
      lives: 5,
      score: 0,
      correctStreak: 0,
      roundsData: [],
    });
    setUserAnswer('');
    setFeedback(null);
    setTimeLeft(30);
    setScreen('game');
    const problem = generateProblem(selectedDifficulty);
    setCurrentProblem(problem);
  };

  // Timer effect
  useEffect(() => {
    if (screen !== 'game' || gameState.lives <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleTimeout();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [screen, gameState.lives]);

  // Handle timeout
  const handleTimeout = () => {
    playBuzzSound();
    setFeedback({ type: 'timeout', text: "Time's up!" });
    setGameState((prev) => ({
      ...prev,
      lives: Math.max(0, prev.lives - 1),
      correctStreak: 0,
      roundsData: [
        ...prev.roundsData,
        {
          round: prev.currentRound + 1,
          problem: currentProblem.problem,
          answer: currentProblem.answer,
          userAnswer: 'timeout',
          correct: false,
        },
      ],
    }));

    setTimeout(() => {
      if (gameState.currentRound + 1 >= 10) {
        setScreen('results');
      } else {
        nextRound();
      }
    }, 1500);
  };

  // Handle answer submission
  const handleSubmitAnswer = () => {
    if (!userAnswer.trim()) return;

    clearInterval(timerRef.current);

    const isCorrect = parseInt(userAnswer) === currentProblem.answer;

    if (isCorrect) {
      playSuccessSound();
      setShowParticles(true);
      const newStreak = gameState.correctStreak + 1;
      const bonus = newStreak >= 3 ? 2 : 1;
      const points = 10 * bonus;

      setFeedback({
        type: 'correct',
        text: ['Amazing!', "You're a Star!", 'Brilliant!', 'Fantastic!'][
          Math.floor(Math.random() * 4)
        ],
      });

      setGameState((prev) => ({
        ...prev,
        score: prev.score + points,
        correctStreak: newStreak,
        roundsData: [
          ...prev.roundsData,
          {
            round: prev.currentRound + 1,
            problem: currentProblem.problem,
            answer: currentProblem.answer,
            userAnswer: parseInt(userAnswer),
            correct: true,
            points,
          },
        ],
      }));
    } else {
      playBuzzSound();
      setFeedback({ type: 'wrong', text: 'Try Again!' });
      setGameState((prev) => ({
        ...prev,
        lives: Math.max(0, prev.lives - 1),
        correctStreak: 0,
        roundsData: [
          ...prev.roundsData,
          {
            round: prev.currentRound + 1,
            problem: currentProblem.problem,
            answer: currentProblem.answer,
            userAnswer: parseInt(userAnswer),
            correct: false,
          },
        ],
      }));
    }

    setUserAnswer('');
    setTimeLeft(30);

    setTimeout(() => {
      setShowParticles(false);
      if (gameState.lives <= 0 || gameState.currentRound + 1 >= 10) {
        setScreen('results');
        if (currentUser) {
          saveGameProgress(currentUser.email, {
            highScore: Math.max(
              gameState.score,
              currentUser.gameProgress?.highScore || 0
            ),
            gamesPlayed: (currentUser.gameProgress?.gamesPlayed || 0) + 1,
          });
        }
      } else {
        nextRound();
      }
    }, 1500);
  };

  // Next round
  const nextRound = () => {
    setGameState((prev) => ({
      ...prev,
      currentRound: prev.currentRound + 1,
    }));
    setFeedback(null);
    const problem = generateProblem(difficulty);
    setCurrentProblem(problem);
  };

  // Handle logout
  const handleLogout = () => {
    setCurrentUser(null);
    setGameState({
      currentRound: 0,
      lives: 5,
      score: 0,
      correctStreak: 0,
      roundsData: [],
    });
    setScreen('home');
    setDifficulty(null);
  };

  // Render heart lives
  const renderHearts = () => {
    return (
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <span
            key={i}
            className={`text-3xl ${i < gameState.lives ? 'text-red-500' : 'text-gray-300'}`}
          >
            ❤️
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-100 via-purple-50 to-pink-100 font-sans">
      <AnimatePresence mode="wait">
        {/* HOME SCREEN */}
        {screen === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center px-4"
          >
            <div className="text-center">
              <motion.div
                animate={{ y: [0, -20, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-8xl mb-4"
              >
                🎮
              </motion.div>
              <h1 className="text-5xl font-bold text-blue-600 mb-2">NUMBER CRUNCH</h1>
              <p className="text-2xl text-gray-700 mb-12">
                Master your math skills and become a math champion!
              </p>

              <div className="space-y-4 max-w-sm mx-auto">
                <button
                  onClick={() => setScreen('signup')}
                  className="w-full py-4 px-8 bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xl font-bold rounded-3xl hover:shadow-lg transform hover:scale-105 transition-all duration-200 cursor-pointer"
                >
                  Create Account
                </button>
                <button
                  onClick={() => setScreen('login')}
                  className="w-full py-4 px-8 bg-gradient-to-r from-green-500 to-teal-500 text-white text-xl font-bold rounded-3xl hover:shadow-lg transform hover:scale-105 transition-all duration-200 cursor-pointer"
                >
                  Log In
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* SIGNUP SCREEN */}
        {screen === 'signup' && !generatedCreds && (
          <motion.div
            key="signup"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="min-h-screen flex flex-col items-center justify-center px-4"
          >
            <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full">
              <h2 className="text-3xl font-bold text-blue-600 mb-6 text-center">
                Create Your Account
              </h2>

              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="block text-lg font-semibold text-gray-700 mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-4 py-4 text-lg border-2 border-blue-300 rounded-2xl focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-lg font-semibold text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-4 text-lg border-2 border-blue-300 rounded-2xl focus:outline-none focus:border-blue-600"
                  />
                </div>

                {signupError && (
                  <div className="bg-red-100 border-2 border-red-400 text-red-700 px-4 py-3 rounded-2xl text-lg font-semibold">
                    {signupError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-4 px-8 bg-gradient-to-r from-blue-500 to-purple-500 text-white text-lg font-bold rounded-2xl hover:shadow-lg transform hover:scale-105 transition-all duration-200 cursor-pointer mt-6"
                >
                  Create Account
                </button>
              </form>

              <button
                onClick={() => setScreen('home')}
                className="w-full mt-4 py-3 text-gray-600 text-lg font-semibold hover:text-blue-600"
              >
                Back to Home
              </button>
            </div>
          </motion.div>
        )}

        {/* SIGNUP CREDENTIALS SCREEN */}
        {screen === 'signup' && generatedCreds && (
          <motion.div
            key="signupCreds"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="min-h-screen flex flex-col items-center justify-center px-4"
          >
            <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2 }}
                className="text-6xl mb-4"
              >
                🎉
              </motion.div>

              <h2 className="text-3xl font-bold text-green-600 mb-6">Account Created!</h2>

              <div className="bg-blue-50 rounded-2xl p-6 mb-6 border-2 border-blue-200">
                <p className="text-gray-700 text-lg mb-4">Here are your login details:</p>

                <div className="bg-white rounded-xl p-4 mb-4 border-2 border-blue-300">
                  <p className="text-sm text-gray-600 font-semibold">Username</p>
                  <p className="text-2xl font-bold text-blue-600">{generatedCreds.username}</p>
                </div>

                <div className="bg-white rounded-xl p-4 border-2 border-blue-300">
                  <p className="text-sm text-gray-600 font-semibold">Password</p>
                  <p className="text-2xl font-bold text-blue-600">{generatedCreds.password}</p>
                </div>

                <p className="text-sm text-gray-600 mt-4 font-semibold">
                  Remember these for next time! 📝
                </p>
              </div>

              <button
                onClick={handleSignupConfirm}
                className="w-full py-4 px-8 bg-gradient-to-r from-green-500 to-teal-500 text-white text-xl font-bold rounded-2xl hover:shadow-lg transform hover:scale-105 transition-all duration-200 cursor-pointer"
              >
                Let's Play!
              </button>
            </div>
          </motion.div>
        )}

        {/* LOGIN SCREEN */}
        {screen === 'login' && (
          <motion.div
            key="login"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="min-h-screen flex flex-col items-center justify-center px-4"
          >
            <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full">
              <h2 className="text-3xl font-bold text-green-600 mb-6 text-center">Welcome Back!</h2>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-lg font-semibold text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-4 text-lg border-2 border-green-300 rounded-2xl focus:outline-none focus:border-green-600"
                  />
                </div>

                <div>
                  <label className="block text-lg font-semibold text-gray-700 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-4 py-4 text-lg border-2 border-green-300 rounded-2xl focus:outline-none focus:border-green-600"
                  />
                </div>

                {loginError && (
                  <div className="bg-red-100 border-2 border-red-400 text-red-700 px-4 py-3 rounded-2xl text-lg font-semibold">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-4 px-8 bg-gradient-to-r from-green-500 to-teal-500 text-white text-lg font-bold rounded-2xl hover:shadow-lg transform hover:scale-105 transition-all duration-200 cursor-pointer mt-6"
                >
                  Log In
                </button>
              </form>

              <button
                onClick={() => setScreen('home')}
                className="w-full mt-4 py-3 text-gray-600 text-lg font-semibold hover:text-green-600"
              >
                Back to Home
              </button>
            </div>
          </motion.div>
        )}

        {/* DIFFICULTY SELECT SCREEN */}
        {screen === 'difficultySelect' && currentUser && (
          <motion.div
            key="difficulty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center px-4"
          >
            <div className="text-center max-w-2xl">
              <h2 className="text-4xl font-bold text-blue-600 mb-2">
                Welcome, {currentUser.name}! 👋
              </h2>
              <p className="text-2xl text-gray-700 mb-12">Choose your difficulty level:</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[
                  { level: 'easy', emoji: '🌟', color: 'from-yellow-400 to-yellow-500' },
                  { level: 'medium', emoji: '🚀', color: 'from-orange-400 to-orange-500' },
                  { level: 'hard', emoji: '💎', color: 'from-red-400 to-red-500' },
                ].map(({ level, emoji, color }) => (
                  <motion.button
                    key={level}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => startGame(level)}
                    className={`py-8 px-6 bg-gradient-to-br ${color} text-white rounded-3xl shadow-lg transform transition-all duration-200 cursor-pointer`}
                  >
                    <div className="text-5xl mb-3">{emoji}</div>
                    <p className="text-2xl font-bold capitalize">{level}</p>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={handleLogout}
                className="py-3 px-8 bg-gray-400 text-white text-lg font-bold rounded-2xl hover:bg-gray-500 transition-all"
              >
                Log Out
              </button>
            </div>
          </motion.div>
        )}

        {/* GAME SCREEN */}
        {screen === 'game' && currentProblem && (
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col px-4 py-6"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
              <div className="text-2xl font-bold text-gray-800">
                {currentUser?.name}
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-700 mb-2">Score</p>
                <p className="text-3xl font-bold text-blue-600">{gameState.score}</p>
              </div>
              <div>
                {renderHearts()}
              </div>
            </div>

            {/* Round indicator */}
            <div className="text-center mb-6">
              <p className="text-xl text-gray-700 font-semibold">
                Round {gameState.currentRound + 1} of 10
              </p>
            </div>

            {/* Timer */}
            <div className="flex justify-center mb-8">
              <div
                className={`text-6xl font-bold ${
                  timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-blue-600'
                }`}
              >
                {timeLeft}s
              </div>
            </div>

            {/* Problem Display */}
            <motion.div
              key={currentProblem.problem}
              animate={
                feedback?.type === 'wrong' || feedback?.type === 'timeout'
                  ? { x: [-20, 20, -20, 20, 0] }
                  : {}
              }
              transition={{ duration: 0.4 }}
              className="bg-white rounded-3xl p-8 shadow-lg mb-8 text-center border-4 border-blue-300"
            >
              <p className="text-6xl font-bold text-blue-600 mb-4">
                {currentProblem.problem}
              </p>

              {/* Feedback */}
              <AnimatePresence>
                {feedback && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`text-4xl font-bold mb-4 ${
                      feedback.type === 'correct' ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {feedback.text}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Particles */}
              {showParticles && (
                <div className="relative h-20">
                  {[...Array(5)].map((_, i) => (
                    <Particle key={i} delay={i * 0.1} emoji={['🌟', '🎉', '🦄', '🍭'][i % 4]} />
                  ))}
                </div>
              )}
            </motion.div>

            {/* Answer Input */}
            {!feedback && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-4 mb-8 max-w-md mx-auto w-full"
              >
                <input
                  type="number"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSubmitAnswer();
                    }
                  }}
                  placeholder="Your answer"
                  autoFocus
                  className="flex-1 px-6 py-4 text-2xl font-bold border-2 border-blue-300 rounded-2xl focus:outline-none focus:border-blue-600"
                />
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!userAnswer}
                  className="px-8 py-4 bg-gradient-to-r from-green-500 to-teal-500 text-white text-xl font-bold rounded-2xl hover:shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Check
                </button>
              </motion.div>
            )}

            {/* Streak indicator */}
            {gameState.correctStreak > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-center mb-4"
              >
                <p className="text-2xl font-bold text-yellow-600">
                  🔥 {gameState.correctStreak} in a row!
                </p>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* RESULTS SCREEN */}
        {screen === 'results' && currentUser && (
          <motion.div
            key="results"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="min-h-screen flex flex-col items-center justify-center px-4"
          >
            <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2 }}
                className="text-7xl mb-6"
              >
                {gameState.lives > 0 ? '🏆' : '💪'}
              </motion.div>

              <h2 className={`text-4xl font-bold mb-6 ${gameState.lives > 0 ? 'text-green-600' : 'text-blue-600'}`}>
                {gameState.lives > 0 ? 'Awesome Job!' : 'Great Try!'}
              </h2>

              <div className="bg-blue-50 rounded-2xl p-6 mb-8 border-2 border-blue-200">
                <p className="text-gray-700 text-lg mb-2">Final Score</p>
                <p className="text-5xl font-bold text-blue-600 mb-4">{gameState.score}</p>

                <div className="space-y-2 text-left">
                  <div className="flex justify-between text-lg">
                    <span className="text-gray-700">Lives Remaining:</span>
                    <span className="font-bold text-red-500">{gameState.lives}</span>
                  </div>
                  <div className="flex justify-between text-lg">
                    <span className="text-gray-700">Correct Answers:</span>
                    <span className="font-bold text-green-600">
                      {gameState.roundsData.filter((r) => r.correct).length} / 10
                    </span>
                  </div>
                  <div className="flex justify-between text-lg">
                    <span className="text-gray-700">Accuracy:</span>
                    <span className="font-bold text-blue-600">
                      {Math.round(
                        (gameState.roundsData.filter((r) => r.correct).length / 10) * 100
                      )}
                      %
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => setScreen('difficultySelect')}
                  className="w-full py-4 px-8 bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xl font-bold rounded-2xl hover:shadow-lg transform hover:scale-105 transition-all duration-200 cursor-pointer"
                >
                  Play Again
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full py-4 px-8 bg-gray-400 text-white text-lg font-bold rounded-2xl hover:bg-gray-500 transition-all"
                >
                  Home
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NumberCrunch;
