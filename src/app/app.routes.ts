// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { SignupComponent } from './components/signup/signup.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { AuthGuard } from './guards/auth.guard';
import { ResetPasswordComponent } from './components/reset-password/reset-password';
import { AppointmentBookingComponent } from './components/appointments/appointments';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'appointment', component: AppointmentBookingComponent },
  { 
    path: 'dashboard', 
    component: DashboardComponent,
    // canActivate: [AuthGuard]
  },
  { path: '**', redirectTo: '/login' }
];