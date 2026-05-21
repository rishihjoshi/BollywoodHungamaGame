/* ============================================================
   Picture Abhi Baaki Hai — Game Logic
   All state in sessionStorage. Does not modify app.js.
   ============================================================ */

'use strict';

// ── Constants ────────────────────────────────────────────────

const PABH_MIN_PLAYERS = 3;
const PABH_MAX_PLAYERS = 12;
const PABH_SESSION_KEY = 'pabh-session';

const VOTE_CATEGORIES = [
  { emoji: '🏆', label: 'Best Overall Pitch' },
  { emoji: '🤪', label: 'Most Absurd Premise' },
  { emoji: '🎬', label: 'Would Actually Watch' },
  { emoji: '😂', label: 'Funniest Pitch' },
  { emoji: '💰', label: 'Biggest Blockbuster' },
  { emoji: '⭐', label: 'Crowd Favourite' },
];

const TIMER_PREVIEWS = {
  60:  { text: 'Fast & chaotic', badge: null },
  90:  { text: 'Sweet spot', badge: 'Recommended' },
  120: { text: 'Full filmi drama', badge: null },
};

const FINAL_SUBTITLES = [
  'Yash Chopra would be proud.',
  'Karan Johar is shaking.',
  'This script has been sold to Dharma Productions.',
  'Amitabh Bachchan has been cast.',
  'OTT rights already acquired.',
];


// ── Module State ─────────────────────────────────────────────

let PABH_DATA = null;
let PABH_TIMER_ID = null;
let PABH_TIMER_TOTAL = 90;
let PABH_TIMER_LEFT = 90;

// Flag: timer was paused when abandon modal opened from timer screen
let pabhTimerWasPaused = false;

// Flag: prevents double-render of vote screen when timer expires AND user taps Time's Up simultaneously
let pabhVoteScreenRendered = false;

const DEFAULT_PABH_STATE = {
  players: [],
  currentRound: 0,
  totalRounds: 5,
  pitchDuration: 90,
  currentPitcherIndex: 0,
  pitcherOrder: [],
  currentCombo: null,
  currentVoteCategory: '',
  votes: {},
  usedActors: [],
  usedLocations: [],
  usedGenres: [],
  usedWildcards: [],
};

let PS = { ...DEFAULT_PABH_STATE };

// ── Utilities ────────────────────────────────────────────────

function pabhEscHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pabhShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickWithoutReplacement(pool, usedIndices) {
  let available = pool.map((_, i) => i).filter(i => !usedIndices.includes(i));
  if (available.length === 0) {
    usedIndices = [];
    available = pool.map((_, i) => i);
  }
  const idx = available[Math.floor(Math.random() * available.length)];
  return { item: pool[idx], newUsed: [...usedIndices, idx] };
}

function savePabhSession() {
  try { sessionStorage.setItem(PABH_SESSION_KEY, JSON.stringify(PS)); } catch (_) {}
}

function loadPabhSession() {
  try {
    const raw = sessionStorage.getItem(PABH_SESSION_KEY);
    if (raw) PS = { ...DEFAULT_PABH_STATE, ...JSON.parse(raw) };
  } catch (_) {}
}

// ── Screen Router ────────────────────────────────────────────

function paabhGoTo(screenName) {
  document.querySelectorAll('[data-screen]').forEach(el => el.classList.remove('screen-active'));
  const target = document.querySelector(`[data-screen="${screenName}"]`);
  if (target) {
    target.classList.add('screen-active');
    target.scrollTop = 0;
  }
}

// ── Data Loading ─────────────────────────────────────────────

async function loadPabhData() {
  if (PABH_DATA) return;
  try {
    const res = await fetch('./data/pabh-data.json');
    PABH_DATA = await res.json();
  } catch (e) {
    console.error('PABH: failed to load data', e);
  }
}

// ── Combo Generation ─────────────────────────────────────────

function generateCombo() {
  if (!PABH_DATA) { console.error('PABH: data not loaded'); return; }
  const actorResult    = pickWithoutReplacement(PABH_DATA.actors,    PS.usedActors);
  const locationResult = pickWithoutReplacement(PABH_DATA.locations, PS.usedLocations);
  const genreResult    = pickWithoutReplacement(PABH_DATA.genres,    PS.usedGenres);
  const wildcardResult = pickWithoutReplacement(PABH_DATA.wildcards, PS.usedWildcards);

  PS.usedActors    = actorResult.newUsed;
  PS.usedLocations = locationResult.newUsed;
  PS.usedGenres    = genreResult.newUsed;
  PS.usedWildcards = wildcardResult.newUsed;

  PS.currentCombo = {
    actor:    actorResult.item,
    location: locationResult.item,
    genre:    genreResult.item,
    wildcard: wildcardResult.item,
  };
  savePabhSession();
}

// ── Vote Category ────────────────────────────────────────────

function getVoteCategory(roundNum) {
  return VOTE_CATEGORIES[(roundNum - 1) % VOTE_CATEGORIES.length];
}

// ── Pitcher Name ─────────────────────────────────────────────

function getPitcherName() {
  const idx = PS.pitcherOrder[PS.currentPitcherIndex % PS.pitcherOrder.length];
  return PS.players[idx]?.name || '';
}

// ── Setup Screen ─────────────────────────────────────────────

function renderPabhSetup() {
  if (PS.players.length === 0) {
    PS.players = Array.from({ length: 3 }, () => ({ name: '', score: 0, roundsWon: 0 }));
  }
  rebuildPabhPlayerList();
  updatePabhSetupUI();
  updateTimerPreview(PS.pitchDuration);

  // Sync option buttons to current state
  document.querySelectorAll('#pabh-round-selector .pabh-option-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.value, 10) === PS.totalRounds);
  });
  document.querySelectorAll('#pabh-timer-selector .pabh-option-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.value, 10) === PS.pitchDuration);
  });
}

function rebuildPabhPlayerList() {
  const list = document.getElementById('pabh-player-list');
  list.innerHTML = '';
  PS.players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <input type="text" value="${pabhEscHtml(p.name)}" placeholder="Player ${i + 1}"
             data-index="${i}" autocomplete="off" autocorrect="off" spellcheck="false"
             autocapitalize="words">
      <button class="btn-remove" data-index="${i}" aria-label="Remove player">✕</button>
    `;
    list.appendChild(row);
  });
}

function updatePabhSetupUI() {
  const count    = PS.players.length;
  const namedMin = PS.players.filter(p => p.name.trim()).length >= PABH_MIN_PLAYERS;
  const addBtn   = document.getElementById('pabh-btn-add-player');
  const startBtn = document.getElementById('pabh-btn-start');
  if (addBtn)   addBtn.disabled   = count >= PABH_MAX_PLAYERS;
  if (startBtn) startBtn.disabled = !namedMin;
}

function updateTimerPreview(seconds) {
  const el = document.getElementById('pabh-timer-preview');
  if (!el) return;
  const info = TIMER_PREVIEWS[seconds];
  if (!info) return;
  const badge = info.badge
    ? `<span class="badge-recommended">${pabhEscHtml(info.badge)}</span>`
    : '';
  el.innerHTML = pabhEscHtml(info.text) + badge;
}

// ── Combo Screen ─────────────────────────────────────────────

function renderComboScreen() {
  const nameEl = document.getElementById('pabh-pitcher-name');
  if (nameEl) nameEl.textContent = getPitcherName();

  const grid = document.getElementById('pabh-cards-grid');
  if (!grid) return;

  const combo = PS.currentCombo;
  const cards = [
    { emoji: '🎬', category: 'ACTOR',    value: combo.actor,           wildcard: false },
    { emoji: '📍', category: 'LOCATION', value: combo.location,        wildcard: false },
    { emoji: '🎭', category: 'GENRE',    value: combo.genre,           wildcard: false },
    { emoji: '⚡', category: 'WILDCARD', value: combo.wildcard.text,   wildcard: true  },
  ];

  grid.innerHTML = cards.map((c, i) => `
    <div class="pabh-combo-card${c.wildcard ? ' wildcard' : ''}" data-card="${i}">
      <span class="pabh-card-category">${pabhEscHtml(c.category)}</span>
      <span class="pabh-card-emoji">${c.emoji}</span>
      <span class="pabh-card-value">${pabhEscHtml(c.value)}</span>
    </div>
  `).join('');

  // Staggered flip reveal
  [0, 300, 600, 900].forEach((delay, i) => {
    setTimeout(() => {
      const card = grid.querySelector(`[data-card="${i}"]`);
      if (card) card.classList.add('revealed');
    }, delay + 50);
  });
}

// ── Timer Screen ─────────────────────────────────────────────

function renderTimerScreen() {
  // Populate full-size combo cards immediately (no stagger)
  const grid = document.getElementById('pabh-timer-cards-grid');
  if (grid && PS.currentCombo) {
    const combo = PS.currentCombo;
    const cards = [
      { emoji: '🎬', category: 'ACTOR',    value: combo.actor,           wildcard: false },
      { emoji: '📍', category: 'LOCATION', value: combo.location,        wildcard: false },
      { emoji: '🎭', category: 'GENRE',    value: combo.genre,           wildcard: false },
      { emoji: '⚡', category: 'WILDCARD', value: combo.wildcard.text,   wildcard: true  },
    ];
    grid.innerHTML = cards.map((c, i) => `
      <div class="pabh-combo-card revealed${c.wildcard ? ' wildcard' : ''}" data-card="${i}">
        <span class="pabh-card-category">${pabhEscHtml(c.category)}</span>
        <span class="pabh-card-emoji">${c.emoji}</span>
        <span class="pabh-card-value">${pabhEscHtml(c.value)}</span>
      </div>
    `).join('');
  }

  // Reset timer display
  PABH_TIMER_TOTAL = PS.pitchDuration;
  PABH_TIMER_LEFT  = PS.pitchDuration;
  updateTimerDisplay(PS.pitchDuration, PS.pitchDuration);
}

function updateTimerDisplay(secondsLeft, total) {
  const numEl  = document.getElementById('pabh-timer-seconds');
  const ring   = document.getElementById('pabh-timer-ring');
  const wrap   = document.querySelector('.pabh-timer-wrap');
  if (!numEl || !ring || !wrap) return;

  numEl.textContent = secondsLeft;

  const circumference = 2 * Math.PI * 46; // ≈ 289.0
  const pctRemaining = total > 0 ? secondsLeft / total : 0;
  ring.style.strokeDashoffset = circumference * (1 - pctRemaining);

  ring.classList.remove('timer-orange', 'timer-red');
  wrap.classList.remove('pulsing');

  if (pctRemaining <= 0.2) {
    ring.classList.add('timer-red');
    wrap.classList.add('pulsing');
  } else if (pctRemaining <= 0.5) {
    ring.classList.add('timer-orange');
  }
}

function startPabhTimer() {
  clearPabhTimer();
  PABH_TIMER_TOTAL = PS.pitchDuration;
  PABH_TIMER_LEFT  = PS.pitchDuration;
  updateTimerDisplay(PABH_TIMER_LEFT, PABH_TIMER_TOTAL);

  PABH_TIMER_ID = setInterval(() => {
    PABH_TIMER_LEFT--;
    updateTimerDisplay(PABH_TIMER_LEFT, PABH_TIMER_TOTAL);
    if (PABH_TIMER_LEFT <= 0) {
      clearPabhTimer();
      if (!pabhVoteScreenRendered) {
        pabhVoteScreenRendered = true;
        setTimeout(() => {
          renderVoteScreen();
          paabhGoTo('pabh-vote');
        }, 400);
      }
    }
  }, 1000);
}

function clearPabhTimer() {
  if (PABH_TIMER_ID !== null) {
    clearInterval(PABH_TIMER_ID);
    PABH_TIMER_ID = null;
  }
}

// ── Vote Screen ───────────────────────────────────────────────

function renderVoteScreen() {
  PS.votes = {};
  pabhVoteScreenRendered = false; // reset race-condition guard for next use
  const cat = getVoteCategory(PS.currentRound);
  PS.currentVoteCategory = cat.label;
  savePabhSession();

  // Reset lock-in button
  const lockBtn = document.getElementById('pabh-btn-lock-votes');
  if (lockBtn) lockBtn.disabled = true;

  const roundLabelEl = document.getElementById('pabh-vote-round-label');
  const catEl        = document.getElementById('pabh-vote-category');
  const progressEl   = document.getElementById('pabh-vote-progress');
  const promptEl     = document.getElementById('pabh-vote-prompt');
  const skipBtn      = document.getElementById('pabh-btn-skip-voter');
  const grid         = document.getElementById('pabh-vote-grid');

  if (roundLabelEl) roundLabelEl.textContent = `Round ${PS.currentRound}`;
  if (catEl) catEl.textContent = `${cat.emoji} ${cat.label}`;

  const pitcher  = getPitcherName();
  const eligible = PS.players.filter(p => p.name !== pitcher);

  if (progressEl) progressEl.textContent = `0 of ${eligible.length} voted`;
  if (promptEl && eligible.length > 0) promptEl.textContent = `📱 Pass to ${eligible[0].name} to vote`;
  if (skipBtn) skipBtn.style.display = 'inline';

  if (grid) {
    grid.innerHTML = PS.players.map(p => {
      if (p.name === pitcher) return '';
      return `
        <div class="pabh-vote-card" data-player="${pabhEscHtml(p.name)}">
          <span>${pabhEscHtml(p.name)}</span>
          <span class="pabh-vote-checkmark">✓</span>
        </div>
      `;
    }).join('');

    // Dim first voter's own card so they can't vote for themselves
    _updateSelfCard(grid, eligible);
  }
}

// Highlights the current voter's own card as un-selectable
function _updateSelfCard(grid, eligible) {
  const nextVoter = eligible.find(p => !PS.votes[p.name]);
  grid.querySelectorAll('.pabh-vote-card').forEach(c => c.classList.remove('self-card'));
  if (nextVoter) {
    const selfCard = grid.querySelector(`[data-player="${CSS.escape(nextVoter.name)}"]`);
    if (selfCard) selfCard.classList.add('self-card');
  }
}

// VOTE MECHANIC — Option B:
// All N-1 non-pitcher players cast one vote each. Auto-advance is removed.
// A "Lock In Votes →" button enables only when voteCount === eligible.length.
// This preserves the group mechanic while giving the host explicit control
// over when to proceed, reducing accidental advances on a shared device.
function handleVoteClick(voterName, votedForName) {
  if (PS.votes[voterName]) return;
  PS.votes[voterName] = votedForName;
  savePabhSession();

  // Update voted card UI (only for real votes, not abstentions)
  const grid = document.getElementById('pabh-vote-grid');
  if (grid && votedForName !== '__abstain__') {
    const card = grid.querySelector(`[data-player="${CSS.escape(votedForName)}"]`);
    if (card) card.classList.add('voted');
  }

  const pitcher  = getPitcherName();
  const eligible = PS.players.filter(p => p.name !== pitcher);
  const voteCount = Object.keys(PS.votes).length;

  const progressEl = document.getElementById('pabh-vote-progress');
  if (progressEl) progressEl.textContent = `${voteCount} of ${eligible.length} voted`;

  // Update "whose turn" prompt and self-card dim for next voter
  const nextVoter = eligible.find(p => !PS.votes[p.name]);
  const promptEl  = document.getElementById('pabh-vote-prompt');
  if (promptEl) {
    promptEl.textContent = nextVoter
      ? `📱 Pass to ${nextVoter.name} to vote`
      : `✅ All votes in — host tap Lock In Votes`;
  }
  if (grid) _updateSelfCard(grid, eligible);

  if (voteCount >= eligible.length) {
    const lockBtn = document.getElementById('pabh-btn-lock-votes');
    if (lockBtn) lockBtn.disabled = false;
    const skipBtn = document.getElementById('pabh-btn-skip-voter');
    if (skipBtn) skipBtn.style.display = 'none';
  }
}

// ── Round Result Screen ───────────────────────────────────────

function renderRoundResult() {
  // Tally votes
  const tally = {};
  PS.players.forEach(p => { tally[p.name] = 0; });
  Object.values(PS.votes).forEach(name => {
    if (name === '__abstain__') return; // skip abstentions
    if (tally[name] !== undefined) tally[name]++;
  });

  // Find max votes
  const maxVotes = Math.max(...Object.values(tally));
  const winners  = PS.players.filter(p => tally[p.name] === maxVotes && maxVotes > 0);
  const isTie    = winners.length > 1;

  // Award points
  PS.players = PS.players.map(p => {
    const votesReceived = tally[p.name] || 0;
    let pts = 0;
    if (isTie && winners.some(w => w.name === p.name)) {
      pts = 1;
    } else if (!isTie && p.name === winners[0]?.name) {
      pts = votesReceived;
    }
    return { ...p, score: (p.score || 0) + pts, roundsWon: (p.roundsWon || 0) + (pts > 0 ? 1 : 0) };
  });
  savePabhSession();

  // Render round num
  const roundNumEl = document.getElementById('pabh-result-round-num');
  if (roundNumEl) roundNumEl.textContent = PS.currentRound;

  // Render winner banner
  const bannerEl = document.getElementById('pabh-winner-banner');
  if (bannerEl) {
    if (winners.length === 0) {
      bannerEl.innerHTML = `<div class="pabh-winner-trophy">🤷</div>
        <p class="pabh-winner-name">Nobody voted!</p>
        <p class="pabh-winner-votes">No points awarded this round.</p>`;
    } else if (isTie) {
      bannerEl.innerHTML = `<div class="pabh-winner-trophy">🤝</div>
        <p class="pabh-winner-name">${pabhEscHtml(winners.map(w => w.name).join(' & '))}</p>
        <p class="pabh-winner-votes">It's a tie! +1 point each.</p>`;
    } else {
      const w = winners[0];
      bannerEl.innerHTML = `<div class="pabh-winner-trophy">🏆</div>
        <p class="pabh-winner-name">${pabhEscHtml(w.name)}</p>
        <p class="pabh-winner-votes">+${tally[w.name]} point${tally[w.name] !== 1 ? 's' : ''} · ${tally[w.name]} vote${tally[w.name] !== 1 ? 's' : ''}</p>`;
    }
  }

  // Render standings
  renderStandings('pabh-standings');

  // Next button label
  const nextBtn = document.getElementById('pabh-btn-next-round');
  if (nextBtn) {
    nextBtn.textContent = PS.currentRound >= PS.totalRounds ? 'See Final Results 🎬' : 'Next Round →';
  }

  // Confetti for winner(s)
  if (winners.length > 0) triggerPabhConfetti();
}

// ── Final Screen ──────────────────────────────────────────────

function renderFinalScreen() {
  // Sort by score DESC, then by roundsWon DESC as tiebreaker
  const sorted = [...PS.players].sort((a, b) =>
    (b.score || 0) - (a.score || 0) || (b.roundsWon || 0) - (a.roundsWon || 0)
  );
  const topScore    = sorted[0]?.score || 0;
  const champions   = sorted.filter(p => (p.score || 0) === topScore);
  const isFinalTie  = champions.length > 1;
  const champion    = sorted[0];

  const winnerEl = document.getElementById('pabh-final-winner');
  if (winnerEl && champion) {
    if (isFinalTie) {
      winnerEl.innerHTML = `
        <div class="pabh-final-trophy">🤝</div>
        <p class="pabh-final-winner-name">${pabhEscHtml(champions.map(c => c.name).join(' & '))}</p>
        <p class="pabh-final-winner-score">${topScore} point${topScore !== 1 ? 's' : ''} each — it's a tie!</p>
      `;
    } else {
      winnerEl.innerHTML = `
        <div class="pabh-final-trophy">🎬</div>
        <p class="pabh-final-winner-name">${pabhEscHtml(champion.name)}</p>
        <p class="pabh-final-winner-score">${champion.score || 0} point${champion.score !== 1 ? 's' : ''}</p>
      `;
    }
  }

  const subtitleEl = document.getElementById('pabh-final-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = FINAL_SUBTITLES[Math.floor(Math.random() * FINAL_SUBTITLES.length)];
  }

  renderStandings('pabh-final-standings');
}

// ── Standings Renderer ────────────────────────────────────────

function renderStandings(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Sort by score DESC, then by roundsWon DESC (consistent with renderFinalScreen)
  const sorted = [...PS.players].sort((a, b) =>
    (b.score || 0) - (a.score || 0) || (b.roundsWon || 0) - (a.roundsWon || 0)
  );
  const rankClasses = ['first', 'second', 'third'];
  const rankLabels  = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th'];

  el.innerHTML = sorted.map((p, i) => {
    // Walk back to the first player with the same score — tied players share a rank
    let displayRank = i;
    while (displayRank > 0 && (sorted[displayRank - 1].score || 0) === (p.score || 0)) displayRank--;
    const rankClass = rankClasses[displayRank] || 'other';
    const rankLabel = rankLabels[displayRank] || `${displayRank + 1}th`;
    const isLeader  = displayRank === 0;
    return `
      <div class="pabh-score-row${isLeader ? ' leader' : ''}">
        <span class="pabh-score-rank ${rankClass}">${rankLabel}</span>
        <span class="pabh-score-name">${pabhEscHtml(p.name)}</span>
        <span class="pabh-score-pts">${p.score || 0} pts</span>
      </div>
    `;
  }).join('');
}

// ── Confetti ──────────────────────────────────────────────────

function triggerPabhConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';

  const COLORS = ['#FFD700', '#C0392B', '#FFFFFF', '#FF8C00', '#27AE60'];
  const particles = Array.from({ length: 100 }, () => ({
    x:    Math.random() * canvas.width,
    y:    Math.random() * canvas.height * -0.5,
    sz:   Math.random() * 8 + 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx:   (Math.random() - 0.5) * 3,
    vy:   Math.random() * 2 + 1,
    rot:  Math.random() * 360,
    vr:   (Math.random() - 0.5) * 6,
    rect: Math.random() > 0.5,
    alpha: 1,
  }));

  let frame = 0;
  const TOTAL = 100;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x   += p.vx;
      p.y   += p.vy;
      p.vy  += 0.12;
      p.rot += p.vr;
      p.alpha = Math.max(0, 1 - frame / TOTAL);

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      if (p.rect) {
        ctx.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz * 0.5);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.sz / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    frame++;
    if (frame < TOTAL) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = 'none';
    }
  }
  requestAnimationFrame(draw);
}

// ── Round Advancement ─────────────────────────────────────────

function advanceToNextRound() {
  clearPabhTimer();
  PS.currentPitcherIndex = (PS.currentPitcherIndex + 1) % PS.players.length;

  if (PS.currentRound >= PS.totalRounds) {
    renderFinalScreen();
    paabhGoTo('pabh-final');
    return;
  }

  PS.currentRound++;
  PS.votes = {};
  generateCombo();
  savePabhSession();
  renderComboScreen();
  paabhGoTo('pabh-combo');
}

// ── Start Game ────────────────────────────────────────────────

function startPabhGame() {
  if (!PABH_DATA) {
    alert('Game data not loaded. Please check your connection and refresh.');
    return;
  }
  const names = PS.players.map(p => p.name.trim()).filter(Boolean);
  if (names.length < PABH_MIN_PLAYERS) return;

  // Check duplicates
  const lower = names.map(n => n.toLowerCase());
  if (lower.some((n, i) => lower.indexOf(n) !== i)) {
    alert('Duplicate names found. Each player needs a unique name.');
    return;
  }

  PS.players = names.map(n => ({ name: n, score: 0, roundsWon: 0 }));
  PS.pitcherOrder   = pabhShuffle(PS.players.map((_, i) => i));
  PS.currentRound   = 1;
  PS.currentPitcherIndex = 0;
  PS.votes          = {};
  PS.usedActors     = [];
  PS.usedLocations  = [];
  PS.usedGenres     = [];
  PS.usedWildcards  = [];

  generateCombo();
  savePabhSession();
  renderComboScreen();
  paabhGoTo('pabh-combo');
}

// ── Play Again ────────────────────────────────────────────────

function playPabhAgain() {
  clearPabhTimer();
  const names = PS.players.map(p => p.name);
  PS = {
    ...DEFAULT_PABH_STATE,
    players: names.map(n => ({ name: n, score: 0, roundsWon: 0 })),
    totalRounds:   PS.totalRounds,
    pitchDuration: PS.pitchDuration,
  };
  savePabhSession();
  renderPabhSetup();
  paabhGoTo('pabh-setup');
}

// ── Event Binding ─────────────────────────────────────────────

function bindPabhEvents() {
  // Home → PABH setup
  document.getElementById('btn-pabh-start')?.addEventListener('click', () => {
    clearPabhTimer();
    PS = { ...DEFAULT_PABH_STATE };
    savePabhSession();
    renderPabhSetup();
    paabhGoTo('pabh-setup');
  });

  // Setup: back to home
  document.getElementById('pabh-btn-back-home')?.addEventListener('click', () => {
    paabhGoTo('screen-home');
  });

  // Setup: player list input delegation
  document.getElementById('pabh-player-list')?.addEventListener('input', e => {
    if (e.target.tagName === 'INPUT') {
      const i = parseInt(e.target.dataset.index, 10);
      PS.players[i] = { ...PS.players[i], name: e.target.value };
      updatePabhSetupUI();
    }
  });

  // Setup: remove player delegation
  document.getElementById('pabh-player-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove');
    if (!btn) return;
    const i = parseInt(btn.dataset.index, 10);
    if (PS.players.length <= PABH_MIN_PLAYERS) return;
    PS.players.splice(i, 1);
    rebuildPabhPlayerList();
    updatePabhSetupUI();
  });

  // Setup: add player
  document.getElementById('pabh-btn-add-player')?.addEventListener('click', () => {
    if (PS.players.length >= PABH_MAX_PLAYERS) return;
    PS.players.push({ name: '', score: 0, roundsWon: 0 });
    rebuildPabhPlayerList();
    updatePabhSetupUI();
    const inputs = document.querySelectorAll('#pabh-player-list input');
    const last = inputs[inputs.length - 1];
    if (last) setTimeout(() => last.focus(), 60);
  });

  // Setup: round selector
  document.getElementById('pabh-round-selector')?.addEventListener('click', e => {
    const btn = e.target.closest('.pabh-option-btn');
    if (!btn) return;
    PS.totalRounds = parseInt(btn.dataset.value, 10);
    document.querySelectorAll('#pabh-round-selector .pabh-option-btn').forEach(b => {
      b.classList.toggle('selected', b === btn);
    });
  });

  // Setup: timer selector
  document.getElementById('pabh-timer-selector')?.addEventListener('click', e => {
    const btn = e.target.closest('.pabh-option-btn');
    if (!btn) return;
    PS.pitchDuration = parseInt(btn.dataset.value, 10);
    document.querySelectorAll('#pabh-timer-selector .pabh-option-btn').forEach(b => {
      b.classList.toggle('selected', b === btn);
    });
    updateTimerPreview(PS.pitchDuration);
  });

  // Setup: start game
  document.getElementById('pabh-btn-start')?.addEventListener('click', startPabhGame);

  // Combo: start pitching
  document.getElementById('pabh-btn-start-pitch')?.addEventListener('click', () => {
    renderTimerScreen();
    paabhGoTo('pabh-timer');
    startPabhTimer();
  });

  // Timer: time's up (manual) — guard prevents double-render if timer fires simultaneously
  document.getElementById('pabh-btn-timesup')?.addEventListener('click', () => {
    if (pabhVoteScreenRendered) return;
    pabhVoteScreenRendered = true;
    clearPabhTimer();
    renderVoteScreen();
    paabhGoTo('pabh-vote');
  });

  // Vote: vote card delegation
  document.getElementById('pabh-vote-grid')?.addEventListener('click', e => {
    const card = e.target.closest('.pabh-vote-card');
    if (!card) return;

    // Shared device: first eligible non-pitcher who hasn't voted yet is the current voter
    const pitcher  = getPitcherName();
    const eligible = PS.players.filter(p => p.name !== pitcher);
    const nextVoter = eligible.find(p => !PS.votes[p.name]);
    if (!nextVoter) return;

    const votedFor = card.dataset.player;
    if (votedFor === nextVoter.name) return; // Fix #2: prevent self-voting
    handleVoteClick(nextVoter.name, votedFor);
  });

  // Vote: lock in votes button (Option B — host explicitly advances)
  document.getElementById('pabh-btn-lock-votes')?.addEventListener('click', () => {
    renderRoundResult();
    paabhGoTo('pabh-round-result');
  });

  // Vote: skip absent player — marks next voter as abstained so game can continue
  document.getElementById('pabh-btn-skip-voter')?.addEventListener('click', () => {
    const pitcher  = getPitcherName();
    const eligible = PS.players.filter(p => p.name !== pitcher);
    const nextVoter = eligible.find(p => !PS.votes[p.name]);
    if (!nextVoter) return;
    handleVoteClick(nextVoter.name, '__abstain__');
  });

  // Round result: next round
  document.getElementById('pabh-btn-next-round')?.addEventListener('click', advanceToNextRound);

  // Final: play again
  document.getElementById('pabh-btn-play-again')?.addEventListener('click', playPabhAgain);

  // Final: back to main menu
  document.getElementById('pabh-btn-back-hungama')?.addEventListener('click', () => {
    clearPabhTimer();
    paabhGoTo('screen-home');
  });

  // ── Abandon / Cancel buttons ──────────────────────────────

  const pabhAbandon = () => {
    clearPabhTimer();
    pabhTimerWasPaused = false;
    sessionStorage.removeItem(PABH_SESSION_KEY);
    PS = { ...DEFAULT_PABH_STATE };
    paabhGoTo('screen-home');
  };

  // Non-timer screens: open abandon modal
  ['pabh-cancel-setup', 'pabh-cancel-combo', 'pabh-cancel-vote', 'pabh-cancel-result'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => showAbandonModal(pabhAbandon));
  });

  // Timer screen: pause first, then open abandon modal
  document.getElementById('pabh-cancel-timer')?.addEventListener('click', () => {
    clearPabhTimer();
    pabhTimerWasPaused = true;
    showAbandonModal(() => {
      pabhTimerWasPaused = false;
      sessionStorage.removeItem(PABH_SESSION_KEY);
      PS = { ...DEFAULT_PABH_STATE };
      paabhGoTo('screen-home');
    });
  });

  // "Stay" on abandon modal: resume timer if it was paused by timer-screen cancel.
  // Registered here (before modal's own dynamic listener) so it fires first.
  document.getElementById('btn-abandon-cancel')?.addEventListener('click', () => {
    if (pabhTimerWasPaused && PABH_TIMER_LEFT > 0 && PABH_TIMER_ID === null) {
      pabhTimerWasPaused = false;
      PABH_TIMER_ID = setInterval(() => {
        PABH_TIMER_LEFT--;
        updateTimerDisplay(PABH_TIMER_LEFT, PABH_TIMER_TOTAL);
        if (PABH_TIMER_LEFT <= 0) {
          clearPabhTimer();
          setTimeout(() => { renderVoteScreen(); paabhGoTo('pabh-vote'); }, 400);
        }
      }, 1000);
    }
  });

  // ── How to Play ───────────────────────────────────────────

  document.getElementById('btn-pabh-rules')?.addEventListener('click', () => {
    paabhGoTo('pabh-rules');
  });

  document.getElementById('btn-pabh-rules-back')?.addEventListener('click', () => {
    paabhGoTo('screen-home');
  });
}

// ── Init ──────────────────────────────────────────────────────

async function initPabh() {
  await loadPabhData();
  loadPabhSession();
  bindPabhEvents();
}

document.addEventListener('DOMContentLoaded', initPabh);
