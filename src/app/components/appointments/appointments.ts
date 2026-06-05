import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, forkJoin } from 'rxjs';
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

  // ── Debounce & cache ──────────────────────────────────────
  private detectDebounceTimer: any = null;
  private readonly DETECT_DEBOUNCE_MS = 600;
  private aiResultCache = new Map<string, { isEmergency: boolean; category: string }>();

  private destroy$ = new Subject<void>();

  // ── Groq config ───────────────────────────────────────────
  private readonly GROQ_API_KEY = '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';
  private readonly GROQ_MODEL   = 'llama-3.3-70b-versatile';

  private readonly GROQ_SYSTEM_PROMPT = `You are a medical triage assistant for a Pakistani hospital. Patients write their reason in English, Urdu, Roman Urdu, or a mix. Many patients are uneducated and write with short words, abbreviations, typos, missing letters, or repeated letters.

YOUR ONLY JOB: decide if the reason describes an active medical emergency happening RIGHT NOW.

════════════════════════════════════════
URDU / ROMAN URDU DICTIONARY (memorize):
════════════════════════════════════════
dil       = heart
bnd/band  = closed/stopped
dard      = pain
seena     = chest
saans     = breath
sans      = breath (short form)
nahi      = not / cannot
aa raha   = coming
uth raha  = rising
ruk gaya  = stopped
tez       = fast / severe
bht/bhut/bohot/boht = very
zyada     = too much / a lot
gir/girr  = fell down
gaya/gayi = happened / went
khoon     = blood
nikal     = coming out
behosh    = unconscious
hosh      = consciousness
chakkar   = dizziness
ulti      = vomiting
jaan      = life
marna/mar = dying / die
madad     = help
hadsa     = accident
haddi     = bone
tooti     = broken
bukhar    = fever
tez bukhar = high fever
gala      = throat
suj       = swollen
chehra    = face
zeher     = poison
jal       = burn
pet       = stomach / abdomen
sar       = head

════════════════════════════════════════
EMERGENCY EXAMPLES (isEmergency: true):
════════════════════════════════════════
"dil bnd"            → dil=heart, bnd=stopped → cardiac EMERGENCY
"dil band"           → heart stopped → cardiac EMERGENCY
"dil band ho gaya"   → heart stopped → cardiac EMERGENCY
"dil drd"            → dil=heart, drd=pain → cardiac EMERGENCY
"seena drd"          → chest pain → cardiac EMERGENCY
"sns nhi"            → saans nahi = can't breathe → cardiac EMERGENCY
"sans nahi aa raha"  → can't breathe → cardiac EMERGENCY
"bht tez drd"        → very severe pain → severe_pain EMERGENCY
"gir gya khoon"      → fell + bleeding → accident EMERGENCY
"behosh"             → unconscious → unconscious EMERGENCY
"bhosh ho gya"       → behosh = unconscious → unconscious EMERGENCY
"jaan ja rhi"        → life going = dying → other_emergency EMERGENCY
"mar rha hoon"       → dying → other_emergency EMERGENCY
"heart atttack"      → cardiac EMERGENCY
"hert atak"          → cardiac EMERGENCY
"chest pain"         → cardiac EMERGENCY
"accident"           → accident EMERGENCY
"khoon aa rha"       → bleeding → accident EMERGENCY
"haddi toot"         → broken bone → accident EMERGENCY
"zeher kha liya"     → poisoned → poisoning EMERGENCY
"jal gya"            → burn → poisoning EMERGENCY
"gala bnd"           → throat closed → allergic EMERGENCY
"stroke"             → stroke EMERGENCY
"seizure"            → other_emergency EMERGENCY
"tez bukhar 104"     → very high fever → other_emergency EMERGENCY

════════════════════════════════════════
NOT EMERGENCY (isEmergency: false):
════════════════════════════════════════
"checkup"            → routine
"hert checkup"       → heart checkup = routine
"dil checkup"        → heart checkup = routine
"aam checkup"        → general checkup = routine
"follow up"          → routine
"blood test"         → routine
"sugar test"         → routine
"bp check"           → routine
"mild headache"      → routine
"slight fever"       → routine
"cough"              → routine
"cold"               → routine
"back pain"          → routine (unless described as severe/unbearable)
"knee pain"          → routine

════════════════════════════════════════
CRITICAL RULES:
════════════════════════════════════════
1. Short/abbreviated Urdu = still valid. "dil bnd" means heart stopped. Treat it as emergency.
2. Missing vowels are normal in Roman Urdu typing: "drd"=dard, "bnd"=band, "sns"=saans, "nhi"=nahi, "gya"=gaya, "rha"=raha, "ho"=ho.
3. If in doubt and it COULD be an emergency — say true. Patient safety first.
4. Only say false when it is clearly a routine visit.

Reply ONLY with valid JSON. No markdown, no explanation, nothing else:
{"isEmergency": true|false, "category": "cardiac"|"accident"|"stroke"|"unconscious"|"severe_pain"|"allergic"|"poisoning"|"other_emergency"|""}
category must be "" when isEmergency is false.`;

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
    this.minDate = new Date().toISOString().split('T')[0];
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
      this.selectedDoctor           = this.doctors.find(d => Number(d.id) === doctorId) || null;
      this.selectedDate             = '';
      this.selectedSlot             = '';
      this.availableSlots           = [];
      this.allGeneratedSlots        = [];
      this.slotError                = '';
      this.reason                   = '';
      this.isEmergency              = false;
      this.emergencyCategory        = '';
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
    this.selectedSlot      = '';
    this.availableSlots    = [];
    this.allGeneratedSlots = [];
    this.slotError         = '';

    if (!this.selectedDoctor || !this.selectedDate) return;

    const dateObj     = new Date(this.selectedDate + 'T00:00:00');
    const dayName     = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
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
          const appointments  = Array.isArray(response) ? response : response.data ?? [];
          this.bookedSlots    = appointments.map((a: any) => a.time);
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
      const end   = endH   * 60 + endM;

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
    this.availableSlots    = allSlots.filter(slot => {
      if (this.bookedSlots.includes(slot)) return false;

      const isToday = this.selectedDate === new Date().toISOString().split('T')[0];
      if (isToday) {
        const now        = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const [timePart, ampm] = slot.split(' ');
        const [h, m]     = timePart.split(':').map(Number);
        let slotMinutes  = h * 60 + m;
        if (ampm === 'PM' && h !== 12) slotMinutes += 720;
        if (ampm === 'AM' && h === 12) slotMinutes  = m;
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
    return this.allGeneratedSlots.length > 0 && this.availableSlots.length === 0;
  }

  // ══════════════════════════════════════════════════════════
  // ── PURE AI Emergency Detection (Groq only, no hardcode) ──
  // ══════════════════════════════════════════════════════════

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

    this.zone.run(() => {
      this.isDetecting = true;
      this.cdr.detectChanges();
    });

    if (this.detectDebounceTimer) clearTimeout(this.detectDebounceTimer);

    this.detectDebounceTimer = setTimeout(async () => {
      try {
        const result = await this.callGroqAI(text);
        this.zone.run(() => {
          this.isEmergency       = result.isEmergency;
          this.emergencyCategory = result.category;
          this.isDetecting       = false;
          if (this.isEmergency) this.selectedSlot = '';
          this.cdr.detectChanges();
        });
      } catch (err) {
        console.error('[Groq] Detection error:', err);
        this.zone.run(() => {
          this.isEmergency       = false;
          this.emergencyCategory = '';
          this.isDetecting       = false;
          this.cdr.detectChanges();
        });
      }
    }, this.DETECT_DEBOUNCE_MS);
  }

  // ── Cache wrapper ─────────────────────────────────────────

  private async callGroqAI(reason: string): Promise<{ isEmergency: boolean; category: string }> {
    const cacheKey = reason.toLowerCase().trim();

    if (this.aiResultCache.has(cacheKey)) {
      console.log('[Groq Cache] Hit:', cacheKey);
      return this.aiResultCache.get(cacheKey)!;
    }

    const result = await this.callGroqAPI(reason);
    this.aiResultCache.set(cacheKey, result);
    return result;
  }

  // ── Actual Groq API call ──────────────────────────────────

  private async callGroqAPI(reason: string): Promise<{ isEmergency: boolean; category: string }> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model:       this.GROQ_MODEL,
        max_tokens:  120,
        temperature: 0,
        messages: [
          { role: 'system', content: this.GROQ_SYSTEM_PROMPT },
          { role: 'user',   content: reason }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(`Groq ${response.status}: ${errBody?.error?.message || 'unknown error'}`);
    }

    const data  = await response.json();
    const text  = data.choices?.[0]?.message?.content ?? '';
    const clean = text.replace(/```[a-z]*\n?/gi, '').trim();

    try {
      const parsed = JSON.parse(clean);
      return {
        isEmergency: parsed.isEmergency === true,
        category:    typeof parsed.category === 'string' ? parsed.category : ''
      };
    } catch {
      console.warn('[Groq] Could not parse response:', clean);
      return { isEmergency: false, category: '' };
    }
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
           !!this.selectedDate   &&
           !!this.selectedSlot   &&
           !!this.patientId      &&
           this.reason.trim().length > 0;
  }

  get isEmergencyFormValid(): boolean {
    return !!this.selectedDoctor &&
           !!this.patientId      &&
           this.isEmergency      &&
           this.reason.trim().length > 0;
  }

  // ── Submit ────────────────────────────────────────────────

  async submitAppointment(): Promise<void> {
    if (!this.reason || this.reason.trim().length === 0) {
      this.bookingError = 'Please enter a reason for the appointment.';
      return;
    }

    clearTimeout(this.detectDebounceTimer);
    this.detectDebounceTimer = null;

    this.zone.run(() => {
      this.isDetecting  = true;
      this.bookingError = '';
      this.cdr.detectChanges();
    });

    try {
      const result = await this.callGroqAI(this.reason.trim());
      this.zone.run(() => {
        this.isEmergency       = result.isEmergency;
        this.emergencyCategory = result.category;
        this.isDetecting       = false;
        this.cdr.detectChanges();
      });
    } catch {
      this.zone.run(() => {
        this.isEmergency       = false;
        this.emergencyCategory = '';
        this.isDetecting       = false;
        this.cdr.detectChanges();
      });
    }

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
            a.time        === this.selectedSlot &&
            a.status      !== 'cancelled' &&
            a.status      !== 'Cancelled'
        );

        if (conflictingAppt) {
          const conflictDoctor     = this.doctors.find(d => Number(d.id) === Number(conflictingAppt.doctorId));
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

    const dateObj      = new Date(this.selectedDate + 'T00:00:00');
    const [time, ampm] = this.selectedSlot.split(' ');
    const [h, m]       = time.split(':').map(Number);
    let hours          = h;
    if (ampm === 'PM' && h !== 12) hours += 12;
    if (ampm === 'AM' && h === 12) hours  = 0;
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
    return new Date(this.selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  getSelectedDayName(): string {
    if (!this.selectedDate) return '';
    return new Date(this.selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  }
}
