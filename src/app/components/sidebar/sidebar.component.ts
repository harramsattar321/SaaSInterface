// src/app/components/sidebar/sidebar.component.ts - UPDATED
import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelService } from '../../services/model.service';
import { AuthService, User } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class SidebarComponent implements OnInit, OnDestroy {

  // MODEL SWITCHER
  selectedModel: string = 'model1';
  
  // Auth
  currentUser: User | null = null;
  private userSubscription?: Subscription;
  
  constructor(
    private modelService: ModelService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Subscribe to user changes
    this.userSubscription = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.userName = `${user.firstName} ${user.lastName}`;
        this.userEmail = user.email;
      }
    });
  }

  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  selectModel(model: string) {
    this.selectedModel = model;
    this.modelService.setSelectedModel(model);
  }

  // Search
  searchText = "";
  
  // Chats
  chats: string[] = ['Chat 1', 'Chat 2', 'Chat 3', 'Hospital Records', 'Patient Reports'];

  // Inline rename
  editingChat: string | null = null;
  editingChatName: string = "";

  // User Info
  userName = "John Doe";
  userEmail = "john.doe@example.com";
  userMenuOpen = false;

  // Settings Modal
  showSettingsModal = false;
  settingsForm = {
    name: '',
    email: '',
    phone: '',
    bio: ''
  };

  // Initials - NOW USING REAL USER DATA
  get userInitials(): string {
    if (!this.currentUser) return 'U';
    
    const firstInitial = this.currentUser.firstName.charAt(0).toUpperCase();
    const lastInitial = this.currentUser.lastName.charAt(0).toUpperCase();
    return firstInitial + lastInitial;
  }

  // Add new chat
  startNewChat() {
    const newChat = `Chat ${this.chats.length + 1}`;
    this.chats.push(newChat);
  }

  // Open chat
  openChat(chat: string) {
    if (this.editingChat === chat) return;
    console.log(`Opening ${chat}`);
  }

  // Delete chat
  deleteChat(chat: string) {
    this.chats = this.chats.filter(c => c !== chat);
  }

  // Rename start
  startRename(chat: string) {
    this.editingChat = chat;
    this.editingChatName = chat;
  }

  // Rename save
  saveRename(chat: string) {
    if (this.editingChatName.trim() !== "") {
      const index = this.chats.indexOf(chat);
      if (index !== -1) {
        this.chats[index] = this.editingChatName.trim();
      }
    }
    this.editingChat = null;
  }

  // Search filter
  filteredChats() {
    return this.chats.filter(c =>
      c.toLowerCase().includes(this.searchText.toLowerCase())
    );
  }

  // Toggle menu
  toggleUserMenu() {
    this.userMenuOpen = !this.userMenuOpen;
  }

  // Open Settings Modal
  openSettings() {
    this.userMenuOpen = false;
    
    // Pre-fill form with current user data
    if (this.currentUser) {
      this.settingsForm = {
        name: `${this.currentUser.firstName} ${this.currentUser.lastName}`,
        email: this.currentUser.email,
        phone: this.currentUser.phoneNumber,
        bio: ''
      };
    }
    
    this.showSettingsModal = true;
  }

  // Close Settings Modal
  closeSettingsModal() {
    this.showSettingsModal = false;
  }

  // Save Settings - NOW WITH API CALL
  saveSettings() {
    if (!this.currentUser) return;

    const nameParts = this.settingsForm.name.trim().split(' ');
    const updateData = {
      firstName: nameParts[0] || this.currentUser.firstName,
      lastName: nameParts.slice(1).join(' ') || this.currentUser.lastName,
      phoneNumber: this.settingsForm.phone || this.currentUser.phoneNumber
    };

    this.authService.updateProfile(updateData).subscribe({
      next: (response) => {
        if (response.success) {
          alert('Settings saved successfully!');
          this.closeSettingsModal();
        }
      },
      error: (error) => {
        alert('Failed to save settings: ' + (error.error?.message || 'Unknown error'));
      }
    });
  }

  // Log out - NOW WITH REAL LOGOUT
  logOut() {
    this.userMenuOpen = false;
    if (confirm('Are you sure you want to logout?')) {
      this.authService.logout();
    }
  }
}