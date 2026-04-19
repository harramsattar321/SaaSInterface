import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { AppointmentService, Appointment, Doctor } from '../../services/appointment.service';
import { FilterStatusPipe } from '../../pipes/filter-status.pipe';

export interface EnrichedAppointment extends Appointment {
  doctor?: Doctor;
  statusLabel?: string;
  isPast?: boolean;
  isNext?: boolean;
}

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  imports: [CommonModule, FilterStatusPipe],
  templateUrl: './patient-dashboard.html',
  styleUrls: ['./patient-dashboard.css']
})
export class PatientDashboard implements OnInit, OnDestroy {

  patientId: string = '';
  patientFirstName: string = '';
  patientLastName: string = '';
  appointments: EnrichedAppointment[] = [];
  nextAppointment: EnrichedAppointment | null = null;
  isLoading: boolean = true;
  errorMessage: string = '';

  countdown = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  private countdownInterval: any;

  // ── Reschedule state ──────────────────────────────────────
  showRescheduleModal: boolean = false;
  rescheduleTarget: EnrichedAppointment | null = null;
  rescheduleDate: string = '';
  rescheduleMinDate: string = '';
  rescheduleDayError: string = '';
  rescheduleTimeSlots: string[] = [];
  selectedRescheduleSlot: string = '';
  isLoadingRescheduleSlots: boolean = false;
  rescheduleLoading: boolean = false;
  rescheduleSuccess: boolean = false;

  // ── Cancel state ──────────────────────────────────────────
  showCancelConfirm: boolean = false;
  cancelTarget: EnrichedAppointment | null = null;
  cancelLoading: boolean = false;

  activeFilter: 'all' | 'upcoming' | 'past' | 'cancelled' = 'all';

  constructor(
    private appointmentService: AppointmentService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const stored = localStorage.getItem('currentUser');
    const currentUser = stored ? JSON.parse(stored) : null;

    this.patientId        = currentUser?.userId    || '';
    this.patientFirstName = currentUser?.firstName || 'Patient';
    this.patientLastName  = currentUser?.lastName  || '';

    const today = new Date();
    today.setDate(today.getDate() + 1);
    this.rescheduleMinDate = today.toISOString().split('T')[0];

    if (!this.patientId) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadDashboard();
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  loadDashboard(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      appointments: this.appointmentService.getAppointmentsByPatient(this.patientId),
      doctors: this.appointmentService.getAllDoctors()
    }).subscribe({
      next: ({ appointments, doctors }) => {
        const doctorList: Doctor[] = Array.isArray(doctors)
          ? doctors
          : (doctors as any)?.data ?? [];

        const doctorMap = new Map<number, Doctor>();
        doctorList.forEach(d => doctorMap.set(d.id, d));

        const now = new Date();

        this.appointments = appointments
          .filter(a => a.patientName === this.patientId)
          .map(appt => {
            const apptDate = new Date(appt.appointmentDate);
            const isPast = apptDate < now || appt.status === 'cancelled';
            return {
              ...appt,
              doctor: doctorMap.get(appt.doctorId),
              isPast,
              statusLabel: this.getStatusLabel(appt.status || '', apptDate)
            };
          })
          .sort((a, b) =>
            new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime()
          );

        const upcoming = this.appointments.filter(
          a => !a.isPast && a.status !== 'cancelled'
        );
        this.nextAppointment = upcoming.length > 0 ? upcoming[0] : null;
        if (this.nextAppointment) {
          this.nextAppointment.isNext = true;
          this.startCountdown(new Date(this.nextAppointment.appointmentDate));
        }

        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Dashboard load error:', err);
        this.errorMessage = 'Failed to load appointments. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  getStatusLabel(status: string, date: Date): string {
    if (status === 'cancelled') return 'Cancelled';
    if (date < new Date()) return 'Completed';
    if (status === 'pending') return 'Upcoming';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  startCountdown(targetDate: Date): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const update = () => {
      const diff = targetDate.getTime() - new Date().getTime();
      if (diff <= 0) {
        this.countdown = { days: 0, hours: 0, minutes: 0, seconds: 0 };
        clearInterval(this.countdownInterval);
        this.cdr.detectChanges();
        return;
      }
      this.countdown = {
        days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours:   Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000)
      };
      this.cdr.detectChanges();
    };

    update();
    this.countdownInterval = setInterval(update, 1000);
  }

  get filteredAppointments(): EnrichedAppointment[] {
    const now = new Date();
    switch (this.activeFilter) {
      case 'upcoming':
        return this.appointments.filter(
          a => new Date(a.appointmentDate) >= now && a.status !== 'cancelled'
        );
      case 'past':
        return this.appointments.filter(
          a => new Date(a.appointmentDate) < now && a.status !== 'cancelled'
        );
      case 'cancelled':
        return this.appointments.filter(a => a.status === 'cancelled');
      default:
        return this.appointments;
    }
  }

  // ── CANCEL ────────────────────────────────────────────────
  confirmCancel(appt: EnrichedAppointment): void {
    this.cancelTarget = appt;
    this.showCancelConfirm = true;
    this.cdr.detectChanges();
  }

  cancelAppointment(): void {
    if (!this.cancelTarget?.id) return;
    this.cancelLoading = true;
    this.cdr.detectChanges();

    this.appointmentService.cancelAppointment(this.cancelTarget.id).subscribe({
      next: () => {
        // Update in-memory so UI reflects instantly without reload
        const appt = this.appointments.find(a => a.id === this.cancelTarget!.id);
        if (appt) {
          appt.status = 'cancelled';
          appt.isPast = true;
          appt.statusLabel = 'Cancelled';
        }
        if (this.nextAppointment?.id === this.cancelTarget?.id) {
          this.nextAppointment = null;
          if (this.countdownInterval) clearInterval(this.countdownInterval);
        }
        this.showCancelConfirm = false;
        this.cancelTarget = null;
        this.cancelLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Cancel error:', err);
        this.cancelLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── RESCHEDULE ────────────────────────────────────────────
  openReschedule(appt: EnrichedAppointment): void {
    this.rescheduleTarget = appt;
    this.rescheduleDate = '';
    this.rescheduleDayError = '';
    this.rescheduleTimeSlots = [];
    this.selectedRescheduleSlot = '';
    this.rescheduleSuccess = false;
    this.showRescheduleModal = true;
    this.cdr.detectChanges();
  }

  onRescheduleDateChange(date: string): void {
    this.rescheduleDate = date;
    this.rescheduleDayError = '';
    this.rescheduleTimeSlots = [];
    this.selectedRescheduleSlot = '';

    if (!this.rescheduleTarget?.doctor || !date) return;

    const dateObj = new Date(date + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const doctor  = this.rescheduleTarget.doctor;

    const slotsForDay = doctor.timeSlots.filter(ts => ts.day === dayName);

    if (slotsForDay.length === 0) {
      this.rescheduleDayError = `${doctor.name} is not available on ${dayName}s. Please pick another date.`;
      this.cdr.detectChanges();
      return;
    }

    this.isLoadingRescheduleSlots = true;
    this.cdr.detectChanges();

    // Fetch already booked slots for this doctor+date
    this.appointmentService.getAppointmentsByDoctorAndDate(
      doctor.id,
      date
    ).subscribe({
      next: (bookedAppointments) => {
        const bookedTimes = (bookedAppointments || []).map((a: any) => a.time);
        const allSlots = this.generateSlots(slotsForDay);

        // Exclude the current appointment's slot so it doesn't block itself
        const currentTime = this.rescheduleTarget?.time || '';
        this.rescheduleTimeSlots = allSlots.filter(
          slot => !bookedTimes.includes(slot) || slot === currentTime
        );

        this.isLoadingRescheduleSlots = false;
        this.cdr.detectChanges();
      },
      error: () => {
        // If fetch fails, show all slots
        this.rescheduleTimeSlots = this.generateSlots(slotsForDay);
        this.isLoadingRescheduleSlots = false;
        this.cdr.detectChanges();
      }
    });
  }

  private generateSlots(slotsForDay: any[]): string[] {
    const allSlots: string[] = [];
    slotsForDay.forEach(slot => {
      const [startH, startM] = slot.startTime.split(':').map(Number);
      const [endH, endM]     = slot.endTime.split(':').map(Number);
      let current = startH * 60 + startM;
      const end   = endH * 60 + endM;
      while (current + 15 <= end) {
        const h       = Math.floor(current / 60);
        const m       = current % 60;
        const ampm    = h < 12 ? 'AM' : 'PM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        const displayM = m.toString().padStart(2, '0');
        allSlots.push(`${displayH.toString().padStart(2, '0')}:${displayM} ${ampm}`);
        current += 15;
      }
    });
    return allSlots;
  }

  confirmReschedule(): void {
    if (!this.rescheduleTarget?.id || !this.selectedRescheduleSlot || !this.rescheduleDate) return;
    this.rescheduleLoading = true;
    this.cdr.detectChanges();

    // Parse the selected slot time back into a full ISO date
    const [time, ampm]   = this.selectedRescheduleSlot.split(' ');
    const [h, m]         = time.split(':').map(Number);
    let hours = h;
    if (ampm === 'PM' && h !== 12) hours += 12;
    if (ampm === 'AM' && h === 12) hours = 0;

    const [year, month, day] = this.rescheduleDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day, hours, m, 0, 0);

    const updatedAppt: Appointment = {
      ...this.rescheduleTarget,
      appointmentDate: dateObj.toISOString(),
      time: this.selectedRescheduleSlot,
      status: 'pending'
    };

    this.appointmentService.rescheduleAppointment(
      this.rescheduleTarget.id!,
      updatedAppt
    ).subscribe({
      next: () => {
        this.rescheduleLoading = false;
        this.rescheduleSuccess = true;
        this.cdr.detectChanges();
        setTimeout(() => {
          this.showRescheduleModal = false;
          this.loadDashboard();
        }, 1500);
      },
      error: (err) => {
        console.error('Reschedule error:', err);
        this.rescheduleLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  closeModal(): void {
    this.showRescheduleModal  = false;
    this.showCancelConfirm    = false;
    this.rescheduleTarget     = null;
    this.cancelTarget         = null;
    this.rescheduleDate       = '';
    this.rescheduleTimeSlots  = [];
    this.selectedRescheduleSlot = '';
    this.rescheduleDayError   = '';
    this.cdr.detectChanges();
  }

  goToBookAppointment(): void { this.router.navigate(['/appointment']); }
  goToChat(): void            { this.router.navigate(['/chatbot']); }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  pad(n: number): string { return n.toString().padStart(2, '0'); }

  priorityClass(priority: string | undefined): string {
    return 'priority-' + (priority || 'normal').toLowerCase();
  }

  statusClass(status: string | undefined): string {
    return 'status-' + (status || 'pending').toLowerCase();
  }

  priorityPClass(priority: string | undefined): string {
    return 'p-' + (priority || 'normal').toLowerCase();
  }
}