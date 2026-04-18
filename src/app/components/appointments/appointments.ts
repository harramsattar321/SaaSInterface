import { Component, OnInit, ChangeDetectorRef } from '@angular/core'; // 1. Added ChangeDetectorRef
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppointmentService, Doctor, Appointment } from '../../services/appointment.service';

@Component({
  selector: 'app-appointment-booking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './appointments.html',
  styleUrls: ['./appointments.css']
})
export class AppointmentBookingComponent implements OnInit {

  doctors: Doctor[] = [];
  selectedDoctor: Doctor | null = null;
  selectedDate: string = '';
  selectedSlot: string = '';

  availableSlots: string[] = [];
  bookedSlots: string[] = [];

  minDate: string = '';
  availableDaysForDoctor: number[] = [];

  isLoadingDoctors: boolean = false;
  isLoadingSlots: boolean = false;
  isSubmitting: boolean = false;

  bookingSuccess: boolean = false;
  bookingError: string = '';
  slotError: string = '';

  patientId: string = '';

  constructor(
    private appointmentService: AppointmentService,
    private cdr: ChangeDetectorRef // 2. Inject ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadPatientId();
    this.loadDoctors();
    this.setMinDate();
  }

  private loadPatientId(): void {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      const user = JSON.parse(currentUser);
      this.patientId = user.userId || user.id; // Fallback for common ID naming
    }
  }

  private setMinDate(): void {
    const today = new Date();
    this.minDate = today.toISOString().split('T')[0];
  }

  loadDoctors(): void {
    this.isLoadingDoctors = true;
    this.appointmentService.getAllDoctors().subscribe({
      next: (data) => {
        this.doctors = data;
        this.isLoadingDoctors = false;
        // 3. Force Angular to see the data update
        this.cdr.detectChanges(); 
      },
      error: (err) => {
        console.error('Error loading doctors:', err);
        this.isLoadingDoctors = false;
        this.cdr.detectChanges();
      }
    });

    // Fallback: If network hangs, stop the spinner after 5 seconds
    setTimeout(() => {
        if(this.isLoadingDoctors) {
            this.isLoadingDoctors = false;
            this.cdr.detectChanges();
        }
    }, 5000);
  }

  onDoctorSelect(event: Event): void {
    const selectEl = event.target as HTMLSelectElement;
    const doctorId = Number(selectEl.value);
    
    // Use find more safely
    this.selectedDoctor = this.doctors.find(d => Number(d.id) === doctorId) || null;
    
    this.selectedDate = '';
    this.selectedSlot = '';
    this.availableSlots = [];
    this.slotError = '';

    if (this.selectedDoctor) {
      this.availableDaysForDoctor = this.getDayNumbers(this.selectedDoctor.availableDays);
    }
    this.cdr.detectChanges();
  }

  private getDayNumbers(days: string[]): number[] {
    const dayMap: { [key: string]: number } = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2,
      'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    return (days || []).map(d => dayMap[d]);
  }

  onDateChange(): void {
    this.selectedSlot = '';
    this.availableSlots = [];
    this.slotError = '';

    if (!this.selectedDoctor || !this.selectedDate) return;

    const dateObj = new Date(this.selectedDate + 'T00:00:00'); // Added T00:00 to avoid timezone shifts
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

    const slotsForDay = this.selectedDoctor.timeSlots.filter(ts => ts.day === dayName);

    if (slotsForDay.length === 0) {
      this.slotError = `Dr. ${this.selectedDoctor.name.replace('Dr. ', '')} is not available on ${dayName}s.`;
      return;
    }

    this.isLoadingSlots = true;

    this.appointmentService.getAppointmentsByDoctorAndDate(
      this.selectedDoctor.id,
      this.selectedDate
    ).subscribe({
      next: (appointments) => {
        this.bookedSlots = (appointments || []).map(a => a.time);
        this.generateAvailableSlots(slotsForDay);
        this.isLoadingSlots = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.generateAvailableSlots(slotsForDay);
        this.isLoadingSlots = false;
        this.cdr.detectChanges();
      }
    });
  }

  private generateAvailableSlots(slotsForDay: any[]): void {
    const allSlots: string[] = [];

    slotsForDay.forEach(slot => {
      const [startH, startM] = slot.startTime.split(':').map(Number);
      const [endH, endM] = slot.endTime.split(':').map(Number);

      let current = startH * 60 + startM;
      const end = endH * 60 + endM;

      while (current + 15 <= end) {
        const h = Math.floor(current / 60);
        const m = current % 60;
        const ampm = h < 12 ? 'AM' : 'PM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        const displayM = m.toString().padStart(2, '0');
        allSlots.push(`${displayH.toString().padStart(2, '0')}:${displayM} ${ampm}`);
        current += 15;
      }
    });

    this.availableSlots = allSlots.filter(slot => !this.bookedSlots.includes(slot));
    this.cdr.detectChanges();
  }

  onSlotSelect(slot: string): void {
    this.selectedSlot = slot;
    this.cdr.detectChanges();
  }

  isSlotSelected(slot: string): boolean {
    return this.selectedSlot === slot;
  }

  get isFormValid(): boolean {
    return !!this.selectedDoctor && !!this.selectedDate && !!this.selectedSlot && !!this.patientId;
  }

  submitAppointment(): void {
    if (!this.isFormValid) return;

    this.isSubmitting = true;
    this.bookingError = '';

    const dateObj = new Date(this.selectedDate + 'T00:00:00');
    const [time, ampm] = this.selectedSlot.split(' ');
    const [h, m] = time.split(':').map(Number);
    let hours = h;
    if (ampm === 'PM' && h !== 12) hours += 12;
    if (ampm === 'AM' && h === 12) hours = 0;

    dateObj.setHours(hours, m, 0, 0);

    const appointment: Appointment = {
      doctorId: this.selectedDoctor!.id,
      patientName: this.patientId,
      appointmentDate: dateObj.toISOString(),
      time: this.selectedSlot,
      priority: 'Normal',
      status: 'pending'
    };

    this.appointmentService.bookAppointment(appointment).subscribe({
      next: () => {
        this.bookingSuccess = true;
        this.isSubmitting = false;
        this.resetForm();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Booking error:', err);
        this.bookingError = 'Failed to book appointment. Please try again.';
        this.isSubmitting = false;
        this.cdr.detectChanges();
      }
    });
  }

  resetForm(): void {
    this.selectedDoctor = null;
    this.selectedDate = '';
    this.selectedSlot = '';
    this.availableSlots = [];
    this.bookedSlots = [];
    this.slotError = '';
    this.cdr.detectChanges();
  }

  dismissSuccess(): void {
    this.bookingSuccess = false;
    this.cdr.detectChanges();
  }

  getSelectedDayName(): string {
    if (!this.selectedDate) return '';
    const dateObj = new Date(this.selectedDate + 'T00:00:00');
    return dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  }

  getFormattedDate(): string {
    if (!this.selectedDate) return '';
    const dateObj = new Date(this.selectedDate + 'T00:00:00');
    return dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
}