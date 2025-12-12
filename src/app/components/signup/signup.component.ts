import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})
export class SignupComponent {
  signupData = {
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: ''
  };
  confirmPassword = '';
  loading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  onSignup() {
    if (!this.signupData.firstName || !this.signupData.lastName ||
        !this.signupData.email || !this.signupData.phoneNumber ||
        !this.signupData.password) {
      this.errorMessage = 'Please fill in all fields';
      return;
    }

    if (this.signupData.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return;
    }

    if (this.signupData.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters long';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.signup(this.signupData).subscribe({
      next: (response) => {
        if (response.success) {
          this.successMessage = 'Account created successfully! Redirecting...';
          setTimeout(() => {
            this.router.navigate(['/dashboard']);
          }, 1500);
        }
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error.error?.message || 'Signup failed. Please try again.';
      },
      complete: () => {
        this.loading = false;
      }
    });
  }
}
