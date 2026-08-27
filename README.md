# Kids Game

Kids Game is a browser-based collection of short educational games built with React and Vite. The current playable activity is **Number Crunch**, a timed arithmetic game for addition, subtraction, and multiplication practice.

The project is intentionally structured so that more games can be added to the main menu as they are completed.

## Current Features

- Number Crunch game with Easy, Medium, and Hard levels
- Timed questions with three lives
- Score, streak, and high-score tracking during a session
- Animated feedback, rewards, and answer choices
- Main menu organized by Mathematics, Language, and Reading
- Responsive browser interface for desktop and mobile screens

Several additional games are listed in the menu as coming soon. They are placeholders until their components are implemented.

## Technology

- React 19
- React DOM 19
- Vite 8
- JavaScript with JSX
- ESLint 10
- npm for dependency management

## Requirements

Install the following before starting:

- Node.js 20 or newer (Node.js 22 LTS is recommended)
- npm, included with Node.js
- Git, if you are cloning the project
- A modern browser such as Chrome, Edge, Firefox, or Safari

Check that Node.js and npm are available:

```bash
node --version
npm --version
```

If either command is not recognized, install Node.js from [nodejs.org](https://nodejs.org/) and restart your terminal or VS Code after installation.

## Installation

### Option 1: Clone the repository

Use this option when the project is hosted in a Git repository:

```bash
git clone <repository-url>
cd kids-game
```

Replace `<repository-url>` with the repository's actual URL.

### Option 2: Use an existing project folder

Open a terminal in the directory that contains `package.json`:

```bash
cd /path/to/kids-game
```

For this workspace, the directory is:

```bash
cd /home/preshengr/Desktop/kids-game
```

Confirm that you are in the correct directory:

```bash
ls package.json package-lock.json
```

### Install dependencies

Because this project has a lockfile, use `npm ci` for the cleanest installation:

```bash
npm ci
```

`npm ci` removes and recreates `node_modules` from `package-lock.json`, which helps avoid mismatched dependency versions. If you are deliberately adding or updating a package, use this instead:

```bash
npm install
```

Do not run both commands as part of the normal setup. Choose `npm ci` for a fresh checkout, or `npm install` when changing dependencies.

## Start the Development Server

Run:

```bash
npm run dev
```

Vite will print a local address, usually:

```text
http://localhost:5173/
```

Open the displayed address in your browser. Keep the terminal running while using the app. Vite provides hot reload, so changes to files in `src/` should appear automatically.

To stop the server, press `Ctrl+C` in the terminal.

### Open the server on another device

To test on a phone or tablet connected to the same network, run:

```bash
npm run dev -- --host 0.0.0.0
```

Open the network URL printed by Vite on the other device. Your firewall may need to allow the chosen port.

## Verify the Project

Run the linter:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

The preview command must be run after `npm run build`. It serves the generated `dist/` directory and is useful for checking the app in production-like mode.

## Available npm Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server with hot reload |
| `npm run build` | Build the optimized production files in `dist/` |
| `npm run lint` | Check JavaScript and JSX files with ESLint |
| `npm run preview` | Serve the latest production build locally |

## Project Structure

```text
kids-game/
├── public/                  # Static files served as-is
├── src/
│   ├── assets/              # Application assets
│   ├── games/
│   │   └── NumberCrunch.jsx # The currently playable game
│   ├── App.jsx              # Main menu and game registry
│   ├── App.css              # App-level styles
│   ├── index.css            # Global styles
│   └── main.jsx              # React entry point
├── .gitignore
├── eslint.config.js         # ESLint configuration
├── index.html               # HTML entry document
├── package.json             # Scripts and dependencies
├── package-lock.json        # Locked dependency versions
└── vite.config.js           # Vite configuration
```

## Adding a New Game

1. Create a component in `src/games/`, for example `src/games/WordScramble.jsx`.
2. Export the component as the default export.
3. Import it near the other game imports in `src/App.jsx`.
4. Add an entry to the `GAMES` array with a unique `id`, display name, category, description, skills, and component.
5. Set `available: true`.
6. Run `npm run lint` and `npm run build`.

The game component should accept the navigation callback used by the surrounding app if it needs to return to the main menu. Follow the existing `NumberCrunch` component and nearby code in `App.jsx` as the reference pattern.

## Troubleshooting

### `npm` or `node` is not recognized

Node.js is missing or its installation directory is not on your PATH. Install the current Node.js LTS release, restart VS Code, and check the versions again.

### `npm ci` fails because the lockfile is out of sync

Make sure you are using the project files from the same checkout and that `package-lock.json` has not been partially edited. If you intentionally changed `package.json`, run:

```bash
npm install
npm run lint
npm run build
```

Commit the updated `package-lock.json` together with the dependency change.

### Port 5173 is already in use

Start Vite with another port:

```bash
npm run dev -- --port 5174
```

Use the URL printed in the terminal.

### The browser shows a blank or stale page

Stop the development server, reinstall dependencies, and start it again:

```bash
rm -rf node_modules
npm ci
npm run dev
```

On Windows PowerShell, remove the dependency folder with `Remove-Item -Recurse -Force node_modules` instead of `rm -rf node_modules`.

### Changes are not appearing

Confirm that the file is saved, that the terminal is running `npm run dev` from this project directory, and that the browser is using the URL printed by Vite. A hard refresh can clear stale browser assets.

## Production Deployment

Build the app with:

```bash
npm ci
npm run lint
npm run build
```

Deploy the contents of `dist/` to a static hosting provider such as GitHub Pages, Netlify, Vercel, or Cloudflare Pages. Configure the host to run `npm run build` and publish `dist/` when deploying directly from the repository.

## Contributing

Before submitting a change:

```bash
npm ci
npm run lint
npm run build
```

Keep game-specific behavior inside its game component, use the existing registry pattern for menu entries, and avoid committing generated folders such as `node_modules/` or `dist/`.
