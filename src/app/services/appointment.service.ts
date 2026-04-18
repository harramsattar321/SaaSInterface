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
  patientName: string;
  appointmentDate: string;
  time: string;
  priority: string;
  status?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {

  private hospitalApi = 'http://127.0.0.1:3000';
  private patientApi = 'http://127.0.0.1:8000';

  constructor(private http: HttpClient) {}

  private doctors$: Observable<Doctor[]> | null = null;

  getAllDoctors(): Observable<Doctor[]> {
    if (!this.doctors$) {
      this.doctors$ = this.http.get<any>(`${this.hospitalApi}/api/doctors`).pipe(
        map(res => res.data),
        shareReplay(1) // Keeps the last result in memory for future subscribers
      );
    }
    return this.doctors$;
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
}