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
  imports: [
    CommonModule,
    FilterStatusPipe,
  ],
  templateUrl: './patient-dashboard.html',
  styleUrls: ['./patient-dashboard.css']
})
export class PatientDashboard implements OnInit, OnDestroy {

  patientId: string = '';
  patientFirstName: string = '';
  appointments: EnrichedAppointment[] = [];
  nextAppointment: EnrichedAppointment | null = null;
  isLoading: boolean = true;
  errorMessage: string = '';

  countdown = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  private countdownInterval: any;

  showRescheduleModal: boolean = false;
  rescheduleTarget: EnrichedAppointment | null = null;
  availableSlots: { date: string; time: string; display: string }[] = [];
  selectedSlot: { date: string; time: string; display: string } | null = null;
  rescheduleLoading: boolean = false;
  rescheduleSuccess: boolean = false;

  showCancelConfirm: boolean = false;
  cancelTarget: EnrichedAppointment | null = null;
  cancelLoading: boolean = false;

  activeFilter: 'all' | 'upcoming' | 'past' | 'cancelled' = 'all';
  patientLastName: any;

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
    this.patientLastName = currentUser?.lastName || 'Fatima';

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

  // Real-time countdown: cdr.detectChanges() on every tick
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
      this.cdr.detectChanges(); // forces re-render each second
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

  get safeNext(): EnrichedAppointment {
    return this.nextAppointment!;
  }

  confirmCancel(appt: EnrichedAppointment): void {
    this.cancelTarget = appt;
    this.showCancelConfirm = true;
  }

  cancelAppointment(): void {
    if (!this.cancelTarget?.id) return;
    this.cancelLoading = true;
    this.appointmentService.cancelAppointment(this.cancelTarget.id).subscribe({
      next: () => {
        this.cancelTarget!.status = 'cancelled';
        this.cancelTarget!.isPast = true;
        this.cancelTarget!.statusLabel = 'Cancelled';
        if (this.nextAppointment?.id === this.cancelTarget?.id) {
          this.nextAppointment = null;
          if (this.countdownInterval) clearInterval(this.countdownInterval);
        }
        this.showCancelConfirm = false;
        this.cancelTarget = null;
        this.cancelLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cancelLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  openReschedule(appt: EnrichedAppointment): void {
    this.rescheduleTarget = appt;
    this.selectedSlot = null;
    this.rescheduleSuccess = false;
    this.showRescheduleModal = true;
    this.buildAvailableSlots(appt);
  }

  buildAvailableSlots(appt: EnrichedAppointment): void {
    if (!appt.doctor) return;
    this.availableSlots = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

      appt.doctor!.timeSlots
        .filter(ts => ts.day === dayName)
        .forEach(slot => {
          this.availableSlots.push({
            date: date.toISOString().split('T')[0],
            time: slot.startTime,
            display: `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} — ${slot.display}`
          });
        });
    }
  }

  confirmReschedule(): void {
    if (!this.rescheduleTarget?.id || !this.selectedSlot) return;
    this.rescheduleLoading = true;

    const updatedAppt: Appointment = {
      ...this.rescheduleTarget,
      appointmentDate: new Date(
        this.selectedSlot.date + 'T' + this.selectedSlot.time + ':00.000Z'
      ).toISOString(),
      time: this.selectedSlot.display.split('—')[1]?.trim() || this.selectedSlot.time,
      status: 'pending'
    };

    this.appointmentService.rescheduleAppointment(this.rescheduleTarget.id!, updatedAppt).subscribe({
      next: () => {
        this.rescheduleLoading = false;
        this.rescheduleSuccess = true;
        this.cdr.detectChanges();
        setTimeout(() => {
          this.showRescheduleModal = false;
          this.loadDashboard();
        }, 1500);
      },
      error: () => {
        this.rescheduleLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  closeModal(): void {
    this.showRescheduleModal = false;
    this.showCancelConfirm = false;
    this.rescheduleTarget = null;
    this.cancelTarget = null;
  }

  goToBookAppointment(): void { this.router.navigate(['/appointment']); }
  goToChat(): void            { this.router.navigate(['/chatbot']); }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

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