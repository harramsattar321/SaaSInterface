import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppointmentService, Doctor, Appointment } from '../../services/appointment.service';

@Component({
  selector: 'app-appointment-booking',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
    private cdr: ChangeDetectorRef,
    private zone: NgZone
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
      this.patientId = user.userId || user.id;
    }
  }

  private setMinDate(): void {
    const today = new Date();
    this.minDate = today.toISOString().split('T')[0];
  }

  loadDoctors(): void {
    this.zone.run(() => {
      this.isLoadingDoctors = true;
    });

    this.appointmentService.getAllDoctors().subscribe({
      next: (data) => {
        this.zone.run(() => {
          this.doctors = data;
          this.isLoadingDoctors = false;
        });
      },
      error: (err) => {
        console.error('Error loading doctors:', err);
        this.zone.run(() => {
          this.isLoadingDoctors = false;
        });
      }
    });

    setTimeout(() => {
      if (this.isLoadingDoctors) {
        this.zone.run(() => {
          this.isLoadingDoctors = false;
        });
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

  onDateChange(): void {
    this.selectedSlot = '';
    this.availableSlots = [];
    this.slotError = '';

    if (!this.selectedDoctor || !this.selectedDate) return;

    const dateObj = new Date(this.selectedDate + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const slotsForDay = this.selectedDoctor.timeSlots.filter(ts => ts.day === dayName);

    console.log('1. Day name:', dayName);
    console.log('2. Slots for day:', slotsForDay);

    if (slotsForDay.length === 0) {
      this.slotError = `Dr. ${this.selectedDoctor.name.replace('Dr. ', '')} is not available on ${dayName}s.`;
      return;
    }

    this.isLoadingSlots = true;
    this.cdr.detectChanges(); // Force UI to show any loading spinners

    this.appointmentService.getAppointmentsByDoctorAndDate(
      this.selectedDoctor.id,
      this.selectedDate
    ).subscribe({
      next: (response: any) => {
          this.zone.run(() => {
          const appointments = Array.isArray(response) ? response : response.data ?? [];
          console.log('3. HTTP response:', appointments);
          this.bookedSlots = appointments.map((a: any) => a.time);
          this.generateAvailableSlots(slotsForDay);
          console.log('4. Available slots:', this.availableSlots);
          this.isLoadingSlots = false;
          
          // Force Angular to update the view with the new slots
          this.cdr.detectChanges(); 
        });
      },
      error: (err) => {
        this.zone.run(() => {
          console.log('3. HTTP ERROR:', err);
          this.generateAvailableSlots(slotsForDay);
          this.isLoadingSlots = false;
          
          // Force Angular to update the view
          this.cdr.detectChanges(); 
        });
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
  }

  onSlotSelect(slot: string): void {
    this.zone.run(() => {
      this.selectedSlot = slot;
    });
  }

  isSlotSelected(slot: string): boolean {
    return this.selectedSlot === slot;
  }

  get isFormValid(): boolean {
    return !!this.selectedDoctor && !!this.selectedDate && !!this.selectedSlot && !!this.patientId;
  }

  submitAppointment(): void {
    if (!this.isFormValid) return;
  
    // Check if patient already has an appointment with this doctor on this date
    const existingBooking = this.bookedSlots.find(slot => slot === this.selectedSlot);
    
    // Check patient's own appointments for this doctor+date
    this.appointmentService.getAppointmentsByDoctorAndDate(
      this.selectedDoctor!.id,
      this.selectedDate
    ).subscribe({
      next: (response: any) => {
  const appointments = Array.isArray(response) ? response : response.data ?? [];
  const patientAlreadyBooked = appointments.some(
          (a: any) => a.patientName === this.patientId
        );
  
        if (patientAlreadyBooked) {
          this.zone.run(() => {
            this.bookingError = `You already have an appointment with ${this.selectedDoctor!.name} on ${this.getFormattedDate()}. Please choose a different date.`;
            this.cdr.detectChanges();
          });
          return;
        }
  
        // No duplicate — proceed with booking
        this.proceedWithBooking();
      },
      error: (err) => {
        this.zone.run(async () => {
          let message = 'Failed to book appointment. Please try again.';
          
          try {
            // Handle both parsed object and ReadableStream (withFetch quirk)
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
            } else if (typeof err?.error === 'string') {
              const parsed = JSON.parse(err.error);
              message = parsed.message || message;
            }
          } catch (e) {
            console.error('Error parsing error response:', e);
          }
      
          this.bookingError = message;
          this.isSubmitting = false;
          this.cdr.detectChanges();
        });
      }
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
      doctorId: this.selectedDoctor!.id,
      patientName: this.patientId,
      appointmentDate: dateObj.toISOString(),
      time: this.selectedSlot,
      priority: 'Normal',
      status: 'pending'
    };
  
    this.appointmentService.bookAppointment(appointment).subscribe({
      next: () => {
        this.zone.run(() => {
          this.isSubmitting = false;
          this.bookingSuccess = true;
          this.resetForm();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.zone.run(async () => {
          let message = 'Failed to book appointment. Please try again.';
          
          try {
            // Handle both parsed object and ReadableStream (withFetch quirk)
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
            } else if (typeof err?.error === 'string') {
              const parsed = JSON.parse(err.error);
              message = parsed.message || message;
            }
          } catch (e) {
            console.error('Error parsing error response:', e);
          }
      
          this.bookingError = message;
          this.isSubmitting = false;
          this.cdr.detectChanges();
        });
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
  }

  dismissSuccess(): void {
    this.zone.run(() => {
      this.bookingSuccess = false;
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