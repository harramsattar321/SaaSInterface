// src/app/components/sidebar/sidebar.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelService } from '../../services/model.service';
import { AuthService, User } from '../../services/auth.service';
import { ChatService, ChatSession } from '../../services/chat.services';
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
  private chatListSubscription?: Subscription;

  // Real chats from backend
  chats: ChatSession[] = [];
  activeChatId: string | null = null;

  // Search
  searchText = '';

  // Inline rename
  editingChatId: string | null = null;
  editingChatName: string = '';

  // User Info
  userName = 'John Doe';
  userEmail = 'john.doe@example.com';
  userMenuOpen = false;

  // Settings Modal
  showSettingsModal = false;
  settingsForm = { name: '', email: '', phone: '', bio: '' };

  constructor(
    private modelService: ModelService,
    private authService: AuthService,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef
  ) {}

  // Close user menu when clicking anywhere outside the sidebar
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.userMenuOpen && !this.elementRef.nativeElement.contains(event.target)) {
      this.userMenuOpen = false;
      this.cdr.detectChanges();
    }
  }

  ngOnInit() {
    // Subscribe to auth user
    this.userSubscription = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.userName = `${user.firstName} ${user.lastName}`;
        this.userEmail = user.email;
      }
    });

    // Subscribe to real chat list from ChatService
    this.chatListSubscription = this.chatService.chatList$.subscribe(chats => {
      this.chats = chats;
      this.cdr.detectChanges();
    });

    // Track active chat for highlight
    this.chatService.activeChatId$.subscribe(id => {
      this.activeChatId = id;
      this.cdr.detectChanges();
    });

    // Load chats from backend on startup
    this.chatService.loadChatList().subscribe({
      error: err => console.error('Failed to load chats:', err)
    });
  }

  ngOnDestroy() {
    this.userSubscription?.unsubscribe();
    this.chatListSubscription?.unsubscribe();
  }

  selectModel(model: string) {
    this.selectedModel = model;
    this.modelService.setSelectedModel(model);
  }

  // Initials
  get userInitials(): string {
    if (!this.currentUser) return 'U';
    return (
      this.currentUser.firstName.charAt(0).toUpperCase() +
      this.currentUser.lastName.charAt(0).toUpperCase()
    );
  }

  // Filtered chats for search
  filteredChats(): ChatSession[] {
    if (!this.searchText.trim()) return this.chats;
    return this.chats.filter(c =>
      c.title.toLowerCase().includes(this.searchText.toLowerCase())
    );
  }

  // Start a new chat
  startNewChat() {
    this.chatService.createNewChat().subscribe({
      error: err => console.error('Failed to create new chat:', err)
    });
  }

  // Open / select a chat
  openChat(chat: ChatSession) {
    if (this.editingChatId === chat.chatId) return;
    this.chatService.setActiveChat(chat.chatId);
  }

  // Delete a chat
  deleteChat(chat: ChatSession, event: Event) {
    event.stopPropagation(); // don't trigger openChat
    if (!confirm(`Delete "${chat.title}"?`)) return;
    this.chatService.deleteChat(chat.chatId).subscribe({
      error: err => console.error('Failed to delete chat:', err)
    });
  }

  // Start rename
  startRename(chat: ChatSession, event: Event) {
    event.stopPropagation();
    this.editingChatId = chat.chatId;
    this.editingChatName = chat.title;
  }

  // Save rename
  saveRename(chat: ChatSession) {
    if (this.editingChatName.trim() === '') {
      this.editingChatId = null;
      return;
    }
    this.chatService.renameChat(chat.chatId, this.editingChatName.trim()).subscribe({
      error: err => console.error('Failed to rename chat:', err)
    });
    this.editingChatId = null;
  }

  // Cancel rename on Escape
  onRenameKeyPress(event: KeyboardEvent, chat: ChatSession) {
    if (event.key === 'Enter') this.saveRename(chat);
    if (event.key === 'Escape') this.editingChatId = null;
  }

  // Toggle user menu
  toggleUserMenu() {
    this.userMenuOpen = !this.userMenuOpen;
  }

  // Settings
  openSettings() {
    this.userMenuOpen = false;
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

  closeSettingsModal() {
    this.showSettingsModal = false;
  }

  saveSettings() {
    if (!this.currentUser) return;
    const nameParts = this.settingsForm.name.trim().split(' ');
    const updateData = {
      firstName: nameParts[0] || this.currentUser.firstName,
      lastName: nameParts.slice(1).join(' ') || this.currentUser.lastName,
      phoneNumber: this.settingsForm.phone || this.currentUser.phoneNumber
    };
    this.authService.updateProfile(updateData).subscribe({
      next: res => {
        if (res.success) {
          alert('Settings saved successfully!');
          this.closeSettingsModal();
        }
      },
      error: err => {
        alert('Failed to save settings: ' + (err.error?.message || 'Unknown error'));
      }
    });
  }

  logOut() {
    this.userMenuOpen = false;
    if (confirm('Are you sure you want to logout?')) {
      this.authService.logout();
    }
  }
}