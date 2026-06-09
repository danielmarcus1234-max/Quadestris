import React, { useEffect, useRef, useState } from "react";


const GRID = 35;
const CELL = 16;
const START_SPEED = 720;
const MIN_SPEED = 82;
const CENTRE = Math.floor(GRID / 2);
const SAFE_MIN = 2;
const SAFE_MAX = GRID - 3;
const CORE_COLOR = "#f8fafc";
const FLASH_MS = 160;
const SETTLE_TICK_MS = 45;
const MULTIPLIER_DURATION_MS = 20000;
const SLOWMO_DURATION_MS = 10000;
const REVERSE_DURATION_MS = 10000;
const BOMB_FLASH_INTERVAL_MS = 65;
const POWERUP_TURNS = 6;
const MAX_SCORE_MULTIPLIER = 6;
const HIGH_SCORES_KEY = "quadestris.highScores.v1";
const SETTINGS_KEY = "quadestris.settings.v1";
const PLAYER_NAME_KEY = "quadestris.playerName.v1";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ssfpmrgxpqcuzpsprqrs.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_FVMm1_mj5WcA6II06dh5mA_4m2D6r3-";
const LEADERBOARD_TABLE = "leaderboard_scores";
const MODES_WITH_LEADERBOARDS = ["classic", "arcade", "cursed"];

const SHAPES = [
  [[1, 1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[1, 1, 0], [0, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
];
const CURSED_PIECES = [
  { shape: [[0, 1, 1], [0, 1, 0], [0, 1, 0], [0, 1, 0], [1, 1, 0]], colorMode: "alternate", colors: ["#7c3aed", "#ca8a04"] },
  { shape: [[1, 1], [1, 1], [1, 1], [1, 1]], colorMode: "solid", color: "#2563eb" },
  { shape: [[0, 1, 0], [1, 1, 1], [1, 1, 1], [0, 1, 0]], colorMode: "solid", color: "#16a34a" },
  { shape: [[1, 1, 0], [0, 1, 1], [0, 1, 1], [1, 1, 0]], colorMode: "half", topColor: "#ea580c", bottomColor: "#2563eb" },
  { shape: [[1, 1, 1, 1, 1, 1, 1, 1]], colorMode: "solid", color: "#e11d48" },
];

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#ca8a04", "#7c3aed", "#ea580c", "#0891b2"];

function isCoreCell(x, y) {
  return (x === CENTRE && y === CENTRE) ||
    (x === CENTRE - 1 && y === CENTRE) ||
    (x === CENTRE + 1 && y === CENTRE) ||
    (x === CENTRE && y === CENTRE - 1) ||
    (x === CENTRE && y === CENTRE + 1);
}

function emptyBoard() {
  const board = Array.from({ length: GRID }, () => Array(GRID).fill(null));
  for (let y = CENTRE - 1; y <= CENTRE + 1; y++) {
    for (let x = CENTRE - 1; x <= CENTRE + 1; x++) {
      if (isCoreCell(x, y)) board[y][x] = CORE_COLOR;
    }
  }
  return board;
}

function rotate(shape) {
  return shape[0].map((_, i) => shape.map(row => row[i]).reverse());
}

function rotateColorGrid(grid) {
  if (!grid || !grid.length) return grid;
  return grid[0].map((_, i) => grid.map(row => row[i]).reverse());
}

function randomPiece(forcedSide = null, shapePool = SHAPES) {
  const index = Math.floor(Math.random() * shapePool.length);
  const side = forcedSide || randomSide();
  const shape = shapePool[index];
  let x = CENTRE - Math.floor(shape[0].length / 2);
  let y = CENTRE - Math.floor(shape.length / 2);

  if (side === "top") y = SAFE_MIN;
  if (side === "bottom") y = SAFE_MAX - shape.length + 1;
  if (side === "left") x = SAFE_MIN;
  if (side === "right") x = SAFE_MAX - shape[0].length + 1;

  return { id: crypto.randomUUID(), shape, color: COLORS[index % COLORS.length], x, y, side };
}

function cursedCellColor(spec, shape, r, c) {
  if (spec.colorMode === "solid") return spec.color;
  if (spec.colorMode === "alternate") {
    let nth = 0;
    for (let yy = 0; yy <= r; yy++) {
      for (let xx = 0; xx < shape[yy].length; xx++) {
        if (!shape[yy][xx]) continue;
        if (yy === r && xx === c) return spec.colors[nth % spec.colors.length];
        nth++;
      }
    }
    return spec.colors[0];
  }
  if (spec.colorMode === "half") {
    return r < Math.ceil(shape.length / 2) ? spec.topColor : spec.bottomColor;
  }
  return "#7c3aed";
}

function randomCursedPiece(forcedSide = null) {
  const index = Math.floor(Math.random() * CURSED_PIECES.length);
  const spec = CURSED_PIECES[index];
  const side = forcedSide || randomSide();
  const shape = spec.shape;
  let x = CENTRE - Math.floor(shape[0].length / 2);
  let y = CENTRE - Math.floor(shape.length / 2);

  if (side === "top") y = SAFE_MIN;
  if (side === "bottom") y = SAFE_MAX - shape.length + 1;
  if (side === "left") x = SAFE_MIN;
  if (side === "right") x = SAFE_MAX - shape[0].length + 1;

  const cellColors = shape.map((row, r) => row.map((cell, c) => (cell ? cursedCellColor(spec, shape, r, c) : null)));
  return { id: crypto.randomUUID(), shape, x, y, side, color: "#7c3aed", cellColors };
}

function randomSide() {
  return ["top", "right", "bottom", "left"][Math.floor(Math.random() * 4)];
}

function oppositeSide(side) {
  if (side === "top") return "bottom";
  if (side === "bottom") return "top";
  if (side === "left") return "right";
  return "left";
}

function directionVector(side) {
  if (side === "top") return { dx: 0, dy: 1 };
  if (side === "bottom") return { dx: 0, dy: -1 };
  if (side === "left") return { dx: 1, dy: 0 };
  return { dx: -1, dy: 0 };
}

function pieceCells(piece, nx = piece.x, ny = piece.y, shape = piece.shape) {
  const cells = [];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) cells.push({ x: nx + c, y: ny + r });
    }
  }
  return cells;
}

function outsideBarrier(x, y) {
  return x < SAFE_MIN || x > SAFE_MAX || y < SAFE_MIN || y > SAFE_MAX;
}

function overlapsBoard(board, piece, nx = piece.x, ny = piece.y, shape = piece.shape) {
  for (const { x, y } of pieceCells(piece, nx, ny, shape)) {
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return true;
    if (board[y][x]) return true;
  }
  return false;
}

function breachesBarrier(piece, nx = piece.x, ny = piece.y, shape = piece.shape) {
  return pieceCells(piece, nx, ny, shape).some(({ x, y }) => outsideBarrier(x, y));
}

function validSideMove(board, piece, nx = piece.x, ny = piece.y, shape = piece.shape) {
  if (breachesBarrier(piece, nx, ny, shape)) return false;
  if (overlapsBoard(board, piece, nx, ny, shape)) return false;
  return true;
}

function merge(board, piece) {
  const next = board.map(row => [...row]);
  pieceCells(piece).forEach(({ x, y }) => {
    if (!outsideBarrier(x, y)) next[y][x] = piece.color;
  });
  return next;
}

function pieceCellColor(piece, r, c) {
  return piece.cellColors?.[r]?.[c] || piece.color;
}

function mergeWithCellColors(board, piece) {
  const next = board.map(row => [...row]);
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const x = piece.x + c;
      const y = piece.y + r;
      if (outsideBarrier(x, y)) continue;
      next[y][x] = pieceCellColor(piece, r, c);
    }
  }
  return next;
}

function clearMatches(board) {
  const toClear = new Set();
  let groups = 0;

  for (let y = SAFE_MIN; y <= SAFE_MAX - 3; y++) {
    for (let x = SAFE_MIN; x <= SAFE_MAX - 3; x++) {
      let full = true;
      for (let yy = y; yy < y + 4; yy++) {
        for (let xx = x; xx < x + 4; xx++) {
          if (!board[yy][xx] || isCoreCell(xx, yy)) full = false;
        }
      }
      if (full) {
        groups++;
        for (let yy = y; yy < y + 4; yy++) {
          for (let xx = x; xx < x + 4; xx++) {
            if (!isCoreCell(xx, yy)) toClear.add(`${xx},${yy}`);
          }
        }
      }
    }
  }

  return { clearKeys: toClear, cleared: groups };
}

function applyClear(board, clearKeys) {
  const next = board.map(row => [...row]);
  clearKeys.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    next[y][x] = null;
  });
  return next;
}

function connectedToCore(board) {
  const connected = Array.from({ length: GRID }, () => Array(GRID).fill(false));
  const queue = [];

  for (let y = CENTRE - 1; y <= CENTRE + 1; y++) {
    for (let x = CENTRE - 1; x <= CENTRE + 1; x++) {
      if (isCoreCell(x, y) && board[y][x]) {
        connected[y][x] = true;
        queue.push([x, y]);
      }
    }
  }

  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
      if (connected[ny][nx] || !board[ny][nx]) continue;
      connected[ny][nx] = true;
      queue.push([nx, ny]);
    }
  }

  return connected;
}

function centreStep(x, y) {
  const dx = CENTRE - x;
  const dy = CENTRE - y;
  if (Math.abs(dx) >= Math.abs(dy)) return { dx: Math.sign(dx), dy: 0 };
  return { dx: 0, dy: Math.sign(dy) };
}

function settleOneTick(startBoard) {
  const board = startBoard.map(row => [...row]);
  const connected = connectedToCore(board);
  const updates = [];
  let bonus = 0;

  for (let y = SAFE_MIN; y <= SAFE_MAX; y++) {
    for (let x = SAFE_MIN; x <= SAFE_MAX; x++) {
      const color = board[y][x];
      if (!color || connected[y][x] || isCoreCell(x, y)) continue;

      const { dx, dy } = centreStep(x, y);
      const nx = x + dx;
      const ny = y + dy;

      if (outsideBarrier(nx, ny)) {
        updates.push({ type: "remove", x, y });
        bonus += 10;
      } else if (!board[ny][nx]) {
        updates.push({ type: "move", x, y, nx, ny, color });
      }
    }
  }

  if (!updates.length) return { board, moved: false, bonus: 0 };

  updates.forEach(update => {
    board[update.y][update.x] = null;
  });

  updates.forEach(update => {
    if (update.type === "move") {
      if (!board[update.ny][update.nx]) board[update.ny][update.nx] = update.color;
      else bonus += 10;
    }
  });

  return { board, moved: true, bonus };
}

function BlockTitle() {
  const letters = {
    Q: ["111", "101", "101", "111", "001"],
    U: ["101", "101", "101", "101", "111"],
    A: ["111", "101", "111", "101", "101"],
    D: ["110", "101", "101", "101", "110"],
    E: ["111", "100", "111", "100", "111"],
    S: ["111", "100", "111", "001", "111"],
    T: ["111", "010", "010", "010", "010"],
    R: ["110", "101", "110", "101", "101"],
    I: ["111", "010", "010", "010", "111"],
  };

  const word = "QUADESTRIS";

  return (
    <div style={{ display:'flex', justifyContent:'center', gap:'2px', marginBottom:'8px' }} aria-label="Quadestris">
      {word.split("").map((letter, letterIndex) => (
        <div
          key={`${letter}-${letterIndex}`}
          style={{ display:'grid', gap:'2px', gridTemplateRows: `repeat(${letters[letter].length}, 6px)` }}
        >
          {letters[letter].map((row, y) => (
            <div key={y} style={{ display:'flex', gap:'2px' }}>
              {row.split("").map((cell, x) => (
                <div
                  key={x}
                  style={{
                    width:'6px',
                    height:'6px',
                    borderRadius:'1px',
                    background: cell === "1" ? COLORS[letterIndex % COLORS.length] : 'transparent'
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PixelPadIcon({ type, color = "#e11d48" }) {
  const icons = {
    up: [
      "00100",
      "01110",
      "10101",
      "00100",
      "00100",
      "00100",
      "00000",
    ],
    right: [
      "00000",
      "00100",
      "00010",
      "11111",
      "00010",
      "00100",
      "00000",
    ],
    down: [
      "00000",
      "00100",
      "00100",
      "00100",
      "10101",
      "01110",
      "00100",
    ],
    left: [
      "00000",
      "00100",
      "01000",
      "11111",
      "01000",
      "00100",
      "00000",
    ],
    rotate: [
      "1110100",
      "0110010",
      "1010001",
      "1000001",
      "1000001",
      "0100010",
      "0011100",
    ],
    drop: [
      "00100",
      "00100",
      "10101",
      "01110",
      "00100",
      "00000",
      "11111",
    ],
  };

  const pattern = icons[type] || icons.right;
  const columns = pattern[0].length;

  return (
    <div
      style={{
        width:'74px',
        height:'74px',
        display:'grid',
        placeContent:'center',
        gridTemplateColumns:`repeat(${columns}, 8px)`,
        gap:'2px',
        border:'3px solid transparent',
        background:'rgba(15,23,42,0.72)',
        boxShadow:'none',
      }}
      aria-hidden="true"
    >
      {pattern.flatMap((row, y) => row.split("").map((cell, x) => (
        <div
          key={`${type}-${y}-${x}`}
          style={{
            width:'8px',
            height:'8px',
            borderRadius:'1px',
            background: cell === "1" ? color : 'transparent',
          }}
        />
      )))}
    </div>
  );
}

function PixelTextButton({ label, onClick, color = "#f43f5e" }) {
  const letters = {
    A: ["111", "101", "111", "101", "101"],
    E: ["111", "100", "111", "100", "111"],
    G: ["111", "100", "101", "101", "111"],
    I: ["111", "010", "010", "010", "111"],
    L: ["100", "100", "100", "100", "111"],
    N: ["101", "111", "111", "111", "101"],
    P: ["110", "101", "110", "100", "100"],
    S: ["111", "100", "111", "001", "111"],
    T: ["111", "010", "010", "010", "010"],
    Y: ["101", "101", "010", "010", "010"],
  };

  return (
    <button
      onClick={onClick}
      style={{
        border:'3px solid transparent',
        background:'rgba(15,23,42,0.72)',
        padding:'10px 12px',
        cursor:'pointer',
        userSelect:'none',
        WebkitUserSelect:'none',
        WebkitTouchCallout:'none',
        touchAction:'manipulation',
        boxShadow:'none',
      }}
      aria-label={label}
    >
      <div style={{ display:'flex', gap:'5px', justifyContent:'center' }} aria-hidden="true">
        {label.toUpperCase().split("").map((letter, letterIndex) => (
          <div key={`${letter}-${letterIndex}`} style={{ display:'grid', gap:'2px' }}>
            {(letters[letter] || letters.P).map((row, y) => (
              <div key={y} style={{ display:'flex', gap:'2px' }}>
                {row.split("").map((cell, x) => (
                  <div
                    key={x}
                    style={{
                      width:'6px',
                      height:'6px',
                      borderRadius:'1px',
                      background: cell === "1" ? color : 'transparent'
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </button>
  );
}

function PixelIconButton({ type, onClick, color = "#ffffff", ariaLabel }) {
  const icons = {
    play: [
      "1000000",
      "1110000",
      "1111100",
      "1111111",
      "1111100",
      "1110000",
      "1000000",
    ],
    cog: [
      "0000000",
      "0001000",
      "0011100",
      "0110110",
      "0011100",
      "0001000",
      "0000000",
    ],
    trophy: [
      "0000000",
      "0111110",
      "0111110",
      "0011100",
      "0001000",
      "0001000",
      "0011100",
    ],
    fullscreen: [
      "1100011",
      "1000001",
      "0000000",
      "0000000",
      "0000000",
      "1000001",
      "1100011",
    ],
  };
  const pattern = icons[type] || icons.cog;
  const columns = pattern[0].length;

  return (
    <button
      onClick={onClick}
      style={{
        border:'3px solid transparent',
        background:'rgba(15,23,42,0.72)',
        width:'74px',
        height:'74px',
        display:'grid',
        placeContent:'center',
        cursor:'pointer',
        userSelect:'none',
        WebkitUserSelect:'none',
        WebkitTouchCallout:'none',
        touchAction:'manipulation',
        boxShadow:'none',
      }}
      aria-label={ariaLabel}
    >
      <div
        style={{
          display:'grid',
          gridTemplateColumns:`repeat(${columns}, 6px)`,
          gap:'2px',
        }}
        aria-hidden="true"
      >
        {pattern.flatMap((row, y) => row.split("").map((cell, x) => (
          <div
            key={`${type}-${y}-${x}`}
            style={{
              width:'6px',
              height:'6px',
              borderRadius:'1px',
              background: cell === "1" ? color : 'transparent',
            }}
          />
        )))}
      </div>
    </button>
  );
}

export default function FourDirectionTetris() {
  const canvasRef = useRef(null);
  const [board, setBoard] = useState(emptyBoard());
  const [pieces, setPieces] = useState([]);
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState({ classic: [], arcade: [], cursed: [] });
  const [publicScores, setPublicScores] = useState({ classic: [], arcade: [], cursed: [] });
  const [publicScoresLoading, setPublicScoresLoading] = useState(false);
  const [publicScoresError, setPublicScoresError] = useState("");
  const [publicPlayerName, setPublicPlayerName] = useState("");
  const [publicSubmitStatus, setPublicSubmitStatus] = useState("");
  const [publicScoreSubmitted, setPublicScoreSubmitted] = useState(false);
  const [level, setLevel] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [gameMode, setGameMode] = useState("classic");
  const [randomSpawnOrder, setRandomSpawnOrder] = useState(false);
  const [nextSideIndex, setNextSideIndex] = useState(0);
  const [devMode, setDevMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [sfxVolume, setSfxVolume] = useState(0.8);
  const [musicVolume, setMusicVolume] = useState(0.5);
  const [screen, setScreen] = useState("title");
  const [countdown, setCountdown] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [paused, setPaused] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [flashKeys, setFlashKeys] = useState(new Set());
  const [levelMessage, setLevelMessage] = useState("");
  const [scoreFlash, setScoreFlash] = useState("");
  const [scoreMultiplier, setScoreMultiplier] = useState(1);
  const [powerUps, setPowerUps] = useState([]);
  const [multiplierPopup, setMultiplierPopup] = useState("");
  const [destroyedPiece, setDestroyedPiece] = useState(null);
  const [hasExtraLife, setHasExtraLife] = useState(false);
  const [screenFlash, setScreenFlash] = useState(false);
  const [missileEffect, setMissileEffect] = useState(null);
  const [pendingDualSpawn, setPendingDualSpawn] = useState(false);
  const [slowMoUntil, setSlowMoUntil] = useState(0);
  const [reverseUntil, setReverseUntil] = useState(0);
  const [pendingCursedPiece, setPendingCursedPiece] = useState(false);
  const [pendingBombPiece, setPendingBombPiece] = useState(false);
  const [nextPreview, setNextPreview] = useState([]);
  const [showHighScores, setShowHighScores] = useState(false);
  const [highScoreMessage, setHighScoreMessage] = useState("");
  const [runHighScoreAchieved, setRunHighScoreAchieved] = useState(false);
  const [showRunHighScoreModal, setShowRunHighScoreModal] = useState(false);
  const [runHighScoreValue, setRunHighScoreValue] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);
  const [runHighScoreDismissed, setRunHighScoreDismissed] = useState(false);
  const [sessionRunCounts, setSessionRunCounts] = useState({ classic: 0, arcade: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugReportText, setBugReportText] = useState("");
  const holdDelayRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const runScoreSavedRef = useRef(false);
  const stepRef = useRef(() => {});
  const prevGameOverRef = useRef(false);
  const pickupSfxRef = useRef(null);
  const cursedPickupSfxRef = useRef(null);
  const clearSfxRef = useRef(null);
  const placePieceSfxRef = useRef(null);
  const levelUpSfxRef = useRef(null);
  const explosionSfxRef = useRef(null);
  const missileFireSfxRef = useRef(null);
  const gameOverSfxRef = useRef(null);
  const extraLifeSfxRef = useRef(null);
  const highScoreSfxRef = useRef(null);
  const lastClearSfxAtRef = useRef(0);

  function levelForScore(points) {
    if (points >= 82000) return 9;
    if (points >= 62000) return 8;
    if (points >= 45500) return 7;
    if (points >= 32000) return 6;
    if (points >= 20500) return 5;
    if (points >= 9000) return 4;
    if (points >= 3500) return 3;
    if (points >= 500) return 2;
    return 1;
  }

  function leaderboardMode(mode = gameMode) {
    return MODES_WITH_LEADERBOARDS.includes(mode) ? mode : null;
  }

  function currentModeTopScore(mode = gameMode) {
    const key = leaderboardMode(mode);
    return key ? (highScores[key]?.[0] || 0) : 0;
  }

  function supabaseConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  function publicLeaderboardEndpoint(query = "") {
    return `${SUPABASE_URL}/rest/v1/${LEADERBOARD_TABLE}${query}`;
  }

  function supabaseHeaders(extra = {}) {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...extra
    };
  }

  function normalizePlayerName(value) {
    return value.replace(/\s+/g, " ").trim().slice(0, 16);
  }

  async function fetchPublicScores() {
    if (!supabaseConfigured()) {
      setPublicScoresError("Add your Supabase anon key to enable public scores.");
      return;
    }

    setPublicScoresLoading(true);
    setPublicScoresError("");
    try {
      const entries = await Promise.all(MODES_WITH_LEADERBOARDS.map(async mode => {
        const query = `?select=player_name,score,mode,created_at&mode=eq.${encodeURIComponent(mode)}&order=score.desc&limit=10`;
        const response = await fetch(publicLeaderboardEndpoint(query), {
          headers: supabaseHeaders()
        });
        if (!response.ok) throw new Error(`Could not load ${mode} scores`);
        const rows = await response.json();
        return [mode, Array.isArray(rows) ? rows : []];
      }));
      setPublicScores(Object.fromEntries(entries));
    } catch {
      setPublicScoresError("Could not load public scores.");
    } finally {
      setPublicScoresLoading(false);
    }
  }

  async function submitPublicScore() {
    if (publicScoreSubmitted || publicSubmitStatus === "sending...") return;
    const key = leaderboardMode(gameMode);
    const name = normalizePlayerName(publicPlayerName);
    const scoreValue = Math.floor(runHighScoreValue || score);
    if (!key || !scoreValue || !name) return;
    if (!supabaseConfigured()) {
      setPublicSubmitStatus("Add your Supabase anon key first.");
      return;
    }

    setPublicSubmitStatus("sending...");
    try {
      const response = await fetch(publicLeaderboardEndpoint(), {
        method: "POST",
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }),
        body: JSON.stringify({
          player_name: name,
          score: scoreValue,
          mode: key
        })
      });
      if (!response.ok) throw new Error("submit failed");
      try {
        localStorage.setItem(PLAYER_NAME_KEY, name);
      } catch {
        // Ignore storage failures.
      }
      setPublicPlayerName(name);
      setPublicSubmitStatus("submitted");
      setPublicScoreSubmitted(true);
      fetchPublicScores();
    } catch {
      setPublicSubmitStatus("could not submit");
    }
  }

  function saveRunScore(points, mode = gameMode) {
    const scoreValue = Math.floor(points);
    if (scoreValue <= 0) return;
    const key = leaderboardMode(mode);
    if (!key) return;

    setHighScores(prev => {
      const next = { ...prev };
      const list = [...(next[key] || []), scoreValue]
        .sort((a, b) => b - a)
        .slice(0, 10);
      next[key] = list;
      try {
        localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
    setSessionRunCounts(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  }

  function maybeFinalizeRunScore() {
    if (runScoreSavedRef.current) return;
    if (score <= 0) return;
    saveRunScore(score, gameMode);
    runScoreSavedRef.current = true;
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIGH_SCORES_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        setHighScores({
          classic: Array.isArray(parsed.classic) ? parsed.classic.filter(Number.isFinite).map(n => Math.floor(n)).slice(0, 10) : [],
          arcade: Array.isArray(parsed.arcade) ? parsed.arcade.filter(Number.isFinite).map(n => Math.floor(n)).slice(0, 10) : [],
          cursed: Array.isArray(parsed.cursed) ? parsed.cursed.filter(Number.isFinite).map(n => Math.floor(n)).slice(0, 10) : [],
        });
      }
    } catch {
      // Ignore storage failures; game still works without persistence.
    }
  }, []);

  useEffect(() => {
    try {
      const savedName = localStorage.getItem(PLAYER_NAME_KEY);
      if (savedName) setPublicPlayerName(normalizePlayerName(savedName));
    } catch {
      // Ignore storage failures.
    }
  }, []);

  useEffect(() => {
    if (showHighScores) fetchPublicScores();
  }, [showHighScores]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.devMode === "boolean") setDevMode(parsed.devMode);
      if (typeof parsed?.randomSpawnOrder === "boolean") setRandomSpawnOrder(parsed.randomSpawnOrder);
      if (typeof parsed?.sfxMuted === "boolean") setSfxMuted(parsed.sfxMuted);
      if (Number.isFinite(parsed?.sfxVolume)) setSfxVolume(Math.max(0, Math.min(1, parsed.sfxVolume)));
      if (Number.isFinite(parsed?.musicVolume)) setMusicVolume(Math.max(0, Math.min(1, parsed.musicVolume)));
    } catch {
      // Ignore invalid settings data.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ devMode, randomSpawnOrder, sfxMuted, sfxVolume, musicVolume })
      );
    } catch {
      // Ignore storage failures.
    }
  }, [devMode, randomSpawnOrder, sfxMuted, sfxVolume, musicVolume]);

  useEffect(() => {
    const initSfx = (ref, src, baseVolume) => {
      const audio = new Audio(src);
      audio.volume = baseVolume;
      audio._baseVolume = baseVolume;
      ref.current = audio;
    };

    initSfx(pickupSfxRef, "/audio/pickuppowerup.wav", 0.65);
    initSfx(cursedPickupSfxRef, "/audio/pickupcursedpowerup.wav", 0.72);
    initSfx(clearSfxRef, "/audio/cleara4by4.wav", 0.78);
    initSfx(placePieceSfxRef, "/audio/placeapiece.wav", 0.68);
    initSfx(levelUpSfxRef, "/audio/level up.wav", 0.78);
    initSfx(explosionSfxRef, "/audio/explosion.wav", 0.82);
    initSfx(missileFireSfxRef, "/audio/missilefiring.wav", 0.8);
    initSfx(gameOverSfxRef, "/audio/gameover.wav", 0.82);
    initSfx(extraLifeSfxRef, "/audio/extra life.wav", 0.82);
    initSfx(highScoreSfxRef, "/audio/high score.wav", 0.86);
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    syncFullscreen();
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen);
    };
  }, []);

  function playSfx(audioRef) {
    if (sfxMuted || sfxVolume <= 0) return;
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const base = Number.isFinite(audio._baseVolume) ? audio._baseVolume : 1;
      audio.volume = Math.max(0, Math.min(1, base * sfxVolume));
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {
      // Ignore audio playback errors.
    }
  }

  function playClearSfxOnce() {
    const now = Date.now();
    if (now - lastClearSfxAtRef.current < 220) return;
    lastClearSfxAtRef.current = now;
    playSfx(clearSfxRef);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit =
          document.exitFullscreen ||
          document.webkitExitFullscreen ||
          document.msExitFullscreen;
        await exit?.call(document);
        return;
      }

      if (isFullscreen) {
        setIsFullscreen(false);
        return;
      }

      const root = document.documentElement;
      const request =
        root.requestFullscreen ||
        root.webkitRequestFullscreen ||
        root.msRequestFullscreen;

      if (request) {
        await request.call(root);
        setIsFullscreen(true);
        return;
      }
    } catch {
      // Mobile browsers can reject fullscreen, so fall back to an app-like fill-screen view.
    }

    setIsFullscreen(true);
    window.scrollTo?.(0, 0);
  }

  function resetToTitle() {
    maybeFinalizeRunScore();
    setBoard(emptyBoard());
    setPieces([]);
    setScore(0);
    setLevel(selectedLevel);
    setScoreMultiplier(1);
    setPowerUps([]);
    setLevelMessage("");
    setScoreFlash("");
    setScoreMultiplier(1);
    setPowerUps([]);
    setDestroyedPiece(null);
    setMissileEffect(null);
    setPendingDualSpawn(false);
    setSlowMoUntil(0);
    setReverseUntil(0);
    setPendingCursedPiece(false);
    setPendingBombPiece(false);
    setNextSideIndex(0);
    setNextPreview([]);
    setRunHighScoreAchieved(false);
    setHighScoreMessage("");
    setShowRunHighScoreModal(false);
    setRunHighScoreValue(0);
    setShareCopied(false);
    setPublicSubmitStatus("");
    setPublicScoreSubmitted(false);
    setRunHighScoreDismissed(false);
    runScoreSavedRef.current = false;
    setHasExtraLife(false);
    setScreenFlash(false);
    setGameOver(false);
    setFailReason("");
    setPaused(false);
    setAnimating(false);
    setFlashKeys(new Set());
    setScreen("title");
    setCountdown(null);
  }

  function randomPowerUp(board) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = SAFE_MIN + Math.floor(Math.random() * (SAFE_MAX - SAFE_MIN));
      const y = SAFE_MIN + Math.floor(Math.random() * (SAFE_MAX - SAFE_MIN));

      let clearArea = true;
      for (let yy = y; yy < y + 2; yy++) {
        for (let xx = x; xx < x + 2; xx++) {
          if (board[yy][xx] || isCoreCell(xx, yy)) clearArea = false;
        }
      }

      if (clearArea) {
        const roll = Math.random();
        const slowMoChance = Math.min(0.06, 0.05 + Math.max(0, level - 3) * 0.01);
        const slowMoThreshold = Math.min(0.94, 0.88 + slowMoChance);

        if (roll < 0.52) {
          return {
            id: crypto.randomUUID(),
            x,
            y,
            size:3,
            type:'multiplier',
            multiplier:2,
            turnsLeft: POWERUP_TURNS,
            collected:false
          };
        }

        if (roll < 0.76) {
          return {
            id: crypto.randomUUID(),
            x,
            y,
            size:3,
            type:'multiplier',
            multiplier:3,
            turnsLeft: POWERUP_TURNS,
            collected:false
          };
        }

        if (roll < 0.88) {
          return {
            id: crypto.randomUUID(),
            x,
            y,
            size:3,
            type:'missile',
            turnsLeft: POWERUP_TURNS,
            collected:false
          };
        }

        if (roll < slowMoThreshold) {
          return {
            id: crypto.randomUUID(),
            x,
            y,
            size:3,
            type:'slowmo',
            turnsLeft: POWERUP_TURNS,
            collected:false
          };
        }

        if (roll < 0.95) {
          return {
            id: crypto.randomUUID(),
            x,
            y,
            size:3,
            type:'dual',
            turnsLeft: POWERUP_TURNS,
            collected:false
          };
        }

        if (roll < 0.97) {
          return {
            id: crypto.randomUUID(),
            x,
            y,
            size:3,
            type:'reverse',
            turnsLeft: POWERUP_TURNS,
            collected:false
          };
        }

        if (gameMode !== "cursed" && roll < 0.985) {
          return {
            id: crypto.randomUUID(),
            x,
            y,
            size:3,
            type:'cursed',
            turnsLeft: POWERUP_TURNS,
            collected:false
          };
        }

        if (roll < 0.995) {
          return {
            id: crypto.randomUUID(),
            x,
            y,
            size:3,
            type:'bomb',
            turnsLeft: POWERUP_TURNS,
            collected:false
          };
        }

        if (!hasExtraLife) {
          return {
            id: crypto.randomUUID(),
            x,
            y,
            size:3,
            type:'life',
            turnsLeft: POWERUP_TURNS,
            collected:false
          };
        }

        return {
          id: crypto.randomUUID(),
          x,
          y,
          size:3,
          type:'multiplier',
          multiplier:3,
          turnsLeft: POWERUP_TURNS,
          collected:false
        };
      }
    }
    return null;
  }

  function spawnDebugPowerUp(type) {
    if (screen !== "playing" || gameMode !== "arcade") return;
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = SAFE_MIN + Math.floor(Math.random() * (SAFE_MAX - SAFE_MIN));
      const y = SAFE_MIN + Math.floor(Math.random() * (SAFE_MAX - SAFE_MIN));

      let clearArea = true;
      for (let yy = y; yy < y + 2; yy++) {
        for (let xx = x; xx < x + 2; xx++) {
          const occupiedByPowerUp = powerUps.some(p =>
            xx >= p.x && xx < p.x + (p.size || 1) &&
            yy >= p.y && yy < p.y + (p.size || 1)
          );
          if (board[yy][xx] || isCoreCell(xx, yy) || occupiedByPowerUp) clearArea = false;
        }
      }

      if (!clearArea) continue;

      const next = {
        id: crypto.randomUUID(),
        x,
        y,
        size: 3,
        type,
        turnsLeft: POWERUP_TURNS,
        collected: false
      };

      if (type === "multiplier2") {
        next.type = "multiplier";
        next.multiplier = 2;
      }
      if (type === "multiplier3") {
        next.type = "multiplier";
        next.multiplier = 3;
      }

      setPowerUps(prev => [...prev, next]);
      return;
    }
  }

  function maybeSpawnPowerUp(board) {
    if (gameMode !== "arcade" && gameMode !== "cursed") return;
    setPowerUps(prev => {
      const aged = prev
        .map(p => ({ ...p, turnsLeft: p.turnsLeft - 1 }))
        .filter(p => p.turnsLeft > 0);

      if (aged.length >= 2) return aged;
      if (Math.random() > 0.14) return aged;

      const next = randomPowerUp(board);
      return next ? [...aged, next] : aged;
    });
  }

  function collectPowerUps(activePiece, sourceBoard = board, hasOtherActivePiece = false) {
    if ((gameMode !== "arcade" && gameMode !== "cursed") || !activePiece || !powerUps.length) {
      return { collected: false, removePiece: false };
    }

    const cells = pieceCells(activePiece);
    const collected = powerUps.filter(power => {
      if (power.collected) return false;
      return cells.some(cell =>
        cell.x >= power.x &&
        cell.x < power.x + (power.size || 1) &&
        cell.y >= power.y &&
        cell.y < power.y + (power.size || 1)
      );
    });

    if (!collected.length) return { collected: false, removePiece: false };

    const lifeCollected = collected.some(p => p.type === 'life');
    const missileCollected = collected.some(p => p.type === 'missile');
    const dualCollected = collected.some(p => p.type === 'dual');
    const slowMoCollected = collected.some(p => p.type === 'slowmo');
    const reverseCollected = collected.some(p => p.type === 'reverse');
    const cursedCollected = collected.some(p => p.type === 'cursed');
    const bombCollected = collected.some(p => p.type === 'bomb');
    if (cursedCollected) playSfx(cursedPickupSfxRef);
    else playSfx(pickupSfxRef);
    const multiplierPickups = collected.filter(p => p.type === 'multiplier');
    const strongest = multiplierPickups.length
      ? Math.max(...multiplierPickups.map(p => p.multiplier))
      : 1;
    const collectedIds = new Set(collected.map(p => p.id));
    const missileSource = collected.find(p => p.type === 'missile');

    setPowerUps(prev => prev.map(power => (
      collectedIds.has(power.id) ? { ...power, collected:true } : power
    )));

    const multiplierBonus = dualCollected ? 2 : 1;
    if (multiplierPickups.length || dualCollected) {
      setScoreMultiplier(prev => {
        const next = Math.min(MAX_SCORE_MULTIPLIER, prev * strongest * multiplierBonus);
        if (!dualCollected) {
          setMultiplierPopup(`x${next}`);
          setTimeout(() => setMultiplierPopup(""), 900);
        }
        return next;
      });
    }

    if (lifeCollected) {
      setHasExtraLife(true);
      setMultiplierPopup("EXTRA LIFE");
      setTimeout(() => setMultiplierPopup(""), 1300);
    }

    if (missileCollected) {
      setMultiplierPopup("");
    }

    if (dualCollected) {
      setPendingDualSpawn(true);
      setNextPreview([]);
      setMultiplierPopup("DUAL");
      setTimeout(() => setMultiplierPopup(""), 900);
    }

    if (slowMoCollected) {
      setSlowMoUntil(prev => Math.max(prev, Date.now()) + SLOWMO_DURATION_MS);
      setMultiplierPopup("SLOW MO");
      setTimeout(() => setMultiplierPopup(""), 900);
    }

    if (reverseCollected) {
      setReverseUntil(prev => Math.max(prev, Date.now()) + REVERSE_DURATION_MS);
      setMultiplierPopup("REVERSE");
      setTimeout(() => setMultiplierPopup(""), 900);
    }

    if (cursedCollected) {
      setPendingCursedPiece(true);
      setNextPreview([]);
      setMultiplierPopup("CURSED NEXT");
      setTimeout(() => setMultiplierPopup(""), 1000);
    }

    if (bombCollected) {
      setPendingBombPiece(true);
      setNextPreview([]);
      setMultiplierPopup("BOMB NEXT");
      setTimeout(() => setMultiplierPopup(""), 900);
    }

    setScoreFlash("");
    setDestroyedPiece(activePiece);

    setTimeout(() => {
      setPowerUps(prev => prev.filter(p => !collectedIds.has(p.id)));
      setDestroyedPiece(null);
      if (missileCollected) {
        fireMissile(sourceBoard, missileSource, hasOtherActivePiece);
      }

      addScore(
        lifeCollected ? 100 : missileCollected ? 150 : dualCollected ? 180 : slowMoCollected ? 120 : reverseCollected ? 120 : cursedCollected ? 140 : bombCollected ? 140 : 25 * strongest,
        lifeCollected ? "life" : missileCollected ? "missile" : dualCollected ? "dual" : slowMoCollected ? "slow" : reverseCollected ? "reverse" : cursedCollected ? "cursed" : bombCollected ? "bomb" : "orb"
      );

    }, 220);

    return { collected: true, removePiece: true };
  }

  function fireMissile(currentBoard, missileSource, skipSettle = false) {
    const targets = [];
    for (let y = SAFE_MIN; y <= SAFE_MAX; y++) {
      for (let x = SAFE_MIN; x <= SAFE_MAX; x++) {
        if (currentBoard[y][x] && !isCoreCell(x, y)) {
          const dist = Math.abs(x - CENTRE) + Math.abs(y - CENTRE);
          targets.push({ x, y, dist });
        }
      }
    }

    if (!targets.length) return;

    targets.sort((a, b) => a.dist - b.dist);
    const target = targets[0];
    const clearKeys = new Set();
    const affected = [];
    const half = 4;

    for (let y = target.y - half; y < target.y + half; y++) {
      for (let x = target.x - half; x < target.x + half; x++) {
        if (
          x >= SAFE_MIN && x <= SAFE_MAX &&
          y >= SAFE_MIN && y <= SAFE_MAX &&
          currentBoard[y][x] &&
          !isCoreCell(x, y)
        ) {
          clearKeys.add(`${x},${y}`);
          affected.push({ x, y });
        }
      }
    }

    if (!clearKeys.size) return;

    setFlashKeys(new Set());

    setMissileEffect({
      phase: 'travel',
      target,
      affected,
      progress: 0,
      start: missileSource
        ? { x: missileSource.x, y: missileSource.y }
        : { x: CENTRE, y: CENTRE }
    });
    playSfx(missileFireSfxRef);

    let frame = 0;
    const travelFrames = 8;
    const travelTimer = setInterval(() => {
      frame++;
      setMissileEffect({
        phase: 'travel',
        target,
        affected,
        progress: frame / travelFrames,
        start: missileSource
        ? { x: missileSource.x, y: missileSource.y }
        : { x: CENTRE, y: CENTRE }
      });

      if (frame >= travelFrames) {
        clearInterval(travelTimer);
        setMissileEffect({
          phase: 'blast',
          target,
          affected,
          progress: 1,
          start: missileSource
        ? { x: missileSource.x, y: missileSource.y }
        : { x: CENTRE, y: CENTRE }
        });
        setFlashKeys(clearKeys);

        setTimeout(() => {
          const blasted = applyClear(currentBoard, clearKeys);
          setFlashKeys(new Set());
          setMissileEffect(null);
          setBoard(blasted);
          playSfx(explosionSfxRef);
          addScore(clearKeys.size * 10, "blast");
          if (skipSettle) return;
          settleAnimated(blasted);
        }, 140);
      }
    }, 35);
  }

  function handleDeath(reason = "Barrier breached") {
    if (hasExtraLife) {
      setHasExtraLife(false);
      playSfx(extraLifeSfxRef);
      setScreenFlash(true);
      setAnimating(true);
      setPendingDualSpawn(false);

      setTimeout(() => {
        const freshBoard = emptyBoard();
        setBoard(freshBoard);
        setPieces([]);
        setDestroyedPiece(null);
        setPowerUps([]);
        setScreenFlash(false);
        setMultiplierPopup("EXTRA LIFE");
        setSlowMoUntil(0);
        setReverseUntil(0);
        setPendingCursedPiece(false);
        setPendingBombPiece(false);
        setNextPreview([]);

        setTimeout(() => {
          setMultiplierPopup("");
          setAnimating(false);
          spawn(freshBoard);
        }, 900);
      }, 180);
      return true;
    }

    setFailReason(reason);
    setGameOver(true);
    maybeFinalizeRunScore();
    return false;
  }

  function shouldUseCursedPool() {
    return gameMode === "cursed" && Math.random() < 0.5;
  }

  function getNextSpawnSide(advance = true) {
    if (randomSpawnOrder) return randomSide();

    const order = ["top", "right", "bottom", "left"];
    const reverseFallOrder = gameMode === "arcade" && reverseUntil > Date.now();
    const side = order[nextSideIndex];
    if (advance) {
      const step = reverseFallOrder ? -1 : 1;
      setNextSideIndex(prev => (prev + step + order.length) % order.length);
    }
    return side;
  }

  function advanceSpawnSide() {
    if (randomSpawnOrder) return;
    const order = ["top", "right", "bottom", "left"];
    const reverseFallOrder = gameMode === "arcade" && reverseUntil > Date.now();
    const step = reverseFallOrder ? -1 : 1;
    setNextSideIndex(prev => (prev + step + order.length) % order.length);
  }

  function previewPieceForSide(side, preferCursed = false, forceBomb = false) {
    const piece = preferCursed
      ? randomCursedPiece(side)
      : (shouldUseCursedPool() ? randomCursedPiece(side) : randomPiece(side));
    return {
      ...piece,
      isBomb: forceBomb || piece.isBomb,
      pendingBombPreview: forceBomb || undefined,
      pendingCursedPreview: preferCursed || undefined
    };
  }

  function nextQueuedSideAfter(side) {
    if (randomSpawnOrder) return randomSide();
    const order = ["top", "right", "bottom", "left"];
    const reverseFallOrder = gameMode === "arcade" && reverseUntil > Date.now();
    const step = reverseFallOrder ? -1 : 1;
    const index = order.indexOf(side);
    return order[(index + step + order.length) % order.length];
  }

  function fillPreviewQueue(seed = [], firstSide = null) {
    const queue = [...seed];
    while (queue.length < 2) {
      const side = queue.length
        ? nextQueuedSideAfter(queue[queue.length - 1].side)
        : (firstSide || (randomSpawnOrder ? randomSide() : ["top", "right", "bottom", "left"][nextSideIndex]));
      queue.push(previewPieceForSide(side, false, false));
    }
    return queue;
  }

  function buildNextPreview() {
    const order = ["top", "right", "bottom", "left"];
    const reverseFallOrder = gameMode === "arcade" && reverseUntil > Date.now();
    const step = reverseFallOrder ? -1 : 1;
    const getSideAt = i => {
      if (randomSpawnOrder) return randomSide();
      const idx = (nextSideIndex + (step * i) + order.length * 4) % order.length;
      return order[idx];
    };

    let bombPending = pendingBombPiece;
    let cursedPending = pendingCursedPiece;

    if (pendingDualSpawn && gameMode === "arcade") {
      const firstSide = getSideAt(0);
      const secondSide = oppositeSide(firstSide);
      const first = previewPieceForSide(firstSide, cursedPending, bombPending);
      if (bombPending) bombPending = false;
      if (cursedPending) cursedPending = false;
      const second = previewPieceForSide(secondSide, false, false);
      return [first, second];
    }

    const previews = [];
    for (let i = 0; i < 2; i++) {
      const side = getSideAt(i);
      const next = previewPieceForSide(side, cursedPending, bombPending);
      previews.push(next);
      if (bombPending) bombPending = false;
      if (cursedPending) cursedPending = false;
    }
    return previews;
  }

  function nextSpawnPiece(forcedSide = null) {
    const side = forcedSide || getNextSpawnSide();
    if (pendingCursedPiece || pendingBombPiece) {
      const next = pendingCursedPiece
        ? randomCursedPiece(side)
        : randomPiece(side);
      if (pendingBombPiece) setPendingBombPiece(false);
      setPendingCursedPiece(false);
      setNextPreview([]);
      return { ...next, isBomb: pendingBombPiece || next.isBomb };
    }
    if (shouldUseCursedPool()) {
      return randomCursedPiece(side);
    }
    return randomPiece(side);
  }

  function consumeQueuedPiece() {
    if (!nextPreview.length) return null;
    const [queued] = nextPreview;
    setNextPreview(prev => fillPreviewQueue(prev.slice(1)));
    if (queued.pendingBombPreview) setPendingBombPiece(false);
    if (queued.pendingCursedPreview) setPendingCursedPiece(false);
    advanceSpawnSide();
    return {
      ...queued,
      id: crypto.randomUUID(),
      pendingBombPreview: undefined,
      pendingCursedPreview: undefined
    };
  }

  function triggerBombPieceLock(startBoard, bombPiece) {
    const merged = mergeWithCellColors(startBoard, bombPiece);
    const bombKeys = new Set(
      pieceCells(bombPiece)
        .filter(({ x, y }) => !outsideBarrier(x, y))
        .map(({ x, y }) => `${x},${y}`)
    );

    setBoard(merged);
    setPieces([]);
    setAnimating(true);
    playSfx(placePieceSfxRef);
    addScore(10, "land");

    let flashes = 0;
    const pulse = () => {
      setFlashKeys(new Set(bombKeys));
      setTimeout(() => {
        setFlashKeys(new Set());
        flashes++;
        if (flashes < 3) {
          setTimeout(pulse, BOMB_FLASH_INTERVAL_MS);
          return;
        }

        const clearKeys = new Set();
        for (const { x, y } of pieceCells(bombPiece)) {
          for (let yy = y - 1; yy <= y + 1; yy++) {
            for (let xx = x - 1; xx <= x + 1; xx++) {
              if (outsideBarrier(xx, yy) || isCoreCell(xx, yy)) continue;
              if (merged[yy][xx]) clearKeys.add(`${xx},${yy}`);
            }
          }
        }

        const blasted = applyClear(merged, clearKeys);
        setBoard(blasted);
        playSfx(explosionSfxRef);
        addScore(clearKeys.size * 12, "bomb");
        settleAnimated(blasted);
      }, BOMB_FLASH_INTERVAL_MS);
    };

    pulse();
  }

  function spawn(nextBoard) {
    const p = pendingBombPiece || pendingCursedPiece
      ? nextSpawnPiece()
      : (consumeQueuedPiece() || nextSpawnPiece());
    if (overlapsBoard(nextBoard, p)) {
      setFailReason("Spawn blocked");
      setGameOver(true);
    } else if (breachesBarrier(p)) {
      setFailReason("Spawn outside barrier");
      setGameOver(true);
    } else {
      setPieces([p]);
    }
  }

  function spawnDual(nextBoard) {
    const scheduledSide = getNextSpawnSide(false);
    const reverseFallOrder = gameMode === "arcade" && reverseUntil > Date.now();
    const step = reverseFallOrder ? -1 : 1;
    const primaryPair = scheduledSide === "top" || scheduledSide === "bottom"
      ? ["top", "bottom"]
      : ["left", "right"];
    const fallbackPair = primaryPair[0] === "top" ? ["left", "right"] : ["top", "bottom"];
    const useCursedFirst = pendingCursedPiece || shouldUseCursedPool();
    const useBombFirst = pendingBombPiece;

    for (const [firstSide, secondSide] of [primaryPair, fallbackPair]) {
      for (let attempt = 0; attempt < 80; attempt++) {
        const firstBase = useCursedFirst ? randomCursedPiece(firstSide) : randomPiece(firstSide);
        const first = useBombFirst ? { ...firstBase, isBomb: true } : firstBase;
        const second = shouldUseCursedPool()
          ? randomCursedPiece(secondSide)
          : randomPiece(secondSide);
        const overlapEachOther = pieceCells(first).some(a =>
          pieceCells(second).some(b => a.x === b.x && a.y === b.y)
        );

        if (
          overlapsBoard(nextBoard, first) || breachesBarrier(first) ||
          overlapsBoard(nextBoard, second) || breachesBarrier(second) ||
          overlapEachOther
        ) {
          continue;
        }

        if (useCursedFirst) setPendingCursedPiece(false);
        if (useBombFirst) setPendingBombPiece(false);
        if (!randomSpawnOrder) setNextSideIndex(prev => (prev + step + 4) % 4);
        setNextPreview([]);
        setPieces([first, second]);
        return true;
      }
    }

    setFailReason("Dual spawn blocked");
    setGameOver(true);
    return false;
  }

  function startGame() {
    maybeFinalizeRunScore();
    const freshBoard = emptyBoard();
    setBoard(freshBoard);
    setPieces([]);
    setScore(0);
    setLevel(selectedLevel);
    setLevelMessage("");
    setScoreFlash("");
    setScoreMultiplier(1);
    setPowerUps([]);
    setDestroyedPiece(null);
    setMissileEffect(null);
    setPendingDualSpawn(false);
    setSlowMoUntil(0);
    setReverseUntil(0);
    setPendingCursedPiece(false);
    setPendingBombPiece(false);
    setNextSideIndex(0);
    setNextPreview([]);
    setRunHighScoreAchieved(false);
    setHighScoreMessage("");
    setShowRunHighScoreModal(false);
    setRunHighScoreValue(0);
    setShareCopied(false);
    setPublicSubmitStatus("");
    setPublicScoreSubmitted(false);
    setRunHighScoreDismissed(false);
    runScoreSavedRef.current = false;
    setHasExtraLife(false);
    setScreenFlash(false);
    setGameOver(false);
    setFailReason("");
    setPaused(false);
    setAnimating(false);
    setFlashKeys(new Set());
    setScreen("countdown");
    setCountdown(3);

    setTimeout(() => setCountdown(2), 700);
    setTimeout(() => setCountdown(1), 1400);
    setTimeout(() => {
      setCountdown(null);
      setScreen("playing");
      spawn(freshBoard);
    }, 2100);
  }

  function addScore(amount, label = "") {
    const gained = amount * level * scoreMultiplier;
    setScoreFlash(`+${Math.floor(gained)}${label ? ` ${label}` : ""}`);
    setTimeout(() => setScoreFlash(""), 700);

    setScore(prev => {
      const next = prev + gained;
      const modeKey = leaderboardMode(gameMode);
      const hasPriorRunThisSession = modeKey ? (sessionRunCounts[modeKey] || 0) > 0 : false;
      if (!runHighScoreAchieved && modeKey && hasPriorRunThisSession && next > currentModeTopScore(gameMode)) {
        setRunHighScoreAchieved(true);
        playSfx(highScoreSfxRef);
        setHighScoreMessage("HIGH SCORE");
        setTimeout(() => setHighScoreMessage(""), 1100);
      }
      const oldLevel = levelForScore(prev);
      const newLevel = levelForScore(next);
      if (newLevel > oldLevel && newLevel > level) {
        setLevel(newLevel);
        playSfx(levelUpSfxRef);
        setLevelMessage(`Level ${newLevel}!`);
        setTimeout(() => setLevelMessage(""), 900);
      }
      return next;
    });
  }

  function settleAnimated(startBoard) {
    const finishSettle = current => {
      setBoard(current);
      setAnimating(false);
      maybeSpawnPowerUp(current);
      if (pendingDualSpawn && gameMode === "arcade") {
        spawnDual(current);
      } else if (!pendingDualSpawn || gameMode !== "arcade") {
        spawn(current);
      }
      setPendingDualSpawn(false);
    };

    if (gameMode === "classic") {
      const connected = connectedToCore(startBoard);
      const next = startBoard.map(row => [...row]);
      let removed = 0;
      for (let y = SAFE_MIN; y <= SAFE_MAX; y++) {
        for (let x = SAFE_MIN; x <= SAFE_MAX; x++) {
          if (!next[y][x] || isCoreCell(x, y) || connected[y][x]) continue;
          next[y][x] = null;
          removed++;
        }
      }
      if (removed) addScore(removed * 10, "loose");
      finishSettle(next);
      return;
    }

    let current = startBoard.map(row => [...row]);
    let totalBonus = 0;
    let ticks = 0;

    const run = () => {
      const result = settleOneTick(current);
      current = result.board;
      totalBonus += result.bonus;
      ticks++;
      setBoard(current);

      if (result.moved && ticks < GRID * GRID) {
        setTimeout(run, SETTLE_TICK_MS);
      } else {
        if (totalBonus) addScore(totalBonus, "loose");
        finishSettle(current);
      }
    };

    run();
  }

  function finalizeLockedBoard(merged) {
    const result = clearMatches(merged);
    setBoard(merged);

    const clearScore = result.cleared * 100;
    if (clearScore) {
      playClearSfxOnce();
      addScore(clearScore, "clear");
    }

    if (result.clearKeys.size) {
      setAnimating(true);
      setFlashKeys(result.clearKeys);
      setTimeout(() => {
        const clearedBoard = applyClear(merged, result.clearKeys);
        setFlashKeys(new Set());
        setBoard(clearedBoard);
        settleAnimated(clearedBoard);
      }, FLASH_MS);
    } else {
      setAnimating(true);
      settleAnimated(merged);
    }
  }

  function step() {
    if (screen !== "playing" || gameOver || paused || animating || !pieces.length) return;

    let currentBoard = board;
    const survivors = [];
    let crossedBarrier = false;

    for (const activePiece of pieces) {
      if (breachesBarrier(activePiece)) {
        if (handleDeath()) return;
        return;
      }

      const { dx, dy } = directionVector(activePiece.side);
      const nx = activePiece.x + dx;
      const ny = activePiece.y + dy;

      if (overlapsBoard(currentBoard, activePiece, nx, ny)) {
        if (activePiece.isBomb) {
          triggerBombPieceLock(currentBoard, activePiece);
          return;
        }
        currentBoard = mergeWithCellColors(currentBoard, activePiece);
        setBoard(currentBoard);
        playSfx(placePieceSfxRef);
        addScore(10, "land");
        continue;
      }

      const movedPiece = { ...activePiece, x: nx, y: ny };
      const pickup = collectPowerUps(movedPiece, currentBoard, pieces.length > 1);
      if (pickup.collected && pickup.removePiece) continue;

      if (breachesBarrier(activePiece, nx, ny)) crossedBarrier = true;

      survivors.push(movedPiece);
    }

    setPieces(survivors);
    if (crossedBarrier) {
      setTimeout(() => handleDeath(), 0);
      return;
    }
    if (!survivors.length && !animating) {
      finalizeLockedBoard(currentBoard);
    }
  }

  useEffect(() => {
    stepRef.current = step;
  });

  function moveRelative(direction) {
    if (screen !== "playing" || gameOver || paused || animating || !pieces.length) return;
    const nextPieces = [];

    for (const activePiece of pieces) {
      let nx = activePiece.x;
      let ny = activePiece.y;

      if (activePiece.side === "top") {
        if (direction === "left") nx -= 1;
        if (direction === "right") nx += 1;
        if (direction === "forward") ny += 1;
      } else if (activePiece.side === "bottom") {
        if (direction === "left") nx += 1;
        if (direction === "right") nx -= 1;
        if (direction === "forward") ny -= 1;
      } else if (activePiece.side === "right") {
        if (direction === "left") ny += 1;
        if (direction === "right") ny -= 1;
        if (direction === "forward") nx -= 1;
      } else if (activePiece.side === "left") {
        if (direction === "left") ny -= 1;
        if (direction === "right") ny += 1;
        if (direction === "forward") nx += 1;
      }

      if (!validSideMove(board, activePiece, nx, ny)) {
        nextPieces.push(activePiece);
        continue;
      }

      const movedPiece = { ...activePiece, x: nx, y: ny };
      const pickup = collectPowerUps(movedPiece, board, pieces.length > 1);
      if (!(pickup.collected && pickup.removePiece)) {
        nextPieces.push(movedPiece);
      }
    }

    setPieces(nextPieces);
  }

  function rotatePiece() {
    if (screen !== "playing" || gameOver || paused || animating || !pieces.length) return;
    const nextPieces = [];
    for (const activePiece of pieces) {
      const rotated = rotate(activePiece.shape);
      if (validSideMove(board, activePiece, activePiece.x, activePiece.y, rotated)) {
        const rotatedPiece = {
          ...activePiece,
          shape: rotated,
          cellColors: rotateColorGrid(activePiece.cellColors),
        };
        const pickup = collectPowerUps(rotatedPiece, board, pieces.length > 1);
        if (!(pickup.collected && pickup.removePiece)) {
          nextPieces.push(rotatedPiece);
        }
      } else {
        nextPieces.push(activePiece);
      }
    }
    setPieces(nextPieces);
  }

  function drop() {
    if (screen !== "playing" || gameOver || paused || animating || !pieces.length) return;
    addScore(25, "drop");

    let currentBoard = board;
    let crossedPiece = null;
    for (const activePiece of pieces) {
      let p = { ...activePiece };
      const { dx, dy } = directionVector(p.side);
      let removedByPickup = false;

      while (!overlapsBoard(currentBoard, p, p.x + dx, p.y + dy)) {
        p.x += dx;
        p.y += dy;
        const pickup = collectPowerUps(p, currentBoard, pieces.length > 1);
        if (pickup.collected && pickup.removePiece) {
          removedByPickup = true;
          break;
        }
        if (breachesBarrier(p)) {
          crossedPiece = p;
          break;
        }
      }
      if (crossedPiece) break;
      if (removedByPickup) continue;
      currentBoard = mergeWithCellColors(currentBoard, p);
      setBoard(currentBoard);
      playSfx(placePieceSfxRef);
      addScore(10, "land");
    }

    if (crossedPiece) {
      setPieces([crossedPiece]);
      setTimeout(() => handleDeath(), 0);
      return;
    }

    setPieces([]);
    finalizeLockedBoard(currentBoard);
  }

  function runControlAction(action) {
    const reverseActive = reverseUntil > Date.now();
    let mapped = action;

    if (reverseActive) {
      if (action === "left") mapped = "right";
      else if (action === "right") mapped = "left";
      else if (action === "forward") mapped = "rotate";
      else if (action === "rotate") mapped = "forward";
    }

    if (mapped === "left" || mapped === "right" || mapped === "forward") moveRelative(mapped);
    if (mapped === "rotate") rotatePiece();
    if (mapped === "drop") drop();
  }

  function getPadLabels() {
    const piece = pieces[0];
    if (!piece) {
      return {
        top: "ROTATE",
        left: "LEFT",
        center: "DROP",
        right: "RIGHT",
        bottom: "FORWARD",
      };
    }

    if (piece.side === "top") {
      return { top: "ROTATE", left: "LEFT", center: "DROP", right: "RIGHT", bottom: "FORWARD" };
    }
    if (piece.side === "bottom") {
      return { top: "FORWARD", left: "RIGHT", center: "DROP", right: "LEFT", bottom: "ROTATE" };
    }
    if (piece.side === "right") {
      return { top: "RIGHT", left: "FORWARD", center: "DROP", right: "ROTATE", bottom: "LEFT" };
    }
    return { top: "LEFT", left: "ROTATE", center: "DROP", right: "FORWARD", bottom: "RIGHT" };
  }

  function triggerPad(position) {
    if (!pieces.length) return;
    const piece = pieces[0];

    if (position === "center") {
      runControlAction("drop");
      return;
    }

    if (piece.side === "top") {
      if (position === "left") runControlAction("left");
      if (position === "right") runControlAction("right");
      if (position === "top") runControlAction("rotate");
      if (position === "bottom") runControlAction("forward");
    } else if (piece.side === "bottom") {
      if (position === "left") runControlAction("right");
      if (position === "right") runControlAction("left");
      if (position === "bottom") runControlAction("rotate");
      if (position === "top") runControlAction("forward");
    } else if (piece.side === "right") {
      if (position === "top") runControlAction("right");
      if (position === "bottom") runControlAction("left");
      if (position === "left") runControlAction("forward");
      if (position === "right") runControlAction("rotate");
    } else if (piece.side === "left") {
      if (position === "top") runControlAction("left");
      if (position === "bottom") runControlAction("right");
      if (position === "right") runControlAction("forward");
      if (position === "left") runControlAction("rotate");
    }
  }

  function stopHold() {
    if (holdDelayRef.current) clearTimeout(holdDelayRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdDelayRef.current = null;
    holdIntervalRef.current = null;
  }

  function startHold(position) {
    stopHold();
    triggerPad(position);

    if (position === "center") return;

    holdDelayRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => triggerPad(position), 70);
    }, 160);
  }

  useEffect(() => {
    return () => stopHold();
  }, []);

  useEffect(() => {
    const onKey = e => {
      const key = e.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        e.preventDefault();
      }

      if (devMode && screen === "playing" && (gameMode === "arcade" || gameMode === "cursed")) {
        if (key === "2") spawnDebugPowerUp("multiplier2");
        if (key === "3") spawnDebugPowerUp("multiplier3");
        if (key === "4") spawnDebugPowerUp("missile");
        if (key === "5") spawnDebugPowerUp("dual");
        if (key === "6") spawnDebugPowerUp("life");
        if (key === "7") spawnDebugPowerUp("slowmo");
        if (key === "8") spawnDebugPowerUp("cursed");
        if (key === "0") spawnDebugPowerUp("reverse");
        if (key === "9") spawnDebugPowerUp("bomb");
      }

      const piece = pieces[0];
      if (!piece) return;

      if (piece.side === "top") {
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") runControlAction("left");
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") runControlAction("right");
        if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") runControlAction("rotate");
        if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") runControlAction("forward");
      } else if (piece.side === "bottom") {
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") runControlAction("right");
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") runControlAction("left");
        if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") runControlAction("rotate");
        if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") runControlAction("forward");
      } else if (piece.side === "right") {
        if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") runControlAction("right");
        if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") runControlAction("left");
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") runControlAction("forward");
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") runControlAction("rotate");
      } else if (piece.side === "left") {
        if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") runControlAction("left");
        if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") runControlAction("right");
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") runControlAction("forward");
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") runControlAction("rotate");
      }

      if (e.key === " ") runControlAction("drop");
      if (key === "p") setPaused(p => !p);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pieces, screen, gameOver, paused, animating, board, powerUps, hasExtraLife, scoreMultiplier, gameMode, devMode, reverseUntil]);

  useEffect(() => {
    const baseSpeed = Math.max(MIN_SPEED, Math.floor(START_SPEED * Math.pow(0.84, level - 1)));
    const speed = slowMoUntil > Date.now() ? Math.round(baseSpeed * 1.85) : baseSpeed;
    const id = setInterval(() => stepRef.current(), speed);
    return () => clearInterval(id);
  }, [level, slowMoUntil]);

  useEffect(() => {
    if (!slowMoUntil) return;
    const remaining = slowMoUntil - Date.now();
    if (remaining <= 0) {
      setSlowMoUntil(0);
      return;
    }
    const id = setTimeout(() => setSlowMoUntil(0), remaining);
    return () => clearTimeout(id);
  }, [slowMoUntil]);

  useEffect(() => {
    if (!reverseUntil) return;
    const remaining = reverseUntil - Date.now();
    if (remaining <= 0) {
      setReverseUntil(0);
      return;
    }
    const id = setTimeout(() => setReverseUntil(0), remaining);
    return () => clearTimeout(id);
  }, [reverseUntil]);

  useEffect(() => {
    if (screen !== "playing" || gameOver || paused || animating || pieces.length) return;
    const id = setTimeout(() => {
      if (pendingDualSpawn && gameMode === "arcade") {
        spawnDual(board);
      } else {
        spawn(board);
      }
      setPendingDualSpawn(false);
    }, 120);
    return () => clearTimeout(id);
  }, [screen, gameOver, paused, animating, pieces.length, pendingDualSpawn, pendingCursedPiece, gameMode, board]);

  useEffect(() => {
    if (screen !== "playing" && screen !== "countdown") {
      setNextPreview([]);
      return;
    }
    if (
      nextPreview.length === 0 ||
      pendingDualSpawn ||
      pendingCursedPiece ||
      pendingBombPiece ||
      reverseUntil > Date.now()
    ) {
      setNextPreview(buildNextPreview());
    }
  }, [screen, gameMode, randomSpawnOrder, reverseUntil, pendingDualSpawn, pendingCursedPiece, pendingBombPiece, nextPreview.length]);

  useEffect(() => {
    if (gameOver) maybeFinalizeRunScore();
  }, [gameOver]);

  useEffect(() => {
    if (!prevGameOverRef.current && gameOver) {
      if (runHighScoreAchieved) playSfx(highScoreSfxRef);
      else playSfx(gameOverSfxRef);
    }
    prevGameOverRef.current = gameOver;
  }, [gameOver, runHighScoreAchieved]);

  useEffect(() => {
    if (!gameOver || !runHighScoreAchieved || showRunHighScoreModal || runHighScoreDismissed) return;
    setRunHighScoreValue(Math.floor(score));
    setShowRunHighScoreModal(true);
  }, [gameOver, runHighScoreAchieved, showRunHighScoreModal, runHighScoreDismissed, score]);

  async function handleShareHighScore() {
    const mode = leaderboardMode(gameMode) || gameMode;
    const text = `I just scored ${Math.floor(runHighScoreValue)} on ${mode} Quadestris!\nhttps://quadestris.vercel.app/`;
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1200);
    } catch {
      setShareCopied(false);
    }
  }

  function limitWords(value, maxWords = 80) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return value;
    return words.slice(0, maxWords).join(" ");
  }

  function handleSendBugReport() {
    const report = bugReportText.trim();
    if (!report) return;
    const subject = "Quadestris bug report";
    const body = [
      report,
      "",
      `Mode: ${gameMode}`,
      `Score: ${Math.floor(score)}`,
      `Level: ${level}`,
      `Screen: ${screen}${gameOver ? " / game over" : ""}`,
      `Reason: ${failReason || "n/a"}`
    ].join("\n");
    window.location.href = `mailto:danielmarcus1234@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setShowBugReport(false);
    setBugReportText("");
  }

  const pixelButtonAssets = {
    title: "/ui/button-title.png",
    restart: "/ui/button-restart.png",
    pause: "/ui/button-pause.png",
    resume: "/ui/button-resume.png",
    highscores: "/ui/button-highscores.png",
  };

  function pixelButtonStyle(asset, fallback) {
    return {
      ...fallback,
      backgroundImage: `url('${asset}')`,
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      imageRendering: "pixelated",
    };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, canvas.width, SAFE_MIN * CELL);
    ctx.fillRect(0, (SAFE_MAX + 1) * CELL, canvas.width, SAFE_MIN * CELL);
    ctx.fillRect(0, SAFE_MIN * CELL, SAFE_MIN * CELL, (SAFE_MAX - SAFE_MIN + 1) * CELL);
    ctx.fillRect((SAFE_MAX + 1) * CELL, SAFE_MIN * CELL, SAFE_MIN * CELL, (SAFE_MAX - SAFE_MIN + 1) * CELL);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, GRID * CELL);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(GRID * CELL, i * CELL);
      ctx.stroke();
    }

    const purplePowerActive =
      reverseUntil > Date.now() ||
      pendingDualSpawn ||
      pendingCursedPiece;
    ctx.strokeStyle = purplePowerActive
      ? "rgba(168,85,247,0.95)"
      : (runHighScoreAchieved ? "rgba(34,197,94,0.95)" : "rgba(248,113,113,0.9)");
    ctx.lineWidth = 4;
    ctx.strokeRect(SAFE_MIN * CELL, SAFE_MIN * CELL, (SAFE_MAX - SAFE_MIN + 1) * CELL, (SAFE_MAX - SAFE_MIN + 1) * CELL);
    ctx.lineWidth = 1;

    // HUD around the barrier (keeps UI integrated with the play area).
    ctx.fillStyle = "rgba(148,163,184,0.95)";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    const hudY = SAFE_MIN * CELL - 9;
    ctx.fillText(`SCORE ${Math.floor(score)}`, SAFE_MIN * CELL + 6, hudY);
    ctx.fillText(`HIGH ${Math.floor(currentModeTopScore())}`, SAFE_MIN * CELL + 116, hudY);
    ctx.fillText(`LEVEL ${level}`, SAFE_MIN * CELL + 214, hudY);
    let hudRightX = SAFE_MIN * CELL + 442;
    if (scoreMultiplier > 1) {
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`x${scoreMultiplier}`, hudRightX, hudY);
      hudRightX -= 64;
    }
    if (hasExtraLife) {
      ctx.fillStyle = "#ff6680";
      ctx.fillText("LIFE", hudRightX, hudY);
    }

    if (scoreFlash) {
      ctx.fillStyle = "#6ee7b7";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(scoreFlash, SAFE_MIN * CELL + 286, hudY);
    }

    if (nextPreview.length) {
      const previewCell = 8;
      const previewGap = 2;
      const baseX = (SAFE_MAX + 1) * CELL + 8;
      const baseY = SAFE_MIN * CELL + 18;
      const laneWidth = SAFE_MIN * CELL - 14;

      ctx.fillStyle = "rgba(203,213,225,0.95)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("NEXT", baseX + laneWidth / 2, baseY - 8);

      const drawPreview = (piece, originY) => {
        if (!piece?.shape?.length) return;
        const pieceWidth = piece.shape[0].length * previewCell + Math.max(0, piece.shape[0].length - 1) * previewGap;
        const originX = baseX + Math.floor((laneWidth - pieceWidth) / 2);
        if (piece.cellColors) {
          ctx.fillStyle = "rgba(124,58,237,0.95)";
          const boxSize = 26;
          const boxX = baseX + Math.floor((laneWidth - boxSize) / 2);
          ctx.fillRect(boxX, originY, boxSize, boxSize);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 18px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("?", boxX + boxSize / 2, originY + 19);
          return;
        }
        for (let r = 0; r < piece.shape.length; r++) {
          for (let c = 0; c < piece.shape[r].length; c++) {
            if (!piece.shape[r][c]) continue;
            const color = piece.cellColors?.[r]?.[c] || (piece.isBomb ? "#ffffff" : piece.color || "#e2e8f0");
            const x = originX + c * (previewCell + previewGap);
            const y = originY + r * (previewCell + previewGap);
            ctx.fillStyle = color;
            ctx.fillRect(x, y, previewCell, previewCell);
          }
        }
      };

      drawPreview(nextPreview[0], baseY + 8);
      drawPreview(nextPreview[1], baseY + 58);
      ctx.textAlign = "left";
    }

    if (screen !== "title") {
      ctx.fillStyle = "rgba(148,163,184,0.95)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(gameMode, canvas.width / 2, (SAFE_MAX + 1) * CELL + 22);
      ctx.textAlign = "left";
    }

    const drawCell = (x, y, color) => {
      const flashing = flashKeys.has(`${x},${y}`);
      ctx.fillStyle = flashing ? "#ffffff" : color;
      ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
      ctx.strokeStyle = flashing ? "#fde68a" : color === CORE_COLOR ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = flashing ? 3 : 1;
      ctx.strokeRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
      ctx.lineWidth = 1;
    };

    board.forEach((row, y) => row.forEach((color, x) => color && drawCell(x, y, color)));

    powerUps.forEach(power => {
      const flashOn = Math.floor(Date.now() / 120) % 2 === 0;
      const collectedFlash = power.collected;
      let color;
      if (collectedFlash) {
        color = flashOn ? "#ffffff" : "#fde68a";
      } else {
        color = flashOn
          ? "#ffffff"
          : (power.multiplier === 3 ? "#ff00aa" : "#00e5ff");
      }
      const px = power.x * CELL + CELL * 0.15;
      const py = power.y * CELL + CELL * 0.15;
      const size = CELL * 0.7;

      if (power.type === 'life') {
        color = flashOn ? '#ffffff' : '#ff0033';
      }
      if (power.type === 'missile') {
        color = flashOn ? '#ffffff' : '#ffb000';
      }
      if (power.type === 'dual') {
        color = flashOn ? '#ffffff' : '#a855f7';
      }
      if (power.type === 'reverse') {
        color = flashOn ? '#ffffff' : '#a855f7';
      }
      if (power.type === 'cursed') {
        color = flashOn ? '#ffffff' : '#a855f7';
      }
      if (power.type === 'bomb') {
        color = flashOn ? '#ffffff' : '#f97316';
      }
      if (power.type === 'slowmo') {
        color = flashOn ? '#ffffff' : '#22d3ee';
      }

      ctx.fillStyle = color;
      ctx.fillRect(px, py, size, size);
      ctx.lineWidth = 1;
      ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 1;
    });
    if (destroyedPiece) {
      const flashOn = Math.floor(Date.now() / 80) % 2 === 0;
      destroyedPiece.shape.forEach((row, r) => row.forEach((cell, c) => {
        if (!cell) return;
        drawCell(destroyedPiece.x + c, destroyedPiece.y + r, flashOn ? "#ffffff" : pieceCellColor(destroyedPiece, r, c));
      }));
    } else if (!animating && pieces.length) {
      pieces.forEach(activePiece => {
        const bombFlashOn = activePiece.isBomb && Math.floor(Date.now() / 90) % 2 === 0;
        activePiece.shape.forEach((row, r) => row.forEach((cell, c) => {
          if (!cell) return;
          const renderColor = bombFlashOn ? "#ffffff" : pieceCellColor(activePiece, r, c);
          drawCell(activePiece.x + c, activePiece.y + r, renderColor);
        }));
      });
    }

    if (screen === "countdown" && countdown) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "white";
      ctx.font = "bold 72px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(countdown, canvas.width / 2, canvas.height / 2 + 24);
    }

    if (missileEffect) {
      const sx = (missileEffect.start.x + 0.5) * CELL;
      const sy = (missileEffect.start.y + 0.5) * CELL;
      const tx = (missileEffect.target.x + 0.5) * CELL;
      const ty = (missileEffect.target.y + 0.5) * CELL;

      if (missileEffect.phase === 'travel') {
        const px = sx + (tx - sx) * missileEffect.progress;
        const py = sy + (ty - sy) * missileEffect.progress;
        const size = CELL * 0.9;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(px - size, py - size, size * 2, size * 2);
      }

      if (missileEffect.phase === 'blast') {
        const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 55);
        missileEffect.affected.forEach(cell => {
          const cx = cell.x * CELL + CELL / 2;
          const cy = cell.y * CELL + CELL / 2;
          const r = CELL * (0.38 + pulse * 0.2);

          const blast = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
          blast.addColorStop(0, "rgba(255,255,255,0.95)");
          blast.addColorStop(0.55, "rgba(253,224,71,0.70)");
          blast.addColorStop(1, "rgba(249,115,22,0)");
          ctx.fillStyle = blast;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    if (screenFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (multiplierPopup) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "bold 72px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(multiplierPopup, canvas.width / 2, canvas.height / 2 + 20);
      ctx.textAlign = 'left';
    }

    if (levelMessage) {
      ctx.fillStyle = "rgba(255,255,255,0.98)";
      ctx.font = "bold 38px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(levelMessage, canvas.width / 2, 52);
      ctx.textAlign = "left";
    }

    if (highScoreMessage) {
      ctx.fillStyle = "rgba(34,197,94,0.98)";
      ctx.font = "bold 44px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(highScoreMessage, canvas.width / 2, 98);
      ctx.textAlign = "left";
    }

    if (gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.68)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "white";
      ctx.font = "bold 36px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2);
      ctx.font = "16px sans-serif";
      ctx.fillText(failReason || "Game ended", canvas.width / 2, canvas.height / 2 + 34);
    }
  }, [board, pieces, gameOver, failReason, animating, flashKeys, screen, countdown, powerUps, multiplierPopup, destroyedPiece, missileEffect, runHighScoreAchieved, highScoreMessage, score, level, gameMode, hasExtraLife, scoreMultiplier, scoreFlash, highScores, reverseUntil, pendingDualSpawn, pendingCursedPiece, pendingBombPiece, nextPreview]);

  const padLabels = getPadLabels();
  const pixelPadButtonStyle = {
    height:'92px',
    borderRadius:'0',
    border:'none',
    background:'transparent',
    cursor:'pointer',
    userSelect:'none',
    WebkitUserSelect:'none',
    WebkitTouchCallout:'none',
    touchAction:'manipulation',
    padding:0,
    fontSize:0,
    display:'grid',
    placeItems:'center'
  };
  const iconForPad = position => {
    if (padLabels[position] === "ROTATE") return "rotate";
    return position === "top" ? "up" : position === "bottom" ? "down" : position;
  };
  const dropIconRotation = () => {
    const side = pieces[0]?.side || "top";
    if (side === "bottom") return "rotate(180deg)";
    if (side === "left") return "rotate(-90deg)";
    if (side === "right") return "rotate(90deg)";
    return "rotate(0deg)";
  };
  const colorForPad = position => padLabels[position] === "ROTATE" ? "#fbbf24" : "#f43f5e";

  return (
    <div style={{ position:isFullscreen ? 'fixed' : 'relative', inset:isFullscreen ? 0 : 'auto', zIndex:isFullscreen ? 9999 : 'auto', minHeight:isFullscreen ? '100dvh' : '100vh', height:isFullscreen ? '100dvh' : 'auto', color:'white', display:'flex', alignItems:isFullscreen ? 'flex-start' : 'center', justifyContent:'center', padding:isFullscreen ? 'max(2px, env(safe-area-inset-top)) 2px 2px' : '8px', width:isFullscreen ? '100vw' : '100%', maxWidth:'100vw', overflowX:'hidden', overflowY:'auto', overscrollBehavior:isFullscreen ? 'contain' : 'auto', background:'radial-gradient(circle at top, #1e293b 0%, #0f172a 42%, #020617 100%)', fontFamily:'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', boxSizing:'border-box', userSelect:'none', WebkitUserSelect:'none', WebkitTouchCallout:'none' }}>
      <div style={{ margin:'0 auto', width:'100%', maxWidth:'920px', background:'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))', border:'1px solid rgba(148,163,184,0.25)', borderRadius:isFullscreen ? '12px' : '24px', padding:isFullscreen ? '6px' : '12px', boxShadow:'0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)', boxSizing:'border-box', display:'grid', justifyItems:'center' }}>
        <div style={{ display:'grid', gap:isFullscreen ? '8px' : '14px', position:'relative', justifyItems:'center' }}>
          <div style={{ textAlign:'center', minHeight:'52px', paddingTop:'0', display:'grid', alignContent:'center', justifyItems:'center', width:'100%' }}>
            <BlockTitle />
          </div>

          {screen === "title" && (
            <div style={{ position:'absolute', inset:'24px', top:'96px', zIndex:30, background:'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))', border:'1px solid rgba(148,163,184,0.24)', borderRadius:'22px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'20px', textAlign:'center', boxShadow:'0 24px 70px rgba(0,0,0,0.62)' }}>
              <div style={{ marginBottom:'20px' }}>
                <BlockTitle />
                <div style={{ color:'#94a3b8', fontSize:'12px', marginTop:'6px' }}>by Daniel Marcus</div>
              </div>
              <div style={{ display:'flex', gap:'18px', alignItems:'center', justifyContent:'center', fontSize:0 }}>
                <PixelIconButton type="play" onClick={startGame} color="#fbbf24" ariaLabel="Play" />
                <PixelIconButton type="cog" onClick={() => setShowSettings(true)} ariaLabel="Settings" />
                <PixelIconButton type="trophy" onClick={() => setShowHighScores(true)} color="#fbbf24" ariaLabel="High Scores" />
                <PixelIconButton type="fullscreen" onClick={toggleFullscreen} color={isFullscreen ? "#22c55e" : "#ffffff"} ariaLabel={isFullscreen ? "Exit fullscreen" : "Fill screen"} />
              </div>
              <button
                onClick={() => setShowBugReport(true)}
                style={{ padding:'8px 14px', borderRadius:'10px', background:'#1e293b', color:'#cbd5e1', border:'1px solid rgba(148,163,184,0.3)', cursor:'pointer', fontWeight:800 }}
              >
                Report Bug
              </button>

              <div style={{ display:'grid', gap:'8px', justifyItems:'center' }}>
                <div style={{ color:'#94a3b8', fontSize:'11px', letterSpacing:'0.14em', textTransform:'uppercase' }}>Game modes</div>
                <div style={{ display:'flex', gap:'10px' }}>
                <button
                  onClick={() => setGameMode('classic')}
                  style={{
                    padding:'10px 18px',
                    borderRadius:'12px',
                    border: gameMode === 'classic' ? '2px solid #60a5fa' : '1px solid #475569',
                    background: gameMode === 'classic' ? '#1e3a8a' : '#1e293b',
                    color:'white',
                    cursor:'pointer',
                    fontWeight:700
                  }}
                >
                  Classic
                </button>

                <button
                  onClick={() => setGameMode('arcade')}
                  style={{
                    padding:'10px 18px',
                    borderRadius:'12px',
                    border: gameMode === 'arcade' ? '2px solid #f472b6' : '1px solid #475569',
                    background: gameMode === 'arcade' ? '#831843' : '#1e293b',
                    color:'white',
                    cursor:'pointer',
                    fontWeight:700
                  }}
                >
                  Arcade
                </button>
                <button
                  onClick={() => setGameMode('cursed')}
                  style={{
                    padding:'10px 18px',
                    borderRadius:'12px',
                    border: gameMode === 'cursed' ? '2px solid #a855f7' : '1px solid #475569',
                    background: gameMode === 'cursed' ? '#4c1d95' : '#1e293b',
                    color:'white',
                    cursor:'pointer',
                    fontWeight:700
                  }}
                >
                  Cursed
                </button>
                </div>
              </div>
              <div style={{ display:'grid', gap:'8px', justifyItems:'center' }}>
                <div style={{ color:'#94a3b8', fontSize:'11px', letterSpacing:'0.14em', textTransform:'uppercase' }}>Start level</div>
                <select
                  value={selectedLevel}
                  onChange={e => setSelectedLevel(Number(e.target.value))}
                  style={{ background:'#1e293b', border:'1px solid #475569', borderRadius:'10px', padding:'8px 12px', color:'white' }}
                >
                  {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={GRID * CELL}
            height={GRID * CELL}
            style={{ width:'min(100%, 560px)', maxWidth:'100%', height:'auto', margin:'0 auto', borderRadius:'18px', border:'1px solid rgba(148,163,184,0.32)', background:'#020617', boxShadow:'0 18px 50px rgba(0,0,0,0.45)', display:'block' }}
          />

          {gameOver && (
            <div style={{ display:'grid', gap:'8px', justifyItems:'center', marginTop:'2px' }}>
              <div style={{ display:'flex', gap:'10px', justifyContent:'center', flexWrap:'wrap' }}>
                <button onClick={startGame} style={{ padding:'8px 14px', borderRadius:'10px', background:'#2563eb', color:'white', border:'none', cursor:'pointer', fontWeight:700 }}>Restart</button>
                <button onClick={resetToTitle} style={{ padding:'8px 14px', borderRadius:'10px', background:'#334155', color:'white', border:'none', cursor:'pointer', fontWeight:700 }}>Title</button>
                <button onClick={() => setShowBugReport(true)} style={{ padding:'8px 14px', borderRadius:'10px', background:'#1e293b', color:'white', border:'1px solid rgba(148,163,184,0.35)', cursor:'pointer', fontWeight:700 }}>Report Bug</button>
              </div>
              {leaderboardMode(gameMode) && score > 0 && !showRunHighScoreModal && (
                <div style={{ display:'flex', gap:'8px', justifyContent:'center', alignItems:'center', flexWrap:'wrap', background:'rgba(15,23,42,0.68)', border:'1px solid rgba(148,163,184,0.18)', borderRadius:'12px', padding:'8px' }}>
                  <input
                    value={publicPlayerName}
                    onChange={e => setPublicPlayerName(normalizePlayerName(e.target.value))}
                    placeholder="Name"
                    maxLength={16}
                    style={{ width:'140px', boxSizing:'border-box', borderRadius:'9px', border:'1px solid rgba(148,163,184,0.35)', background:'#020617', color:'#e2e8f0', padding:'8px', font:'inherit', textAlign:'center', userSelect:'text', WebkitUserSelect:'text' }}
                  />
                  <button
                    onClick={submitPublicScore}
                    disabled={!publicPlayerName.trim() || publicScoreSubmitted || publicSubmitStatus === "sending..."}
                    style={{ padding:'8px 12px', borderRadius:'10px', background:publicPlayerName.trim() && !publicScoreSubmitted && publicSubmitStatus !== "sending..." ? '#7c3aed' : '#334155', color:'white', border:'none', cursor:publicPlayerName.trim() && !publicScoreSubmitted && publicSubmitStatus !== "sending..." ? 'pointer' : 'default', fontWeight:800 }}
                  >
                    {publicScoreSubmitted ? "Submitted" : "Submit Public Score"}
                  </button>
                  <div style={{ minWidth:'80px', fontSize:'12px', color:publicSubmitStatus === "submitted" ? '#86efac' : '#cbd5e1' }}>{publicSubmitStatus}</div>
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display:'grid',
              gridTemplateColumns:'repeat(3, minmax(92px, 1fr))',
              gridTemplateRows:'repeat(3, 92px)',
              gap:'8px',
              justifyContent:'center',
              alignItems:'center',
              touchAction:'none',
              userSelect:'none',
              WebkitUserSelect:'none',
              WebkitTouchCallout:'none',
              width:'min(100%, 320px)',
              margin:'0 auto'
            }}
          >
            <div />
            <button
              onPointerDown={e => { e.preventDefault(); startHold('top'); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={e => e.preventDefault()}
              style={pixelPadButtonStyle}
            >
              <PixelPadIcon type={iconForPad("top")} color={colorForPad("top")} />
            </button>
            <div />

            <button
              onPointerDown={e => { e.preventDefault(); startHold('left'); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={e => e.preventDefault()}
              style={pixelPadButtonStyle}
            >
              <PixelPadIcon type={iconForPad("left")} color={colorForPad("left")} />
            </button>
            <button
              onPointerDown={e => { e.preventDefault(); startHold('center'); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={e => e.preventDefault()}
              style={pixelPadButtonStyle}
            >
              <div style={{ transform:dropIconRotation(), transition:'transform 120ms ease' }}>
                <PixelPadIcon type="drop" color="#fbbf24" />
              </div>
            </button>
            <button
              onPointerDown={e => { e.preventDefault(); startHold('right'); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={e => e.preventDefault()}
              style={pixelPadButtonStyle}
            >
              <PixelPadIcon type={iconForPad("right")} color={colorForPad("right")} />
            </button>

            <div />
            <button
              onPointerDown={e => { e.preventDefault(); startHold('bottom'); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={e => e.preventDefault()}
              style={pixelPadButtonStyle}
            >
              <PixelPadIcon type={iconForPad("bottom")} color={colorForPad("bottom")} />
            </button>
            <div />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'8px', fontSize:'13px', color:'#cbd5e1', background:'rgba(15,23,42,0.55)', border:'1px solid rgba(148,163,184,0.16)', borderRadius:'16px', padding:'12px', marginTop:'4px', width:'100%' }}>
            <div>← / → / WASD or pad: relative movement</div>
            <div>Space: hard drop</div>
            <div>4×4 squares clear</div>
            <div>No line clears</div>
            <div>Loose blocks fall inward</div>
            <div>Lost loose blocks give points</div>
            <div>Arcade: collect multiplier cubes</div>
            <div>Arcade: missiles and hearts</div>
          </div>

          <div style={{ display:'flex', gap:'10px', justifyContent:'center', marginTop:'6px', width:'100%', flexWrap:'wrap' }}>
            <button
              onClick={resetToTitle}
              style={pixelButtonStyle(pixelButtonAssets.title, { padding:'10px 18px', minWidth:'92px', borderRadius:'12px', background:'#334155', color:'white', border:'none', cursor:'pointer', userSelect:'none', WebkitUserSelect:'none', WebkitTouchCallout:'none', touchAction:'manipulation' })}
            >
              Title Screen
            </button>
            <button
              onClick={startGame}
              style={pixelButtonStyle(pixelButtonAssets.restart, { padding:'10px 18px', minWidth:'84px', borderRadius:'12px', background:'#2563eb', color:'white', border:'none', cursor:'pointer', userSelect:'none', WebkitUserSelect:'none', WebkitTouchCallout:'none', touchAction:'manipulation' })}
            >
              Restart
            </button>
            <button
              onClick={() => setPaused(p => !p)}
              style={pixelButtonStyle(paused ? pixelButtonAssets.resume : pixelButtonAssets.pause, { padding:'10px 18px', minWidth:'74px', borderRadius:'12px', background:'#475569', color:'white', border:'none', cursor:'pointer', userSelect:'none', WebkitUserSelect:'none', WebkitTouchCallout:'none', touchAction:'manipulation' })}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => setShowHighScores(true)}
              style={pixelButtonStyle(pixelButtonAssets.highscores, { padding:'10px 18px', minWidth:'102px', borderRadius:'12px', background:'#1e293b', color:'white', border:'1px solid rgba(148,163,184,0.35)', cursor:'pointer', userSelect:'none', WebkitUserSelect:'none', WebkitTouchCallout:'none', touchAction:'manipulation' })}
            >
              High Scores
            </button>
          </div>

          {showHighScores && (
            <div style={{ position:'absolute', inset:'20px', zIndex:40, background:'rgba(2,6,23,0.96)', border:'1px solid rgba(148,163,184,0.3)', borderRadius:'18px', padding:'12px', display:'grid', gap:'8px', alignContent:'start', gridAutoRows:'max-content', overflowY:'auto' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontWeight:800, color:'#e2e8f0' }}>High Scores</div>
                <button onClick={() => setShowHighScores(false)} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1px solid rgba(148,163,184,0.3)', background:'#1e293b', color:'white', cursor:'pointer', fontWeight:800 }}>X</button>
              </div>
              <div style={{ fontSize:'12px', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.12em' }}>Local</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:'10px', alignItems:'start' }}>
                <div style={{ background:'rgba(15,23,42,0.7)', border:'1px solid rgba(148,163,184,0.22)', borderRadius:'12px', padding:'10px', minHeight:'120px' }}>
                  <div style={{ fontWeight:800, marginBottom:'8px' }}>Classic Top 10</div>
                  {(highScores.classic || []).length ? (highScores.classic || []).map((v, i) => (
                    <div key={`classic-${i}`} style={{ fontSize:'13px', color:'#cbd5e1' }}>{i + 1}. {Math.floor(v)}</div>
                  )) : <div style={{ fontSize:'13px', color:'#64748b' }}>No scores yet</div>}
                </div>
                <div style={{ background:'rgba(15,23,42,0.7)', border:'1px solid rgba(148,163,184,0.22)', borderRadius:'12px', padding:'10px', minHeight:'120px' }}>
                  <div style={{ fontWeight:800, marginBottom:'8px' }}>Arcade Top 10</div>
                  {(highScores.arcade || []).length ? (highScores.arcade || []).map((v, i) => (
                    <div key={`arcade-${i}`} style={{ fontSize:'13px', color:'#cbd5e1' }}>{i + 1}. {Math.floor(v)}</div>
                  )) : <div style={{ fontSize:'13px', color:'#64748b' }}>No scores yet</div>}
                </div>
                <div style={{ background:'rgba(15,23,42,0.7)', border:'1px solid rgba(148,163,184,0.22)', borderRadius:'12px', padding:'10px', minHeight:'120px' }}>
                  <div style={{ fontWeight:800, marginBottom:'8px' }}>Cursed Top 10</div>
                  {(highScores.cursed || []).length ? (highScores.cursed || []).map((v, i) => (
                    <div key={`cursed-${i}`} style={{ fontSize:'13px', color:'#cbd5e1' }}>{i + 1}. {Math.floor(v)}</div>
                  )) : <div style={{ fontSize:'13px', color:'#64748b' }}>No scores yet</div>}
                </div>
              </div>

              <div style={{ display:'flex', justifyContent:'space-between', gap:'10px', alignItems:'center', marginTop:'4px' }}>
                <div style={{ fontSize:'12px', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.12em' }}>Public</div>
                <button onClick={fetchPublicScores} style={{ padding:'6px 10px', borderRadius:'8px', border:'1px solid rgba(148,163,184,0.3)', background:'#1e293b', color:'#cbd5e1', cursor:'pointer', fontWeight:700 }}>Refresh</button>
              </div>
              {publicScoresError && <div style={{ color:'#fca5a5', fontSize:'12px' }}>{publicScoresError}</div>}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:'10px', alignItems:'start' }}>
                {MODES_WITH_LEADERBOARDS.map(mode => (
                  <div key={`public-${mode}`} style={{ background:'rgba(15,23,42,0.7)', border:'1px solid rgba(148,163,184,0.22)', borderRadius:'12px', padding:'10px', minHeight:'120px' }}>
                    <div style={{ fontWeight:800, marginBottom:'8px', textTransform:'capitalize' }}>{mode} Top 10</div>
                    {publicScoresLoading ? (
                      <div style={{ fontSize:'13px', color:'#64748b' }}>Loading...</div>
                    ) : (publicScores[mode] || []).length ? (publicScores[mode] || []).map((row, i) => (
                      <div key={`${mode}-${row.created_at || i}`} style={{ fontSize:'13px', color:'#cbd5e1', display:'flex', justifyContent:'space-between', gap:'8px' }}>
                        <span>{i + 1}. {row.player_name}</span>
                        <span>{Math.floor(row.score)}</span>
                      </div>
                    )) : <div style={{ fontSize:'13px', color:'#64748b' }}>No scores yet</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showSettings && (
            <div style={{ position:'absolute', inset:'20px', zIndex:45, background:'rgba(2,6,23,0.97)', border:'1px solid rgba(148,163,184,0.3)', borderRadius:'18px', padding:'12px', display:'grid', gap:'10px', alignContent:'start', gridAutoRows:'max-content', overflowY:'auto' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontWeight:800, color:'#e2e8f0' }}>Settings</div>
                <button onClick={() => setShowSettings(false)} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1px solid rgba(148,163,184,0.3)', background:'#1e293b', color:'white', cursor:'pointer', fontWeight:800 }}>X</button>
              </div>

              <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'#cbd5e1' }}>
                <input type="checkbox" checked={sfxMuted} onChange={e => setSfxMuted(e.target.checked)} />
                Mute SFX
              </label>

              <div style={{ display:'grid', gap:'4px' }}>
                <div style={{ fontSize:'13px', color:'#cbd5e1' }}>SFX Volume: {Math.round(sfxVolume * 100)}%</div>
                <input type="range" min="0" max="1" step="0.01" value={sfxVolume} onChange={e => setSfxVolume(Number(e.target.value))} />
              </div>

              <div style={{ display:'grid', gap:'4px' }}>
                <div style={{ fontSize:'13px', color:'#cbd5e1' }}>Music Volume: {Math.round(musicVolume * 100)}%</div>
                <input type="range" min="0" max="1" step="0.01" value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} />
              </div>

              <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'#cbd5e1' }}>
                <input type="checkbox" checked={randomSpawnOrder} onChange={e => setRandomSpawnOrder(e.target.checked)} />
                Random spawn order
              </label>

              <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'#cbd5e1' }}>
                <input type="checkbox" checked={devMode} onChange={e => setDevMode(e.target.checked)} />
                Dev mode
              </label>
            </div>
          )}

          {showBugReport && (
            <div style={{ position:'absolute', inset:'20px', zIndex:48, background:'rgba(2,6,23,0.97)', border:'1px solid rgba(148,163,184,0.3)', borderRadius:'18px', padding:'12px', display:'grid', gap:'10px', alignContent:'start', gridAutoRows:'max-content', overflowY:'auto' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontWeight:800, color:'#e2e8f0' }}>Report Bug</div>
                <button onClick={() => setShowBugReport(false)} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1px solid rgba(148,163,184,0.3)', background:'#1e293b', color:'white', cursor:'pointer', fontWeight:800 }}>X</button>
              </div>
              <textarea
                value={bugReportText}
                onChange={e => setBugReportText(limitWords(e.target.value))}
                placeholder="What went wrong?"
                rows={7}
                style={{ width:'100%', resize:'vertical', minHeight:'140px', boxSizing:'border-box', borderRadius:'12px', border:'1px solid rgba(148,163,184,0.35)', background:'#020617', color:'#e2e8f0', padding:'10px', font:'inherit', outline:'none', userSelect:'text', WebkitUserSelect:'text' }}
              />
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px', fontSize:'12px', color:'#94a3b8' }}>
                <span>{bugReportText.trim() ? bugReportText.trim().split(/\s+/).length : 0}/80 words</span>
                <button
                  onClick={handleSendBugReport}
                  disabled={!bugReportText.trim()}
                  style={{ padding:'10px 18px', borderRadius:'12px', background:bugReportText.trim() ? '#2563eb' : '#334155', color:'white', border:'none', cursor:bugReportText.trim() ? 'pointer' : 'default', fontWeight:800 }}
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {showRunHighScoreModal && (
            <div style={{ position:'absolute', inset:'20px', zIndex:50, background:'rgba(2,6,23,0.96)', border:'1px solid rgba(34,197,94,0.45)', borderRadius:'18px', padding:'16px', display:'grid', gap:'12px', alignContent:'center', justifyItems:'center' }}>
              <div style={{ fontWeight:900, fontSize:'26px', color:'#22c55e' }}>High Score: {Math.floor(runHighScoreValue)}</div>
              <div style={{ display:'grid', gap:'8px', width:'min(100%, 320px)' }}>
                <input
                  value={publicPlayerName}
                  onChange={e => setPublicPlayerName(normalizePlayerName(e.target.value))}
                  placeholder="Name for public board"
                  maxLength={16}
                  style={{ width:'100%', boxSizing:'border-box', borderRadius:'10px', border:'1px solid rgba(148,163,184,0.35)', background:'#020617', color:'#e2e8f0', padding:'10px', font:'inherit', textAlign:'center', userSelect:'text', WebkitUserSelect:'text' }}
                />
                <button
                  onClick={submitPublicScore}
                  disabled={!publicPlayerName.trim() || publicScoreSubmitted || publicSubmitStatus === "sending..."}
                  style={{ padding:'10px 18px', borderRadius:'12px', background:publicPlayerName.trim() && !publicScoreSubmitted && publicSubmitStatus !== "sending..." ? '#7c3aed' : '#334155', color:'white', border:'none', cursor:publicPlayerName.trim() && !publicScoreSubmitted && publicSubmitStatus !== "sending..." ? 'pointer' : 'default', fontWeight:700 }}
                >
                  {publicScoreSubmitted ? "Submitted" : "Submit Public Score"}
                </button>
                <div style={{ minHeight:'18px', fontSize:'13px', color:publicSubmitStatus === "submitted" ? '#86efac' : '#cbd5e1' }}>{publicSubmitStatus}</div>
              </div>
              <div style={{ display:'flex', gap:'10px' }}>
                <button onClick={handleShareHighScore} style={{ padding:'10px 18px', borderRadius:'12px', background:'#16a34a', color:'white', border:'none', cursor:'pointer', fontWeight:700 }}>Share</button>
                <button onClick={() => { setRunHighScoreDismissed(true); setShowRunHighScoreModal(false); }} style={{ padding:'10px 18px', borderRadius:'12px', background:'#334155', color:'white', border:'none', cursor:'pointer', fontWeight:700 }}>Continue</button>
              </div>
              <div style={{ minHeight:'18px', fontSize:'13px', color:'#86efac' }}>{shareCopied ? "copied to clipboard" : ""}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
