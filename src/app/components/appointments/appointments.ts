// src/app/components/appointments/appointments.ts — FULL UPDATED FILE

import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
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

  minDate: string = '';
  availableDaysForDoctor: number[] = [];

  // ── Reason / emergency state ──────────────────────────────
  reason: string = '';
  isEmergency: boolean = false;
  emergencyCategory: string = '';
  isDetecting: boolean = false;          // spinner while calling /detect

  // ── UI flags ──────────────────────────────────────────────
  isLoadingDoctors: boolean = false;
  isLoadingSlots: boolean = false;
  isSubmitting: boolean = false;

  bookingSuccess: boolean = false;
  bookedAppointmentTime: string = '';    // shown in success banner for emergency
  bookingError: string = '';
  slotError: string = '';
  doctorUnavailableMessage: string = ''; // set when doctor is not available for emergency

  patientId: string = '';

  // ── Debounce cleanup only ─────────────────────────────────
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
      this.slotError = '';
      // Reset reason/emergency when doctor changes
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
        const h     = Math.floor(current / 60);
        const m     = current % 60;
        const ampm  = h < 12 ? 'AM' : 'PM';
        const h12   = h % 12 === 0 ? 12 : h % 12;
        allSlots.push(`${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`);
        current += 15;
      }
    });

    this.availableSlots = allSlots.filter(slot => {
      // Remove already-booked slots
      if (this.bookedSlots.includes(slot)) return false;

      // ✅ FIX Issue 1: if selected date is today, hide slots that are already past
      const isToday = this.selectedDate === new Date().toISOString().split('T')[0];
      if (isToday) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const [timePart, ampm] = slot.split(' ');
        const [h, m] = timePart.split(':').map(Number);
        let slotMinutes = h * 60 + m;
        if (ampm === 'PM' && h !== 12) slotMinutes += 720;
        if (ampm === 'AM' && h === 12) slotMinutes = m;
        if (slotMinutes <= nowMinutes) return false; // past slot — hide it
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

  // ── Reason / Emergency detection ──────────────────────────

  // Full keyword list — mirrors emergency.routes.ts on the backend
  private readonly EMERGENCY_KEYWORDS: Record<string, string[]> = {
    cardiac:         ['heart attack','chest pain','chest tightness','cardiac arrest','heart pain','heart failure','palpitations','irregular heartbeat','angina','myocardial','heart pressure','left arm pain','jaw pain','shortness of breath','cant breathe',"can't breathe",'difficulty breathing','breathing difficulty','breathless'],
    accident:        ['accident','car crash','road accident','vehicle accident','motorcycle accident','bike accident','hit by car','fell','fall','fallen','fracture','broken bone','broken arm','broken leg','head injury','head trauma','skull','concussion','trauma','bleeding','blood loss','heavy bleeding','wound','deep cut','laceration','internal bleeding'],
    stroke:          ['stroke','paralysis','face drooping','arm weakness','leg weakness','speech problem','slurred speech','sudden headache','worst headache','vision loss','sudden vision','numbness','confusion','loss of balance','brain attack'],
    unconscious:     ['unconscious','fainted','fainting','passed out','unresponsive','not responding','collapsed','blackout','loss of consciousness','dizzy and fell','dizziness'],
    severe_pain:     ['severe pain','extreme pain','unbearable pain','sharp pain','stabbing pain','intense pain','excruciating','worst pain','severe abdominal pain','severe stomach pain','appendix'],
    allergic:        ['allergic reaction','anaphylaxis','anaphylactic','swollen throat','throat closing','hives','swelling face','face swelling','epipen','bee sting','severe allergy'],
    poisoning:       ['overdose','poisoning','poison','swallowed','ingested','drug overdose','medication overdose','toxic','chemical burn','burn','burnt','severe burn'],
    other_emergency: ['emergency','urgent','critical','serious condition','life threatening','life-threatening','immediately','right now','help me','vomiting blood','blood in vomit','coughing blood','seizure','convulsion','epilepsy attack','high fever','fever 40','fever 41','fever 42'],
  };

  /** Detect emergency purely on the frontend — no network call, works on any deployment */
  private detectEmergencyLocally(reason: string): { isEmergency: boolean; category: string } {
    if (!reason || reason.trim().length < 3) return { isEmergency: false, category: '' };
    const lower = reason.toLowerCase();
    for (const [category, keywords] of Object.entries(this.EMERGENCY_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) return { isEmergency: true, category };
      }
    }
    return { isEmergency: false, category: '' };
  }

  /** Called on every keystroke in the reason textarea */
  onReasonInput(): void {
    // Run detection synchronously — no API call, no spinner, instant result
    const result = this.detectEmergencyLocally(this.reason);
    this.zone.run(() => {
      this.isEmergency     = result.isEmergency;
      this.emergencyCategory = result.category;
      this.isDetecting     = false;
      if (this.isEmergency) this.selectedSlot = '';
      this.cdr.detectChanges();
    });
  }

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
            // Doctor not available today or slot outside working hours
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

    // ✅ FIX Issue 2: only block if patient already has THIS EXACT SLOT booked
    // (not just any appointment on the same day — they can book multiple slots)
    this.appointmentService.getAppointmentsByDoctorAndDate(
      this.selectedDoctor!.id,
      this.selectedDate
    ).subscribe({
      next: (response: any) => {
        const appointments = Array.isArray(response) ? response : response.data ?? [];
        const slotAlreadyBooked = appointments.some(
          (a: any) => a.patientName === this.patientId && a.time === this.selectedSlot
        );

        if (slotAlreadyBooked) {
          this.zone.run(() => {
            this.bookingError = `You already have an appointment at ${this.selectedSlot} with ${this.selectedDoctor!.name}. Please choose a different time slot.`;
            this.cdr.detectChanges();
          });
          return;
        }

        this.proceedWithBooking();
      },
      error: () => this.proceedWithBooking()
    });
  }

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
      error: async (err) => {
        this.zone.run(async () => {
          let message = 'Failed to book appointment. Please try again.';
          try {
            if (err?.error?.message) {
              message = err.error.message;
            } else if (err?.error instanceof ReadableStream) {
              const reader = err.error.getReader();
              const decoder = new TextDecoder();
              let result = '';
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                result += decoder.decode(value);
              }
              const parsed = JSON.parse(result);
              message = parsed.message || message;
            }
          } catch (e) { /* ignore */ }
          this.bookingError = message;
          this.isSubmitting = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────

  resetForm(): void {
    this.selectedDoctor  = null;
    this.selectedDate    = '';
    this.selectedSlot    = '';
    this.availableSlots  = [];
    this.bookedSlots     = [];
    this.slotError       = '';
    this.reason          = '';
    this.isEmergency     = false;
    this.emergencyCategory = '';
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
