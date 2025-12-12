import { Component } from '@angular/core';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { ChatAreaComponent } from '../chat-area/chat-area.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [SidebarComponent, ChatAreaComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {}
