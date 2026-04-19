import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelService } from '../../services/model.service';
import { Subscription } from 'rxjs';
import { ChatService, ReportAnalysis } from '../../services/chat.services';
import { Router, RouterModule } from '@angular/router';

interface Message {
  id: number;
  text: string;
  isUser: boolean;
  timestamp: Date;
  audioUrl?: string;
  file?: {
    name: string;
    size: number;
    type: string;
  };
  liked?: boolean;
  disliked?: boolean;
  copied?: boolean;
  // Report analysis result attached to an AI message
  reportAnalysis?: ReportAnalysis;
}

@Component({
  selector: 'app-chat-area',
  templateUrl: './chat-area.component.html',
  styleUrls: ['./chat-area.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
})
export class ChatAreaComponent implements OnInit, OnDestroy {
  messages: Message[] = [];
  userInput: string = '';
  selectedFile: File | null = null;
  isEditing = false;
  editingMessageId: number | null = null;
  editingText = '';
  messageIdCounter = 0;

  isLoading = false;
  isLoadingChat = false;
  isAnalyzingReport = false;

  selectedModel: string = 'model1';
  private modelSubscription?: Subscription;
  private activeChatSubscription?: Subscription;

  private currentChatId: string | null = null;

  isRecording = false;
  recordingTime = '0:00';
  frequencyBars: number[] = [];
  private recordingInterval: any;
  private recordingStartTime: number = 0;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private mediaStream: MediaStream | null = null;

  private recognition: any = null;
  private initialInputText: string = '';

  constructor(
    private modelService: ModelService,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit() {
    this.modelSubscription = this.modelService.selectedModel$.subscribe((model) => {
      this.selectedModel = model;
    });

    this.activeChatSubscription = this.chatService.activeChatId$.subscribe((chatId) => {
      if (!chatId) {
        this.currentChatId = null;
        this.messages = [];
        this.cdr.detectChanges();
        return;
      }
      if (chatId === this.currentChatId) return;
      this.openChat(chatId);
    });
  }

  ngOnDestroy() {
    this.stopRecordingTimers();
    this.cleanupAudioResources();
    if (this.recognition) this.recognition.stop();
    if (this.modelSubscription) this.modelSubscription.unsubscribe();
    if (this.activeChatSubscription) this.activeChatSubscription.unsubscribe();
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  goToBookAppointment(): void {
    this.router.navigate(['/appointment']);
  }

  sendSuggestion(text: string): void {
    this.userInput = text;
    this.sendMessage();
  }

  // ─── Chat Loading ──────────────────────────────────────────────────────────

  private openChat(chatId: string) {
    this.currentChatId = chatId;
    this.isLoadingChat = true;
    this.cdr.detectChanges();

    this.chatService.loadChat(chatId).subscribe({
      next: (res) => {
        this.messages = res.chat.messages.map((m) => ({
          id: this.messageIdCounter++,
          text: m.content,
          isUser: m.role === 'user',
          timestamp: new Date(m.timestamp ?? Date.now()),
        }));
        this.isLoadingChat = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load chat:', err);
        this.isLoadingChat = false;
        this.cdr.detectChanges();
      },
    });
  }

  // ─── File Selection ───────────────────────────────────────────────────────

  triggerFileInput(): void {
    const input = document.getElementById('report-file-input') as HTMLInputElement;
    input?.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a PDF, PNG, or JPG file.');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) {
      alert('File is too large. Maximum size is 10 MB.');
      return;
    }

    this.selectedFile = file;
    this.cdr.detectChanges();

    // Reset input so the same file can be re-selected if needed
    input.value = '';
  }

  removeSelectedFile(): void {
    this.selectedFile = null;
    this.cdr.detectChanges();
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ─── Send Message ──────────────────────────────────────────────────────────

  sendMessage() {
    if (this.isRecording) this.stopRecording();

    // If a file is selected, analyze it instead of sending a normal chat message
    if (this.selectedFile) {
      this.sendReportMessage(this.selectedFile);
      return;
    }

    if (this.userInput.trim() === '') return;

    const messageText = this.userInput.trim();
    const userMessage: Message = {
      id: this.messageIdCounter++,
      text: messageText,
      isUser: true,
      timestamp: new Date(),
    };
    this.messages.push(userMessage);
    this.userInput = '';
    this.isLoading = true;
    this.cdr.detectChanges();

    if (!this.currentChatId) {
      this.chatService.createNewChat().subscribe({
        next: (res) => {
          this.currentChatId = res.chat.chatId;
          this.dispatchMessage(messageText);
        },
        error: (err) => {
          console.error('Failed to create chat session:', err);
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
    } else {
      this.dispatchMessage(messageText);
    }
  }

  // ─── Report Analysis ──────────────────────────────────────────────────────

  private sendReportMessage(file: File): void {
    // 1. Show the user's file upload as a message
    const userMessage: Message = {
      id: this.messageIdCounter++,
      text: '',
      isUser: true,
      timestamp: new Date(),
      file: { name: file.name, size: file.size, type: file.type },
    };
    this.messages.push(userMessage);
    this.selectedFile = null;
    this.isAnalyzingReport = true;
    this.cdr.detectChanges();

    // 2. Call Flask
    this.chatService.analyzeReport(file).subscribe({
      next: (res) => {
        this.isAnalyzingReport = false;

        // 3. Attach the full analysis to an AI message
        const aiMessage: Message = {
          id: this.messageIdCounter++,
          text: '',
          isUser: false,
          timestamp: new Date(),
          reportAnalysis: res.analysis,
        };
        this.messages.push(aiMessage);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isAnalyzingReport = false;
        const errText =
          err.status === 401
            ? 'Session expired. Please log in again.'
            : err.error?.error || 'Could not analyze the report. Please try again.';

        this.messages.push({
          id: this.messageIdCounter++,
          text: errText,
          isUser: false,
          timestamp: new Date(),
        });
        this.cdr.detectChanges();
      },
    });
  }

  // ─── Dispatch Chat Message ─────────────────────────────────────────────────

  private dispatchMessage(messageText: string) {
    const chatId = this.currentChatId!;

    this.chatService.saveMessage(chatId, 'user', messageText).subscribe({
      next: () => {
        this.chatService.sendMessage(messageText).subscribe({
          next: (res) => {
            this.isLoading = false;
            const replyText = res.reply;
            const aiMessage: Message = {
              id: this.messageIdCounter++,
              text: replyText,
              isUser: false,
              timestamp: new Date(),
            };
            this.messages.push(aiMessage);
            this.cdr.detectChanges();

            this.chatService.saveMessage(chatId, 'assistant', replyText).subscribe({
              error: (err) => console.error('Failed to save assistant reply:', err),
            });
          },
          error: (err) => {
            this.isLoading = false;
            const errMsg =
              err.status === 401
                ? 'Session expired. Please log in again.'
                : 'Something went wrong. Please try again.';
            this.messages.push({
              id: this.messageIdCounter++,
              text: errMsg,
              isUser: false,
              timestamp: new Date(),
            });
            this.cdr.detectChanges();
          },
        });
      },
      error: () => {
        this.chatService.sendMessage(messageText).subscribe({
          next: (res) => {
            this.isLoading = false;
            this.messages.push({
              id: this.messageIdCounter++,
              text: res.reply,
              isUser: false,
              timestamp: new Date(),
            });
            this.cdr.detectChanges();
          },
          error: () => {
            this.isLoading = false;
            this.cdr.detectChanges();
          },
        });
      },
    });
  }

  // ─── Edit ──────────────────────────────────────────────────────────────────

  startEdit(message: Message) {
    this.isEditing = true;
    this.editingMessageId = message.id;
    this.editingText = message.text;
  }

  saveEdit() {
    const index = this.messages.findIndex((m) => m.id === this.editingMessageId);
    if (index !== -1) {
      this.messages[index].text = this.editingText.trim();
    }
    this.cancelEdit();
  }

  cancelEdit() {
    this.isEditing = false;
    this.editingMessageId = null;
    this.editingText = '';
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  onKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onEditKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.saveEdit();
    }
  }

  // ─── Voice Recording ──────────────────────────────────────────────────────

  async toggleVoiceRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      this.mediaStream = stream;
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.recordingTime = '0:00';
      this.initialInputText = this.userInput;
      this.cdr.detectChanges();

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        const currentTranscript = finalTranscript + interimTranscript;
        this.userInput = this.initialInputText
          ? `${this.initialInputText} ${currentTranscript}`
          : currentTranscript;
        this.cdr.detectChanges();
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') this.cancelRecording();
      };

      this.recognition.start();

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);
      this.frequencyBars = Array(30).fill(20);

      this.recordingInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        this.recordingTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        this.cdr.detectChanges();
      }, 1000);

      this.animateFrequencyBars();
    } catch (error: any) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone or start speech recognition.');
      this.isRecording = false;
      this.cdr.detectChanges();
      this.cleanupAudioResources();
    }
  }

  animateFrequencyBars() {
    if (!this.analyser || !this.isRecording) return;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const animate = () => {
      if (!this.isRecording || !this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      this.frequencyBars = Array(30)
        .fill(0)
        .map((_, index) => {
          const dataIndex = Math.floor((index / 30) * bufferLength);
          const value = dataArray[dataIndex] || 0;
          return Math.max(20, (value / 255) * 100);
        });
      this.cdr.detectChanges();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  stopRecording() {
    this.isRecording = false;
    this.cdr.detectChanges();
    if (this.recognition) this.recognition.stop();
    this.stopRecordingTimers();
    this.cleanupAudioResources();
    this.frequencyBars = [];
  }

  cancelRecording() {
    this.isRecording = false;
    this.cdr.detectChanges();
    if (this.recognition) this.recognition.stop();
    this.stopRecordingTimers();
    this.cleanupAudioResources();
    this.frequencyBars = [];
    this.userInput = this.initialInputText;
  }

  private stopRecordingTimers() {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private cleanupAudioResources() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  // ─── Message Actions ──────────────────────────────────────────────────────

  copyMessage(text: string) {
    navigator.clipboard.writeText(text);
  }

  likeMessage(message: any) {
    message.liked = !message.liked;
    if (message.liked) message.disliked = false;
  }

  dislikeMessage(message: any) {
    message.disliked = !message.disliked;
    if (message.disliked) message.liked = false;
  }
}