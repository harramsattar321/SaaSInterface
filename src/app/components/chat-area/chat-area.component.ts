import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelService } from '../../services/model.service';
import { Subscription } from 'rxjs';
import { ChatService } from '../../services/chat.services';

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
}

@Component({
  selector: 'app-chat-area',
  templateUrl: './chat-area.component.html',
  styleUrls: ['./chat-area.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
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

  selectedModel: string = 'model1';
  private modelSubscription?: Subscription;

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

  // ADDED: ChangeDetectorRef to the constructor
  constructor(
    private modelService: ModelService, 
    private chatService: ChatService,
    private cdr: ChangeDetectorRef 
  ) {}

  ngOnInit() {
    this.modelSubscription = this.modelService.selectedModel$.subscribe(
      model => {
        this.selectedModel = model;
      }
    );
  }

  ngOnDestroy() {
    this.stopRecordingTimers();
    this.cleanupAudioResources();
    if (this.recognition) {
      this.recognition.stop();
    }
    if (this.modelSubscription) {
      this.modelSubscription.unsubscribe();
    }
  }

  sendMessage() {
    if (this.isRecording) {
      this.stopRecording();
    }

    if (this.userInput.trim() === '' && !this.selectedFile) return;
  
    const messageText = this.userInput.trim();
  
    const userMessage: Message = {
      id: this.messageIdCounter++,
      text: messageText || 'File attached',
      isUser: true,
      timestamp: new Date()
    };
  
    this.messages.push(userMessage);
    this.userInput = '';
  
    this.isLoading = true;

    this.chatService.sendMessage(messageText).subscribe({
      next: (res) => {
        this.isLoading = false;
        const aiResponse: Message = {
          id: this.messageIdCounter++,
          text: res.reply,
          isUser: false,
          timestamp: new Date()
        };
        this.messages.push(aiResponse);
      },
      error: (err) => {
        this.isLoading = false;
        const errMsg = err.status === 401
          ? 'Session expired. Please log in again.'
          : 'Something went wrong. Please try again.';
        this.messages.push({
          id: this.messageIdCounter++,
          text: errMsg,
          isUser: false,
          timestamp: new Date()
        });
      }
    });
  }

  startEdit(message: Message) { 
    this.isEditing = true;
    this.editingMessageId = message.id;
    this.editingText = message.text;
  }

  saveEdit() { 
    const index = this.messages.findIndex(m => m.id === this.editingMessageId);
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

  async toggleVoiceRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      
      this.mediaStream = stream;
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.recordingTime = '0:00';
      this.initialInputText = this.userInput; 
      
      // POKE ANGULAR: Wake up and show the visualizer/wiggle immediately!
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
          
        // POKE ANGULAR: Show the live typed text instantly!
        this.cdr.detectChanges(); 
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          this.cancelRecording();
        }
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
        
        // POKE ANGULAR: Update the timer every second!
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
      
      this.frequencyBars = Array(30).fill(0).map((_, index) => {
        const dataIndex = Math.floor((index / 30) * bufferLength);
        const value = dataArray[dataIndex] || 0;
        return Math.max(20, (value / 255) * 100);
      });
      
      // POKE ANGULAR: Make the spikes jump smoothly!
      this.cdr.detectChanges();
      
      this.animationFrameId = requestAnimationFrame(animate);
    };
    
    animate();
  }

  stopRecording() {
    this.isRecording = false;
    
    // POKE ANGULAR: Hide visualizer when stopping
    this.cdr.detectChanges();
    
    if (this.recognition) {
      this.recognition.stop();
    }

    this.stopRecordingTimers();
    this.cleanupAudioResources();
    this.frequencyBars = [];
  }

  cancelRecording() {
    this.isRecording = false;
    
    // POKE ANGULAR: Hide visualizer when cancelling
    this.cdr.detectChanges();

    if (this.recognition) {
      this.recognition.stop();
    }
    
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
      this.mediaStream.getTracks().forEach(track => track.stop());
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

  copyMessage(text: string) { 
    navigator.clipboard.writeText(text);
  }

  likeMessage(message: any) { 
    message.liked = !message.liked;
    if (message.liked) {
      message.disliked = false;
    }
  }
  
  dislikeMessage(message: any) { 
    message.disliked = !message.disliked;
    if (message.disliked) {
      message.liked = false;
    }
  }
}