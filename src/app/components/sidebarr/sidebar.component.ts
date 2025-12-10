import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelService } from '../../services/model.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class SidebarComponent {

  // MODEL SWITCHER
  selectedModel: string = 'model1';
  
  constructor(private modelService: ModelService) {}

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

  // Initials
  get userInitials(): string {
    const names = this.userName.split(' ');
    return (names[0][0] + (names[1]?.[0] || '')).toUpperCase();
  }

  // Add new chat
  startNewChat() {
    const newChat = `Chat ${this.chats.length + 1}`;
    this.chats.push(newChat);
  }

  // Open chat
  openChat(chat: string) {
    if (this.editingChat === chat) return;
    alert(`Opening ${chat}`);
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
    this.settingsForm = {
      name: this.userName,
      email: this.userEmail,
      phone: '',
      bio: ''
    };
    
    this.showSettingsModal = true;
  }

  // Close Settings Modal
  closeSettingsModal() {
    this.showSettingsModal = false;
  }

  // Save Settings
  saveSettings() {
    // Update user info
    if (this.settingsForm.name.trim()) {
      this.userName = this.settingsForm.name.trim();
    }
    if (this.settingsForm.email.trim()) {
      this.userEmail = this.settingsForm.email.trim();
    }

    // Here you will add backend API call
    console.log('Settings saved:', this.settingsForm);
    
    // TODO: Add API call here when backend is ready
    // this.http.post('/api/user/update', this.settingsForm).subscribe(...)

    alert('Settings saved successfully!');
    this.closeSettingsModal();
  }

  // Log out
  logOut() {
    this.userMenuOpen = false;
    
    // TODO: Add logout API call here when backend is ready
    // this.http.post('/api/logout', {}).subscribe(...)
    
    alert("Logged out!");
  }
}