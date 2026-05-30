import React, { useEffect, useRef, useState } from "react";


const GRID = 35;
const CELL = 16;
const START_SPEED = 720;
const MIN_SPEED = 38;
const CENTRE = Math.floor(GRID / 2);
const SAFE_MIN = 2;
const SAFE_MAX = GRID - 3;
const CORE_COLOR = "#f8fafc";
const FLASH_MS = 160;
const SETTLE_TICK_MS = 45;
const MULTIPLIER_DURATION_MS = 20000;
const POWERUP_TURNS = 6;
const MAX_SCORE_MULTIPLIER = 6;

const SHAPES = [
  [[1, 1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[1, 1, 0], [0, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
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

function randomPiece(forcedSide = null) {
  const index = Math.floor(Math.random() * SHAPES.length);
  const side = forcedSide || ["top", "right", "bottom", "left"][Math.floor(Math.random() * 4)];
  const shape = SHAPES[index];
  let x = CENTRE - Math.floor(shape[0].length / 2);
  let y = CENTRE - Math.floor(shape.length / 2);

  if (side === "top") y = SAFE_MIN;
  if (side === "bottom") y = SAFE_MAX - shape.length + 1;
  if (side === "left") x = SAFE_MIN;
  if (side === "right") x = SAFE_MAX - shape[0].length + 1;

  return { id: crypto.randomUUID(), shape, color: COLORS[index], x, y, side };
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
    Q: ["111", "101", "101", "101", "111"],
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

export default function FourDirectionTetris() {
  const canvasRef = useRef(null);
  const [board, setBoard] = useState(emptyBoard());
  const [pieces, setPieces] = useState([]);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [gameMode, setGameMode] = useState("classic");
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
  const holdDelayRef = useRef(null);
  const holdIntervalRef = useRef(null);

  function levelForScore(points) {
    if (points >= 36500) return 9;
    if (points >= 28500) return 8;
    if (points >= 21500) return 7;
    if (points >= 15500) return 6;
    if (points >= 10500) return 5;
    if (points >= 6500) return 4;
    if (points >= 3500) return 3;
    if (points >= 1500) return 2;
    if (points >= 500) return 1.5;
    return 1;
  }

  function resetToTitle() {
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

        if (roll < 0.58) {
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

        if (roll < 0.82) {
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

        if (roll < 0.95) {
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

        if (roll < 0.985) {
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

  function maybeSpawnPowerUp(board) {
    if (gameMode !== "arcade") return;
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
    if (gameMode !== "arcade" || !activePiece || !powerUps.length) {
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
        setMultiplierPopup(`x${next}`);
        setTimeout(() => setMultiplierPopup(""), 900);
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
      setMultiplierPopup("DUAL");
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
        lifeCollected ? 100 : missileCollected ? 150 : dualCollected ? 180 : 25 * strongest,
        lifeCollected ? "life" : missileCollected ? "missile" : dualCollected ? "dual" : "orb"
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
    return false;
  }

  function spawn(nextBoard) {
    const p = randomPiece();
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
    const first = randomPiece();
    const second = randomPiece(oppositeSide(first.side));
    const overlapEachOther = pieceCells(first).some(a =>
      pieceCells(second).some(b => a.x === b.x && a.y === b.y)
    );

    if (
      overlapsBoard(nextBoard, first) || breachesBarrier(first) ||
      overlapsBoard(nextBoard, second) || breachesBarrier(second) ||
      overlapEachOther
    ) {
      return false;
    }

    setPieces([first, second]);
    return true;
  }

  function startGame() {
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
      const oldLevel = levelForScore(prev);
      const newLevel = levelForScore(next);
      if (newLevel > oldLevel && newLevel > level) {
        setLevel(newLevel);
        setLevelMessage(`Level ${newLevel}!`);
        setTimeout(() => setLevelMessage(""), 900);
      }
      return next;
    });
  }

  function settleAnimated(startBoard) {
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
        setAnimating(false);
        maybeSpawnPowerUp(current);
        if (pendingDualSpawn && gameMode === "arcade" && !spawnDual(current)) {
          spawn(current);
        } else if (!pendingDualSpawn || gameMode !== "arcade") {
          spawn(current);
        }
        setPendingDualSpawn(false);
      }
    };

    run();
  }

  function finalizeLockedBoard(merged) {
    const result = clearMatches(merged);
    setBoard(merged);

    const clearScore = result.cleared * 100;
    if (clearScore) addScore(clearScore, "clear");

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

    for (const activePiece of pieces) {
      const { dx, dy } = directionVector(activePiece.side);
      const nx = activePiece.x + dx;
      const ny = activePiece.y + dy;

      if (overlapsBoard(currentBoard, activePiece, nx, ny)) {
        currentBoard = merge(currentBoard, activePiece);
        setBoard(currentBoard);
        addScore(10, "land");
        continue;
      }

      const movedPiece = { ...activePiece, x: nx, y: ny };
      const pickup = collectPowerUps(movedPiece, currentBoard, pieces.length > 1);
      if (pickup.collected && pickup.removePiece) continue;

      if (breachesBarrier(activePiece, nx, ny)) {
        if (handleDeath()) return;
        return;
      }

      survivors.push(movedPiece);
    }

    setPieces(survivors);
    if (!survivors.length && !animating) {
      finalizeLockedBoard(currentBoard);
    }
  }

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
        const rotatedPiece = { ...activePiece, shape: rotated };
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
    for (const activePiece of pieces) {
      let p = { ...activePiece };
      const { dx, dy } = directionVector(p.side);

      while (!overlapsBoard(currentBoard, p, p.x + dx, p.y + dy)) {
        p.x += dx;
        p.y += dy;
        if (breachesBarrier(p)) {
          if (handleDeath()) return;
          return;
        }
      }
      currentBoard = merge(currentBoard, p);
      setBoard(currentBoard);
      addScore(10, "land");
    }

    setPieces([]);
    finalizeLockedBoard(currentBoard);
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
      drop();
      return;
    }

    if (piece.side === "top") {
      if (position === "left") moveRelative("left");
      if (position === "right") moveRelative("right");
      if (position === "top") rotatePiece();
      if (position === "bottom") moveRelative("forward");
    } else if (piece.side === "bottom") {
      if (position === "left") moveRelative("right");
      if (position === "right") moveRelative("left");
      if (position === "bottom") rotatePiece();
      if (position === "top") moveRelative("forward");
    } else if (piece.side === "right") {
      if (position === "top") moveRelative("right");
      if (position === "bottom") moveRelative("left");
      if (position === "left") moveRelative("forward");
      if (position === "right") rotatePiece();
    } else if (piece.side === "left") {
      if (position === "top") moveRelative("left");
      if (position === "bottom") moveRelative("right");
      if (position === "right") moveRelative("forward");
      if (position === "left") rotatePiece();
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
      const piece = pieces[0];
      if (!piece) return;

      if (piece.side === "top") {
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") moveRelative("left");
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") moveRelative("right");
        if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") rotatePiece();
        if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") moveRelative("forward");
      } else if (piece.side === "bottom") {
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") moveRelative("right");
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") moveRelative("left");
        if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") rotatePiece();
        if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") moveRelative("forward");
      } else if (piece.side === "right") {
        if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") moveRelative("right");
        if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") moveRelative("left");
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") moveRelative("forward");
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") rotatePiece();
      } else if (piece.side === "left") {
        if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") moveRelative("left");
        if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") moveRelative("right");
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") moveRelative("forward");
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") rotatePiece();
      }

      if (e.key === " ") drop();
      if (e.key.toLowerCase() === "p") setPaused(p => !p);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pieces, screen, gameOver, paused, animating, board, powerUps, hasExtraLife, scoreMultiplier, gameMode]);

  useEffect(() => {
    const speed = Math.max(28, Math.floor(560 * Math.pow(0.68, level - 1)));
    const id = setInterval(step, speed);
    return () => clearInterval(id);
  }, [level, step]);

  useEffect(() => {
    if (screen !== "playing" || gameOver || paused || animating || pieces.length) return;
    const id = setTimeout(() => {
      if (pendingDualSpawn && gameMode === "arcade") {
        if (!spawnDual(board)) spawn(board);
      } else {
        spawn(board);
      }
      setPendingDualSpawn(false);
    }, 120);
    return () => clearTimeout(id);
  }, [screen, gameOver, paused, animating, pieces.length, pendingDualSpawn, gameMode, board]);

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

    ctx.strokeStyle = "rgba(248,113,113,0.9)";
    ctx.lineWidth = 4;
    ctx.strokeRect(SAFE_MIN * CELL, SAFE_MIN * CELL, (SAFE_MAX - SAFE_MIN + 1) * CELL, (SAFE_MAX - SAFE_MIN + 1) * CELL);
    ctx.lineWidth = 1;

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

      ctx.fillStyle = color;
      ctx.fillRect(px, py, size, size);
      ctx.lineWidth = 1;
      ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 1;
    });
    if (destroyedPiece) {
      const flashOn = Math.floor(Date.now() / 80) % 2 === 0;
      destroyedPiece.shape.forEach((row, r) => row.forEach((cell, c) => cell && drawCell(destroyedPiece.x + c, destroyedPiece.y + r, flashOn ? "#ffffff" : destroyedPiece.color)));
    } else if (!animating && pieces.length) {
      pieces.forEach(activePiece => {
        activePiece.shape.forEach((row, r) => row.forEach((cell, c) => cell && drawCell(activePiece.x + c, activePiece.y + r, activePiece.color)));
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
  }, [board, pieces, gameOver, failReason, animating, flashKeys, screen, countdown, powerUps, multiplierPopup, destroyedPiece, missileEffect]);

  const padLabels = getPadLabels();

  return (
    <div style={{ minHeight:'100vh', color:'white', display:'flex', alignItems:'center', justifyContent:'center', padding:'8px', width:'100%', maxWidth:'100vw', overflowX:'hidden', background:'radial-gradient(circle at top, #1e293b 0%, #0f172a 42%, #020617 100%)', fontFamily:'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', boxSizing:'border-box' }}>
      <div style={{ margin:'0 auto', width:'100%', maxWidth:'920px', background:'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))', border:'1px solid rgba(148,163,184,0.25)', borderRadius:'24px', padding:'12px', boxShadow:'0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)', boxSizing:'border-box' }}>
        <div style={{ display:'grid', gap:'18px', position:'relative' }}>
          <div style={{ display:'grid', gridTemplateColumns:'minmax(120px, 160px) minmax(0, 1fr)', alignItems:'center', gap:'12px' }}>
            <div style={{ textAlign:'left', background:'rgba(15,23,42,0.82)', border:'1px solid rgba(148,163,184,0.22)', borderRadius:'14px', padding:'10px 12px', minWidth:'126px', backdropFilter:'blur(10px)' }}>
              <div style={{ fontSize:'11px', letterSpacing:'0.14em', textTransform:'uppercase', color:'#94a3b8' }}>Score</div>
              <div style={{ fontSize:'28px', fontWeight:800, lineHeight:1 }}>{Math.floor(score)}</div>
              <div style={{ fontSize:'12px', color:'#cbd5e1', marginTop:'4px' }}>Level {level}</div>
              <div style={{ fontSize:'12px', color:'#6ee7b7', minHeight:'16px', marginTop:'2px' }}>{scoreFlash}</div>
              <div style={{ height:'1px', background:'rgba(148,163,184,0.16)', margin:'8px 0' }} />
              <div style={{ fontSize:'10px', color:'#64748b' }}>4x4 clear = 100 × level</div>
              <div style={{ fontSize:'10px', color:'#64748b' }}>Loose block = 10 × level</div>
              <div style={{ fontSize:'10px', color:'#94a3b8', marginTop:'6px' }}>Mode: {gameMode}</div>
              <div style={{ fontSize:'10px', color: hasExtraLife ? '#ff6680' : '#475569' }}>
                Life: {hasExtraLife ? '♥' : '-'}
              </div>
              <div style={{ fontSize:'10px', color:'#fbbf24' }}>Multiplier: x{scoreMultiplier}</div>
            </div>

            <div style={{ textAlign:'center', minHeight:'64px', paddingTop:'4px' }}>
            <BlockTitle />
            <p style={{ color:'#cbd5e1', fontSize:'14px', margin:'6px 0 0' }}>Build from the centre. Clear 4×4 blocks. Do not breach the red perimeter.</p>
            </div>

          </div>

          {levelMessage && (
            <div className="absolute inset-x-0 top-24 text-center text-3xl font-bold text-white pointer-events-none z-20">
              {levelMessage}
            </div>
          )}

          {screen === "title" && (
            <div style={{ position:'absolute', inset:'24px', top:'96px', zIndex:30, background:'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))', border:'1px solid rgba(148,163,184,0.24)', borderRadius:'22px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'20px', textAlign:'center', boxShadow:'0 24px 70px rgba(0,0,0,0.62)' }}>
              <div style={{ marginBottom:'20px' }}>
                <BlockTitle />
              </div>
              <div style={{ color:'#cbd5e1', fontSize:'14px', maxWidth:'390px', padding:'0 18px', lineHeight:1.55 }}>
                Build from the centre. Clear 4×4 blocks. Survive the accelerating fall from four directions.
              </div>

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
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'12px', background:'rgba(30,41,59,0.65)', border:'1px solid rgba(148,163,184,0.18)', borderRadius:'14px', padding:'10px 14px' }}>
                <span style={{ fontSize:'13px', color:'#94a3b8' }}>Start level</span>
                <select
                  value={selectedLevel}
                  onChange={e => setSelectedLevel(Number(e.target.value))}
                  style={{ background:'#1e293b', border:'1px solid #475569', borderRadius:'10px', padding:'8px 12px', color:'white' }}
                >
                  {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button onClick={startGame} style={{ padding:'12px 32px', borderRadius:'12px', background:'#2563eb', color:'white', border:'none', cursor:'pointer', fontWeight:'bold' }}>Play</button>
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={GRID * CELL}
            height={GRID * CELL}
            style={{ width:'min(100%, 560px)', height:'auto', margin:'0 auto', borderRadius:'18px', border:'1px solid rgba(148,163,184,0.32)', background:'#020617', boxShadow:'0 18px 50px rgba(0,0,0,0.45)', display:'block' }}
          />

          <div
            style={{
              display:'grid',
              gridTemplateColumns:'repeat(3, minmax(68px, 1fr))',
              gridTemplateRows:'repeat(3, 56px)',
              gap:'6px',
              justifyContent:'center',
              alignItems:'center',
              touchAction:'none',
              userSelect:'none',
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
              style={{ height:'58px', borderRadius:'12px', border:'1px solid rgba(148,163,184,0.28)', background:'#1e293b', color:'white', fontWeight:800, fontSize:'11px', cursor:'pointer' }}
            >
              {padLabels.top}
            </button>
            <div />

            <button
              onPointerDown={e => { e.preventDefault(); startHold('left'); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={e => e.preventDefault()}
              style={{ height:'58px', borderRadius:'12px', border:'1px solid rgba(148,163,184,0.28)', background:'#1e293b', color:'white', fontWeight:800, fontSize:'11px', cursor:'pointer' }}
            >
              {padLabels.left}
            </button>
            <button
              onPointerDown={e => { e.preventDefault(); startHold('center'); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={e => e.preventDefault()}
              style={{ height:'58px', borderRadius:'12px', border:'1px solid rgba(250,204,21,0.45)', background:'#854d0e', color:'white', fontWeight:900, fontSize:'12px', cursor:'pointer', boxShadow:'0 0 18px rgba(250,204,21,0.16)' }}
            >
              {padLabels.center}
            </button>
            <button
              onPointerDown={e => { e.preventDefault(); startHold('right'); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={e => e.preventDefault()}
              style={{ height:'58px', borderRadius:'12px', border:'1px solid rgba(148,163,184,0.28)', background:'#1e293b', color:'white', fontWeight:800, fontSize:'11px', cursor:'pointer' }}
            >
              {padLabels.right}
            </button>

            <div />
            <button
              onPointerDown={e => { e.preventDefault(); startHold('bottom'); }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={e => e.preventDefault()}
              style={{ height:'58px', borderRadius:'12px', border:'1px solid rgba(148,163,184,0.28)', background:'#1e293b', color:'white', fontWeight:800, fontSize:'11px', cursor:'pointer' }}
            >
              {padLabels.bottom}
            </button>
            <div />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'8px', fontSize:'13px', color:'#cbd5e1', background:'rgba(15,23,42,0.55)', border:'1px solid rgba(148,163,184,0.16)', borderRadius:'16px', padding:'12px' }}>
            <div>← / → / WASD or pad: relative movement</div>
            <div>Space: hard drop</div>
            <div>4×4 squares clear</div>
            <div>No line clears</div>
            <div>Loose blocks fall inward</div>
            <div>Lost loose blocks give points</div>
            <div>Arcade: collect multiplier cubes</div>
            <div>Arcade: missiles and hearts</div>
          </div>

          <div style={{ display:'flex', gap:'10px', justifyContent:'center' }}>
            <button onClick={resetToTitle} style={{ padding:'10px 18px', borderRadius:'12px', background:'#334155', color:'white', border:'none', cursor:'pointer' }}>Title Screen</button>
            <button onClick={startGame} style={{ padding:'10px 18px', borderRadius:'12px', background:'#2563eb', color:'white', border:'none', cursor:'pointer' }}>Restart</button>
            <button onClick={() => setPaused(p => !p)} style={{ padding:'10px 18px', borderRadius:'12px', background:'#475569', color:'white', border:'none', cursor:'pointer' }}>
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
