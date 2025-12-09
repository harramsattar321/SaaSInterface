import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './components/sidebarr/sidebar.component';
import { ChatAreaComponent } from './components/chat-area/chat-area.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, ChatAreaComponent]
})
export class App {
  protected readonly title = signal('hospital-website');
}