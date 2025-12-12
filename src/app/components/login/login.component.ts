import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  email = '';
  password = '';
  loading = false;
  errorMessage = '';
  
  // Timeout duration in milliseconds (2 seconds)
  private readonly LOGIN_TIMEOUT = 1000;
  private timeoutHandle: any;

  constructor(private authService: AuthService, private router: Router) {}

  onLogin() {
    // ------------------------------
    // 1. Client-side validation
    // ------------------------------
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

    // ------------------------------
    // 2. Forced timeout - show error if backend is slow
    // ------------------------------
    this.timeoutHandle = setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.errorMessage = 'Server is taking too long. Please try again.';
      }
    }, this.LOGIN_TIMEOUT);

    // ------------------------------
    // 3. Call backend login
    // ------------------------------
    this.authService.login(this.email, this.password).subscribe({
      next: (response: any) => {
        clearTimeout(this.timeoutHandle);
        this.loading = false;
        
        if (response.success) {
          // Clear form
          this.email = '';
          this.password = '';
          // Navigate to dashboard
          this.router.navigate(['/dashboard']);
        } else {
          // Backend returned success=false
          this.errorMessage = response.message || 'Invalid email or password';
        }
      },
      error: (error: any) => {
        clearTimeout(this.timeoutHandle);
        this.loading = false;
        
        // Show error message immediately
        if (error.error?.message) {
          this.errorMessage = error.error.message;
        } else if (error.status === 401 || error.status === 403) {
          this.errorMessage = 'Invalid email or password';
        } else if (error.status === 0) {
          this.errorMessage = 'Unable to connect to server. Please check your internet connection.';
        } else if (error.status === 500) {
          this.errorMessage = 'Server error. Please try again later.';
        } else {
          this.errorMessage = 'Invalid email or password';
        }
        
        console.error('Login error:', error);
      }
    });
  }

  // Clear error message when user starts typing
  onInputChange() {
    if (this.errorMessage) {
      this.errorMessage = '';
    }
  }
}