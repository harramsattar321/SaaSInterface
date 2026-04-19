// appointment.service.ts  — full updated file
// Added: getAppointmentsByPatient(), cancelAppointment(), rescheduleAppointment()

import { map, shareReplay } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Doctor {
  id: number;
  name: string;
  specialty: string;
  experience: string;
  education: string;
  image: string;
  availableDays: string[];
  timeSlots: TimeSlot[];
  shortBio: string;
  consultationFee: string;
}

export interface TimeSlot {
  day: string;
  startTime: string;
  endTime: string;
  display: string;
}

export interface Appointment {
  id?: number;
  doctorId: number;
  patientName: string; // this is actually patientId / userId
  appointmentDate: string;
  time: string;
  priority: string;
  status?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AppointmentService {
  private hospitalApi = 'http://127.0.0.1:3000';
  private patientApi = 'http://127.0.0.1:8000';

  constructor(private http: HttpClient) {}

  private doctors$: Observable<Doctor[]> | null = null;

  // ── Existing methods (unchanged) ──────────────────────────

  getAllDoctors(): Observable<Doctor[]> {
    if (!this.doctors$) {
      this.doctors$ = this.http.get<any>(`${this.hospitalApi}/api/doctors`).pipe(
        map((res) => {
          // handle both: plain array OR { data: [] }
          return Array.isArray(res) ? res : res.data ?? [];
        }),
        shareReplay(1)
      );
    }
    return this.doctors$;
  }

  private handleError(err: any): string {
    if (err?.error?.message) return err.error.message;
    if (typeof err?.error === 'string') {
      try {
        return JSON.parse(err.error).message;
      } catch {
        return err.error;
      }
    }
    return 'Failed to book appointment. Please try again.';
  }

  getDoctorById(id: number): Observable<Doctor> {
    return this.http.get<Doctor>(`${this.hospitalApi}/api/doctors/${id}`);
  }

  getAppointmentsByDoctorAndDate(doctorId: number, date: string): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(
      `${this.hospitalApi}/api/appointments?doctorId=${doctorId}&date=${date}`
    );
  }

  bookAppointment(appointment: Appointment): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.hospitalApi}/api/appointments`, appointment);
  }

  // ── New methods for Dashboard ─────────────────────────────

  /**
   * Get all appointments for a specific patient.
   * patientName field in the DB actually stores the userId (e.g. "PAT1765520117599942").
   */
  getAppointmentsByPatient(patientId: string): Observable<Appointment[]> {
    return this.http.get<any>(`${this.hospitalApi}/api/appointments?patientName=${patientId}`).pipe(
      // Handle both { data: [...] } and plain array responses
      map((res) => (Array.isArray(res) ? res : res.data ?? res))
    );
  }

  /**
   * Cancel an appointment by ID.
   * Sends a PATCH to update status to 'cancelled'.
   */
  cancelAppointment(appointmentId: number): Observable<any> {
    return this.http.patch(`${this.hospitalApi}/api/appointments/${appointmentId}`, {
      status: 'cancelled',
    });
  }

  /**
   * Reschedule an appointment by ID.
   * Sends a PUT with the updated appointment object.
   */
  rescheduleAppointment(appointmentId: number, appointment: Appointment): Observable<Appointment> {
    return this.http.put<Appointment>(
      `${this.hospitalApi}/api/appointments/${appointmentId}`,
      appointment
    );
  }
}
