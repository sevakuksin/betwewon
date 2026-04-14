/**
 * Bet We Won! — static game logic: CDR3 reels, antigen scoring, bounties, session score.
 */

// =============================================================================
// Constants — amino acids & residue classes (for color + scoring)
// =============================================================================

const AMINO_ACIDS = [
  "A", "C", "D", "E", "F", "G", "H", "I", "K", "L",
  "M", "N", "P", "Q", "R", "S", "T", "V", "W", "Y",
];

/** @typedef {'positive'|'negative'|'hydrophobic'|'polar'|'small'|'other'} ResidueClass */

const POSITIVE = new Set(["R", "K"]);
const NEGATIVE = new Set(["D", "E"]);
const HYDROPHOBIC = new Set(["W", "F", "L", "I", "V", "Y"]);
const POLAR = new Set(["S", "T", "N", "Q"]);
const SMALL = new Set(["G", "A"]);
const AROMATIC = new Set(["Y", "W", "F"]);

/**
 * Map one-letter code to class for coloring and category counts.
 * @param {string} aa
 * @returns {ResidueClass}
 */
function getResidueClass(aa) {
  if (POSITIVE.has(aa)) return "positive";
  if (NEGATIVE.has(aa)) return "negative";
  if (HYDROPHOBIC.has(aa)) return "hydrophobic";
  if (POLAR.has(aa)) return "polar";
  if (SMALL.has(aa)) return "small";
  return "other";
}

/**
 * @param {string[]} seq CDR3 one-letter codes
 * @returns {Record<ResidueClass, number>}
 */
function getClassCounts(seq) {
  /** @type {Record<ResidueClass, number>} */
  const counts = {
    positive: 0,
    negative: 0,
    hydrophobic: 0,
    polar: 0,
    small: 0,
    other: 0,
  };
  for (const aa of seq) {
    counts[getResidueClass(aa)] += 1;
  }
  return counts;
}

/**
 * @param {string[]} seq
 * @param {Set<string>} letters
 */
function countInSet(seq, letters) {
  return seq.filter((a) => letters.has(a)).length;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function uniformInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAminoAcid() {
  return randomChoice(AMINO_ACIDS);
}

/** CDR3 length and V / D / J reel split (3 + 4 + 3); each reel scrolls as one strip. */
const CDR3_LEN = 10;

/** @type {("V"|"D"|"J")[]} */
const REEL_KEYS = ["V", "D", "J"];
const REEL_LENGTHS = { V: 3, D: 4, J: 3 };

/** Fallback if CSS var missing; real spin distance uses measured `.reel__row` height (matches `--reel-row-h`). */
const REEL_ROW_PX_FALLBACK = 54;

/**
 * @returns {number}
 */
function getReelRowHeightPx() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--reel-row-h").trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : REEL_ROW_PX_FALLBACK;
}

/**
 * @param {string[]} cdr3 length {@link CDR3_LEN}
 * @returns {{ V: string[], D: string[], J: string[] }}
 */
function splitCdr3ToSegments(cdr3) {
  return {
    V: cdr3.slice(0, 3),
    D: cdr3.slice(3, 7),
    J: cdr3.slice(7, 10),
  };
}

/**
 * @param {number} len
 */
function randomSegmentLetters(len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(randomAminoAcid());
  return out;
}

// =============================================================================
// Sequence generation
// =============================================================================

/**
 * @param {number} n
 * @returns {string[]}
 */
function generatePeptide(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(randomAminoAcid());
  return out;
}

/** @returns {{ cdr3: string[], contextL: string[], contextR: string[] }} */
function generateFullSequence() {
  return {
    cdr3: generatePeptide(CDR3_LEN),
    contextL: generatePeptide(2),
    contextR: generatePeptide(2),
  };
}

// =============================================================================
// Motif helpers (CDR3, variable length)
// =============================================================================

/** Y-X-Y: Y at i and i+2 */
function hasMotifYXY(seq) {
  for (let i = 0; i <= seq.length - 3; i++) {
    if (seq[i] === "Y" && seq[i + 2] === "Y") return true;
  }
  return false;
}

/** X-W-X: W not at ends */
function hasMotifXWX(seq) {
  for (let i = 1; i <= seq.length - 2; i++) {
    if (seq[i] === "W") return true;
  }
  return false;
}

/** W-X-Y */
function hasMotifWXY(seq) {
  for (let i = 0; i <= seq.length - 3; i++) {
    if (seq[i] === "W" && seq[i + 2] === "Y") return true;
  }
  return false;
}

// =============================================================================
// Antigen rule points (before base + noise + clamp)
// =============================================================================

/**
 * Charged: R, K, D, E
 * @param {string[]} seq
 */
function chargedFraction(seq) {
  const n = countInSet(seq, new Set([...POSITIVE, ...NEGATIVE]));
  return n / seq.length;
}

/**
 * @param {string[]} seq
 */
function positiveFraction(seq) {
  return countInSet(seq, POSITIVE) / seq.length;
}

/**
 * @param {string[]} seq
 */
function hydrophobicFraction(seq) {
  return countInSet(seq, HYDROPHOBIC) / seq.length;
}

/**
 * @param {string[]} seq
 */
function polarFraction(seq) {
  return countInSet(seq, POLAR) / seq.length;
}

/**
 * @param {AntigenDef} antigen
 * @param {string[]} seq
 */
function antigenRulePoints(antigen, seq) {
  return antigen.rules(seq);
}

/**
 * @typedef {object} AntigenOutcomes
 * @property {string} successTitle
 * @property {string} successMessage
 * @property {string} [successDetail]
 */

/**
 * @typedef {object} AntigenDef
 * @property {string} id
 * @property {string} name
 * @property {string} label
 * @property {string} difficulty
 * @property {string} ruleSummary
 * @property {number} bounty Points added to session score on a winning finalize.
 * @property {AntigenOutcomes} outcomes
 * @property {(seq: string[]) => number} rules
 */

/** @type {AntigenDef[]} */
const ANTIGENS = [
  {
    id: "covid",
    name: "COVID Spike (RBD)",
    label: "virus",
    difficulty: "medium",
    bounty: 38,
    ruleSummary: "Likes aromatic residues; balanced hydrophobicity helps; dislikes high charge; Y-X-Y bonus.",
    outcomes: {
      successTitle: "Neutralized",
      successMessage: "High affinity antibody produced. Infection neutralized.",
    },
    rules(seq) {
      let p = 0;
      p += 2 * countInSet(seq, AROMATIC);
      const h = countInSet(seq, HYDROPHOBIC);
      const hMin = Math.ceil((2 / 7) * seq.length);
      const hMax = Math.floor((4 / 7) * seq.length);
      if (hMax >= hMin && h >= hMin && h <= hMax) p += 1;
      if (chargedFraction(seq) > 0.4) p -= 2;
      if (hasMotifYXY(seq)) p += 3;
      return p;
    },
  },
  {
    id: "lps",
    name: "LPS",
    label: "bacterial surface",
    difficulty: "easy",
    bounty: 22,
    ruleSummary: "Likes bulky hydrophobes (W, F, L, I); dislikes high charge.",
    outcomes: {
      successTitle: "Epitope locked",
      successMessage: "Your B cell sails through selection with a LPS-hugging receptor. Bacterial surface neutralized.",
    },
    rules(seq) {
      let p = 0;
      p += 2 * countInSet(seq, new Set(["W", "F", "L", "I"]));
      if (chargedFraction(seq) > 0.3) p -= 2;
      return p;
    },
  },
  {
    id: "flu",
    name: "Influenza Hemagglutinin",
    label: "virus",
    difficulty: "medium",
    bounty: 35,
    ruleSummary: "Likes polar residues; some aromatic OK; dislikes too much hydrophobic.",
    outcomes: {
      successTitle: "Ha! Stopped flu",
      successMessage: "High affinity antibody produced. Infection neutralized.",
    },
    rules(seq) {
      let p = 0;
      p += 1 * countInSet(seq, POLAR);
      p += 1 * countInSet(seq, new Set(["Y", "F"]));
      if (hydrophobicFraction(seq) > 0.5) p -= 2;
      return p;
    },
  },
  {
    id: "betv1",
    name: "Bet v 1",
    label: "pollen allergen",
    difficulty: "medium",
    bounty: 100,
    ruleSummary: "Prefers balanced composition; dislikes one class dominating.",
    outcomes: {
      successTitle: "Pollen jackpot",
      successMessage:
        "Cell survives selection with a gorgeous Bet v 1 binder. You win — seasonal allergies. Grab the antihistamines.",
      successDetail: "Science outreach disclaimer: still better than losing the round.",
    },
    rules(seq) {
      const counts = getClassCounts(seq);
      const fracs = Object.values(counts).map((c) => c / seq.length);
      const maxF = Math.max(...fracs);
      let p = 0;
      const represented = Object.values(counts).filter((c) => c > 0).length;
      if (maxF <= 0.5 && represented >= 3) p += 3;
      if (maxF > 0.5) p -= 3;
      return p;
    },
  },
  {
    id: "feld1",
    name: "Fel d 1",
    label: "cat allergen",
    difficulty: "easy",
    bounty: 18,
    ruleSummary: "Likes small/flexible (G, S, A); dislikes bulky aromatics.",
    outcomes: {
      successTitle: "Cat scratch fever (allergy edition)",
      successMessage:
        "Strong Fel d 1 affinity — the cell lives! You \"won\" a prime cat-allergy receptor. Sniffles incoming.",
    },
    rules(seq) {
      let p = 0;
      p += 2 * countInSet(seq, new Set(["G", "S", "A"]));
      p -= 2 * countInSet(seq, new Set(["W", "F", "Y"]));
      return p;
    },
  },
  {
    id: "dnabind",
    name: "DNA-binding protein",
    label: "nuclear protein",
    difficulty: "medium",
    bounty: 45,
    ruleSummary: "Likes negative residues; dislikes positive residues.",
    outcomes: {
      successTitle: "Nuclear coupon redeemed",
      successMessage:
        "High affinity to a nuclear protein — selection passed. Hope you like chromatin-adjacent drama.",
      successDetail: "Totally not how real therapeutic antibodies are chosen.",
    },
    rules(seq) {
      let p = 0;
      p += 2 * countInSet(seq, NEGATIVE);
      p -= 2 * countInSet(seq, POSITIVE);
      return p;
    },
  },
  {
    id: "enzyme",
    name: "Enzyme pocket",
    label: "protein pocket",
    difficulty: "medium",
    bounty: 32,
    ruleSummary: "Likes hydrophobic packing; dislikes too much polar; X-W-X bonus.",
    outcomes: {
      successTitle: "Pocket aces",
      successMessage: "Tight fit in the enzyme pocket — your B cell graduates. Not a drug yet, but it looks the part.",
    },
    rules(seq) {
      let p = 0;
      p += 1 * countInSet(seq, HYDROPHOBIC);
      if (polarFraction(seq) > 0.5) p -= 2;
      if (hasMotifXWX(seq)) p += 3;
      return p;
    },
  },
  {
    id: "glycan",
    name: "Glycan shield",
    label: "shielded viral surface",
    difficulty: "hard",
    bounty: 50,
    ruleSummary: "Tough baseline; rewards shield-like patches; W-X-Y bonus.",
    outcomes: {
      successTitle: "Shield pierced",
      successMessage: "You punched through the glycan fuzz — high affinity, infection neutralized.",
    },
    rules(seq) {
      let p = -3;
      for (const aa of seq) {
        if (HYDROPHOBIC.has(aa)) p += 1;
      }
      if (hasMotifWXY(seq)) p += 4;
      return p;
    },
  },
];

// =============================================================================
// Affinity, specificity, autoimmunity risk
// =============================================================================

/**
 * Affinity for one antigen: one shared base & noise per spin + rule points.
 * @param {string[]} seq
 * @param {AntigenDef} antigen
 * @param {number} spinBase 1..4
 * @param {number} spinNoise -1..1
 */
function computeAffinity(seq, antigen, spinBase, spinNoise) {
  const rules = antigenRulePoints(antigen, seq);
  return clamp(spinBase + rules + spinNoise, 0, 10);
}

/**
 * Specificity 0–10: composition spread vs “sticky” extremes (mostly independent of antigen).
 * @param {string[]} seq
 */
function computeSpecificity(seq) {
  const L = seq.length;
  const counts = getClassCounts(seq);
  const fracs = Object.values(counts).map((c) => c / L);
  const maxF = Math.max(...fracs);
  const nClasses = Object.values(counts).filter((c) => c > 0).length;

  let s = 6;
  if (nClasses >= 4) s += 1;
  if (nClasses >= 5) s += 1;

  if (maxF > 0.5) s -= 3;
  else if (maxF > 0.44) s -= 2;
  else if (maxF >= 0.43) s -= 1;

  const charged = countInSet(seq, new Set([...POSITIVE, ...NEGATIVE]));
  const chFrac = charged / L;
  if (chFrac >= 0.38) s -= 2;
  else if (chFrac >= 0.32) s -= 1;

  if (hydrophobicFraction(seq) > 0.49) s -= 2;
  else if (hydrophobicFraction(seq) >= 0.42) s -= 1;

  const letterCounts = {};
  for (const a of seq) letterCounts[a] = (letterCounts[a] || 0) + 1;
  const maxLetter = Math.max(...Object.values(letterCounts));
  const repeatThreshold = Math.max(4, Math.ceil(L * 0.37));
  if (maxLetter >= repeatThreshold) s -= 2;

  const posOnly = countInSet(seq, POSITIVE);
  if (posOnly / L >= 0.27) s -= 1;

  if (chFrac >= 0.19 && hydrophobicFraction(seq) >= 0.33) s -= 1;

  return clamp(s, 0, 10);
}

/**
 * Autoimmunity risk % (0–90). Shown in UI; on finalize, autoimmune if random in [0,100) < risk.
 * Low specificity stacks with “sticky” sequence chemistry; high affinity adds cross-reactivity pressure.
 * @param {string[]} seq
 * @param {number} affinity 0..10
 * @param {number} specificity 0..10
 * @returns {number} percent 0..85
 */
function computeAutoimmunityRiskPercent(seq, affinity, specificity) {
  const posF = positiveFraction(seq);
  const hydF = hydrophobicFraction(seq);
  const chF = chargedFraction(seq);

  let risk = 8;

  if (posF > 0.37) risk += 12;
  else if (posF > 0.27) risk += 6;

  if (hydF > 0.5) risk += 10;
  else if (hydF > 0.4) risk += 6;

  if (chF > 0.35) risk += 8;
  else if (chF > 0.3) risk += 4;

  if (affinity >= 9) risk += 10;
  else if (affinity >= 8) risk += 6;

  if (specificity <= 2) risk += 22;
  else if (specificity <= 3) risk += 14;
  else if (specificity <= 4) risk += 9;
  else if (specificity <= 5) risk += 5;

  if (specificity <= 4 && chF > 0.28) risk += 6;
  if (specificity <= 4 && hydF > 0.38) risk += 6;
  if (specificity <= 3 && posF > 0.2) risk += 8;

  if (specificity <= 2) risk = Math.max(risk, 72);

  return clamp(risk, 0, 85);
}

/**
 * Rank antigens by affinity; return top 2 (stable tie-break by name).
 * @param {string[]} seq
 * @param {number} spinBase
 * @param {number} spinNoise
 */
function getTopTwoAntigens(seq, spinBase, spinNoise) {
  const scored = ANTIGENS.map((ag) => ({
    antigen: ag,
    affinity: computeAffinity(seq, ag, spinBase, spinNoise),
  }));
  scored.sort((a, b) => {
    if (b.affinity !== a.affinity) return b.affinity - a.affinity;
    return a.antigen.name.localeCompare(b.antigen.name);
  });
  return scored.slice(0, 2);
}

// =============================================================================
// Outcome evaluation
// =============================================================================

const MSG_DEATH = "Low affinity. Cell eliminated during selection.";

/**
 * @param {string[]} seq
 * @param {number} specificity
 */
function autoimmuneDiagnosisLabel(seq, specificity) {
  const posFrac = positiveFraction(seq);
  const hydFrac = hydrophobicFraction(seq);
  const bulkyAro = countInSet(seq, new Set(["W", "F", "Y"]));

  if (specificity < 2) {
    return "Hyper-reactive repertoire — Lupus-like autoimmunity";
  }
  if (posFrac > 0.35 && specificity <= 4) {
    return "Lupus-like autoimmunity";
  }
  if (hydFrac > 0.45 && (specificity <= 5 || bulkyAro >= 3)) {
    return "Rheumatoid-like autoimmunity";
  }
  return "Autoimmune response triggered";
}

/**
 * @typedef {object} OutcomeResult
 * @property {'death'|'autoimmune'|'success'} kind
 * @property {string} title
 * @property {string} message
 * @property {string} detail
 * @property {'lupus'|'ra'|'generic'} [autoFlavor]
 */

/**
 * @param {number} affinity
 * @param {number} riskPercent
 * @param {string[]} seq
 * @param {number} specificity
 * @param {AntigenDef} antigen
 * @returns {OutcomeResult}
 */
function evaluateOutcome(affinity, riskPercent, seq, specificity, antigen) {
  if (affinity < 7) {
    return {
      kind: "death",
      title: "Cell eliminated",
      message: MSG_DEATH,
      detail: "",
    };
  }
  // One roll: autoimmune if U ~ Uniform[0,100) falls below displayed risk %.
  const roll = Math.random() * 100;
  if (roll < riskPercent) {
    const diagnosis = autoimmuneDiagnosisLabel(seq, specificity);
    const detail =
      specificity < 3
        ? "Super-low specificity — your receptor is basically waving at everything."
        : "Your antibody was a little too enthusiastic.";
    let autoFlavor = "generic";
    if (/lupus/i.test(diagnosis)) autoFlavor = "lupus";
    else if (/rheumatoid/i.test(diagnosis)) autoFlavor = "ra";
    return {
      kind: "autoimmune",
      title: diagnosis.toUpperCase(),
      message: diagnosis,
      detail,
      autoFlavor,
    };
  }
  const o = antigen.outcomes;
  return {
    kind: "success",
    title: o.successTitle,
    message: o.successMessage,
    detail: o.successDetail || "",
  };
}

// =============================================================================
// Application state
// =============================================================================

/** @type {{
 *   phase: 'start'|'antigens'|'mutate'|'result',
 *   cdr3: string[],
 *   contextL: string[],
 *   contextR: string[],
 *   spinBase: number,
 *   spinNoise: number,
 *   topTwo: { antigen: AntigenDef, affinity: number }[],
 *   chosen: AntigenDef | null,
 *   mutationPoints: number,
 *   mutationIndex: number | null,
 * }} */
const state = {
  phase: "start",
  cdr3: [],
  contextL: [],
  contextR: [],
  spinBase: 1,
  spinNoise: 0,
  topTwo: [],
  chosen: null,
  mutationPoints: 3,
  mutationIndex: null,
};

/** Persists across rounds until autoimmune wipe or Restart. */
let sessionScore = 0;

function resetGame() {
  reelSpinActive = false;
  state.phase = "start";
  state.cdr3 = [];
  state.contextL = [];
  state.contextR = [];
  state.spinBase = 1;
  state.spinNoise = 0;
  state.topTwo = [];
  state.chosen = null;
  state.mutationPoints = 3;
  state.mutationIndex = null;
}

// =============================================================================
// DOM references
// =============================================================================

/** Prevents double-pull while reels run. */
let reelSpinActive = false;

const el = {
  riskCorner: /** @type {HTMLElement} */ (document.getElementById("risk-corner")),
  riskCornerValue: /** @type {HTMLElement} */ (document.getElementById("risk-corner-value")),
  screenStart: /** @type {HTMLElement} */ (document.getElementById("screen-start")),
  screenAntigens: /** @type {HTMLElement} */ (document.getElementById("screen-antigens")),
  screenMutate: /** @type {HTMLElement} */ (document.getElementById("screen-mutate")),
  screenResult: /** @type {HTMLElement} */ (document.getElementById("screen-result")),
  slotReelsStart: /** @type {HTMLElement} */ (document.getElementById("slot-reels-start")),
  slotReelsAntigen: /** @type {HTMLElement} */ (document.getElementById("slot-reels-antigen")),
  slotMachineAntigenWrap: /** @type {HTMLElement} */ (document.getElementById("slot-machine-antigen-wrap")),
  slotLever: /** @type {HTMLButtonElement} */ (document.getElementById("slot-lever")),
  slotHintStart: /** @type {HTMLElement} */ (document.getElementById("slot-hint-start")),
  slotRowMutate: /** @type {HTMLElement} */ (document.getElementById("slot-row-mutate")),
  antigenCards: /** @type {HTMLElement} */ (document.getElementById("antigen-cards")),
  chosenName: /** @type {HTMLElement} */ (document.getElementById("chosen-antigen-name")),
  chosenRule: /** @type {HTMLElement} */ (document.getElementById("chosen-antigen-rule")),
  chosenBounty: /** @type {HTMLElement} */ (document.getElementById("chosen-antigen-bounty")),
  barAffinity: /** @type {HTMLElement} */ (document.getElementById("bar-affinity")),
  barSpecificity: /** @type {HTMLElement} */ (document.getElementById("bar-specificity")),
  valAffinity: /** @type {HTMLElement} */ (document.getElementById("val-affinity")),
  valSpecificity: /** @type {HTMLElement} */ (document.getElementById("val-specificity")),
  valRiskMain: /** @type {HTMLElement} */ (document.getElementById("val-risk-main")),
  mutationPoints: /** @type {HTMLElement} */ (document.getElementById("mutation-points")),
  btnFinalize: /** @type {HTMLButtonElement} */ (document.getElementById("btn-finalize")),
  mutationOverlay: /** @type {HTMLElement} */ (document.getElementById("mutation-overlay")),
  mutationOptions: /** @type {HTMLElement} */ (document.getElementById("mutation-options")),
  mutationPositionLabel: /** @type {HTMLElement} */ (document.getElementById("mutation-position-label")),
  mutationCancel: /** @type {HTMLButtonElement} */ (document.getElementById("mutation-cancel")),
  resultHeading: /** @type {HTMLElement} */ (document.getElementById("result-heading")),
  resultMessage: /** @type {HTMLElement} */ (document.getElementById("result-message")),
  resultDetail: /** @type {HTMLElement} */ (document.getElementById("result-detail")),
  resultScoreLine: /** @type {HTMLElement} */ (document.getElementById("result-score-line")),
  btnPlayAgain: /** @type {HTMLButtonElement} */ (document.getElementById("btn-play-again")),
  sessionScoreEl: /** @type {HTMLElement} */ (document.getElementById("session-score")),
  btnRestart: /** @type {HTMLButtonElement} */ (document.getElementById("btn-restart")),
};

// =============================================================================
// UI rendering
// =============================================================================

function showScreen(name) {
  const screens = {
    start: el.screenStart,
    antigens: el.screenAntigens,
    mutate: el.screenMutate,
    result: el.screenResult,
  };
  Object.values(screens).forEach((s) => {
    s.classList.remove("screen--active");
    s.classList.add("hidden");
  });
  const active = screens[name];
  active.classList.remove("hidden");
  active.classList.add("screen--active");
}

function setRiskCornerVisible(visible) {
  el.riskCorner.classList.toggle("hidden", !visible);
}

function renderSessionScore() {
  el.sessionScoreEl.textContent = String(sessionScore);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wrap chemistry keywords in spans using the same palette as residue capsules.
 * @param {string} text
 */
function highlightRuleSummary(text) {
  let s = escapeHtml(text);
  const tokens = [];
  let t = 0;
  /** @param {RegExp} re @param {string} cls */
  function wrapAll(re, cls) {
    s = s.replace(re, (m) => {
      const id = `\uE000${t++}\uE000`;
      tokens.push({ id, html: `<span class="rule-hl rule-hl--${cls}">${m}</span>` });
      return id;
    });
  }

  wrapAll(/\bpositive residues\b/gi, "positive");
  wrapAll(/\bnegative residues\b/gi, "negative");
  wrapAll(/\bbulky hydrophobes\b/gi, "hydrophobic");
  wrapAll(/\bbulky aromatics\b/gi, "hydrophobic");
  wrapAll(/\btoo much hydrophobic\b/gi, "hydrophobic");
  wrapAll(/\btoo much polar\b/gi, "polar");
  wrapAll(/\bhigh charge\b/gi, "charge");
  wrapAll(/\bhydrophobic packing\b/gi, "hydrophobic");
  wrapAll(/\bhydrophobicity\b/gi, "hydrophobic");
  wrapAll(/\bsmall\/flexible\b/gi, "small");
  wrapAll(/\bshield-like\b/gi, "hydrophobic");
  wrapAll(/\bhydrophilic\b/gi, "polar");
  wrapAll(/\bhydrophobic\b/gi, "hydrophobic");
  wrapAll(/\bpolar\b/gi, "polar");
  wrapAll(/\baromatics?\b/gi, "hydrophobic");
  wrapAll(/\bbalanced\b/gi, "balanced");
  wrapAll(/\bflexible\b/gi, "small");
  wrapAll(/\bsmall\b/gi, "small");
  wrapAll(/\bpositive\b/gi, "positive");
  wrapAll(/\bnegative\b/gi, "negative");

  for (const { id, html } of tokens) {
    s = s.split(id).join(html);
  }
  return s;
}

/**
 * @param {string} letter
 */
function capsuleClass(letter) {
  const c = getResidueClass(letter);
  return `aa aa--class-${c}`;
}

/**
 * One horizontal row of reel capsules (segment moves as a unit).
 * @param {string[]} letters
 */
function reelRowCapsulesHTML(letters) {
  return letters
    .map((L) => `<span class="${capsuleClass(L)} aa--reel" aria-hidden="true">${L}</span>`)
    .join("");
}

/**
 * Placeholder reels on the title screen before the first pull.
 * @param {HTMLElement} container
 */
function mountPlaceholderReels(container) {
  container.innerHTML = REEL_KEYS.map((key) => {
    const len = REEL_LENGTHS[key];
    const placeholders = Array(len)
      .fill(0)
      .map(() => `<span class="aa aa--placeholder aa--reel" aria-hidden="true">?</span>`)
      .join("");
    return `
      <div class="reel">
        <div class="reel__label">${key}</div>
        <div class="reel__window">
          <div class="reel__strip">
            <div class="reel__row">${placeholders}</div>
          </div>
        </div>
      </div>`;
  }).join("");
}

/**
 * Stopped reels for the antigen picker (and static display).
 * @param {HTMLElement} container
 * @param {{ V: string[], D: string[], J: string[] }} segments
 */
function mountStaticReels(container, segments) {
  container.innerHTML = REEL_KEYS.map((key) => {
    const row = reelRowCapsulesHTML(segments[key]);
    return `
      <div class="reel">
        <div class="reel__label">${key}</div>
        <div class="reel__window">
          <div class="reel__strip">
            <div class="reel__row">${row}</div>
          </div>
        </div>
      </div>`;
  }).join("");
}

/**
 * Build three tall strips; each strip translates as one block (slower, staggered stop).
 * @param {{ V: string[], D: string[], J: string[] }} segments
 */
function buildSpinningReelsInnerHTML(segments) {
  return REEL_KEYS.map((key, reelIdx) => {
    const len = REEL_LENGTHS[key];
    const finalRow = segments[key];
    const numJunkRows = uniformInt(18, 28);
    const rows = [];
    for (let r = 0; r < numJunkRows; r++) rows.push(randomSegmentLetters(len));
    rows.push(finalRow);
    const rowHtml = rows.map((lets) => `<div class="reel__row">${reelRowCapsulesHTML(lets)}</div>`).join("");
    const durationSec = 2.85 + reelIdx * 1.1;
    return `
      <div class="reel reel--spinning" data-reel-idx="${reelIdx}">
        <div class="reel__label">${key}</div>
        <div class="reel__window">
          <div class="reel__strip" data-duration="${durationSec}" style="transform: translateY(0)">
            ${rowHtml}
          </div>
        </div>
      </div>`;
  }).join("");
}

/**
 * @param {HTMLElement} container
 * @param {{ V: string[], D: string[], J: string[] }} segments
 * @param {() => void} onDone
 */
function runSlotReelAnimation(container, segments, onDone) {
  container.innerHTML = buildSpinningReelsInnerHTML(segments);
  const strips = /** @type {HTMLElement[]} */ ([...container.querySelectorAll(".reel__strip")]);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const sampleRow = container.querySelector(".reel__strip .reel__row");
      const measured = sampleRow?.getBoundingClientRect().height ?? 0;
      const rowPx = measured > 0 ? measured : getReelRowHeightPx();
      strips.forEach((strip) => {
        const nRows = strip.querySelectorAll(".reel__row").length;
        const y = Math.max(0, nRows - 1) * rowPx;
        const dur = Number(strip.dataset.duration);
        strip.style.transition = `transform ${dur}s cubic-bezier(0.1, 0.72, 0.12, 1)`;
        strip.style.transform = `translateY(-${y}px)`;
      });
    });
  });

  const lastDur = Number(strips[strips.length - 1]?.dataset.duration ?? "3") * 1000;
  window.setTimeout(() => {
    container.querySelectorAll(".reel--spinning").forEach((node) => node.classList.remove("reel--spinning"));
    onDone();
  }, lastDur + 320);
}

function animateLeverPull() {
  el.slotLever.classList.add("slot-lever--pulled");
  window.setTimeout(() => el.slotLever.classList.remove("slot-lever--pulled"), 480);
}

/**
 * @param {string[]} letters
 * @param {object} opts
 * @param {'context'|'cdr3'} opts.role
 * @param {boolean} [opts.spinning]
 * @param {boolean} [opts.interactive]
 * @param {boolean} [opts.disableMutations]
 */
function buildSlotRowHTML(letters, opts) {
  const { role, spinning = false, interactive = false, disableMutations = false } = opts;
  const spinClass = spinning ? " aa--spin" : "";
  const contextTiles = letters
    .map(
      (L) =>
        `<span class="${capsuleClass(L)}${spinClass}" data-aa="${L}" data-role="${role}" role="img" aria-label="${L}">${L}</span>`
    )
    .join("");

  if (role === "context") {
    return `<div class="slot-context">${contextTiles}</div>`;
  }
  const disabled = interactive && disableMutations ? " aa--disabled" : "";
  const cdr3Tiles = letters
    .map((L, i) => {
      if (interactive) {
        return `<span class="${capsuleClass(L)}${spinClass}${disabled}" data-aa="${L}" data-role="cdr3" data-index="${i}" role="button" tabindex="0" aria-label="Position ${i + 1}, ${L}">${L}</span>`;
      }
      return `<span class="${capsuleClass(L)}${spinClass}" data-aa="${L}" data-role="cdr3" data-index="${i}" role="img" aria-label="Position ${i + 1}, ${L}">${L}</span>`;
    })
    .join("");
  return `<div class="slot-frame">${cdr3Tiles}</div>`;
}

/**
 * Full row: … context | CDR3 | context …
 */
function renderSlotRow(container, seq, contextL, contextR, options = {}) {
  const {
    spinning = false,
    interactive = false,
    flashFrame = false,
    disableMutations = false,
  } = options;
  const left = buildSlotRowHTML(contextL, { role: "context", spinning });
  const mid = buildSlotRowHTML(seq, {
    role: "cdr3",
    spinning,
    interactive,
    disableMutations,
  });
  const right = buildSlotRowHTML(contextR, { role: "context", spinning });
  container.innerHTML = `
    <span class="slot-ellipsis" aria-hidden="true">…</span>
    ${left}
    ${mid}
    ${right}
    <span class="slot-ellipsis" aria-hidden="true">…</span>
  `;
  const frame = container.querySelector(".slot-frame");
  if (frame && flashFrame) {
    frame.classList.remove("slot-frame--flash");
    void frame.offsetWidth;
    frame.classList.add("slot-frame--flash");
  }
}

/**
 * @param {{ antigen: AntigenDef, affinity: number }[]} topTwo
 */
function renderAntigenCards(topTwo) {
  el.antigenCards.innerHTML = topTwo
    .map(
      ({ antigen, affinity }) => `
    <button type="button" class="antigen-card" data-antigen-id="${antigen.id}" aria-label="Select ${antigen.name}, bounty ${antigen.bounty}">
      <div class="antigen-card__bounty" aria-hidden="true">+${antigen.bounty} pts</div>
      <h3 class="antigen-card__name">${antigen.name}</h3>
      <div class="antigen-card__meta">
        <span class="antigen-card__label">${antigen.label}</span>
        <span class="antigen-card__diff">${antigen.difficulty} difficulty</span>
      </div>
      <p class="antigen-card__rule">${highlightRuleSummary(antigen.ruleSummary)}</p>
      <div class="antigen-card__score">Match preview: ${affinity}/10 · win adds <strong>${antigen.bounty}</strong> to your score</div>
    </button>
  `
    )
    .join("");
}

function getCurrentScores() {
  if (!state.chosen) {
    return { affinity: 0, specificity: 0, risk: 0 };
  }
  const aff = computeAffinity(state.cdr3, state.chosen, state.spinBase, state.spinNoise);
  const spec = computeSpecificity(state.cdr3);
  const risk = computeAutoimmunityRiskPercent(state.cdr3, aff, spec);
  return { affinity: aff, specificity: spec, risk };
}

function renderStats() {
  const { affinity, specificity, risk } = getCurrentScores();
  el.valAffinity.textContent = String(affinity);
  el.valSpecificity.textContent = String(specificity);
  el.barAffinity.style.width = `${affinity * 10}%`;
  el.barSpecificity.style.width = `${specificity * 10}%`;
  const riskStr = `${Math.round(risk)}%`;
  el.valRiskMain.textContent = riskStr;
  el.riskCornerValue.textContent = riskStr;
}

function renderMutationPoints() {
  el.mutationPoints.textContent = String(state.mutationPoints);
  el.btnFinalize.disabled = false;
}

// =============================================================================
// Flow actions
// =============================================================================

function onLeverSpin() {
  if (reelSpinActive) return;
  reelSpinActive = true;
  el.slotLever.disabled = true;
  animateLeverPull();

  const seq = generateFullSequence();
  state.cdr3 = seq.cdr3;
  state.contextL = seq.contextL;
  state.contextR = seq.contextR;
  state.spinBase = uniformInt(1, 4);
  state.spinNoise = uniformInt(-1, 1);
  state.topTwo = getTopTwoAntigens(state.cdr3, state.spinBase, state.spinNoise);
  state.mutationPoints = 3;
  state.chosen = null;

  el.slotHintStart.textContent = "Spinning V / D / J...";

  const segments = splitCdr3ToSegments(state.cdr3);
  runSlotReelAnimation(el.slotReelsStart, segments, () => {
    reelSpinActive = false;
    el.slotLever.disabled = false;
    el.slotHintStart.textContent = "Pull the lever to spin V · D · J";

    const startPanel = document.querySelector("#slot-machine-start .slot-machine__panel");
    if (startPanel) {
      startPanel.classList.add("slot-machine__panel--ding");
      window.setTimeout(() => startPanel.classList.remove("slot-machine__panel--ding"), 800);
    }

    window.setTimeout(() => {
      showScreen("antigens");
      setRiskCornerVisible(true);
      mountStaticReels(el.slotReelsAntigen, segments);
      el.slotMachineAntigenWrap.classList.add("slot-machine--landed");
      window.setTimeout(() => el.slotMachineAntigenWrap.classList.remove("slot-machine--landed"), 900);
      renderAntigenCards(state.topTwo);

      const top = state.topTwo[0];
      const aff = top ? top.affinity : 0;
      const spec = computeSpecificity(state.cdr3);
      const risk = computeAutoimmunityRiskPercent(state.cdr3, aff, spec);
      el.riskCornerValue.textContent = `${Math.round(risk)}%`;
    }, 320);
  });
}

/**
 * @param {string} antigenId
 */
function onChooseAntigen(antigenId) {
  const found = ANTIGENS.find((a) => a.id === antigenId);
  if (!found) return;
  state.chosen = found;
  state.phase = "mutate";
  state.mutationPoints = 3;

  el.chosenName.textContent = found.name;
  el.chosenRule.innerHTML = highlightRuleSummary(found.ruleSummary);
  el.chosenBounty.textContent = `Bounty: +${found.bounty} pts if you win`;

  showScreen("mutate");
  setRiskCornerVisible(true);
  renderSlotRow(el.slotRowMutate, state.cdr3, state.contextL, state.contextR, {
    interactive: true,
    disableMutations: state.mutationPoints <= 0,
  });
  renderStats();
  renderMutationPoints();
  attachCdr3ClickHandlers();
}

function attachCdr3ClickHandlers() {
  const tiles = el.slotRowMutate.querySelectorAll('[data-role="cdr3"]');
  tiles.forEach((node) => {
    node.addEventListener("click", onCdr3TileClick);
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onCdr3TileClick(/** @type {any} */ (e));
      }
    });
  });
}

/**
 * @param {Event} ev
 */
function onCdr3TileClick(ev) {
  if (state.mutationPoints <= 0) return;
  const t = /** @type {HTMLElement} */ (ev.currentTarget);
  const idx = Number(t.dataset.index);
  if (Number.isNaN(idx)) return;
  state.mutationIndex = idx;
  openMutationPicker(idx);
}

/**
 * @param {number} index
 */
function openMutationPicker(index) {
  const current = state.cdr3[index];
  el.mutationPositionLabel.textContent = `position ${index + 1} (${current})`;

  const options = [];
  while (options.length < 3) {
    const pick = randomAminoAcid();
    options.push(pick);
  }

  el.mutationOptions.innerHTML = options
    .map(
      (L) =>
        `<button type="button" class="${capsuleClass(L)}" data-replace="${L}" aria-label="Replace with ${L}">${L}</button>`
    )
    .join("");

  el.mutationOptions.querySelectorAll("button[data-replace]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const letter = /** @type {HTMLButtonElement} */ (btn).dataset.replace;
      if (letter && state.mutationIndex !== null) {
        applyMutation(state.mutationIndex, letter);
      }
      closeMutationPicker();
    });
  });

  el.mutationOverlay.classList.remove("hidden");
  el.mutationOverlay.setAttribute("aria-hidden", "false");
}

function closeMutationPicker() {
  state.mutationIndex = null;
  el.mutationOverlay.classList.add("hidden");
  el.mutationOverlay.setAttribute("aria-hidden", "true");
}

/**
 * @param {number} index
 * @param {string} letter
 */
function applyMutation(index, letter) {
  state.cdr3[index] = letter;
  state.mutationPoints -= 1;
  renderSlotRow(el.slotRowMutate, state.cdr3, state.contextL, state.contextR, {
    interactive: true,
    disableMutations: state.mutationPoints <= 0,
    flashFrame: true,
  });
  renderStats();
  renderMutationPoints();
  attachCdr3ClickHandlers();
}

function onFinalize() {
  if (!state.chosen) return;
  const { affinity, specificity, risk } = getCurrentScores();
  const outcome = evaluateOutcome(affinity, risk, state.cdr3, specificity, state.chosen);

  el.screenResult.classList.remove("screen-result--wipe");

  el.resultHeading.textContent = outcome.title;
  el.resultHeading.classList.remove(
    "result-title--win",
    "result-title--death",
    "result-title--auto",
    "result-title--auto-lupus",
    "result-title--auto-ra"
  );
  if (outcome.kind === "success") {
    el.resultHeading.classList.add("result-title--win");
  } else if (outcome.kind === "death") {
    el.resultHeading.classList.add("result-title--death");
  } else {
    el.resultHeading.classList.add("result-title--auto");
    if (outcome.autoFlavor === "lupus") el.resultHeading.classList.add("result-title--auto-lupus");
    if (outcome.autoFlavor === "ra") el.resultHeading.classList.add("result-title--auto-ra");
    el.screenResult.classList.add("screen-result--wipe");
  }

  el.resultMessage.textContent = outcome.message;
  if (outcome.detail) {
    el.resultDetail.textContent = outcome.detail;
    el.resultDetail.classList.remove("hidden");
  } else {
    el.resultDetail.classList.add("hidden");
  }

  if (outcome.kind === "success") {
    const gain = state.chosen.bounty;
    sessionScore += gain;
    el.resultScoreLine.textContent = `+${gain} points! Total score: ${sessionScore}.`;
  } else if (outcome.kind === "autoimmune") {
    const lost = sessionScore;
    sessionScore = 0;
    el.resultScoreLine.textContent =
      lost > 0
        ? `SCORE WIPED — you lost all ${lost} points.`
        : `SCORE WIPED — you're already at zero.`;
  } else {
    const deathPenalty = 30;
    sessionScore -= deathPenalty;
    el.resultScoreLine.textContent = `Cell eliminated — −${deathPenalty} points. Total score: ${sessionScore}.`;
  }
  renderSessionScore();
  el.resultScoreLine.classList.remove("hidden");

  setRiskCornerVisible(false);
  showScreen("result");
}

function onPlayAgain() {
  resetGame();
  setRiskCornerVisible(false);
  showScreen("start");
  mountPlaceholderReels(el.slotReelsStart);
}

function onRestartScore() {
  sessionScore = 0;
  renderSessionScore();
  resetGame();
  reelSpinActive = false;
  el.slotLever.disabled = false;
  setRiskCornerVisible(false);
  showScreen("start");
  mountPlaceholderReels(el.slotReelsStart);
  el.slotHintStart.textContent = "Pull the lever to spin V · D · J";
}

// =============================================================================
// Init
// =============================================================================

el.slotLever.addEventListener("click", onLeverSpin);

el.antigenCards.addEventListener("click", (e) => {
  const btn = /** @type {HTMLElement} */ (e.target).closest("[data-antigen-id]");
  if (!btn) return;
  const id = btn.getAttribute("data-antigen-id");
  if (id) onChooseAntigen(id);
});

el.btnFinalize.addEventListener("click", onFinalize);
el.mutationCancel.addEventListener("click", closeMutationPicker);
el.mutationOverlay.addEventListener("click", (e) => {
  if (e.target === el.mutationOverlay) closeMutationPicker();
});
el.btnPlayAgain.addEventListener("click", onPlayAgain);
el.btnRestart.addEventListener("click", onRestartScore);

showScreen("start");
setRiskCornerVisible(false);
mountPlaceholderReels(el.slotReelsStart);
renderSessionScore();
