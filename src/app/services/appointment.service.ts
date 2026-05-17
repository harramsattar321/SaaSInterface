// src/services/appointment.service.ts — FULL UPDATED FILE

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
  patientName: string; // stores userId e.g. "PAT1765520117599942"
  appointmentDate: string;
  time: string;
  priority: 'High' | 'Normal' | 'Medium';
  status?: string;
  reason?: string;
}

export interface EmergencyDetectResult {
  success: boolean;
  isEmergency: boolean;
  category: string;
}

export interface EmergencyBookResult {
  success: boolean;
  message: string;
  appointment: Appointment & { doctorName: string };
  bumped: { appointmentId: number; patientId: string } | null;
}

@Injectable({
  providedIn: 'root',
})
export class AppointmentService {
  private hospitalApi = 'https://20-13-9-186.nip.io/hospital';
  private patientApi  = 'https://20-13-9-186.nip.io/patient';

  constructor(private http: HttpClient) {}

  private doctors$: Observable<Doctor[]> | null = null;

  // ── Doctors ───────────────────────────────────────────────

  getAllDoctors(): Observable<Doctor[]> {
    if (!this.doctors$) {
      this.doctors$ = this.http.get<any>(`${this.hospitalApi}/api/doctors`).pipe(
        map((res) => (Array.isArray(res) ? res : res.data ?? [])),
        shareReplay(1)
      );
    }
    return this.doctors$;
  }

  getDoctorById(id: number): Observable<Doctor> {
    return this.http.get<Doctor>(`${this.hospitalApi}/api/doctors/${id}`);
  }

  // ── Appointments ──────────────────────────────────────────

  getAppointmentsByDoctorAndDate(doctorId: number, date: string): Observable<Appointment[]> {
    return this.http.get<any>(
      `${this.hospitalApi}/api/appointments?doctorId=${doctorId}&date=${date}`
    ).pipe(
      map((res) => (Array.isArray(res) ? res : res.data ?? []))
    );
  }

  getAppointmentsByPatient(patientId: string): Observable<Appointment[]> {
    return this.http.get<any>(
      `${this.hospitalApi}/api/appointments?patientName=${patientId}`
    ).pipe(
      map((res) => (Array.isArray(res) ? res : res.data ?? res))
    );
  }

  bookAppointment(appointment: Appointment): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.hospitalApi}/api/appointments`, appointment);
  }

  cancelAppointment(appointmentId: number): Observable<any> {
    return this.http.patch(`${this.hospitalApi}/api/appointments/${appointmentId}`, {
      status: 'Cancelled',
    });
  }

  rescheduleAppointment(appointmentId: number, appointment: Appointment): Observable<Appointment> {
    return this.http.put<Appointment>(
      `${this.hospitalApi}/api/appointments/${appointmentId}`,
      appointment
    );
  }

  // ── Reminders ─────────────────────────────────────────────

  sendReminder(payload: {
    appointmentId: number;
    patientId: string;
    appointmentTime: string;
    appointmentDate: string;
    doctorName: string;
  }): Observable<any> {
    const token = localStorage.getItem('token') ?? '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.patientApi}/api/reminders/send-reminder`, payload, { headers });
  }

  // ── EMERGENCY — NEW ───────────────────────────────────────

  /**
   * Send reason text to hospital backend for keyword-based emergency detection.
   * Returns { isEmergency, category }
   */
  detectEmergency(reason: string): Observable<EmergencyDetectResult> {
    return this.http.post<EmergencyDetectResult>(
      `${this.hospitalApi}/api/emergency/detect`,
      { reason }
    );
  }

  /**
   * Book an emergency appointment.
   * Backend calculates next 15-min slot, bumps existing patient if needed,
   * sends cancellation email to bumped patient, books with priority: 'High'.
   */
  bookEmergencyAppointment(payload: {
    doctorId: number;
    patientId: string;
    reason: string;
    category: string;
  }): Observable<EmergencyBookResult> {
    return this.http.post<EmergencyBookResult>(
      `${this.hospitalApi}/api/emergency/book`,
      payload
    );
  }
}