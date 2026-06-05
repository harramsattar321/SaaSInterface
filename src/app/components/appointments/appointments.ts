import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AppointmentService, Doctor, Appointment } from '../../services/appointment.service';

@Component({
  selector: 'app-appointment-booking',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './appointments.html',
  styleUrls: ['./appointments.css']
})
export class AppointmentBookingComponent implements OnInit, OnDestroy {

  // ── Doctor / date / slot state ────────────────────────────
  doctors: Doctor[] = [];
  selectedDoctor: Doctor | null = null;
  selectedDate: string = '';
  selectedSlot: string = '';

  availableSlots: string[] = [];
  bookedSlots: string[] = [];
  allGeneratedSlots: string[] = [];

  minDate: string = '';
  availableDaysForDoctor: number[] = [];

  // ── Reason / emergency state ──────────────────────────────
  reason: string = '';
  isEmergency: boolean = false;
  emergencyCategory: string = '';
  isDetecting: boolean = false;

  // ── UI flags ──────────────────────────────────────────────
  isLoadingDoctors: boolean = false;
  isLoadingSlots: boolean = false;
  isSubmitting: boolean = false;

  bookingSuccess: boolean = false;
  bookedAppointmentTime: string = '';
  bookingError: string = '';
  slotError: string = '';
  doctorUnavailableMessage: string = '';

  patientId: string = '';

  // ── Debounce timer & AI result cache ─────────────────────
  private detectDebounceTimer: any = null;
  private readonly DETECT_DEBOUNCE_MS = 500;

  // Cache AI results so same phrase never hits API twice
  private aiResultCache = new Map<string, { isEmergency: boolean; category: string }>();

  private destroy$ = new Subject<void>();

  // ── Groq config (move to environment.ts later) ────────────
  private readonly GROQ_API_KEY = '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';
  private readonly GROQ_MODEL   = 'llama-3.3-70b-versatile';

  private readonly GROQ_SYSTEM_PROMPT = `You are a medical triage assistant. Your only job is to read a patient's reason for booking an appointment and decide whether it describes a medical emergency.

Rules:
- Be tolerant of typos, misspellings, abbreviations, rough grammar, and MIXED LANGUAGES including Urdu/Hindi/Roman Urdu.
- Misspelled English examples you MUST detect: accidant, hert atak, hert atack, hart attack, seziure, siezure, fanted, bleding, bleading, chestpian, cant breth, sevear pain, extream pain, colapsed, unconscous, ovrdose, fractur, brokn
- Urdu / Roman Urdu examples you MUST detect:
    Cardiac:     mera dil dard kar raha, dil dard, seena dard, seene mein dard, dil ka dora, saans nahi aa raha, sans nahi aa raha, saans band, sans rukk gaya, saans lena mushkil, dil tez dhadak raha
    Accident:    girr gaya, gir gaya, hadsa ho gaya, gaari accident, haddi tooti, khoon aa raha, khoon nikal raha, chot lagi, badi chot, toot gaya
    Unconscious: behosh ho gaya, behosh ho gayi, behoshi, hosh nahi, girr ke behosh ho gaya
    Severe pain: bht tez dard, bahut tez dard, bohot zyada dard, dard bardaasht nahi, pet mein tez dard
    General:     marne wala hoon, marne wali hoon, meri jaan jaa rahi, jaan bachao, madad karo, chakkar aa raha, ulti nahi ruk rahi, tez bukhar, bukhaar 40, tabiyat bht kharab, gala band ho raha, gala suj gaya
- If the text PLAUSIBLY describes an emergency in ANY language, mark isEmergency true. Always err on the side of caution.
- Reply ONLY with a valid JSON object. No markdown fences, no explanation, nothing else.

JSON schema (exactly two keys):
{"isEmergency": true|false, "category": "cardiac"|"accident"|"stroke"|"unconscious"|"severe_pain"|"allergic"|"poisoning"|"other_emergency"|""}

category must be "" when isEmergency is false.

Examples:
"accidant"                     → {"isEmergency":true,"category":"accident"}
"hert atak"                    → {"isEmergency":true,"category":"cardiac"}
"fanted in office"             → {"isEmergency":true,"category":"unconscious"}
"mera dil dard kar raha"       → {"isEmergency":true,"category":"cardiac"}
"sans nahi aa raha"            → {"isEmergency":true,"category":"other_emergency"}
"seena dard ho raha hai"       → {"isEmergency":true,"category":"cardiac"}
"behosh ho gaya"               → {"isEmergency":true,"category":"unconscious"}
"girr gaya khoon aa raha"      → {"isEmergency":true,"category":"accident"}
"bht tez dard ho raha"         → {"isEmergency":true,"category":"severe_pain"}
"marne wala hoon"              → {"isEmergency":true,"category":"other_emergency"}
"chakkar aa raha behoshi"      → {"isEmergency":true,"category":"unconscious"}
"tez bukhar"                   → {"isEmergency":true,"category":"other_emergency"}
"routine checkup"              → {"isEmergency":false,"category":""}
"mild headache"                → {"isEmergency":false,"category":""}
"aam checkup"                  → {"isEmergency":false,"category":""}
"follow up visit"              → {"isEmergency":false,"category":""}`;

  constructor(
    private appointmentService: AppointmentService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.loadPatientId();
    this.loadDoctors();
    this.setMinDate();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.detectDebounceTimer) clearTimeout(this.detectDebounceTimer);
  }

  // ── Setup ─────────────────────────────────────────────────

  private loadPatientId(): void {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      const user = JSON.parse(currentUser);
      this.patientId = user.userId || user.id;
    }
  }

  private setMinDate(): void {
    const today = new Date();
    this.minDate = today.toISOString().split('T')[0];
  }

  // ── Doctors ───────────────────────────────────────────────

  loadDoctors(): void {
    this.zone.run(() => { this.isLoadingDoctors = true; });

    this.appointmentService.getAllDoctors().subscribe({
      next: (data) => {
        this.zone.run(() => {
          this.doctors = data;
          this.isLoadingDoctors = false;
        });
      },
      error: (err) => {
        console.error('Error loading doctors:', err);
        this.zone.run(() => { this.isLoadingDoctors = false; });
      }
    });

    setTimeout(() => {
      if (this.isLoadingDoctors) {
        this.zone.run(() => { this.isLoadingDoctors = false; });
      }
    }, 5000);
  }

  onDoctorSelect(event: Event): void {
    const selectEl = event.target as HTMLSelectElement;
    const doctorId = Number(selectEl.value);

    this.zone.run(() => {
      this.selectedDoctor = this.doctors.find(d => Number(d.id) === doctorId) || null;
      this.selectedDate = '';
      this.selectedSlot = '';
      this.availableSlots = [];
      this.allGeneratedSlots = [];
      this.slotError = '';
      this.reason = '';
      this.isEmergency = false;
      this.emergencyCategory = '';
      this.doctorUnavailableMessage = '';

      if (this.selectedDoctor) {
        this.availableDaysForDoctor = this.getDayNumbers(this.selectedDoctor.availableDays);
      }
    });
  }

  private getDayNumbers(days: string[]): number[] {
    const dayMap: { [key: string]: number } = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2,
      'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    return (days || []).map(d => dayMap[d]);
  }

  // ── Date / slots ──────────────────────────────────────────

  onDateChange(): void {
    this.selectedSlot = '';
    this.availableSlots = [];
    this.allGeneratedSlots = [];
    this.slotError = '';

    if (!this.selectedDoctor || !this.selectedDate) return;

    const dateObj = new Date(this.selectedDate + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const slotsForDay = this.selectedDoctor.timeSlots.filter(ts => ts.day === dayName);

    if (slotsForDay.length === 0) {
      this.slotError = `Dr. ${this.selectedDoctor.name.replace('Dr. ', '')} is not available on ${dayName}s.`;
      return;
    }

    this.isLoadingSlots = true;
    this.cdr.detectChanges();

    this.appointmentService.getAppointmentsByDoctorAndDate(
      this.selectedDoctor.id,
      this.selectedDate
    ).subscribe({
      next: (response: any) => {
        this.zone.run(() => {
          const appointments = Array.isArray(response) ? response : response.data ?? [];
          this.bookedSlots = appointments.map((a: any) => a.time);
          this.generateAvailableSlots(slotsForDay);
          this.isLoadingSlots = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.zone.run(() => {
          this.generateAvailableSlots(slotsForDay);
          this.isLoadingSlots = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  private generateAvailableSlots(slotsForDay: any[]): void {
    const allSlots: string[] = [];

    slotsForDay.forEach(slot => {
      const [startH, startM] = slot.startTime.split(':').map(Number);
      const [endH, endM]     = slot.endTime.split(':').map(Number);

      let current = startH * 60 + startM;
      const end   = endH * 60 + endM;

      while (current + 15 <= end) {
        const h    = Math.floor(current / 60);
        const m    = current % 60;
        const ampm = h < 12 ? 'AM' : 'PM';
        const h12  = h % 12 === 0 ? 12 : h % 12;
        allSlots.push(`${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`);
        current += 15;
      }
    });

    this.allGeneratedSlots = allSlots;
    this.availableSlots = allSlots.filter(slot => {
      if (this.bookedSlots.includes(slot)) return false;

      const isToday = this.selectedDate === new Date().toISOString().split('T')[0];
      if (isToday) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const [timePart, ampm] = slot.split(' ');
        const [h, m] = timePart.split(':').map(Number);
        let slotMinutes = h * 60 + m;
        if (ampm === 'PM' && h !== 12) slotMinutes += 720;
        if (ampm === 'AM' && h === 12) slotMinutes = m;
        if (slotMinutes <= nowMinutes) return false;
      }

      return true;
    });
  }

  onSlotSelect(slot: string): void {
    this.zone.run(() => { this.selectedSlot = slot; });
  }

  isSlotSelected(slot: string): boolean {
    return this.selectedSlot === slot;
  }

  get allSlotsBooked(): boolean {
    return this.allGeneratedSlots.length > 0 &&
           this.availableSlots.length === 0;
  }

  // ══════════════════════════════════════════════════════════
  // ── AI Emergency Detection (Groq) ─────────────────────────
  // ══════════════════════════════════════════════════════════

  // Layer 1 — instant regex precheck for obvious English emergencies
  private readonly FAST_PRECHECK_PATTERNS: RegExp[] = [
    /\b(heart\s*attack|chest\s*pain|stroke|seizure|unconscious|overdose|poison|bleed|fracture|broken\s*bone|accident|crash|fell|emergency|urgent|can'?t\s*breat)/i,
  ];

  private isObviousEmergency(text: string): boolean {
    return this.FAST_PRECHECK_PATTERNS.some(re => re.test(text));
  }

  // Cache wrapper — same phrase never hits Groq API twice
  private async detectEmergencyWithAI(reason: string): Promise<{ isEmergency: boolean; category: string }> {
    const cacheKey = reason.toLowerCase().trim();

    if (this.aiResultCache.has(cacheKey)) {
      console.log('[AI Cache] Hit — skipping API call for:', cacheKey);
      return this.aiResultCache.get(cacheKey)!;
    }

    const result = await this.callGroqAPI(reason);
    this.aiResultCache.set(cacheKey, result);
    return result;
  }

  // Groq API call
  private async callGroqAPI(reason: string): Promise<{ isEmergency: boolean; category: string }> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model:       this.GROQ_MODEL,
        max_tokens:  150,
        temperature: 0,
        messages: [
          { role: 'system', content: this.GROQ_SYSTEM_PROMPT },
          { role: 'user',   content: reason }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(`Groq API error ${response.status}: ${errBody?.error?.message || ''}`);
    }

    const data  = await response.json();
    const text  = data.choices?.[0]?.message?.content ?? '';
    const clean = text.replace(/```[a-z]*\n?/gi, '').trim();

    try {
      return JSON.parse(clean);
    } catch {
      console.warn('[Groq] Failed to parse JSON response:', clean);
      return { isEmergency: false, category: '' };
    }
  }

  // ── Reason input handler ──────────────────────────────────

  onReasonInput(): void {
    const text = this.reason.trim();

    // Reset if too short
    if (text.length < 3) {
      this.zone.run(() => {
        this.isEmergency       = false;
        this.emergencyCategory = '';
        this.isDetecting       = false;
        this.cdr.detectChanges();
      });
      return;
    }

    // Layer 1: instant regex — catches obvious English keywords
    if (this.isObviousEmergency(text)) {
      this.zone.run(() => {
        this.isEmergency       = true;
        this.emergencyCategory = 'other_emergency';
        this.selectedSlot      = '';
        this.isDetecting       = false;
        this.cdr.detectChanges();
      });
      return;
    }

    // Layer 2: local keyword + fuzzy detection (instant, no API)
    const localResult = this.detectEmergencyLocally(text);
    if (localResult.isEmergency) {
      this.zone.run(() => {
        this.isEmergency       = localResult.isEmergency;
        this.emergencyCategory = localResult.category;
        this.selectedSlot      = '';
        this.isDetecting       = false;
        this.cdr.detectChanges();
      });
      return;
    }

    // Layer 3: Groq AI with debounce — handles Urdu + complex sentences local missed
    this.zone.run(() => {
      this.isDetecting = true;
      this.cdr.detectChanges();
    });

    if (this.detectDebounceTimer) clearTimeout(this.detectDebounceTimer);

    this.detectDebounceTimer = setTimeout(async () => {
      try {
        const result = await this.detectEmergencyWithAI(text);
        this.zone.run(() => {
          this.isEmergency       = result.isEmergency;
          this.emergencyCategory = result.category;
          this.isDetecting       = false;
          if (this.isEmergency) this.selectedSlot = '';
          this.cdr.detectChanges();
        });
      } catch (err) {
        console.warn('[Groq] Detection failed, falling back to local:', err);
        const fallback = this.detectEmergencyLocally(text);
        this.zone.run(() => {
          this.isEmergency       = fallback.isEmergency;
          this.emergencyCategory = fallback.category;
          this.isDetecting       = false;
          if (this.isEmergency) this.selectedSlot = '';
          this.cdr.detectChanges();
        });
      }
    }, this.DETECT_DEBOUNCE_MS);
  }

  // ══════════════════════════════════════════════════════════
  // ── Local keyword + fuzzy fallback ───────────────────────
  // ══════════════════════════════════════════════════════════

  private readonly EMERGENCY_KEYWORDS: Record<string, string[]> = {
    cardiac: [
      'heart attack','chest pain','chest tightness','chest pressure',
      'cardiac arrest','heart pain','heart failure','palpitations',
      'irregular heartbeat','angina','myocardial','left arm pain','jaw pain',
      'shortness of breath','short of breath','cant breathe',"can't breathe",
      'difficulty breathing','breathing difficulty','breathless',
      // misspellings
      'heart atack','hert attack','hert atack','hart attack','hert attak',
      'hart attak','heart attak','hert atak','heart atak','hart atak',
      'hrt atak','hrt atack','chestpain','chest pian',
      'cant breth',"can't breth",'i cant breath','i can t breathe',
      // Urdu / Roman Urdu
      'dil dard','dil ka dard','seena dard','seene mein dard','seene ka dard',
      'dil ka dora','heart ka dora','dil band','seena tight',
      'dil tez','dil dhadak','mera dil dard','dil mein dard',
      'saans nahi','sans nahi','sans rukk','saans rukk','saans band',
      'sans lena mushkil','saans lena mushkil',
    ],
    accident: [
      'accident','car crash','road accident','vehicle accident','motorcycle accident',
      'bike accident','hit by car','fell','fall','fallen',
      'fracture','fractured','broken bone','broken arm','broken leg',
      'head injury','head trauma','skull','concussion',
      'trauma','bleeding','blood loss','heavy bleeding',
      'wound','deep cut','laceration','internal bleeding',
      // misspellings
      'accidant','acident','accsident','fractur','brokn',
      'bleding','bleading',
      // Urdu / Roman Urdu
      'girr gaya','gir gaya','giir gaya','girr paya','hadsa',
      'gaari accident','accident ho gaya','toot gaya','haddi tooti',
      'khoon aa raha','khoon nikal raha','bahut khoon',
      'chot lagi','badi chot','serious chot',
    ],
    stroke: [
      'stroke','paralysis','face drooping','face droping',
      'arm weakness','leg weakness','speech problem','slurred speech',
      'slured speech','sudden headache','worst headache',
      'vision loss','sudden vision','numbness','confusion',
      'loss of balance','brain attack',
      // Urdu
      'muh tirha','haath kamzor','taang kamzor','baat nahi ho rahi',
      'aankhon se nahi dikh raha','ankhon se dhundla','nass phati',
    ],
    unconscious: [
      'unconscious','fainted','fainting','passed out','unresponsive',
      'not responding','collapsed','blackout','black out',
      'loss of consciousness','dizzy and fell','dizziness',
      // misspellings
      'unconscous','fanted','faited','passd out','colapsed',
      // Urdu
      'behosh','behosh ho gaya','behosh ho gayi','behoshi',
      'girr gaya behosh','hosh nahi','hosh kho diya',
      'girr pari','hosh nahi raha',
    ],
    severe_pain: [
      'severe pain','extreme pain','unbearable pain','sharp pain',
      'stabbing pain','intense pain','excruciating','worst pain',
      'severe abdominal pain','severe stomach pain','appendix',
      // misspellings
      'sevear pain','extream pain',
      // Urdu
      'bht tez dard','bahut tez dard','bohot zyada dard','bht zyada dard',
      'dard bardaasht nahi','dard nahi jhel sakta','bohot dard',
      'pet mein tez dard','sar mein tez dard',
    ],
    allergic: [
      'allergic reaction','anaphylaxis','anaphylactic',
      'swollen throat','throat closing','hives','swelling face',
      'face swelling','epipen','bee sting','severe allergy',
      'alergic reaction',
      // Urdu
      'gala band ho raha','gala suj gaya','chehra suj gaya',
      'allergy reaction','bee ne kata',
    ],
    poisoning: [
      'overdose','poisoning','swallowed','ingested',
      'drug overdose','medication overdose','toxic','chemical burn',
      'burn','burnt','severe burn',
      'ovrdose','poising','poison',
      // Urdu
      'zeher kha liya','dawai bht zyada kha li','dawai overdose',
      'jal gaya','jal gayi','aag lagi','andar kuch kha liya',
    ],
    other_emergency: [
      'emergency','urgent','critical','serious condition',
      'life threatening','life-threatening','immediately','right now','help me',
      'vomiting blood','blood in vomit','coughing blood',
      'seizure','convulsion','epilepsy attack',
      'high fever','fever 40','fever 41','fever 42',
      'emergancy','emergenci','urgnt','seziure','siezure',
      // Urdu
      'emergency hai','madad karo','mujhe madad chahiye','jaldi aao',
      'meri jaan jaa rahi','marne wala hoon','marne wali hoon',
      'chakkar aa raha','ulti ho rahi','ulti nahi ruk rahi',
      'meri tabiyat bht kharab','tabiyat theek nahi',
      'tez bukhar','bukhaar 40','bukhaar 41',
      'jaan bachao',
    ],
  };

  private detectEmergencyLocally(reason: string): { isEmergency: boolean; category: string } {
    if (!reason || reason.trim().length < 3) return { isEmergency: false, category: '' };

    const lower = reason.toLowerCase();

    // Step 1: exact substring match
    for (const [category, keywords] of Object.entries(this.EMERGENCY_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) return { isEmergency: true, category };
      }
    }

    // Step 2: Soundex phonetic match
    const phoneticResult = this.detectByPhonetic(lower);
    if (phoneticResult) {
      return { isEmergency: true, category: phoneticResult };
    }

    // Step 3: Levenshtein on individual tokens
    const HIGH_RISK_WORDS = [
      'accident', 'fracture', 'seizure',  'fainted',  'unconscious',
      'bleeding', 'overdose', 'poisoning','stroke',   'cardiac',
      'attack',   'heart',    'chest',    'emergency','breathe',
      'behosh',   'dard',     'seena',    'khoon',    'hadsa', 'bukhar'
    ];
    const inputTokens = lower.split(/\W+/).filter((t: string) => t.length > 2);

    for (const token of inputTokens) {
      for (const risk of HIGH_RISK_WORDS) {
        const threshold = risk.length > 6 ? 3 : 2;
        if (this.levenshtein(token, risk) <= threshold) {
          return { isEmergency: true, category: 'other_emergency' };
        }
      }
    }

    // Step 4: token-pair join check (e.g. "hert"+"atak" → "hertatak" ≈ "heartattack")
    const HIGH_RISK_PHRASES = [
      'heartattack', 'chestpain', 'heartfailure',
      'headinjury', 'bloodloss', 'brainstroke',
    ];
    for (let i = 0; i < inputTokens.length - 1; i++) {
      const pair = inputTokens[i] + inputTokens[i + 1];
      for (const phrase of HIGH_RISK_PHRASES) {
        if (this.levenshtein(pair, phrase) <= 3) {
          return { isEmergency: true, category: 'cardiac' };
        }
      }
    }

    return { isEmergency: false, category: '' };
  }

  // ── Soundex ───────────────────────────────────────────────

  private soundex(word: string): string {
    if (!word) return '0000';
    const w = word.toUpperCase();
    const codeMap: Record<string, string> = {
      B:'1', F:'1', P:'1', V:'1',
      C:'2', G:'2', J:'2', K:'2', Q:'2', S:'2', X:'2', Z:'2',
      D:'3', T:'3',
      L:'4',
      M:'5', N:'5',
      R:'6',
    };

    let result = w[0];
    let prev   = codeMap[w[0]] ?? '0';

    for (let i = 1; i < w.length && result.length < 4; i++) {
      const code = codeMap[w[i]] ?? '0';
      if (code !== '0' && code !== prev) {
        result += code;
      }
      prev = code;
    }

    return result.padEnd(4, '0');
  }

  private readonly EMERGENCY_SOUNDEX: Record<string, string> = {
    'H630': 'cardiac',          // heart, hert, hart, haart
    'A320': 'cardiac',          // attack, atak, atack, attak
    'C323': 'cardiac',          // cardiac
    'C152': 'cardiac',          // chest
    'S362': 'stroke',           // stroke, strok
    'P642': 'stroke',           // paralysis
    'U525': 'unconscious',      // unconscious, unconscous
    'F530': 'unconscious',      // fainted, fanted, faited
    'A235': 'accident',         // accident, accidant, acident
    'F620': 'accident',         // fracture, fractur
    'B453': 'accident',         // bleeding, bleding
    'S260': 'other_emergency',  // seizure, seziure, siezure
    'O136': 'poisoning',        // overdose, ovrdose
  };

  private detectByPhonetic(text: string): string | null {
    const tokens = text.split(/\W+/).filter((t: string) => t.length > 2);
    for (const token of tokens) {
      const code = this.soundex(token);
      if (this.EMERGENCY_SOUNDEX[code]) {
        return this.EMERGENCY_SOUNDEX[code];
      }
    }
    return null;
  }

  // ── Levenshtein ───────────────────────────────────────────

  private levenshtein(a: string, b: string): number {
    const dp: number[][] = Array.from({ length: a.length + 1 }, (_: any, i: number) =>
      Array.from({ length: b.length + 1 }, (_2: any, j: number) => (i === 0 ? j : j === 0 ? i : 0))
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

  // ── Emergency category label ──────────────────────────────

  get emergencyCategoryLabel(): string {
    const labels: Record<string, string> = {
      cardiac:         '🫀 Cardiac Emergency',
      accident:        '🚑 Accident / Trauma',
      stroke:          '🧠 Stroke',
      unconscious:     '😵 Loss of Consciousness',
      severe_pain:     '⚡ Severe Pain',
      allergic:        '🌿 Allergic Reaction',
      poisoning:       '☠️ Poisoning / Overdose',
      other_emergency: '🚨 Medical Emergency',
    };
    return labels[this.emergencyCategory] || '🚨 Emergency Detected';
  }

  // ── Form validation ───────────────────────────────────────

  get isNormalFormValid(): boolean {
    return !!this.selectedDoctor &&
           !!this.selectedDate &&
           !!this.selectedSlot &&
           !!this.patientId &&
           this.reason.trim().length > 0;
  }

  get isEmergencyFormValid(): boolean {
    return !!this.selectedDoctor &&
           !!this.patientId &&
           this.isEmergency &&
           this.reason.trim().length > 0;
  }

  // ── Submit ────────────────────────────────────────────────

  async submitAppointment(): Promise<void> {
    if (!this.reason || this.reason.trim().length === 0) {
      this.bookingError = 'Please enter a reason for the appointment.';
      return;
    }

    // Always cancel debounce and run AI immediately on submit
    // so isEmergency is 100% resolved before we proceed
    clearTimeout(this.detectDebounceTimer);
    this.detectDebounceTimer = null;

    this.zone.run(() => {
      this.isDetecting  = true;
      this.bookingError = '';
      this.cdr.detectChanges();
    });

    try {
      const result = await this.detectEmergencyWithAI(this.reason.trim());
      this.zone.run(() => {
        this.isEmergency       = result.isEmergency;
        this.emergencyCategory = result.category;
        this.isDetecting       = false;
        this.cdr.detectChanges();
      });
    } catch {
      const fallback = this.detectEmergencyLocally(this.reason.trim());
      this.zone.run(() => {
        this.isEmergency       = fallback.isEmergency;
        this.emergencyCategory = fallback.category;
        this.isDetecting       = false;
        this.cdr.detectChanges();
      });
    }

    // isEmergency fully resolved — now route to correct booking
    if (this.isEmergency) {
      this.submitEmergencyAppointment();
    } else {
      this.submitNormalAppointment();
    }
  }

  // ── Emergency booking ─────────────────────────────────────

  private submitEmergencyAppointment(): void {
    if (!this.isEmergencyFormValid) return;

    this.zone.run(() => {
      this.isSubmitting = true;
      this.bookingError = '';
      this.cdr.detectChanges();
    });

    this.appointmentService.bookEmergencyAppointment({
      doctorId:  this.selectedDoctor!.id,
      patientId: this.patientId,
      reason:    this.reason,
      category:  this.emergencyCategory,
    }).subscribe({
      next: (result) => {
        this.zone.run(() => {
          this.isSubmitting          = false;
          this.bookingSuccess        = true;
          this.bookedAppointmentTime = result.appointment.time;
          this.resetForm();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.zone.run(() => {
          if (err?.error?.doctorUnavailable) {
            this.bookingError             = '__unavailable__';
            this.doctorUnavailableMessage = err.error.message;
          } else {
            this.bookingError = err?.error?.message || 'Emergency booking failed. Please try again.';
          }
          this.isSubmitting = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  // ── Normal booking ────────────────────────────────────────

  private submitNormalAppointment(): void {
    if (!this.isNormalFormValid) return;

    this.zone.run(() => {
      this.isSubmitting = true;
      this.bookingError = '';
      this.cdr.detectChanges();
    });

    const allDoctorRequests = this.doctors.map(doctor =>
      this.appointmentService.getAppointmentsByDoctorAndDate(doctor.id, this.selectedDate)
    );

    forkJoin(allDoctorRequests).subscribe({
      next: (allResponses: any[]) => {
        const allAppointmentsToday = allResponses.flatMap((response: any) =>
          Array.isArray(response) ? response : response.data ?? []
        );

        const conflictingAppt = allAppointmentsToday.find(
          (a: any) =>
            a.patientName === this.patientId &&
            a.time === this.selectedSlot &&
            a.status !== 'cancelled' &&
            a.status !== 'Cancelled'
        );

        if (conflictingAppt) {
          const conflictDoctor = this.doctors.find(
            d => Number(d.id) === Number(conflictingAppt.doctorId)
          );
          const conflictDoctorName = conflictDoctor?.name || `Doctor #${conflictingAppt.doctorId}`;

          this.zone.run(() => {
            this.bookingError =
              `You already have an appointment at ${this.selectedSlot} with ${conflictDoctorName} on this date. ` +
              `Please cancel that appointment first, or choose a different time slot.`;
            this.isSubmitting = false;
            this.cdr.detectChanges();
          });
          return;
        }

        this.proceedWithBooking();
      },
      error: () => {
        this.proceedWithBooking();
      }
    });
  }

  // ── Core booking call ─────────────────────────────────────

  private proceedWithBooking(): void {
    this.zone.run(() => {
      this.isSubmitting = true;
      this.bookingError = '';
      this.cdr.detectChanges();
    });

    const dateObj = new Date(this.selectedDate + 'T00:00:00');
    const [time, ampm] = this.selectedSlot.split(' ');
    const [h, m] = time.split(':').map(Number);
    let hours = h;
    if (ampm === 'PM' && h !== 12) hours += 12;
    if (ampm === 'AM' && h === 12) hours = 0;
    dateObj.setHours(hours, m, 0, 0);

    const appointment: Appointment = {
      doctorId:        this.selectedDoctor!.id,
      patientName:     this.patientId,
      appointmentDate: dateObj.toISOString(),
      time:            this.selectedSlot,
      priority:        'Normal',
      status:          'pending',
      reason:          this.reason || undefined,
    };

    this.appointmentService.bookAppointment(appointment).subscribe({
      next: () => {
        this.zone.run(() => {
          this.isSubmitting          = false;
          this.bookingSuccess        = true;
          this.bookedAppointmentTime = this.selectedSlot;
          this.resetForm();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.zone.run(() => {
          this.bookingError = err?.error?.message || 'Failed to book appointment. Please try again.';
          this.isSubmitting = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────

  resetForm(): void {
    this.selectedDoctor           = null;
    this.selectedDate             = '';
    this.selectedSlot             = '';
    this.availableSlots           = [];
    this.bookedSlots              = [];
    this.allGeneratedSlots        = [];
    this.slotError                = '';
    this.reason                   = '';
    this.isEmergency              = false;
    this.emergencyCategory        = '';
    this.doctorUnavailableMessage = '';
  }

  closeUnavailableModal(): void {
    this.zone.run(() => {
      this.bookingError             = '';
      this.doctorUnavailableMessage = '';
    });
  }

  dismissSuccess(): void {
    this.zone.run(() => {
      this.bookingSuccess        = false;
      this.bookedAppointmentTime = '';
    });
  }

  getFormattedDate(): string {
    if (!this.selectedDate) return '';
    const dateObj = new Date(this.selectedDate + 'T00:00:00');
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  getSelectedDayName(): string {
    if (!this.selectedDate) return '';
    const dateObj = new Date(this.selectedDate + 'T00:00:00');
    return dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  }
}
