// src/app/components/appointments/appointments.ts

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

  // ── Debounce timer for AI detection ──────────────────────
  private detectDebounceTimer: any = null;
  private readonly DETECT_DEBOUNCE_MS = 600;

  private destroy$ = new Subject<void>();

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

  // ── AI Emergency Detection ────────────────────────────────

  private readonly FAST_PRECHECK_PATTERNS: RegExp[] = [
    /\b(heart\s*attack|chest\s*pain|stroke|seizure|unconscious|overdose|poison|bleed|fracture|broken\s*bone|accident|crash|fell|emergency|urgent|can'?t\s*breath)\b/i,
  ];

  private isObviousEmergency(text: string): boolean {
    return this.FAST_PRECHECK_PATTERNS.some(re => re.test(text));
  }

  /**
   * Calls the Groq API to semantically analyse the reason text.
   * Handles misspellings, synonyms, mixed languages, and rough grammar.
   */
  private async detectEmergencyWithAI(reason: string): Promise<{ isEmergency: boolean; category: string }> {

    const GROQ_API_KEY = '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';
    const GROQ_MODEL   = 'llama-3.3-70b-versatile';

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
        model:       GROQ_MODEL,
        max_tokens:  100,
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
    const clean = text.replace(/```[a-z]*\n?/gi, '').trim();
    return JSON.parse(clean);
  }

  // ── Reason input handler ──────────────────────────────────

  onReasonInput(): void {
    const text = this.reason.trim();

    if (text.length < 3) {
      this.zone.run(() => {
        this.isEmergency       = false;
        this.emergencyCategory = '';
        this.isDetecting       = false;
        this.cdr.detectChanges();
      });
      return;
    }

    if (this.isObviousEmergency(text)) {
      this.zone.run(() => {
        this.isEmergency       = true;
        this.emergencyCategory = 'other_emergency';
        this.selectedSlot      = '';
        this.isDetecting       = false;
        this.cdr.detectChanges();
      });
    } else {
      this.zone.run(() => {
        this.isDetecting = true;
        this.cdr.detectChanges();
      });
    }

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
        console.warn('AI emergency detection failed, using local fallback:', err);
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

  // ── Local keyword fallback (used only if API fails) ───────
  //   Extended with common misspelling variants.

  private readonly EMERGENCY_KEYWORDS: Record<string, string[]> = {
    cardiac: [
      'heart attack','heart atack','hert attack','hert atack','hart attack',
      'chest pain','chest pian','chestpain','chest tightness','chest pressure',
      'cardiac arrest','heart pain','heart failure','palpitations',
      'irregular heartbeat','angina','myocardial','left arm pain','jaw pain',
      'shortness of breath','short of breath','cant breathe',"can't breathe",
      'cant breth',"can't breth",'difficulty breathing','breathing difficulty',
      'breathless','i cant breath',
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

    for (const [category, keywords] of Object.entries(this.EMERGENCY_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) return { isEmergency: true, category };
      }
    }

    // Fuzzy pass: Levenshtein distance ≤ 2 against high-risk core words
    const HIGH_RISK_WORDS = [
      'accident','fracture','seizure','fainted','unconscious',
      'bleeding','overdose','poisoning','stroke','cardiac',
    ];
    const inputTokens = lower.split(/\W+/).filter((t: string) => t.length > 3);
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
      cardiac:         '❤️ Cardiac Emergency',
      accident:        '🚨 Accident / Trauma',
      stroke:          '🧠 Stroke',
      unconscious:     '⚠️ Loss of Consciousness',
      severe_pain:     '🔴 Severe Pain',
      allergic:        '⚠️ Allergic Reaction',
      poisoning:       '☠️ Poisoning / Overdose',
      other_emergency: '🚨 Medical Emergency',
    };
    return labels[this.emergencyCategory] || '🚨 Emergency Detected';
  }

  // ── Form validation ───────────────────────────────────────

  get isNormalFormValid(): boolean {
    return !!this.selectedDoctor && !!this.selectedDate && !!this.selectedSlot && !!this.patientId;
  }

  get isEmergencyFormValid(): boolean {
    return !!this.selectedDoctor && !!this.patientId && this.isEmergency;
  }

  // ── Submit ────────────────────────────────────────────────

  submitAppointment(): void {
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
          this.isSubmitting = false;
          this.bookingSuccess = true;
          this.bookedAppointmentTime = result.appointment.time;
          this.resetForm();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.zone.run(() => {
          if (err?.error?.doctorUnavailable) {
            this.bookingError = '__unavailable__';
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
          this.isSubmitting = false;
          this.bookingSuccess = true;
          this.bookedAppointmentTime = this.selectedSlot;
          this.resetForm();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.zone.run(() => {
          const message = err?.error?.message || 'Failed to book appointment. Please try again.';
          this.bookingError = message;
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
      this.bookingError = '';
      this.doctorUnavailableMessage = '';
    });
  }

  dismissSuccess(): void {
    this.zone.run(() => {
      this.bookingSuccess = false;
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
