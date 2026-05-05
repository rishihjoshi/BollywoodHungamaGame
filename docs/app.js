/* ============================================================
   BOLLYWOOD HUNGAMA — app.js  (v2 Sholay Edition)
   Hot-seat phone-passing game. No clue input. Verbal play is offline.
   ============================================================ */
'use strict';

// ============================================================
// 1. CHARACTER DATA
// ============================================================

const DAKU_CHARS = [
  { name: 'Gabbar',  team: 'DAKU', emoji: '💀', flavour: '"Kitne aadmi the?"' },
  { name: 'Sambha',  team: 'DAKU', emoji: '🔫', flavour: '"Poore pachaas hazaar!"' },
  { name: 'Kaalia',  team: 'DAKU', emoji: '⚔️',  flavour: "Gabbar's loyal foot soldier." },
];

const GAON_CHARS = [
  { name: 'Veeru',          team: 'GAON', emoji: '🤠', flavour: '"Basanti, in kutton ke saamne mat nachna."' },
  { name: 'Jay',            team: 'GAON', emoji: '🃏', flavour: 'The quiet one. Plays cards with fate.' },
  { name: 'Thakur',         team: 'GAON', emoji: '👁️', flavour: 'Hands tied. Eyes burning with justice.' },
  { name: 'Basanti',        team: 'GAON', emoji: '🗣️', flavour: 'Talks faster than her tonga horse.' },
  { name: 'Radha',          team: 'GAON', emoji: '🕯️', flavour: "Thakur's widowed daughter-in-law. Silent strength." },
  { name: 'Baldev Singh',   team: 'GAON', emoji: '😟', flavour: "Basanti's worried Mausi-ka-pati." },
  { name: 'Mausiji',        team: 'GAON', emoji: '🎭', flavour: "Drama queen. Basanti's aunt." },
  { name: 'Ahmed',          team: 'GAON', emoji: '📜', flavour: 'The village elder who knows everything.' },
  { name: 'Soorma Bhopali', team: 'GAON', emoji: '🥸', flavour: 'All talk, no action. Still fun at parties.' },
  { name: 'Ramlal',         team: 'GAON', emoji: '🏡', flavour: "Thakur's loyal house help." },
  { name: 'Imaam Saheb',    team: 'GAON', emoji: '🕌', flavour: "Ahmed's father. Wise village counsel." },
  { name: 'Hariram Naai',   team: 'GAON', emoji: '✂️', flavour: 'The village barber. Hears all gossip.' },
  { name: 'Jailor',         team: 'GAON', emoji: '🔑', flavour: 'Reformed. On the side of good now.' },
  { name: 'Gaonwale',       team: 'GAON', emoji: '👨‍🌾', flavour: 'Generic villager. Unknown but present.' },
];

const CATEGORY_LABELS = {
  film_title:    'Film Title',
  hero_dialogue: 'Famous Dialogue',
  celeb:         'Celebrity',
  song:          'Song',
  character:     'Character',
};

// ============================================================
// 2. CONSTANTS
// ============================================================

const MIN_PLAYERS   = 3;
const MAX_PLAYERS   = 12;
const STORAGE_GAME  = 'bh-game-v2';
const STORAGE_SCORES= 'bh-scores-v2';

// ============================================================
// 3. STATE
// ============================================================

const DEFAULT_STATE = {
  phase:              'screen-home',
  players:            [], // [{name, role:'daku'|'gaon', char:{name,team,emoji,flavour}}]
  dakuCount:          0,
  showCatToDaku:      true,
  currentWord:        null, // word entry from words.json (may include imageUrl)
  usedWordIds:        [],
  roleRevealIndex:    0,  // 0..players.length-1
  wordRevealIndex:    0,  // 0..players.length-1
  roundResult:        {}, // {Gabbar:null|true|false, Sambha:null|true|false, Kaalia:null|true|false}
  roundsThisSession:  0,
};

let STATE = { ...DEFAULT_STATE };
let WORDS = [];

// ============================================================
// 4. SCORES (persisted across sessions)
// ============================================================

const DEFAULT_SCORES = {
  roundsPlayed: 0,
  gaonWins:     0,
  dakuWins:     0,
  players:      [], // [{name, timesGabbar, timesCaught}]
};

let SCORES = { ...DEFAULT_SCORES };

// ============================================================
// 5. PERSISTENCE
// ============================================================

function saveState() {
  try { localStorage.setItem(STORAGE_GAME, JSON.stringify(STATE)); } catch (_) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_GAME);
    if (raw) STATE = { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (_) { STATE = { ...DEFAULT_STATE }; }
}

function saveScores() {
  try { localStorage.setItem(STORAGE_SCORES, JSON.stringify(SCORES)); } catch (_) {}
}

function loadScores() {
  try {
    const raw = localStorage.getItem(STORAGE_SCORES);
    if (raw) SCORES = { ...DEFAULT_SCORES, ...JSON.parse(raw) };
  } catch (_) { SCORES = { ...DEFAULT_SCORES }; }
}

function resetScores() {
  SCORES = { ...DEFAULT_SCORES };
  saveScores();
}

// ============================================================
// 6. SCREEN ROUTER
// ============================================================

function goTo(screenName) {
  document.querySelectorAll('[data-screen]').forEach(el => el.classList.remove('screen-active'));
  const target = document.querySelector(`[data-screen="${screenName}"]`);
  if (target) { target.classList.add('screen-active'); target.scrollTop = 0; }
  STATE.phase = screenName;
  saveState();
}

// ============================================================
// 7. ABANDON MODAL
// ============================================================

function showAbandonModal(onConfirm) {
  const modal = document.getElementById('abandon-modal');
  modal.classList.remove('hidden');

  const stay    = document.getElementById('btn-abandon-cancel');
  const confirm = document.getElementById('btn-abandon-confirm');

  const cleanup = () => {
    modal.classList.add('hidden');
    stay.removeEventListener('click', onStay);
    confirm.removeEventListener('click', onGo);
  };

  const onStay = () => cleanup();
  const onGo   = () => { cleanup(); onConfirm(); };

  stay.addEventListener('click', onStay);
  confirm.addEventListener('click', onGo);
}

function abandonToHome() {
  STATE = { ...DEFAULT_STATE };
  saveState();
  goTo('screen-home');
}

// ============================================================
// 8. WORDS LOADER
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
// 9. UTILITIES
// ============================================================

function fisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function calcDakuCount(n) {
  if (n <= 5) return 1;
  if (n <= 8) return 2;
  return 3;
}

function getDakuNames(count) {
  return ['Gabbar', 'Sambha', 'Kaalia'].slice(0, count);
}

// ============================================================
// 10. ROLE ASSIGNMENT
// ============================================================

function assignRoles(playerNames) {
  const count = playerNames.length;
  const dakuCount = calcDakuCount(count);
  const shuffledPlayers = fisherYates([...playerNames]);

  // Assign Daku characters to first dakuCount shuffled players
  const dakuSlots = DAKU_CHARS.slice(0, dakuCount);
  // Shuffle Gaon pool and take what we need
  const gaonPool  = fisherYates([...GAON_CHARS]);

  let gaonIdx = 0;
  return shuffledPlayers.map((name, i) => {
    if (i < dakuCount) {
      return { name, role: 'daku', char: dakuSlots[i] };
    } else {
      // If we run out of unique GAON chars, suffix Gaonwale
      let char = gaonPool[gaonIdx];
      if (!char) {
        char = { ...GAON_CHARS[GAON_CHARS.length - 1], name: `Gaonwale ${gaonIdx - GAON_CHARS.length + 2}` };
      }
      gaonIdx++;
      return { name, role: 'gaon', char };
    }
  });
}

// ============================================================
// 11. WORD SELECTION
// ============================================================

function pickWord() {
  let pool = WORDS.filter(w => !STATE.usedWordIds.includes(w.id));
  if (pool.length === 0) { STATE.usedWordIds = []; pool = [...WORDS]; }
  const word = pool[Math.floor(Math.random() * pool.length)];
  STATE.usedWordIds.push(word.id);
  return word;
}

// ============================================================
// 12. SETUP SCREEN
// ============================================================

function renderSetupScreen() {
  // Keep existing player names or start with 3 empty slots
  if (STATE.players.length === 0) {
    STATE.players = Array.from({ length: 3 }, () => ({ name: '' }));
  }
  rebuildPlayerList();
  updateSetupUI();
}

function rebuildPlayerList() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  STATE.players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <input type="text" value="${escHtml(p.name)}" placeholder="Player ${i + 1}"
             data-index="${i}" autocomplete="off" autocorrect="off" spellcheck="false"
             autocapitalize="words">
      <button class="btn-remove" data-index="${i}" aria-label="Remove player">✕</button>
    `;
    list.appendChild(row);
  });
}

function updateSetupUI() {
  const count    = STATE.players.length;
  const daku     = calcDakuCount(count);
  const names    = getDakuNames(daku);
  const addBtn   = document.getElementById('btn-add-player');
  const startBtn = document.getElementById('btn-start-game');
  const infoEl   = document.getElementById('daku-info-text');
  const valid    = STATE.players.filter(p => p.name.trim()).length >= MIN_PLAYERS;

  const dakuLabel = names.join(', ');
  infoEl.innerHTML = `<strong>${daku} Daku</strong> in this game: ${escHtml(dakuLabel)}`;

  addBtn.disabled   = count >= MAX_PLAYERS;
  startBtn.disabled = !valid;
  document.getElementById('setup-validation').textContent = '';
}

// ============================================================
// 13. ROLE REVEAL SCREEN
// ============================================================

function renderRoleRevealForPlayer(idx) {
  const player = STATE.players[idx];

  // Gate: privacy pass screen
  const gate    = document.getElementById('rr-privacy-gate');
  const cardView= document.getElementById('rr-card-view');
  gate.classList.remove('hidden');
  cardView.classList.add('hidden');

  document.getElementById('rr-gate-name').textContent = player.name;

  // Wire up reveal button (single-use)
  const revealBtn = document.getElementById('btn-rr-reveal');
  revealBtn.replaceWith(revealBtn.cloneNode(true)); // remove old listeners
  const freshReveal = document.getElementById('btn-rr-reveal');
  freshReveal.addEventListener('click', () => {
    showRoleCard(idx);
  }, { once: true });
}

function showRoleCard(idx) {
  const player = STATE.players[idx];
  const char   = player.char;
  const isDaku  = player.role === 'daku';

  const gate     = document.getElementById('rr-privacy-gate');
  const cardView = document.getElementById('rr-card-view');
  gate.classList.add('hidden');
  cardView.classList.remove('hidden');

  document.getElementById('rr-card-name').textContent = player.name;

  const back = document.getElementById('rr-card-back');
  back.className = `flip-card-back ${isDaku ? 'card-daku' : 'card-gaon'}`;

  document.getElementById('rr-team-badge').textContent  = char.team;
  document.getElementById('rr-char-name').innerHTML     = `${char.emoji} ${escHtml(char.name)}`;
  document.getElementById('rr-flavour').textContent     = char.flavour;

  // Trigger flip (remove, then re-add flipped after one frame)
  const card = document.getElementById('rr-flip-card');
  card.classList.remove('flipped');
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('flipped')));

  // Wire Done button
  const doneBtn = document.getElementById('btn-rr-done');
  doneBtn.replaceWith(doneBtn.cloneNode(true));
  const freshDone = document.getElementById('btn-rr-done');
  freshDone.addEventListener('click', () => {
    const next = idx + 1;
    STATE.roleRevealIndex = next;
    saveState();
    if (next >= STATE.players.length) {
      // All roles revealed — move to word reveal
      STATE.wordRevealIndex = 0;
      saveState();
      renderWordRevealForPlayer(0);
      goTo('screen-word-reveal');
    } else {
      renderRoleRevealForPlayer(next);
    }
  }, { once: true });
}

// ============================================================
// 14. WORD REVEAL SCREEN
// ============================================================

function renderWordRevealForPlayer(idx) {
  const player = STATE.players[idx];

  const gate   = document.getElementById('wr-privacy-gate');
  const reveal = document.getElementById('wr-reveal-view');
  gate.classList.remove('hidden');
  reveal.classList.add('hidden');

  document.getElementById('wr-gate-name').textContent = player.name;

  const revealBtn = document.getElementById('btn-wr-reveal');
  revealBtn.replaceWith(revealBtn.cloneNode(true));
  document.getElementById('btn-wr-reveal').addEventListener('click', () => {
    showWordReveal(idx);
  }, { once: true });
}

function showWordReveal(idx) {
  const player  = STATE.players[idx];
  const word    = STATE.currentWord;
  const isDaku  = player.role === 'daku';
  const catLabel= CATEGORY_LABELS[word.category] || word.category;

  const gate   = document.getElementById('wr-privacy-gate');
  const reveal = document.getElementById('wr-reveal-view');
  gate.classList.add('hidden');
  reveal.classList.remove('hidden');

  const content = document.getElementById('wr-content');

  if (!isDaku) {
    // GAON: full word + hint + image
    let imgHtml = '';
    if (word.imageUrl) {
      imgHtml = `<img src="${escHtml(word.imageUrl)}" alt="${escHtml(word.word)}" class="wr-image"
                      onerror="this.style.display='none'">`;
    }
    content.innerHTML = `
      <div class="word-reveal-gaon">
        <div class="wr-cat-badge">${escHtml(catLabel)}</div>
        ${imgHtml}
        <div class="wr-word">${escHtml(word.word)}</div>
        <div class="wr-hint">${escHtml(word.hint)}</div>
      </div>
    `;
  } else if (STATE.showCatToDaku) {
    // DAKU (toggle ON): show category only
    content.innerHTML = `
      <div class="word-reveal-daku">
        <div style="font-size:40px">💀</div>
        <div class="wr-daku-label">You are DAKU — Category only</div>
        <div class="wr-daku-cat">${escHtml(catLabel)}</div>
        <div class="wr-daku-note">Blend in. Give a plausible clue without knowing the word.</div>
      </div>
    `;
  } else {
    // DAKU (toggle OFF): see nothing
    content.innerHTML = `
      <div class="word-reveal-daku-blind">
        <div style="font-size:40px">🙈</div>
        <div style="font-family:var(--font-display);font-size:1.25rem;color:var(--color-gold);margin:8px 0">You are DAKU</div>
        <div style="font-size:0.875rem;color:var(--color-text-muted);line-height:1.6">
          You don't see the word.<br>Listen carefully and bluff!
        </div>
      </div>
    `;
  }

  // Wire Done button
  const doneBtn = document.getElementById('btn-wr-done');
  doneBtn.replaceWith(doneBtn.cloneNode(true));
  document.getElementById('btn-wr-done').addEventListener('click', () => {
    const next = idx + 1;
    STATE.wordRevealIndex = next;
    saveState();
    if (next >= STATE.players.length) {
      // All words revealed — offline play
      goTo('screen-offline-play');
    } else {
      renderWordRevealForPlayer(next);
    }
  }, { once: true });
}

// ============================================================
// 15. END SCREEN
// ============================================================

function renderEndScreen() {
  const word = STATE.currentWord;

  // Round label
  document.getElementById('end-round-label').textContent =
    `Round ${SCORES.roundsPlayed + 1}`;

  // Secret word
  document.getElementById('end-word').textContent = word.word;
  document.getElementById('end-word-hint').textContent = word.hint;

  // Image
  const imgWrap = document.getElementById('end-word-image-wrap');
  imgWrap.innerHTML = word.imageUrl
    ? `<img src="${escHtml(word.imageUrl)}" alt="${escHtml(word.word)}"
            style="width:100px;height:140px;object-fit:cover;border-radius:8px;border:2px solid var(--color-border)"
            onerror="this.style.display='none'">`
    : '';

  // Daku reveals
  const dakuPlayers = STATE.players.filter(p => p.role === 'daku');
  const dakuList    = document.getElementById('daku-reveal-list');
  dakuList.innerHTML = '';
  dakuPlayers.forEach(p => {
    const row = document.createElement('div');
    row.className = 'daku-reveal-row';
    row.innerHTML = `
      <span class="daku-reveal-player">${escHtml(p.name)}</span>
      <span class="daku-reveal-char">${escHtml(p.char.emoji)} ${escHtml(p.char.name)}</span>
    `;
    dakuList.appendChild(row);
  });

  // Record section: YES/NO per Daku
  STATE.roundResult = {};
  const catchList = document.getElementById('catch-record-list');
  catchList.innerHTML = '';
  dakuPlayers.forEach(p => {
    STATE.roundResult[p.char.name] = null;
    const row = document.createElement('div');
    row.className = 'catch-row';
    row.innerHTML = `
      <div class="catch-row-label">
        Caught <span class="char-name">${escHtml(p.char.name)}</span>?
        <span style="color:var(--color-text-muted);font-size:0.8rem"> (${escHtml(p.name)})</span>
      </div>
      <div class="yes-no-btns">
        <button class="yn-btn yes" data-char="${escHtml(p.char.name)}" data-val="true">YES</button>
        <button class="yn-btn no"  data-char="${escHtml(p.char.name)}" data-val="false">NO</button>
      </div>
    `;
    catchList.appendChild(row);
  });

  // Wire YES/NO buttons
  catchList.addEventListener('click', e => {
    const btn = e.target.closest('.yn-btn');
    if (!btn) return;
    const charName = btn.dataset.char;
    const val      = btn.dataset.val === 'true';
    STATE.roundResult[charName] = val;

    // Update button styles
    const parent = btn.closest('.yes-no-btns');
    parent.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Check if all recorded
    const allRecorded = Object.values(STATE.roundResult).every(v => v !== null);
    if (allRecorded) finalizeRound();
  });

  // Hide banner
  document.getElementById('round-result-banner').className = 'round-result-banner';

  // Render scoreboard
  renderEndScoreboard();
}

function finalizeRound() {
  const allCaught = Object.values(STATE.roundResult).every(v => v === true);
  const gaonWins  = allCaught;

  // Update scores
  SCORES.roundsPlayed++;
  if (gaonWins) SCORES.gaonWins++;
  else           SCORES.dakuWins++;

  // Per-player stats
  STATE.players.forEach(p => {
    let entry = SCORES.players.find(s => s.name === p.name);
    if (!entry) {
      entry = { name: p.name, timesGabbar: 0, timesCaught: 0 };
      SCORES.players.push(entry);
    }
    if (p.char.name === 'Gabbar') entry.timesGabbar++;
    if (p.role === 'daku' && STATE.roundResult[p.char.name] === true) entry.timesCaught++;
  });

  saveScores();
  STATE.roundsThisSession++;
  saveState();

  // Show banner
  const banner    = document.getElementById('round-result-banner');
  const icon      = document.getElementById('banner-icon');
  const title     = document.getElementById('banner-title');
  const sub       = document.getElementById('banner-sub');

  if (gaonWins) {
    banner.className = 'round-result-banner gaon-win';
    icon.textContent  = '🎉';
    title.textContent = 'Gaon Wins!';
    sub.textContent   = 'All Dakus identified. Ramgarh is safe!';
    launchConfetti();
  } else {
    banner.className = 'round-result-banner daku-win';
    icon.textContent  = '💀';
    title.textContent = 'Daku Wins!';
    sub.textContent   = 'At least one Daku escaped. Gabbar reigns!';
  }

  banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  renderEndScoreboard();
}

function renderEndScoreboard() {
  document.getElementById('end-stat-rounds').textContent = SCORES.roundsPlayed;
  document.getElementById('end-stat-gaon').textContent   = SCORES.gaonWins;
  document.getElementById('end-stat-daku').textContent   = SCORES.dakuWins;

  // Build per-player table sorted by rounds played as Gabbar desc (fun stat)
  const list = document.getElementById('end-score-list');
  list.innerHTML = '';
  const sorted = [...SCORES.players].sort((a, b) => b.timesGabbar - a.timesGabbar);
  sorted.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'score-row' + (i === 0 && p.timesGabbar > 0 ? ' leader' : '');
    const rankClass = i === 0 ? 'first' : i === 1 ? 'second' : i === 2 ? 'third' : '';
    row.innerHTML = `
      <span class="score-rank ${rankClass}">${i + 1}</span>
      <span class="score-name">${escHtml(p.name)}</span>
      <span style="font-size:0.75rem;color:var(--color-text-muted);text-align:right;line-height:1.4">
        Gabbar ×${p.timesGabbar}<br>Caught ×${p.timesCaught}
      </span>
    `;
    list.appendChild(row);
  });
}

// ============================================================
// 16. SCORES SCREEN
// ============================================================

function renderScoresScreen() {
  document.getElementById('stat-rounds').textContent = SCORES.roundsPlayed;
  document.getElementById('stat-gaon').textContent   = SCORES.gaonWins;
  document.getElementById('stat-daku').textContent   = SCORES.dakuWins;

  const table  = document.getElementById('player-stat-table');
  table.innerHTML = '';
  if (SCORES.players.length === 0) {
    table.innerHTML = '<p style="font-size:0.875rem;color:var(--color-text-muted);text-align:center;padding:20px">No games played yet.</p>';
    return;
  }
  SCORES.players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'player-stat-row';
    row.innerHTML = `
      <span class="player-stat-name">${escHtml(p.name)}</span>
      <span class="player-stat-tag">Gabbar ×${p.timesGabbar}</span>
      <span class="player-stat-tag">Caught ×${p.timesCaught}</span>
    `;
    table.appendChild(row);
  });
}

// ============================================================
// 17. CONFETTI
// ============================================================

function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ['#FFD700','#C0392B','#F5F5F5','#27AE60','#3498DB'];
  const COUNT  = 120;
  const FRAMES = 120;

  const particles = Array.from({ length: COUNT }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * -0.5,
    sz: Math.random() * 8 + 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 5,
    vy: Math.random() * 5 + 2,
    rot: Math.random() * 360,
    vr: (Math.random() - 0.5) * 7,
    rect: Math.random() > 0.4,
  }));

  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frame / FRAMES);
      if (p.rect) ctx.fillRect(-p.sz / 2, -p.sz * 0.3, p.sz, p.sz * 0.6);
      else { ctx.beginPath(); ctx.arc(0, 0, p.sz / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
    frame++;
    if (frame < FRAMES) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  requestAnimationFrame(tick);
}

// ============================================================
// 18. GAME FLOW
// ============================================================

function startGame() {
  // Collect and validate player names
  const inputs  = document.querySelectorAll('#player-list input');
  const names   = Array.from(inputs).map(el => el.value.trim()).filter(n => n);

  const errEl = document.getElementById('setup-validation');

  if (names.length < MIN_PLAYERS) {
    errEl.textContent = `Enter at least ${MIN_PLAYERS} player names.`;
    return;
  }

  const lower = names.map(n => n.toLowerCase());
  if (lower.some((n, i) => lower.indexOf(n) !== i)) {
    errEl.textContent = 'Duplicate names found. Each player needs a unique name.';
    return;
  }

  errEl.textContent = '';

  // Assign roles
  const assigned    = assignRoles(names);
  STATE.players     = assigned;
  STATE.dakuCount   = calcDakuCount(names.length);
  STATE.currentWord = pickWord();
  STATE.roleRevealIndex = 0;
  STATE.wordRevealIndex = 0;
  STATE.roundResult     = {};
  saveState();

  // Start hot-seat role reveals
  renderRoleRevealForPlayer(0);
  goTo('screen-role-reveal');
}

function playAgain() {
  // Keep player names, re-assign roles, pick new word
  const names = STATE.players.map(p => p.name);
  STATE.players         = assignRoles(names);
  STATE.dakuCount       = calcDakuCount(names.length);
  STATE.currentWord     = pickWord();
  STATE.roleRevealIndex = 0;
  STATE.wordRevealIndex = 0;
  STATE.roundResult     = {};
  saveState();

  renderRoleRevealForPlayer(0);
  goTo('screen-role-reveal');
}

// ============================================================
// 19. PWA / bfcache
// ============================================================

window.addEventListener('pageshow', e => {
  if (e.persisted) { loadState(); loadScores(); resumePhase(); }
});

function resumePhase() {
  const safe = ['screen-home', 'screen-setup', 'screen-rules', 'screen-scores'];
  if (safe.includes(STATE.phase)) {
    goTo(STATE.phase);
    return;
  }
  switch (STATE.phase) {
    case 'screen-role-reveal':
      renderRoleRevealForPlayer(STATE.roleRevealIndex);
      goTo('screen-role-reveal');
      break;
    case 'screen-word-reveal':
      renderWordRevealForPlayer(STATE.wordRevealIndex);
      goTo('screen-word-reveal');
      break;
    case 'screen-offline-play':
      goTo('screen-offline-play');
      break;
    case 'screen-end':
      renderEndScreen();
      goTo('screen-end');
      break;
    default:
      goTo('screen-home');
  }
}

// ============================================================
// 20. EVENT BINDINGS
// ============================================================

function bindEvents() {

  // ── Home ──
  document.getElementById('btn-home-start').addEventListener('click', () => {
    // Reset players for fresh game (keep usedWordIds)
    STATE.players = Array.from({ length: 3 }, () => ({ name: '' }));
    saveState();
    renderSetupScreen();
    goTo('screen-setup');
  });

  document.getElementById('btn-home-rules').addEventListener('click', () => goTo('screen-rules'));
  document.getElementById('btn-home-scores').addEventListener('click', () => {
    renderScoresScreen();
    goTo('screen-scores');
  });

  // ── Abandon modal ──
  document.querySelectorAll('.screen-cancel').forEach(btn => {
    btn.addEventListener('click', () => showAbandonModal(abandonToHome));
  });

  // ── Rules back ──
  document.getElementById('btn-rules-back').addEventListener('click', () => goTo('screen-home'));

  // ── Scores back + reset ──
  document.getElementById('btn-scores-back').addEventListener('click', () => goTo('screen-home'));
  document.getElementById('btn-reset-scores').addEventListener('click', () => {
    if (confirm('Reset all scores? This cannot be undone.')) {
      resetScores();
      renderScoresScreen();
    }
  });

  // ── Setup: player list input delegation ──
  document.getElementById('player-list').addEventListener('input', e => {
    if (e.target.tagName === 'INPUT') {
      const i = parseInt(e.target.dataset.index, 10);
      STATE.players[i] = { ...STATE.players[i], name: e.target.value };
      updateSetupUI();
    }
  });

  document.getElementById('player-list').addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove');
    if (!btn) return;
    const i = parseInt(btn.dataset.index, 10);
    if (STATE.players.length <= MIN_PLAYERS) return;
    STATE.players.splice(i, 1);
    rebuildPlayerList();
    updateSetupUI();
  });

  document.getElementById('btn-add-player').addEventListener('click', () => {
    if (STATE.players.length >= MAX_PLAYERS) return;
    STATE.players.push({ name: '' });
    rebuildPlayerList();
    updateSetupUI();
    const inputs = document.querySelectorAll('#player-list input');
    const last   = inputs[inputs.length - 1];
    if (last) setTimeout(() => last.focus(), 60);
  });

  // ── Category toggle ──
  document.getElementById('toggle-category').addEventListener('click', function () {
    STATE.showCatToDaku = !STATE.showCatToDaku;
    this.classList.toggle('on', STATE.showCatToDaku);
    this.setAttribute('aria-checked', String(STATE.showCatToDaku));
  });

  // ── Start game ──
  document.getElementById('btn-start-game').addEventListener('click', startGame);

  // ── Offline play → end screen ──
  document.getElementById('btn-done-playing').addEventListener('click', () => {
    renderEndScreen();
    goTo('screen-end');
  });

  // ── End screen ──
  document.getElementById('btn-play-again').addEventListener('click', playAgain);
  document.getElementById('btn-end-home').addEventListener('click', () => {
    STATE = { ...DEFAULT_STATE, usedWordIds: STATE.usedWordIds }; // keep word history
    saveState();
    goTo('screen-home');
  });

  // Cancel on end screen → just home (no game in progress)
  document.getElementById('cancel-end').addEventListener('click', () => {
    STATE = { ...DEFAULT_STATE, usedWordIds: STATE.usedWordIds };
    saveState();
    goTo('screen-home');
  });

  // ── Keyboard: Enter on setup inputs ──
  document.getElementById('player-list').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      const i = parseInt(e.target.dataset.index, 10);
      const next = document.querySelector(`#player-list input[data-index="${i + 1}"]`);
      if (next) next.focus();
      else document.getElementById('btn-start-game').focus();
    }
  });
}

// ============================================================
// 21. INIT
// ============================================================

async function initApp() {
  loadState();
  loadScores();
  await loadWords();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }

  bindEvents();
  resumePhase();
}

document.addEventListener('DOMContentLoaded', initApp);
