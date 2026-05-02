/* ============================================================
   BOLLYWOOD HUNGAMA — app.js
   Pure vanilla JS, no framework, no build step.
   ============================================================ */

'use strict';

// ============================================================
// 1. CONSTANTS
// ============================================================

const STORAGE_KEY   = 'bh-game-state';
const MIN_PLAYERS   = 4;
const MAX_PLAYERS   = 12;
const GUESS_OPTIONS = 6;

const CATEGORY_LABELS = {
  film_title:    'Film Title',
  hero_dialogue: 'Famous Dialogue',
  celeb:         'Celebrity',
  song:          'Song',
  character:     'Character',
};

// ============================================================
// 2. STATE
// ============================================================

const DEFAULT_STATE = {
  players:              [],   // [{name, score}]
  round:                1,
  guesserIndex:         0,    // index into guesserRotation
  guesserRotation:      [],   // shuffled player indices, length = players*2
  roles:                {},   // {playerName: 'nice'|'naughty'}
  currentWord:          null, // {id, category, word, hint}
  clues:                [],   // [{playerName, clue, cancelled}]
  cluePlayerIndex:      0,    // which non-guesser is entering a clue
  roleRevealPlayerIndex:0,    // which non-guesser is seeing their role (0 = guesser announce)
  guessedWord:          null,
  usedWordIds:          [],
  guessOptions:         [],   // the 6 shuffled options shown to guesser
  phase:                'screen-home',
};

let STATE = { ...DEFAULT_STATE };
let WORDS = [];  // in-memory cache of words.json

// ============================================================
// 3. LOCALSTORAGE HELPERS
// ============================================================

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); } catch (_) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) STATE = { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (_) {
    STATE = { ...DEFAULT_STATE };
  }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
  STATE = { ...DEFAULT_STATE };
}

// ============================================================
// 4. SCREEN ROUTER
// ============================================================

function goTo(screenName) {
  document.querySelectorAll('[data-screen]').forEach(el => {
    el.classList.remove('screen-active');
  });
  const target = document.querySelector(`[data-screen="${screenName}"]`);
  if (target) {
    target.classList.add('screen-active');
    target.scrollTop = 0;
  }
  STATE.phase = screenName;
  saveState();
}

// ============================================================
// 5. WORDS LOADER
// ============================================================

async function loadWords() {
  if (WORDS.length > 0) return;
  try {
    const res = await fetch('./data/words.json');
    WORDS = await res.json();
  } catch (e) {
    console.error('Failed to load words.json', e);
    WORDS = [];
  }
}

// ============================================================
// 6. PURE UTILITIES
// ============================================================

function fisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildGuesserRotation(playerCount) {
  const base = Array.from({ length: playerCount }, (_, i) => i);
  return fisherYates([...base, ...base]);
}

function currentGuesserName() {
  return STATE.players[STATE.guesserRotation[STATE.guesserIndex]].name;
}

function nonGuessers() {
  const g = currentGuesserName();
  return STATE.players.filter(p => p.name !== g);
}

// ============================================================
// 7. ROLE ASSIGNMENT
// ============================================================

function assignRoles(playerNames, guesserName) {
  const others = playerNames.filter(n => n !== guesserName);
  const naughtyCount = Math.max(1, Math.floor(others.length / 3));
  const shuffled = fisherYates([...others]);
  const roles = {};
  shuffled.forEach((name, i) => {
    roles[name] = i < naughtyCount ? 'naughty' : 'nice';
  });
  return roles;
}

// ============================================================
// 8. WORD & DECOY SELECTION
// ============================================================

function pickWord() {
  let pool = WORDS.filter(w => !STATE.usedWordIds.includes(w.id));
  if (pool.length === 0) {
    STATE.usedWordIds = [];
    pool = [...WORDS];
  }
  const word = pool[Math.floor(Math.random() * pool.length)];
  STATE.usedWordIds.push(word.id);
  return word;
}

function buildGuessOptions(correctWord) {
  let sameCategory = WORDS.filter(
    w => w.category === correctWord.category && w.id !== correctWord.id
  );
  if (sameCategory.length < GUESS_OPTIONS - 1) {
    const extra = WORDS.filter(
      w => w.category !== correctWord.category && w.id !== correctWord.id
    );
    sameCategory = [...sameCategory, ...fisherYates(extra)];
  }
  const decoys = fisherYates(sameCategory).slice(0, GUESS_OPTIONS - 1).map(w => w.word);
  return fisherYates([correctWord.word, ...decoys]);
}

// ============================================================
// 9. CLUE VALIDATION
// ============================================================

function validateClue(raw, answerWord) {
  const clue = raw.trim();
  if (!clue) return { valid: false, error: 'Please enter a clue.' };
  if (/\s/.test(clue)) return { valid: false, error: 'One word only — no spaces!' };

  const norm = clue.toLowerCase();
  const answerTokens = answerWord.toLowerCase().split(/\s+/);
  if (answerTokens.includes(norm) || answerWord.toLowerCase() === norm) {
    return { valid: false, error: "You can't say the secret word!" };
  }
  return { valid: true, clue };
}

// ============================================================
// 10. DUPLICATE DETECTION
// ============================================================

function processDuplicates() {
  const counts = {};
  STATE.clues.forEach(c => {
    const n = c.clue.trim().toLowerCase();
    counts[n] = (counts[n] || 0) + 1;
  });
  STATE.clues = STATE.clues.map(c => ({
    ...c,
    cancelled: counts[c.clue.trim().toLowerCase()] > 1,
  }));
  saveState();
}

// ============================================================
// 11. SCORING ENGINE
// ============================================================

function calculateScore(guessedCorrectly, caughtName) {
  const guesserPlayer = STATE.players[STATE.guesserRotation[STATE.guesserIndex]];
  const results = [];

  const naughtyNames = Object.entries(STATE.roles)
    .filter(([, r]) => r === 'naughty')
    .map(([n]) => n);

  if (guessedCorrectly) {
    guesserPlayer.score += 2;
    results.push({ name: guesserPlayer.name, points: 2, reason: 'Correct guess!' });

    if (caughtName && naughtyNames.includes(caughtName)) {
      guesserPlayer.score += 1;
      results.push({ name: guesserPlayer.name, points: 1, reason: 'Caught the Naughty player!' });
    } else {
      naughtyNames.forEach(nn => {
        const p = STATE.players.find(pl => pl.name === nn);
        if (p) {
          p.score += 2;
          results.push({ name: p.name, points: 2, reason: 'Naughty survived uncaught!' });
        }
      });
    }
  } else {
    // Wrong guess — naughty survives
    naughtyNames.forEach(nn => {
      const p = STATE.players.find(pl => pl.name === nn);
      if (p) {
        p.score += 2;
        results.push({ name: p.name, points: 2, reason: 'Naughty survived (wrong guess)!' });
      }
    });
  }

  // Nice players with surviving clues
  STATE.clues
    .filter(c => !c.cancelled && STATE.roles[c.playerName] === 'nice')
    .forEach(c => {
      const p = STATE.players.find(pl => pl.name === c.playerName);
      if (p) {
        p.score += 1;
        results.push({ name: p.name, points: 1, reason: 'Good clue!' });
      }
    });

  saveState();
  return results;
}

// ============================================================
// 12. CONFETTI
// ============================================================

function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS  = ['#FFD700', '#C0392B', '#F5F5F5', '#27AE60', '#E74C3C', '#3498DB'];
  const COUNT   = 130;
  const FRAMES  = 130;

  const particles = Array.from({ length: COUNT }, () => ({
    x:        Math.random() * canvas.width,
    y:        Math.random() * canvas.height * -0.5,
    size:     Math.random() * 8 + 4,
    color:    COLORS[Math.floor(Math.random() * COLORS.length)],
    vx:       (Math.random() - 0.5) * 5,
    vy:       Math.random() * 5 + 2,
    rotation: Math.random() * 360,
    vr:       (Math.random() - 0.5) * 7,
    rect:     Math.random() > 0.45,
  }));

  let frame = 0;
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.12;
      p.rotation += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frame / FRAMES);
      if (p.rect) {
        ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    frame++;
    if (frame < FRAMES) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(tick);
}

// ============================================================
// 13. RENDER FUNCTIONS
// ============================================================

// --- Players Screen ---
function renderPlayersScreen() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  STATE.players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'player-input-row';
    row.innerHTML = `
      <input type="text" placeholder="Player ${i + 1}" value="${escHtml(p.name)}"
             data-index="${i}" autocomplete="off" autocorrect="off" spellcheck="false">
      <button class="btn-remove-player" data-index="${i}" aria-label="Remove player">✕</button>
    `;
    list.appendChild(row);
  });
  updatePlayerScreenUI();
}

function updatePlayerScreenUI() {
  const count = STATE.players.length;
  const hint  = document.getElementById('player-count-hint');
  const startBtn = document.getElementById('btn-start-game');
  const addBtn   = document.getElementById('btn-add-player');

  if (count < MIN_PLAYERS) {
    hint.textContent = `Need at least ${MIN_PLAYERS} players (${MIN_PLAYERS - count} more)`;
  } else if (count === MAX_PLAYERS) {
    hint.textContent = `${count} players — maximum reached`;
  } else {
    hint.textContent = `${count} player${count !== 1 ? 's' : ''}`;
  }

  startBtn.disabled = count < MIN_PLAYERS;
  addBtn.disabled   = count >= MAX_PLAYERS;
}

// --- Role Reveal Screen ---
function renderRoleRevealScreen() {
  const container = document.getElementById('role-reveal-content');
  container.innerHTML = '';

  const idx      = STATE.roleRevealPlayerIndex;
  const ng       = nonGuessers();
  const gName    = currentGuesserName();

  // Step 0: announce the guesser
  if (idx === 0) {
    container.innerHTML = `
      <p class="pass-instruction">Pass phone to</p>
      <p class="player-name-display">${escHtml(gName)}</p>
      <div class="guesser-announce">
        <div class="announce-emoji">🎯</div>
        <p class="announce-title">You are the Guesser!</p>
        <p class="announce-sub">Look away when everyone else sees the word. Don't peek at their role cards!</p>
      </div>
      <button class="btn btn-primary" id="btn-guesser-ok" style="max-width:320px;width:100%">Got it — Pass Phone</button>
    `;
    document.getElementById('btn-guesser-ok').addEventListener('click', () => {
      STATE.roleRevealPlayerIndex = 1;
      saveState();
      renderRoleRevealScreen();
    });
    return;
  }

  // Steps 1..n: each non-guesser sees their role
  const player = ng[idx - 1];
  if (!player) { startWordShowPhase(); return; }

  const role       = STATE.roles[player.name];
  const isNaughty  = role === 'naughty';
  const roleLabel  = isNaughty ? 'NAUGHTY' : 'NICE';
  const roleEmoji  = isNaughty ? '😈' : '😇';
  const backClass  = isNaughty ? 'role-naughty' : 'role-nice';
  const roleDesc   = isNaughty
    ? 'Give a clue that sounds helpful but leads the Guesser astray!'
    : 'Give a clear, helpful clue to help the Guesser win!';

  container.innerHTML = `
    <p class="pass-instruction">Pass phone to</p>
    <p class="player-name-display">${escHtml(player.name)}</p>
    <div class="flip-card" id="role-flip-card" style="max-width:320px">
      <div class="flip-card-inner">
        <div class="flip-card-front">
          <div class="tap-hint">Tap to reveal your role</div>
          <div class="card-icon">🎬</div>
        </div>
        <div class="flip-card-back ${backClass}">
          <div class="role-emoji">${roleEmoji}</div>
          <div class="role-label">${roleLabel}</div>
          <div class="role-description">${roleDesc}</div>
        </div>
      </div>
    </div>
    <p class="role-memorize-hint" id="memorize-hint" style="opacity:0;transition:opacity 0.4s">Memorise your role, then pass the phone</p>
    <div style="max-width:320px;width:100%;margin-top:8px">
      <button class="btn btn-primary" id="btn-role-done" style="display:none">Done — Pass Phone</button>
    </div>
  `;

  const card = document.getElementById('role-flip-card');
  card.addEventListener('click', () => {
    if (card.classList.contains('flipped')) return;
    card.classList.add('flipped');
    setTimeout(() => {
      document.getElementById('memorize-hint').style.opacity = '1';
      document.getElementById('btn-role-done').style.display = 'flex';
    }, 650);
  });

  document.getElementById('btn-role-done').addEventListener('click', () => {
    STATE.roleRevealPlayerIndex++;
    saveState();
    renderRoleRevealScreen();
  });
}

// --- Word Show Screen ---
function renderWordShowScreen() {
  const w = STATE.currentWord;
  document.getElementById('word-category-badge').textContent =
    CATEGORY_LABELS[w.category] || w.category;
  document.getElementById('word-text').textContent = w.word;
  document.getElementById('word-hint-text').textContent = w.hint;
  document.getElementById('guesser-name-word-show').textContent = currentGuesserName();
}

// --- Clue Entry ---
function renderCluePrivacyGate() {
  const ng     = nonGuessers();
  const player = ng[STATE.cluePlayerIndex];

  document.getElementById('clue-gate-player-name').textContent = player.name;
  document.getElementById('clue-privacy-gate').classList.remove('hidden');
  document.getElementById('clue-input-view').classList.add('hidden');
  document.getElementById('clue-input').value = '';
  document.getElementById('clue-validation-msg').textContent = '';
}

function renderClueInputView() {
  const ng     = nonGuessers();
  const player = ng[STATE.cluePlayerIndex];

  document.getElementById('clue-input-player-name').textContent = player.name;
  document.getElementById('clue-privacy-gate').classList.add('hidden');
  document.getElementById('clue-input-view').classList.remove('hidden');

  // Progress dots
  const dotsContainer = document.getElementById('clue-progress-dots');
  dotsContainer.innerHTML = '';
  ng.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'progress-dot' +
      (i < STATE.cluePlayerIndex ? ' done' : i === STATE.cluePlayerIndex ? ' active' : '');
    dotsContainer.appendChild(dot);
  });

  const input = document.getElementById('clue-input');
  input.value = '';
  document.getElementById('clue-validation-msg').textContent = '';
  setTimeout(() => {
    try { input.focus(); } catch (_) {}
  }, 350);
}

// --- Guess Screen ---
function renderGuessScreen() {
  const cluesContainer = document.getElementById('surviving-clues');
  cluesContainer.innerHTML = '';

  const allClues = STATE.clues;
  if (allClues.length === 0) {
    cluesContainer.innerHTML = '<p class="clues-empty-hint">No clues were submitted!</p>';
  } else {
    allClues.forEach(c => {
      const div = document.createElement('div');
      div.className = 'clue-item' + (c.cancelled ? ' cancelled' : '');
      div.textContent = c.clue;
      cluesContainer.appendChild(div);
    });
  }

  // Guess grid
  const grid = document.getElementById('guess-grid');
  grid.innerHTML = '';
  STATE.guessOptions.forEach(word => {
    const btn = document.createElement('button');
    btn.className   = 'guess-option';
    btn.textContent = word;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.guess-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      STATE.guessedWord = word;
      document.getElementById('btn-confirm-guess').disabled = false;
    });
    grid.appendChild(btn);
  });

  document.getElementById('btn-confirm-guess').disabled = true;
  STATE.guessedWord = null;
}

// --- Catch Screen ---
function renderCatchScreen() {
  const grid = document.getElementById('catch-player-grid');
  grid.innerHTML = '';
  let selectedName = null;

  // Add a confirm button that appears after selection
  const confirmWrap = document.createElement('div');
  confirmWrap.style.cssText = 'grid-column:1/-1;margin-top:4px';
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-danger hidden';
  confirmBtn.textContent = 'That\'s the Naughty player!';
  confirmBtn.addEventListener('click', () => finishRound(selectedName));
  confirmWrap.appendChild(confirmBtn);

  nonGuessers().forEach(player => {
    const btn = document.createElement('button');
    btn.className    = 'player-grid-btn';
    btn.textContent  = player.name;
    btn.dataset.name = player.name;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-grid-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedName = player.name;
      confirmBtn.classList.remove('hidden');
    });
    grid.appendChild(btn);
  });

  grid.appendChild(confirmWrap);
}

// --- Round Result ---
function renderRoundResultScreen(results) {
  document.getElementById('result-round-num').textContent = STATE.round;

  // Show what the word was
  const reveal = document.getElementById('round-result-reveal');
  reveal.innerHTML = `
    <div style="text-align:center;margin-bottom:8px">
      <p style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-text-muted)">The word was</p>
      <p style="font-family:var(--font-display);font-size:var(--text-2xl);color:var(--color-gold)">${escHtml(STATE.currentWord.word)}</p>
    </div>
  `;

  const list = document.getElementById('round-result-list');
  list.innerHTML = '';

  if (results.length === 0) {
    list.innerHTML = '<p class="no-points-msg">No points scored this round.</p>';
    return;
  }

  results.forEach((r, i) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.style.animationDelay = `${i * 120}ms`;
    item.innerHTML = `
      <div class="result-item-left">
        <span class="result-player-name">${escHtml(r.name)}</span>
        <span class="result-reason">${escHtml(r.reason)}</span>
      </div>
      <span class="result-points">+${r.points}</span>
    `;
    list.appendChild(item);
  });
}

// --- Scoreboard ---
function renderScoreboard() {
  const totalRounds = STATE.players.length * 2;
  document.getElementById('sb-round-num').textContent    = STATE.round;
  document.getElementById('sb-total-rounds').textContent = totalRounds;

  const sorted = [...STATE.players].sort((a, b) => b.score - a.score);
  const list   = document.getElementById('scoreboard-list');
  list.innerHTML = '';

  sorted.forEach((p, i) => {
    const isLeader = i === 0;
    const rankClass = i === 0 ? 'first' : i === 1 ? 'second' : i === 2 ? 'third' : '';
    const row = document.createElement('div');
    row.className = 'score-row' + (isLeader ? ' leader' : '');
    row.innerHTML = `
      <span class="score-rank ${rankClass}">${i + 1}</span>
      <span class="score-name">${escHtml(p.name)}</span>
      <span class="score-badge">${p.score}</span>
    `;
    list.appendChild(row);
  });
}

// --- Final Screen ---
function renderFinalScreen() {
  const sorted = [...STATE.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  document.getElementById('winner-name').textContent       = winner.name;
  document.getElementById('winner-score-text').textContent = `${winner.score} points`;

  const table = document.getElementById('final-score-table');
  table.innerHTML = '';
  sorted.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'final-table-row';
    row.innerHTML = `
      <span class="final-rank">${i + 1}</span>
      <span class="final-name">${escHtml(p.name)}</span>
      <span class="final-pts">${p.score}</span>
    `;
    table.appendChild(row);
  });

  setTimeout(launchConfetti, 300);
}

// ============================================================
// 14. GAME FLOW FUNCTIONS
// ============================================================

function startNewGame() {
  const gName = currentGuesserName();
  STATE.roles              = assignRoles(STATE.players.map(p => p.name), gName);
  STATE.currentWord        = pickWord();
  STATE.guessOptions       = buildGuessOptions(STATE.currentWord);
  STATE.clues              = [];
  STATE.cluePlayerIndex    = 0;
  STATE.roleRevealPlayerIndex = 0;
  STATE.guessedWord        = null;
  saveState();

  renderRoleRevealScreen();
  goTo('screen-role-reveal');
}

function startWordShowPhase() {
  renderWordShowScreen();
  goTo('screen-word-show');
}

function startCluePhase() {
  STATE.clues           = [];
  STATE.cluePlayerIndex = 0;
  saveState();
  renderCluePrivacyGate();
  goTo('screen-clue-entry');
}

function showNextCluePlayer() {
  const ng = nonGuessers();
  if (STATE.cluePlayerIndex >= ng.length) {
    processDuplicates();
    renderGuessScreen();
    goTo('screen-guess');
    return;
  }
  renderCluePrivacyGate();
  goTo('screen-clue-entry');
}

function submitClue() {
  const input   = document.getElementById('clue-input');
  const errEl   = document.getElementById('clue-validation-msg');
  const { valid, error, clue } = validateClue(input.value, STATE.currentWord.word);

  if (!valid) {
    errEl.textContent = error;
    input.focus();
    return;
  }

  errEl.textContent = '';
  const ng = nonGuessers();
  STATE.clues.push({
    playerName: ng[STATE.cluePlayerIndex].name,
    clue,
    cancelled: false,
  });
  STATE.cluePlayerIndex++;
  saveState();
  showNextCluePlayer();
}

function confirmGuess() {
  const selected   = STATE.guessedWord;
  const correct    = STATE.currentWord.word;
  const isCorrect  = selected.toLowerCase() === correct.toLowerCase();

  if (isCorrect) {
    launchConfetti();
    renderCatchScreen();
    goTo('screen-catch');
  } else {
    const results = calculateScore(false, null);
    renderRoundResultScreen(results);
    goTo('screen-round-result');
  }
}

function finishRound(caughtName) {
  const isCorrect = STATE.guessedWord &&
    STATE.guessedWord.toLowerCase() === STATE.currentWord.word.toLowerCase();
  const results = calculateScore(isCorrect, caughtName || null);
  renderRoundResultScreen(results);
  goTo('screen-round-result');
}

function advanceRound() {
  const totalRounds = STATE.players.length * 2;

  if (STATE.round >= totalRounds ||
      STATE.guesserIndex + 1 >= STATE.guesserRotation.length) {
    renderFinalScreen();
    goTo('screen-final');
    return;
  }

  STATE.round++;
  STATE.guesserIndex++;
  STATE.roleRevealPlayerIndex = 0;
  STATE.clues           = [];
  STATE.cluePlayerIndex = 0;
  STATE.guessedWord     = null;

  const gName = currentGuesserName();
  STATE.roles        = assignRoles(STATE.players.map(p => p.name), gName);
  STATE.currentWord  = pickWord();
  STATE.guessOptions = buildGuessOptions(STATE.currentWord);
  saveState();

  renderRoleRevealScreen();
  goTo('screen-role-reveal');
}

// ============================================================
// 15. PLAYER SETUP HELPERS
// ============================================================

function getPlayerNamesFromDOM() {
  return Array.from(
    document.querySelectorAll('#player-list input')
  ).map(el => el.value.trim());
}

function validateAndStartGame() {
  const names    = getPlayerNamesFromDOM();
  const errEl    = document.getElementById('player-validation');
  const filtered = names.filter(n => n.length > 0);

  if (filtered.length < MIN_PLAYERS) {
    errEl.textContent = `Enter at least ${MIN_PLAYERS} player names.`;
    return;
  }

  const lower = filtered.map(n => n.toLowerCase());
  const dupes = lower.filter((n, i) => lower.indexOf(n) !== i);
  if (dupes.length > 0) {
    errEl.textContent = 'Duplicate names found — each player needs a unique name.';
    return;
  }

  errEl.textContent = '';
  STATE.players        = filtered.map(name => ({ name, score: 0 }));
  STATE.round          = 1;
  STATE.guesserIndex   = 0;
  STATE.usedWordIds    = [];
  STATE.guesserRotation = buildGuesserRotation(filtered.length);
  saveState();
  startNewGame();
}

// ============================================================
// 16. PWA INSTALL PROMPT
// ============================================================

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const hint = document.getElementById('android-install-hint');
  if (hint) hint.classList.add('visible');
});

function maybeShowIOSHint() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;
  if (isIOS && !standalone) {
    const hint = document.getElementById('ios-install-hint');
    if (hint) hint.classList.add('visible');
  }
}

// Safari bfcache fix
window.addEventListener('pageshow', e => {
  if (e.persisted) {
    loadState();
    resumeToPhase();
  }
});

// ============================================================
// 17. ESCAPE HELPER
// ============================================================

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// 18. RESUME STATE
// ============================================================

function resumeToPhase() {
  const safe = ['screen-home', 'screen-players', 'screen-rules'];
  if (safe.includes(STATE.phase)) {
    goTo(STATE.phase);
    if (STATE.phase === 'screen-players') renderPlayersScreen();
  } else {
    // Mid-game phases: try to resume intelligently
    switch (STATE.phase) {
      case 'screen-role-reveal':
        renderRoleRevealScreen();
        goTo('screen-role-reveal');
        break;
      case 'screen-word-show':
        renderWordShowScreen();
        goTo('screen-word-show');
        break;
      case 'screen-clue-entry':
        renderCluePrivacyGate();
        goTo('screen-clue-entry');
        break;
      case 'screen-guess':
        renderGuessScreen();
        goTo('screen-guess');
        break;
      case 'screen-catch':
        renderCatchScreen();
        goTo('screen-catch');
        break;
      case 'screen-scoreboard':
        renderScoreboard();
        goTo('screen-scoreboard');
        break;
      case 'screen-final':
        renderFinalScreen();
        goTo('screen-final');
        break;
      default:
        clearState();
        goTo('screen-home');
    }
  }
}

// ============================================================
// 19. EVENT BINDINGS
// ============================================================

function bindEvents() {

  // Home
  document.getElementById('btn-start').addEventListener('click', () => {
    // Pre-populate 4 empty player slots
    if (STATE.players.length === 0) {
      STATE.players = Array.from({ length: 4 }, () => ({ name: '', score: 0 }));
    }
    renderPlayersScreen();
    goTo('screen-players');
  });

  document.getElementById('btn-how-to-play').addEventListener('click', () => {
    goTo('screen-rules');
  });

  // Rules
  document.getElementById('btn-close-rules').addEventListener('click', () => {
    goTo('screen-home');
  });

  // Players screen — event delegation for dynamic inputs
  document.getElementById('player-list').addEventListener('input', e => {
    if (e.target.tagName === 'INPUT') {
      const i = parseInt(e.target.dataset.index, 10);
      STATE.players[i].name = e.target.value;
      document.getElementById('player-validation').textContent = '';
      updatePlayerScreenUI();
    }
  });

  document.getElementById('player-list').addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove-player');
    if (!btn) return;
    const i = parseInt(btn.dataset.index, 10);
    if (STATE.players.length <= MIN_PLAYERS) return;
    STATE.players.splice(i, 1);
    renderPlayersScreen();
  });

  document.getElementById('btn-add-player').addEventListener('click', () => {
    if (STATE.players.length >= MAX_PLAYERS) return;
    STATE.players.push({ name: '', score: 0 });
    renderPlayersScreen();
    // Focus the new input
    const inputs = document.querySelectorAll('#player-list input');
    const last   = inputs[inputs.length - 1];
    if (last) setTimeout(() => last.focus(), 50);
  });

  document.getElementById('btn-start-game').addEventListener('click', validateAndStartGame);

  document.getElementById('btn-back-home').addEventListener('click', () => {
    goTo('screen-home');
  });

  // Word show
  document.getElementById('btn-word-seen').addEventListener('click', startCluePhase);

  // Clue entry — ready button
  document.getElementById('btn-ready-for-clue').addEventListener('click', renderClueInputView);

  // Clue submit — button and Enter key
  document.getElementById('btn-submit-clue').addEventListener('click', submitClue);
  document.getElementById('clue-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitClue(); }
  });

  // Clue input focus → scroll into view (keyboard occlusion fix)
  document.getElementById('clue-input').addEventListener('focus', () => {
    setTimeout(() => {
      document.getElementById('clue-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 320);
  });

  // Guess confirm
  document.getElementById('btn-confirm-guess').addEventListener('click', confirmGuess);

  // Catch — skip button
  document.getElementById('btn-skip-catch').addEventListener('click', () => finishRound(null));

  // Round result → scoreboard
  document.getElementById('btn-to-scoreboard').addEventListener('click', () => {
    renderScoreboard();
    goTo('screen-scoreboard');
  });

  // Scoreboard → next round
  document.getElementById('btn-next-round').addEventListener('click', advanceRound);

  // Final → play again
  document.getElementById('btn-play-again').addEventListener('click', () => {
    clearState();
    goTo('screen-home');
  });
}

// ============================================================
// 20. APP INIT
// ============================================================

async function initApp() {
  loadState();
  await loadWords();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }

  maybeShowIOSHint();
  bindEvents();
  resumeToPhase();
}

document.addEventListener('DOMContentLoaded', initApp);
