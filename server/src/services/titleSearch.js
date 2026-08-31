import prisma from "../config/db.js";

/*
 * Search that forgives a typo.
 *
 * The previous search was a single `contains` against title and genre, which
 * only ever finds what the viewer spelled exactly. "Interstellr" or "sholey"
 * returned nothing at all, and a catalog you can only reach by spelling it
 * correctly is not much of a search.
 *
 * Postgres could do this with pg_trgm, but that needs an extension and a
 * migration on the hosted database, and the deployed API is the only thing that
 * can reach it. Scoring in the API needs neither, and at this catalog size the
 * whole title index is a couple of megabytes.
 */

// The index is rebuilt on demand. A serverless instance lives minutes, so this
// mostly means once per cold start; the ceiling stops a very large catalog from
// turning every cold start into a multi-megabyte read.
const INDEX_TTL_MS = 10 * 60 * 1000;
const INDEX_LIMIT = 30_000;

// Below this a match is noise rather than a near miss.
const SCORE_FLOOR = 120;

let index = null;
let indexedAt = 0;

/**
 * Lowercase, strip accents and punctuation, collapse whitespace. Without this
 * "Devdas: The Musical" and "devdas the musical" score as different strings,
 * and "Salaar Part 1" never matches "salaar part1".
 */
export function normalise(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Edit distance, abandoned as soon as it cannot come in under `max`.
 *
 * Counts a swap of two neighbouring letters as one edit, not two. That case is
 * most of what real typing gets wrong — "crary" for "carry" — and plain
 * Levenshtein scores it as two changes, far enough to miss the title entirely.
 */
export function editDistance(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let beforePrev = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1);
    curr[0] = i;
    let rowBest = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], beforePrev[j - 2] + 1);
      }
      if (curr[j] < rowBest) rowBest = curr[j];
    }
    // Every distance from here on is at least this row's best, so once that
    // passes the cutoff the answer cannot come in under it.
    if (rowBest > max) return max + 1;
    beforePrev = prev;
    prev = curr;
  }
  return prev[b.length];
}

// Words that match half the catalog and say nothing about what the viewer
// meant. Length alone is not enough of a test — "the" is three letters and
// carries nothing, "meg" is three letters and is the whole title.
const STOPWORDS = new Set([
  "a", "an", "and", "at", "de", "for", "in", "ka", "ke", "ki", "of", "on",
  "or", "part", "the", "to", "with",
]);

/**
 * The words worth matching on their own. If a query is nothing but stopwords,
 * they are all it has to go on.
 */
function significantWords(query) {
  const words = query.split(" ");
  const significant = words.filter((w) => !STOPWORDS.has(w));
  return significant.length ? significant : words;
}

/** How wrong a word of this length is allowed to be. */
function tolerance(length) {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (length <= 8) return 2;
  return 3;
}

function trigrams(text) {
  const padded = ` ${text} `;
  const set = new Set();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
}

/**
 * Dice coefficient over trigrams — 0 to 1. Catches the failures edit distance
 * is bad at, notably a transposition or a word typed in the wrong order.
 */
function trigramSimilarity(a, b) {
  const [ta, tb] = [trigrams(a), trigrams(b)];
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

/**
 * The best trigram score over every run of title words as long as the query.
 * Capped by word count because the windows multiply and this only runs for
 * queries nothing else could match.
 */
function bestWindowSimilarity(query, title) {
  const queryWords = query.split(" ");
  if (queryWords.length > 3) return 0;

  const titleWords = title.split(" ");
  if (titleWords.length <= queryWords.length) return 0;

  let best = 0;
  for (let i = 0; i + queryWords.length <= titleWords.length; i++) {
    const window = titleWords.slice(i, i + queryWords.length).join(" ");
    best = Math.max(best, trigramSimilarity(query, window));
  }
  return best;
}

/**
 * Rank one candidate against the query. Higher is better; null means "not a
 * match at all".
 *
 * Ordered so that an exact spelling always outranks a correction — someone who
 * typed the title right should never have a fuzzy match pushed above it.
 */
export function scoreTitle(query, candidate) {
  const title = candidate.titleNorm;
  if (!title) return null;

  let score = 0;

  if (title === query) score = 1000;
  else if (title.startsWith(query)) score = 820;
  else if (new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) score = 700;
  else if (title.includes(query)) score = 600;

  if (!score) {
    // Every word the viewer typed present somewhere, in any order.
    const titleWords = title.split(" ");
    const matches = (w) => titleWords.some((t) => t.startsWith(w));

    if (query.split(" ").every(matches)) score = 520;
    else {
      // Partial credit, but only on words that carry meaning. Counting short
      // ones put "Godzilla Minus One" in the results for "carry on jatta",
      // because "one" starts with "on".
      const words = significantWords(query);
      const matched = words.filter(matches).length;
      if (matched && matched * 2 >= words.length) score = 300 + 60 * matched;
    }
  }

  if (!score) {
    // Nothing matched cleanly, so treat it as a misspelling. Comparing against
    // the whole title is not enough — "intersteller" is most of "Interstellar"
    // but a small fraction of "Interstellar: The IMAX Experience" — so the same
    // comparison runs against every run of words the query could have meant.
    const whole = trigramSimilarity(query, title);
    const window = bestWindowSimilarity(query, title);

    // A near-miss on the whole title beats an equally close miss on part of
    // one. Scored together, "Shola Aur Shabnam" edged out "Sholay" for
    // "sholey" — the window matched slightly better than the real title did.
    if (whole >= 0.34) score = Math.round(220 + whole * 300);
    else if (window >= 0.34) score = Math.round(170 + window * 260);

    if (!score) {
      // A typo in one word of a longer title: match word to word instead.
      const words = significantWords(query);
      const titleWords = title.split(" ");
      let hits = 0;
      for (const w of words) {
        const max = tolerance(w.length);
        if (max && titleWords.some((t) => editDistance(w, t, max) <= max)) hits++;
      }
      if (hits) score = 150 + 90 * hits + (hits === words.length ? 60 : 0);
    }
  }

  // Genre is a legitimate thing to type, but a title match means more.
  if (candidate.genreNorm === query) score = Math.max(score, 480);
  else if (candidate.genreNorm?.includes(query)) score = Math.max(score, 260);

  if (!score || score < SCORE_FLOOR) return null;

  // A shorter title containing the query is the closer match: for "dhoom",
  // "Dhoom" should come before "Dhoom Dhaam Dhamaal".
  score -= Math.min(40, Math.floor(title.length / 4));
  return score;
}

async function buildIndex() {
  const rows = await prisma.title.findMany({
    take: INDEX_LIMIT,
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, genre: true, releaseYear: true },
  });

  index = rows.map((r) => ({
    id: r.id,
    releaseYear: r.releaseYear,
    titleNorm: normalise(r.title),
    genreNorm: normalise(r.genre),
  }));
  indexedAt = Date.now();
  return index;
}

async function getIndex() {
  if (!index || Date.now() - indexedAt > INDEX_TTL_MS) return buildIndex();
  return index;
}

/**
 * Ranked ids for a query, best first. Returning ids rather than rows keeps the
 * card projection in one place — the controller selects it.
 */
export async function rankMatches(rawQuery, limit) {
  const query = normalise(rawQuery);
  if (query.length < 2) return [];

  const candidates = await getIndex();
  const scored = [];

  for (const candidate of candidates) {
    const score = scoreTitle(query, candidate);
    if (score !== null) scored.push({ id: candidate.id, score, year: candidate.releaseYear });
  }

  scored.sort((a, b) => b.score - a.score || b.year - a.year);
  return scored.slice(0, limit).map((s) => s.id);
}

/** Only for tests — a stale index would otherwise outlive the data. */
export function resetIndex() {
  index = null;
  indexedAt = 0;
}
