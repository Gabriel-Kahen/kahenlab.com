const canvas = document.getElementById("life");
const ctx = canvas.getContext("2d", { alpha: false });

const glyphs = {
  A: [
    "01110",
    "10001",
    "10001",
    "11111",
    "10001",
    "10001",
    "10001",
  ],
  B: [
    "11110",
    "10001",
    "10001",
    "11110",
    "10001",
    "10001",
    "11110",
  ],
  C: [
    "01111",
    "10000",
    "10000",
    "10000",
    "10000",
    "10000",
    "01111",
  ],
  E: [
    "11111",
    "10000",
    "10000",
    "11110",
    "10000",
    "10000",
    "11111",
  ],
  H: [
    "10001",
    "10001",
    "10001",
    "11111",
    "10001",
    "10001",
    "10001",
  ],
  O: [
    "01110",
    "10001",
    "10001",
    "10001",
    "10001",
    "10001",
    "01110",
  ],
  R: [
    "11110",
    "10001",
    "10001",
    "11110",
    "10100",
    "10010",
    "10001",
  ],
  S: [
    "01111",
    "10000",
    "10000",
    "01110",
    "00001",
    "00001",
    "11110",
  ],
  T: [
    "11111",
    "00100",
    "00100",
    "00100",
    "00100",
    "00100",
    "00100",
  ],
  U: [
    "10001",
    "10001",
    "10001",
    "10001",
    "10001",
    "10001",
    "01110",
  ],
};

const navWords = [
  { label: "RESEARCH", href: "./research.html" },
  { label: "ABOUT", href: "./about.html" },
];
let cols = 0;
let rows = 0;
let cellSize = 10;
let current = new Uint8Array();
let next = new Uint8Array();
let age = new Uint8Array();
let protectedUntil = new Float64Array();
let imprint = [];
let imprintMask = new Uint8Array();
let wordHitAreas = [];
let generation = 0;
let lastStep = 0;
let isDrawing = false;
let pendingNavigation = null;
let lastDrawnCell = null;

function index(x, y) {
  return y * cols + x;
}

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const narrow = window.innerWidth < 720;
  cellSize = narrow ? 3 : 6;
  cols = Math.ceil(window.innerWidth / cellSize);
  rows = Math.ceil(window.innerHeight / cellSize);
  current = new Uint8Array(cols * rows);
  next = new Uint8Array(cols * rows);
  age = new Uint8Array(cols * rows);
  protectedUntil = new Float64Array(cols * rows);
  imprintMask = new Uint8Array(cols * rows);
  buildWords();
  seed();
  draw();
}

function wordWidth(label) {
  return label.length * 5 + (label.length - 1);
}

function buildWords() {
  imprint = [];
  wordHitAreas = [];
  imprintMask.fill(0);
  const narrowLayout = window.innerWidth < 720;
  const sidePadding = narrowLayout ? 14 : 24;
  const rowGapUnits = narrowLayout ? 32 : 13;
  const unscaledMaxWidth = Math.max(
    ...navWords.map((item) => wordWidth(item.label)),
  );
  const unscaledTotalHeight = navWords.length * 7 + (navWords.length - 1) * rowGapUnits;
  const maxScaleByWidth = Math.floor((cols - sidePadding * 2) / unscaledMaxWidth);
  const maxScaleByHeight = Math.floor((rows - 8) / unscaledTotalHeight);
  const scale = Math.max(1, Math.min(3, maxScaleByWidth, maxScaleByHeight));
  const glyphWidth = 5 * scale;
  const glyphHeight = 7 * scale;
  const gap = 1 * scale;
  const rowGap = rowGapUnits * scale;
  const totalHeight = navWords.length * glyphHeight + (navWords.length - 1) * rowGap;
  const startY = Math.floor((rows - totalHeight) / 2);

  navWords.forEach((item, row) => {
    const labelWidth = item.label.length * glyphWidth + (item.label.length - 1) * gap;
    const wordStartX = Math.floor((cols - labelWidth) / 2);
    const wordStartY = startY + row * (glyphHeight + rowGap);

    wordHitAreas.push({
      href: item.href,
      x1: wordStartX - 1,
      x2: wordStartX + labelWidth,
      y1: wordStartY - 1,
      y2: wordStartY + glyphHeight,
    });

    let cursor = wordStartX;
    for (const letter of item.label) {
      const glyph = glyphs[letter];
      for (let gy = 0; gy < glyph.length; gy += 1) {
        for (let gx = 0; gx < glyph[gy].length; gx += 1) {
          if (glyph[gy][gx] !== "1") continue;
          for (let sy = 0; sy < scale; sy += 1) {
            for (let sx = 0; sx < scale; sx += 1) {
              const x = cursor + gx * scale + sx;
              const y = wordStartY + gy * scale + sy;
              if (x >= 0 && x < cols && y >= 0 && y < rows) {
                const cell = index(x, y);
                imprint.push(cell);
                imprintMask[cell] = 1;
              }
            }
          }
        }
      }
      cursor += glyphWidth + gap;
    }
  });
}

function setInitialCell(x, y) {
  if (x < 0 || x >= cols || y < 0 || y >= rows) return;
  const cell = index(x, y);
  if (imprintMask[cell] === 1) return;
  current[cell] = 1;
  age[cell] = 80;
}

function placePattern(x, y, pattern) {
  for (let py = 0; py < pattern.length; py += 1) {
    for (let px = 0; px < pattern[py].length; px += 1) {
      if (pattern[py][px] === "1") setInitialCell(x + px, y + py);
    }
  }
}

function seed() {
  current.fill(0);
  age.fill(0);
  protectedUntil.fill(0);
  generation = 0;

  for (const i of imprint) {
    current[i] = 1;
    age[i] = 1;
  }

  const edgeBand = Math.max(10, Math.floor(Math.min(cols, rows) * 0.22));
  const noiseCount = Math.floor(cols * rows * 0.032);
  for (let i = 0; i < noiseCount; i += 1) {
    const side = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;

    if (side === 0) {
      x = Math.floor(Math.random() * cols);
      y = Math.floor(Math.random() * edgeBand);
    } else if (side === 1) {
      x = Math.floor(Math.random() * cols);
      y = rows - 1 - Math.floor(Math.random() * edgeBand);
    } else if (side === 2) {
      x = Math.floor(Math.random() * edgeBand);
      y = Math.floor(Math.random() * rows);
    } else {
      x = cols - 1 - Math.floor(Math.random() * edgeBand);
      y = Math.floor(Math.random() * rows);
    }

    setInitialCell(x, y);
  }

  const glider = ["010", "001", "111"];
  const blinker = ["111"];
  const block = ["11", "11"];
  const beacon = ["1100", "1100", "0011", "0011"];
  const patterns = [
    [Math.floor(cols * 0.08), Math.floor(rows * 0.12), glider],
    [Math.floor(cols * 0.9), Math.floor(rows * 0.16), glider],
    [Math.floor(cols * 0.18), Math.floor(rows * 0.08), blinker],
    [Math.floor(cols * 0.72), Math.floor(rows * 0.1), beacon],
    [Math.floor(cols * 0.12), Math.floor(rows * 0.82), beacon],
    [Math.floor(cols * 0.82), Math.floor(rows * 0.78), blinker],
    [Math.floor(cols * 0.5), Math.floor(rows * 0.08), block],
    [Math.floor(cols * 0.48), Math.floor(rows * 0.9), blinker],
    [Math.floor(cols * 0.9), Math.floor(rows * 0.88), block],
    [Math.floor(cols * 0.06), Math.floor(rows * 0.54), glider],
  ];

  for (const [x, y, pattern] of patterns) {
    placePattern(x, y, pattern);
  }
}

function liveNeighbors(x, y) {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = (x + dx + cols) % cols;
      const ny = (y + dy + rows) % rows;
      count += current[index(nx, ny)];
    }
  }
  return count;
}

function step(time) {
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const i = index(x, y);
      const neighbors = liveNeighbors(x, y);
      const alive = current[i] === 1;
      if (imprintMask[i] === 1 || protectedUntil[i] > time) {
        next[i] = 1;
        age[i] = Math.min(255, age[i] + 10);
        continue;
      }
      const lives = alive
        ? neighbors === 2 || neighbors === 3
        : neighbors === 3;
      next[i] = lives ? 1 : 0;
      age[i] = lives ? Math.min(255, age[i] + 5) : Math.max(0, age[i] - 18);
    }
  }

  [current, next] = [next, current];
  next.fill(0);
  generation += 1;
}

function draw() {
  ctx.fillStyle = "#030806";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  ctx.fillStyle = "rgba(52, 78, 63, 0.22)";
  for (let x = 0; x < cols; x += 1) {
    ctx.fillRect(x * cellSize, 0, 1, window.innerHeight);
  }
  for (let y = 0; y < rows; y += 1) {
    ctx.fillRect(0, y * cellSize, window.innerWidth, 1);
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const i = index(x, y);
      if (imprintMask[i] === 1) continue;
      if (current[i] !== 1 && age[i] === 0) continue;
      const heat = Math.min(1, age[i] / 110);
      const alpha = current[i] ? 0.44 : 0.11 * heat;
      const red = Math.round(128 + 64 * heat);
      const green = Math.round(94 + 56 * heat);
      const blue = Math.round(60 + 24 * heat);
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
      ctx.fillRect(
        x * cellSize + 1,
        y * cellSize + 1,
        Math.max(1, cellSize - 2),
        Math.max(1, cellSize - 2),
      );
    }
  }

  ctx.shadowColor = "rgba(191, 255, 144, 0.7)";
  ctx.shadowBlur = Math.max(6, cellSize * 1.6);
  for (const i of imprint) {
    const x = i % cols;
    const y = Math.floor(i / cols);
    ctx.fillStyle = "#dfff9d";
    ctx.fillRect(
      x * cellSize + 1,
      y * cellSize + 1,
      Math.max(1, cellSize - 2),
      Math.max(1, cellSize - 2),
    );
  }
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255, 255, 229, 0.92)";
  for (const i of imprint) {
    const x = i % cols;
    const y = Math.floor(i / cols);
    const inset = Math.max(2, Math.floor(cellSize * 0.28));
    ctx.fillRect(
      x * cellSize + inset,
      y * cellSize + inset,
      Math.max(1, cellSize - inset * 2),
      Math.max(1, cellSize - inset * 2),
    );
  }
}

function animate(time) {
  if (time - lastStep > 82) {
    step(time);
    draw();
    lastStep = time;
  }
  requestAnimationFrame(animate);
}

function eventToCell(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / cellSize);
  const y = Math.floor((event.clientY - rect.top) / cellSize);
  return { x, y };
}

function linkAtCell(x, y) {
  return wordHitAreas.find(
    (area) => x >= area.x1 && x <= area.x2 && y >= area.y1 && y <= area.y2,
  );
}

function setLiveCell(x, y) {
  if (x < 0 || x >= cols || y < 0 || y >= rows) return false;

  const cell = index(x, y);
  current[cell] = 1;
  age[cell] = 255;
  protectedUntil[cell] = performance.now() + 900;
  return true;
}

function drawCellLine(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  let changed = false;

  for (let i = 0; i <= steps; i += 1) {
    const x = Math.round(from.x + (dx * i) / steps);
    const y = Math.round(from.y + (dy * i) / steps);
    changed = setLiveCell(x, y) || changed;
  }

  if (changed) draw();
  return changed;
}

function addLiveCell(event) {
  const cell = eventToCell(event);
  const changed = setLiveCell(cell.x, cell.y);
  if (changed) draw();
  lastDrawnCell = cell;
  return changed;
}

function updateCursor(event) {
  if (isDrawing || pendingNavigation) return;
  const { x, y } = eventToCell(event);
  canvas.style.cursor = linkAtCell(x, y) ? "pointer" : "crosshair";
}

function startDrawing(event) {
  const { x, y } = eventToCell(event);
  pendingNavigation = linkAtCell(x, y) || null;
  if (pendingNavigation) {
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  isDrawing = true;
  lastDrawnCell = null;
  canvas.setPointerCapture(event.pointerId);
  addLiveCell(event);
}

function drawWhileDragging(event) {
  if (pendingNavigation) return;
  if (!isDrawing) return;
  const cell = eventToCell(event);
  if (lastDrawnCell) {
    drawCellLine(lastDrawnCell, cell);
  } else {
    addLiveCell(event);
  }
  lastDrawnCell = cell;
}

function stopDrawing(event) {
  if (pendingNavigation) {
    const { x, y } = eventToCell(event);
    const releasedOnSameLink = linkAtCell(x, y) === pendingNavigation;
    const href = pendingNavigation.href;
    pendingNavigation = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (releasedOnSameLink) window.location.href = href;
    return;
  }

  isDrawing = false;
  lastDrawnCell = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

window.addEventListener("resize", resize);
canvas.addEventListener("pointerdown", startDrawing);
canvas.addEventListener("pointermove", (event) => {
  updateCursor(event);
  drawWhileDragging(event);
});
canvas.addEventListener("pointerrawupdate", drawWhileDragging);
canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
canvas.addEventListener("pointerleave", () => {
  if (!isDrawing && !pendingNavigation) canvas.style.cursor = "default";
});

resize();
requestAnimationFrame(animate);
