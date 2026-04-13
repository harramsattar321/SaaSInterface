import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  // --- Login fields ---
  email = '';
  password = '';
  loading = false;
  errorMessage = '';
  resetSuccessMessage = '';

  // --- Forgot password fields ---
  showForgotPassword = false;
  forgotEmail = '';
  forgotLoading = false;
  forgotErrorMessage = '';
  forgotSuccessMessage = '';

  private readonly LOGIN_TIMEOUT = 1000;
  private timeoutHandle: any;
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef   // ← forces Angular to re-render the template
  ) {}

  ngOnInit() {
    const resetDone = this.route.snapshot.queryParamMap.get('reset');
    if (resetDone === 'success') {
      this.resetSuccessMessage = 'Password reset successfully! Please log in with your new password.';
      this.router.navigate([], {
        queryParams: { reset: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }

  // ----------------------------------------
  // LOGIN
  // ----------------------------------------
  onLogin() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Please fill in all fields';
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.errorMessage = 'Please enter a valid email';
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.resetSuccessMessage = '';

    this.timeoutHandle = setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.errorMessage = 'Server is taking too long. Please try again.';
      }
    }, this.LOGIN_TIMEOUT);

    this.authService.login(this.email, this.password).subscribe({
      next: (response: any) => {
        clearTimeout(this.timeoutHandle);
        this.loading = false;
        if (response.success) {
          this.email = '';
          this.password = '';
          this.router.navigate(['/dashboard']);
        } else {
          this.errorMessage = response.message || 'Invalid email or password';
        }
      },
      error: (error: any) => {
        clearTimeout(this.timeoutHandle);
        this.loading = false;
        if (error.error?.message) {
          this.errorMessage = error.error.message;
        } else if (error.status === 401 || error.status === 403) {
          this.errorMessage = 'Invalid email or password';
        } else if (error.status === 0) {
          this.errorMessage = 'Unable to connect to server.';
        } else {
          this.errorMessage = 'Invalid email or password';
        }
      }
    });
  }

  onInputChange() {
    if (this.errorMessage) this.errorMessage = '';
  }

  // ----------------------------------------
  // FORGOT PASSWORD
  // ----------------------------------------

  openForgotPassword() {
    this.showForgotPassword = true;
    this.forgotEmail = this.email;
    this.forgotLoading = false;
    this.forgotErrorMessage = '';
    this.forgotSuccessMessage = '';
  }

  backToLogin() {
    this.showForgotPassword = false;
    this.forgotEmail = '';
    this.forgotLoading = false;
    this.forgotErrorMessage = '';
    this.forgotSuccessMessage = '';
  }

  onForgotPassword() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.forgotEmail) {
      this.forgotErrorMessage = 'Please enter your email address';
      return;
    }
    if (!emailRegex.test(this.forgotEmail)) {
      this.forgotErrorMessage = 'Please enter a valid email address';
      return;
    }

    this.forgotLoading = true;
    this.forgotErrorMessage = '';
    this.forgotSuccessMessage = '';

    fetch(`${this.apiUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.forgotEmail })
    })
      .then(res => res.json())
      .then(() => {
        this.ngZone.run(() => {
          this.forgotLoading = false;
          this.forgotSuccessMessage = 'Reset link sent! Please check your inbox (and spam folder).';
          this.forgotEmail = '';
          this.cdr.detectChanges(); // ← force the template to re-render right now
        });
      })
      .catch(() => {
        this.ngZone.run(() => {
          this.forgotLoading = false;
          this.forgotErrorMessage = 'Unable to connect to server. Please check your connection.';
          this.cdr.detectChanges(); // ← same here
        });
      });
  }

  onForgotInputChange() {
    if (this.forgotErrorMessage) this.forgotErrorMessage = '';
  }
}