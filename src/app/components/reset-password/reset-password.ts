import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reset-password.html',
  styleUrls: ['./reset-password.css']
})
export class ResetPasswordComponent implements OnInit {
  token = '';
  newPassword = '';
  confirmPassword = '';

  loading = false;
  errorMessage = '';
  successMessage = '';

  showNew = false;
  showConfirm = false;

  private apiUrl = 'http://localhost:3000/api';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';

    try {
      this.token = decodeURIComponent(this.token);
    } catch {
      // already decoded, ignore
    }

    if (!this.token) {
      this.errorMessage = 'Invalid or missing reset token. Please request a new reset link.';
    }
  }

  onInputChange() {
    if (this.errorMessage) this.errorMessage = '';
  }

  toggleShowNew() { this.showNew = !this.showNew; }
  toggleShowConfirm() { this.showConfirm = !this.showConfirm; }

  onResetPassword() {
    this.errorMessage = '';

    if (!this.newPassword || !this.confirmPassword) {
      this.errorMessage = 'Please fill in both fields.';
      return;
    }

    if (this.newPassword.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters.';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    this.loading = true;

    this.http.post<any>(`${this.apiUrl}/auth/reset-password`, {
      token: this.token,
      newPassword: this.newPassword
    }).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.successMessage = 'Password reset! Redirecting to login...';
          // Redirect to login with a success flag so login page shows a banner
          setTimeout(() => {
            this.router.navigate(['/login'], { queryParams: { reset: 'success' } });
          }, 2000);
        } else {
          this.errorMessage = response.message || 'Something went wrong. Please try again.';
        }
      },
      error: (error) => {
        this.loading = false;
        if (error.status === 400) {
          this.errorMessage = error.error?.message || 'Reset link is invalid or has expired. Please request a new one.';
        } else if (error.status === 0) {
          this.errorMessage = 'Unable to connect to server. Please check your connection.';
        } else {
          this.errorMessage = 'Server error. Please try again later.';
        }
      }
    });
  }
}