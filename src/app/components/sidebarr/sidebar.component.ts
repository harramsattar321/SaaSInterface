import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelService } from '../services/model.service';

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
    
    // Map model ID to display name
    const modelNames: { [key: string]: string } = {
      'model1': 'Model 1',
      'model2': 'Model 2',
      'model3': 'Model 3'
    };
    
    // Update the service with display name
    this.modelService.setModel(modelNames[model]);
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
  userMenuOpen = false;
  
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
    if (this.editingChat === chat) return; // Don't open if editing
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
  
  // Menu actions
  logOut() {
    this.userMenuOpen = false;
    alert("Logged out!");
  }
  
  openSettings() {
    this.userMenuOpen = false;
    alert("Open settings!");
  }
}