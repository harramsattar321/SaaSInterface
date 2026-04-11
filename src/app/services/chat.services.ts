import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private apiUrl = 'http://localhost:5000';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') ?? '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  private getPatientName(): string {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      const user = JSON.parse(currentUser);
      // Combine first and last name for the Router
      return `${user.firstName} ${user.lastName}`.trim();
    }
    return 'Patient';
  }

  sendMessage(message: string): Observable<{ reply: string; state: string }> {
    return this.http.post<{ reply: string; state: string }>(
      `${this.apiUrl}/chat`,
      { 
        message,
        patientName: this.getPatientName()  // send full name to Flask
      },
      { headers: this.getHeaders() }
    );
  }

  resetSession(): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/chat/reset`, 
      { patientName: this.getPatientName() },
      { headers: this.getHeaders() }
    );
  }
}