// src/app/services/auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Router } from '@angular/router';

export interface User {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api';
  private currentUserSubject = new BehaviorSubject<User | null>(this.getUserFromStorage());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  // Get user from localStorage
  private getUserFromStorage(): User | null {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
  }

  // Signup
  signup(signupData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phoneNumber: string;
  }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/signup`, signupData)
      .pipe(
        tap(response => {
          if (response.success && response.token && response.user) {
            this.setSession(response.token, response.user);
          }
        })
      );
  }

  // Login
  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap(response => {
          if (response.success && response.token && response.user) {
            this.setSession(response.token, response.user);
          }
        })
      );
  }

  // Set session
  private setSession(token: string, user: User): void {
    localStorage.setItem('token', token);
    localStorage.setItem('currentUser', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  // Logout
  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  // Check if user is logged in
  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  // Get current user
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  // Get token
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  // Get user initials
  getUserInitials(): string {
    const user = this.getCurrentUser();
    if (!user) return 'U';
    
    const firstInitial = user.firstName.charAt(0).toUpperCase();
    const lastInitial = user.lastName.charAt(0).toUpperCase();
    return firstInitial + lastInitial;
  }

  // Get full name
  getFullName(): string {
    const user = this.getCurrentUser();
    return user ? `${user.firstName} ${user.lastName}` : 'Guest';
  }

  // Update user profile
  updateProfile(updateData: Partial<User>): Observable<AuthResponse> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.getToken()}`
    });

    return this.http.put<AuthResponse>(
      `${this.apiUrl}/user/update`,
      updateData,
      { headers }
    ).pipe(
      tap(response => {
        if (response.success && response.user) {
          const token = this.getToken();
          if (token) {
            this.setSession(token, response.user);
          }
        }
      })
    );
  }
}