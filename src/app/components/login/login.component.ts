import { Component, OnInit, NgZone } from '@angular/core';
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
    private ngZone: NgZone   // ← forces Angular to detect changes
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

    console.log('🚀 STEP 1: Setting forgotLoading = true');
    this.forgotLoading = true;
    this.forgotErrorMessage = '';
    this.forgotSuccessMessage = '';

    // Use native fetch() as a completely independent test
    // This bypasses Angular's HttpClient entirely
    fetch(`${this.apiUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.forgotEmail })
    })
      .then(res => {
        console.log('🚀 STEP 2: Got response, status =', res.status);
        return res.json();
      })
      .then(data => {
        console.log('🚀 STEP 3: Response data =', data);
        // Run inside NgZone so Angular picks up the state change
        this.ngZone.run(() => {
          console.log('🚀 STEP 4: Inside NgZone — setting loading=false, showing success');
          this.forgotLoading = false;
          this.forgotSuccessMessage = 'Reset link sent! Please check your inbox (and spam folder).';
          this.forgotEmail = '';
          console.log('🚀 STEP 5: forgotLoading =', this.forgotLoading, '| forgotSuccessMessage =', this.forgotSuccessMessage);
        });
      })
      .catch(err => {
        console.error('🚀 STEP 2 ERROR:', err);
        this.ngZone.run(() => {
          this.forgotLoading = false;
          this.forgotErrorMessage = 'Unable to connect to server. Please check your internet connection.';
        });
      });
  }

  onForgotInputChange() {
    if (this.forgotErrorMessage) this.forgotErrorMessage = '';
  }
}