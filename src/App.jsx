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

function randomPiece() {
  const index = Math.floor(Math.random() * SHAPES.length);
  const side = ["top", "right", "bottom", "left"][Math.floor(Math.random() * 4)];
  const shape = SHAPES[index];
  let x = CENTRE - Math.floor(shape[0].length / 2);
  let y = CENTRE - Math.floor(shape.length / 2);

  if (side === "top") y = SAFE_MIN;
  if (side === "bottom") y = SAFE_MAX - shape.length + 1;
  if (side === "left") x = SAFE_MIN;
  if (side === "right") x = SAFE_MAX - shape[0].length + 1;

  return { shape, color: COLORS[index], x, y, side };
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
    Q: ["111", "101", "111", "001"],
    U: ["101", "101", "101", "111"],
    A: ["010", "101", "111", "101"],
    D: ["110", "101", "101", "110"],
    E: ["111", "110", "100", "111"],
    S: ["111", "100", "111", "001", "111"],
    T: ["111", "010", "010", "010"],
    R: ["110", "101", "110", "101"],
    I: ["111", "010", "010", "111"],
  };
  const word = "QUADESTRIS";

  return (
    <div className="flex justify-center gap-1 mb-2" aria-label="Quadestris">
      {word.split("").map((letter, letterIndex) => (
        <div key={`${letter}-${letterIndex}`} className="grid gap-[2px]" style={{ gridTemplateRows: `repeat(${letters[letter].length}, 6px)` }}>
          {letters[letter].map((row, y) => (
            <div key={y} className="flex gap-[2px]">
              {row.split("").map((cell, x) => (
                <div
                  key={x}
                  className="w-[6px] h-[6px] rounded-[1px]"
                  style={{ background: cell === "1" ? COLORS[(letterIndex + x + y) % COLORS.length] : "transparent" }}
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
  const [piece, setPiece] = useState(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [screen, setScreen] = useState("title");
  const [countdown, setCountdown] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [paused, setPaused] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [flashKeys, setFlashKeys] = useState(new Set());
  const [levelMessage, setLevelMessage] = useState("");
  const [scoreFlash, setScoreFlash] = useState("");

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
    setPiece(null);
    setScore(0);
    setLevel(selectedLevel);
    setLevelMessage("");
    setScoreFlash("");
    setGameOver(false);
    setFailReason("");
    setPaused(false);
    setAnimating(false);
    setFlashKeys(new Set());
    setScreen("title");
    setCountdown(null);
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
      setPiece(p);
    }
  }

  function startGame() {
    const freshBoard = emptyBoard();
    setBoard(freshBoard);
    setPiece(null);
    setScore(0);
    setLevel(selectedLevel);
    setLevelMessage("");
    setScoreFlash("");
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
    const gained = amount * level;
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
        spawn(current);
      }
    };

    run();
  }

  function lockPiece(p = piece) {
    if (!p) return;

    addScore(10, "land");
    const merged = merge(board, p);
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
    if (screen !== "playing" || gameOver || paused || animating || !piece) return;
    const { dx, dy } = directionVector(piece.side);
    const nx = piece.x + dx;
    const ny = piece.y + dy;

    if (overlapsBoard(board, piece, nx, ny)) {
      lockPiece(piece);
      return;
    }

    setPiece({ ...piece, x: nx, y: ny });
    if (breachesBarrier(piece, nx, ny)) {
      setFailReason("Barrier breached");
      setGameOver(true);
    }
  }

  function moveRelative(direction) {
    if (screen !== "playing" || gameOver || paused || animating || !piece) return;

    let nx = piece.x;
    let ny = piece.y;

    if (piece.side === "top") {
      if (direction === "left") nx -= 1;
      if (direction === "right") nx += 1;
      if (direction === "forward") ny += 1;
    } else if (piece.side === "bottom") {
      if (direction === "left") nx += 1;
      if (direction === "right") nx -= 1;
      if (direction === "forward") ny -= 1;
    } else if (piece.side === "right") {
      if (direction === "left") ny += 1;
      if (direction === "right") ny -= 1;
      if (direction === "forward") nx -= 1;
    } else if (piece.side === "left") {
      if (direction === "left") ny -= 1;
      if (direction === "right") ny += 1;
      if (direction === "forward") nx += 1;
    }

    if (validSideMove(board, piece, nx, ny)) setPiece({ ...piece, x: nx, y: ny });
  }

  function rotatePiece() {
    if (screen !== "playing" || gameOver || paused || animating || !piece) return;
    const rotated = rotate(piece.shape);
    if (validSideMove(board, piece, piece.x, piece.y, rotated)) setPiece({ ...piece, shape: rotated });
  }

  function drop() {
    if (screen !== "playing" || gameOver || paused || animating || !piece) return;
    let p = { ...piece };
    const { dx, dy } = directionVector(p.side);

    while (!overlapsBoard(board, p, p.x + dx, p.y + dy)) {
      p.x += dx;
      p.y += dy;
      if (breachesBarrier(p)) {
        setPiece(p);
        setFailReason("Barrier breached");
        setGameOver(true);
        return;
      }
    }

    addScore(25, "drop");
    lockPiece(p);
  }

  useEffect(() => {
    const onKey = e => {
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
  });

  useEffect(() => {
    const speed = Math.max(MIN_SPEED, Math.floor(START_SPEED * Math.pow(0.78, level - 1)));
    const id = setInterval(step, speed);
    return () => clearInterval(id);
  });

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
    if (!animating && piece) piece.shape.forEach((row, r) => row.forEach((cell, c) => cell && drawCell(piece.x + c, piece.y + r, piece.color)));

    if (screen === "countdown" && countdown) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "white";
      ctx.font = "bold 72px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(countdown, canvas.width / 2, canvas.height / 2 + 24);
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
  }, [board, piece, gameOver, failReason, animating, flashKeys, screen, countdown]);

  return (
    <div style={{ minHeight:'100vh', color:'white', display:'flex', alignItems:'center', justifyContent:'center', padding:'28px', width:'100%', background:'radial-gradient(circle at top, #1e293b 0%, #0f172a 42%, #020617 100%)', fontFamily:'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
      <div style={{ margin:'0 auto', width:'min-content', background:'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))', border:'1px solid rgba(148,163,184,0.25)', borderRadius:'24px', padding:'24px', boxShadow:'0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
        <div style={{ display:'grid', gap:'18px', position:'relative' }}>
          <div style={{ display:'grid', gridTemplateColumns:'160px auto 160px', alignItems:'center', gap:'14px' }}>
            <div style={{ textAlign:'left', background:'rgba(15,23,42,0.82)', border:'1px solid rgba(148,163,184,0.22)', borderRadius:'14px', padding:'10px 12px', minWidth:'126px', backdropFilter:'blur(10px)' }}>
              <div style={{ fontSize:'11px', letterSpacing:'0.14em', textTransform:'uppercase', color:'#94a3b8' }}>Score</div>
              <div style={{ fontSize:'28px', fontWeight:800, lineHeight:1 }}>{Math.floor(score)}</div>
              <div style={{ fontSize:'12px', color:'#cbd5e1', marginTop:'4px' }}>Level {level}</div>
              <div style={{ fontSize:'12px', color:'#6ee7b7', minHeight:'16px', marginTop:'2px' }}>{scoreFlash}</div>
              <div style={{ height:'1px', background:'rgba(148,163,184,0.16)', margin:'8px 0' }} />
              <div style={{ fontSize:'10px', color:'#64748b' }}>4x4 clear = 100 × level</div>
              <div style={{ fontSize:'10px', color:'#64748b' }}>Loose block = 10 × level</div>
            </div>

            <div style={{ textAlign:'center', minHeight:'64px', paddingTop:'4px' }}>
            <BlockTitle />
            <p style={{ color:'#cbd5e1', fontSize:'14px', margin:'6px 0 0' }}>Build from the centre. Clear 4×4 blocks. Do not breach the red perimeter.</p>
            </div>

            <div />
          </div>

          {levelMessage && (
            <div className="absolute inset-x-0 top-24 text-center text-3xl font-bold text-white pointer-events-none z-20">
              {levelMessage}
            </div>
          )}

          {screen === "title" && (
            <div style={{ position:'absolute', inset:'24px', top:'96px', zIndex:30, background:'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))', border:'1px solid rgba(148,163,184,0.24)', borderRadius:'22px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'20px', textAlign:'center', boxShadow:'0 24px 70px rgba(0,0,0,0.62)' }}>
              <div style={{ transform:'scale(1.75)', marginBottom:'20px' }}>
                <BlockTitle />
              </div>
              <div style={{ color:'#cbd5e1', fontSize:'14px', maxWidth:'390px', padding:'0 18px', lineHeight:1.55 }}>
                Build from the centre. Clear 4×4 blocks. Survive the accelerating fall from four directions.
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
            style={{ borderRadius:'18px', border:'1px solid rgba(148,163,184,0.32)', background:'#020617', boxShadow:'0 18px 50px rgba(0,0,0,0.45)' }}
          />

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'13px', color:'#cbd5e1', background:'rgba(15,23,42,0.55)', border:'1px solid rgba(148,163,184,0.16)', borderRadius:'16px', padding:'12px' }}>
            <div>← / → / WASD: relative movement</div>
            <div>Space: hard drop</div>
            <div>4×4 squares clear</div>
            <div>No line clears</div>
            <div>Loose blocks fall inward</div>
            <div>Lost loose blocks give points</div>
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
