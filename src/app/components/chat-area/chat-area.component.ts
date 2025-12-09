import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Message {
  id: number;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

@Component({
  selector: 'app-chat-area',
  templateUrl: './chat-area.component.html',
  styleUrls: ['./chat-area.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ChatAreaComponent {
  messages: Message[] = [];
  userInput: string = '';
  isEditing: boolean = false;
  editingMessageId: number | null = null;
  editingText: string = '';
  messageIdCounter: number = 0;

  // Send message
  sendMessage() {
    if (this.userInput.trim() === '') return;

    // Add user message
    const userMessage: Message = {
      id: this.messageIdCounter++,
      text: this.userInput.trim(),
      isUser: true,
      timestamp: new Date()
    };
    this.messages.push(userMessage);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: this.messageIdCounter++,
        text: this.generateResponse(userMessage.text),
        isUser: false,
        timestamp: new Date()
      };
      this.messages.push(aiResponse);
    }, 1000);

    this.userInput = '';
  }

  // Generate mock response
  generateResponse(userText: string): string {
    const responses = [
      `I understand you said: "${userText}". How can I help you further?`,
      `That's an interesting point about "${userText}". Let me provide more details...`,
      `Thanks for sharing that. Regarding "${userText}", here's what I think...`,
      `Great question! About "${userText}", I can explain...`
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Start editing message
  startEdit(message: Message) {
    this.isEditing = true;
    this.editingMessageId = message.id;
    this.editingText = message.text;
  }

  // Save edited message
  saveEdit() {
    if (this.editingText.trim() === '') return;

    const messageIndex = this.messages.findIndex(m => m.id === this.editingMessageId);
    if (messageIndex !== -1) {
      this.messages[messageIndex].text = this.editingText.trim();
      
      // Remove all messages after edited one
      this.messages = this.messages.slice(0, messageIndex + 1);

      // Generate new response
      setTimeout(() => {
        const aiResponse: Message = {
          id: this.messageIdCounter++,
          text: this.generateResponse(this.editingText),
          isUser: false,
          timestamp: new Date()
        };
        this.messages.push(aiResponse);
      }, 1000);
    }

    this.cancelEdit();
  }

  // Cancel editing
  cancelEdit() {
    this.isEditing = false;
    this.editingMessageId = null;
    this.editingText = '';
  }

  // Copy message text
  copyMessage(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      alert('Message copied!');
    });
  }

  // Like message
  likeMessage(message: Message) {
    console.log('Liked:', message.text);
    alert('Message liked! 👍');
  }

  // Dislike message
  dislikeMessage(message: Message) {
    console.log('Disliked:', message.text);
    alert('Message disliked! 👎');
  }

  // Voice input
  startVoiceInput() {
    alert('Voice input feature coming soon! 🎤');
  }

  // Handle Enter key
  onKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // Handle Enter in edit mode
  onEditKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.saveEdit();
    } else if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }
}