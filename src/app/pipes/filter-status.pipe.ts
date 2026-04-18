// filter-status.pipe.ts
// Place in: src/app/pipes/filter-status.pipe.ts
// Add to your module's declarations array.

import { Pipe, PipeTransform } from '@angular/core';
import { Appointment } from '../services/appointment.service';

@Pipe({ name: 'filterStatus', standalone: true })
export class FilterStatusPipe implements PipeTransform {
  transform(appointments: Appointment[], status: string): number {
    if (!appointments) return 0;
    const now = new Date();

    if (status === 'pending') {
      // Upcoming = pending AND in the future
      return appointments.filter(
        a => a.status !== 'cancelled' && new Date(a.appointmentDate) >= now
      ).length;
    }

    if (status === 'completed') {
      return appointments.filter(
        a => a.status !== 'cancelled' && new Date(a.appointmentDate) < now
      ).length;
    }

    return appointments.filter(a => a.status === status).length;
  }
}