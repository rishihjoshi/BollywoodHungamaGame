#!/usr/bin/env node
/**
 * fetch-tmdb-images.js
 *
 * Reads docs/data/words.json, fetches a TMDB image URL for each entry
 * that doesn't already have one, and writes the updated JSON back.
 *
 * Requires: Node 18+ (native fetch). No npm dependencies.
 * Auth: TMDB_TOKEN env var (Bearer token — TMDB API Read Access Token)
 *
 * Search strategy per category:
 *   celeb        → /search/person   → profile_path
 *   film_title   → /search/movie    → poster_path   (query = word)
 *   hero_dialogue→ /search/movie    → poster_path   (query = movie from hint)
 *   character    → /search/movie    → poster_path   (query = movie from hint)
 *   song         → /search/movie    → poster_path   (query = movie from hint)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const WORDS_FILE   = path.resolve(__dirname, '../docs/data/words.json');
const TMDB_BASE    = 'https://api.themoviedb.org/3';
const IMG_BASE     = 'https://image.tmdb.org/t/p/w500';
const RATE_DELAY   = 250; // ms between requests
const TOKEN        = process.env.TMDB_TOKEN;

if (!TOKEN) {
  console.error('ERROR: TMDB_TOKEN environment variable is not set.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract a movie/show title from a hint string.
 * Hints are formatted like:  "Sholay 1975 — action dacoit classic"
 * or simply:                 "Sholay — classic 1975"
 * We grab everything before the first " — " or " - " dash.
 * Falls back to null if no separator found.
 */
function movieFromHint(hint) {
  if (!hint) return null;
  // Try em-dash variant first, then regular hyphen-dash
  const emIdx  = hint.indexOf(' — ');
  const hypIdx = hint.indexOf(' - ');
  const idx    = emIdx >= 0 ? emIdx : hypIdx;
  if (idx < 0) return null;
  // Strip trailing year like "Sholay 1975" → "Sholay"
  return hint.slice(0, idx).replace(/\s+\d{4}$/, '').trim();
}

/** Pull the first 4-digit year (19xx/20xx) from a hint, or null. */
function yearFromHint(hint) {
  const m = /\b(19|20)\d{2}\b/.exec(hint || '');
  return m ? parseInt(m[0], 10) : null;
}

/** Build the TMDB search URL for a word entry. */
function buildSearchUrl(word) {
  const base = `${TMDB_BASE}`;
  if (word.category === 'celeb') {
    const q = encodeURIComponent(word.word);
    // include_adult=false avoids namesakes in adult titles
    return `${base}/search/person?query=${q}&include_adult=false&language=en-US&page=1`;
  }

  // For all other categories, search by movie title
  let movieTitle =
    word.category === 'film_title'
      ? word.word
      : movieFromHint(word.hint) || word.word;

  const q      = encodeURIComponent(movieTitle);
  const year   = yearFromHint(word.hint);
  // primary_release_year strongly disambiguates same-named titles
  // (e.g. "Black" 2005 vs Black Panther, "Don" 2006 vs Don Juan 1926).
  const yearQP = year ? `&primary_release_year=${year}` : '';
  return `${base}/search/movie?query=${q}&include_adult=false${yearQP}&language=en-US&page=1`;
}

/**
 * Extract the best image URL from a TMDB search response.
 * These are almost all Hindi films/stars, and the bare title/name often
 * collides with unrelated foreign titles or namesakes, so we score results
 * rather than blindly taking results[0]:
 *   - movies: prefer original_language 'hi', then release year near the hint,
 *     then TMDB popularity.
 *   - people: prefer the most popular match (the famous Bollywood star beats
 *     an obscure same-named person).
 */
function extractImageUrl(data, category, hintYear) {
  const results = data.results;
  if (!results || results.length === 0) return '';

  if (category === 'celeb') {
    const best = [...results]
      .filter(r => r.profile_path)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
    return best ? `${IMG_BASE}${best.profile_path}` : '';
  }

  const scored = results
    .filter(r => r.poster_path)
    .map(r => {
      const yr = (r.release_date || '').slice(0, 4);
      const yearGap = hintYear && /^\d{4}$/.test(yr) ? Math.abs(+yr - hintYear) : 99;
      return {
        r,
        hindi: r.original_language === 'hi' ? 0 : 1,
        yearGap,
        pop: r.popularity || 0,
      };
    })
    .sort((a, b) =>
      a.hindi - b.hindi || a.yearGap - b.yearGap || b.pop - a.pop);

  return scored.length ? `${IMG_BASE}${scored[0].r.poster_path}` : '';
}

/** Fetch one TMDB search and return the image URL (or empty string). */
async function fetchImageUrl(word) {
  const url = buildSearchUrl(word);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`  TMDB ${res.status} for "${word.word}" — skipping`);
      return '';
    }

    const data = await res.json();
    return extractImageUrl(data, word.category, yearFromHint(word.hint));
  } catch (err) {
    console.warn(`  Network error for "${word.word}": ${err.message} — skipping`);
    return '';
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading: ${WORDS_FILE}`);
  const words = JSON.parse(fs.readFileSync(WORDS_FILE, 'utf8'));

  let fetched  = 0;
  let skipped  = 0;
  let failed   = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    // Skip entries that already have a non-empty imageUrl
    if (w.imageUrl && w.imageUrl !== '') {
      skipped++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${words.length}] ${w.category.padEnd(13)} "${w.word}" → `);

    const imageUrl = await fetchImageUrl(w);
    w.imageUrl = imageUrl;

    if (imageUrl) {
      console.log(imageUrl);
      fetched++;
    } else {
      console.log('(no image found)');
      failed++;
    }

    await sleep(RATE_DELAY);
  }

  fs.writeFileSync(WORDS_FILE, JSON.stringify(words, null, 2) + '\n', 'utf8');

  console.log(`\nDone. fetched=${fetched}  skipped=${skipped}  no-image=${failed}`);
  console.log(`Written: ${WORDS_FILE}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
