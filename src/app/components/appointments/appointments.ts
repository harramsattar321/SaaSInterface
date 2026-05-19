// ─────────────────────────────────────────────────────────────────────────────
// PATCH — replace the two methods below inside AppointmentBookingComponent
// ─────────────────────────────────────────────────────────────────────────────

// ── AI Emergency Detection ────────────────────────────────────────────────────

private readonly FAST_PRECHECK_PATTERNS: RegExp[] = [
  /\b(heart\s*attack|chest\s*pain|stroke|seizure|unconscious|overdose|poison|bleed|fracture|broken\s*bone|accident|crash|fell|emergency|urgent|can'?t\s*breath)\b/i,
];

private isObviousEmergency(text: string): boolean {
  return this.FAST_PRECHECK_PATTERNS.some(re => re.test(text));
}

/**
 * Calls the Groq API (llama-3.3-70b) to semantically analyse the reason text.
 * Handles misspellings, synonyms, mixed languages, and rough grammar.
 */
private async detectEmergencyWithAI(reason: string): Promise<{ isEmergency: boolean; category: string }> {

  const GROQ_API_KEY = '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';
  const GROQ_MODEL   = 'llama-3.3-70b-versatile';

  // ── THIS WAS THE BUG: the prompt was just a placeholder comment ──
  const systemPrompt = `
You are a medical triage assistant. Your only job is to read a patient's reason
for booking an appointment and decide whether it describes a medical emergency.

Rules:
- Be tolerant of typos, misspellings, abbreviations, rough grammar, and mixed languages.
  Examples: "accidant" = accident, "hert atack" = heart attack, "seziure" = seizure,
  "i cant breth" = can't breathe, "fanted" = fainted, "bleding" = bleeding.
- If the text plausibly describes an emergency, mark it as one — err on the side of caution.
- Reply ONLY with a valid JSON object — no markdown fences, no explanation, nothing else.

JSON schema (exactly two keys):
{
  "isEmergency": true | false,
  "category": one of "cardiac" | "accident" | "stroke" | "unconscious" | "severe_pain" | "allergic" | "poisoning" | "other_emergency" | ""
}

category must be "" when isEmergency is false.

Examples:
  "accidant"          → {"isEmergency":true,"category":"accident"}
  "hert atack"        → {"isEmergency":true,"category":"cardiac"}
  "fanted in office"  → {"isEmergency":true,"category":"unconscious"}
  "routine checkup"   → {"isEmergency":false,"category":""}
  "mild headache"     → {"isEmergency":false,"category":""}
`.trim();

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model:      GROQ_MODEL,
      max_tokens: 100,
      // temperature 0 → deterministic, reduces hallucinated JSON
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: reason },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Groq API error ${response.status}`);

  const data  = await response.json();
  const text  = data.choices[0].message.content ?? '';
  // Strip any accidental markdown fences the model may still emit
  const clean = text.replace(/```[a-z]*\n?/gi, '').trim();
  return JSON.parse(clean);
}

// ── Local keyword fallback (used only if API call fails) ──────────────────────
//
// Extended with common misspelling variants so the fallback is also resilient.

private readonly EMERGENCY_KEYWORDS: Record<string, string[]> = {
  cardiac: [
    'heart attack','heart atack','hert attack','hert atack','hart attack',
    'chest pain','chest pian','chestpain','chest tightness','chest pressure',
    'cardiac arrest','heart pain','heart failure','palpitations',
    'irregular heartbeat','angina','myocardial','left arm pain','jaw pain',
    'shortness of breath','short of breath','cant breathe',"can't breathe",
    'cant breth',"can't breth",'difficulty breathing','breathing difficulty',
    'breathless','i cant breath','i can\'t breath',
  ],
  accident: [
    'accident','accidant','acident','accsident',
    'car crash','road accident','vehicle accident','motorcycle accident',
    'bike accident','hit by car','fell','fall','fallen',
    'fracture','fractured','fractur',
    'broken bone','broken arm','broken leg','brokn',
    'head injury','head trauma','skull','concussion',
    'trauma','bleeding','bleding','bleading','blood loss',
    'heavy bleeding','wound','deep cut','laceration','internal bleeding',
  ],
  stroke: [
    'stroke','strok','paralysis','face drooping','face droping',
    'arm weakness','leg weakness','speech problem','slurred speech',
    'slured speech','sudden headache','worst headache',
    'vision loss','sudden vision','numbness','numness','confusion',
    'loss of balance','brain attack',
  ],
  unconscious: [
    'unconscious','unconscous','fainted','fainting','fanted','faited',
    'passed out','passd out','unresponsive','not responding',
    'collapsed','colapsed','blackout','black out',
    'loss of consciousness','dizzy and fell','dizziness',
  ],
  severe_pain: [
    'severe pain','sevear pain','extream pain','extreme pain',
    'unbearable pain','sharp pain','stabbing pain','intense pain',
    'excruciating','worst pain','severe abdominal pain','severe stomach pain',
    'appendix',
  ],
  allergic: [
    'allergic reaction','alergic reaction','anaphylaxis','anaphylactic',
    'swollen throat','throat closing','hives','swelling face',
    'face swelling','epipen','bee sting','severe allergy',
  ],
  poisoning: [
    'overdose','ovrdose','poisoning','poising','poison',
    'swallowed','ingested','drug overdose','medication overdose',
    'toxic','chemical burn','burn','burnt','severe burn',
  ],
  other_emergency: [
    'emergency','emergancy','emergenci','urgent','urgnt',
    'critical','serious condition','life threatening','life-threatening',
    'immediately','right now','help me',
    'vomiting blood','blood in vomit','coughing blood',
    'seizure','seziure','siezure','convulsion','epilepsy attack',
    'high fever','fever 40','fever 41','fever 42',
  ],
};

private detectEmergencyLocally(reason: string): { isEmergency: boolean; category: string } {
  if (!reason || reason.trim().length < 3) return { isEmergency: false, category: '' };

  const lower = reason.toLowerCase();

  // Also apply a simple single-character-substitution fuzzy check for very short tokens
  for (const [category, keywords] of Object.entries(this.EMERGENCY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return { isEmergency: true, category };
    }
  }

  // Light fuzzy pass: tokenise the input and check edit-distance ≤ 2
  // against a core set of high-risk words.
  const HIGH_RISK_WORDS = [
    'accident','fracture','seizure','fainted','unconscious',
    'bleeding','overdose','poisoning','stroke','cardiac',
  ];
  const inputTokens = lower.split(/\W+/).filter(t => t.length > 3);
  for (const token of inputTokens) {
    for (const risk of HIGH_RISK_WORDS) {
      if (this.levenshtein(token, risk) <= 2) {
        return { isEmergency: true, category: 'other_emergency' };
      }
    }
  }

  return { isEmergency: false, category: '' };
}

/** Levenshtein distance — O(n·m), fine for short medical words. */
private levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
