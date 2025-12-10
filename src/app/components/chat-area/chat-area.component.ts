import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelService } from '../../services/model.service';
import { Subscription } from 'rxjs';

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

  // Selected Model from service
  selectedModel: string = 'model1';
  private modelSubscription?: Subscription;

  // Voice recording properties
  isRecording = false;
  recordingTime = '0:00';
  frequencyBars: number[] = [];
  private recordingInterval: any;
  private recordingStartTime: number = 0;
  private animationInterval: any;
  
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private mediaStream: MediaStream | null = null;

  constructor(private modelService: ModelService) {}

  ngOnInit() {
    // Subscribe to model changes
    this.modelSubscription = this.modelService.selectedModel$.subscribe(
      model => {
        this.selectedModel = model;
      }
    );
  }

  ngOnDestroy() {
    this.stopRecordingTimers();
    this.cleanupAudioResources();
    
    // Unsubscribe from model service
    if (this.modelSubscription) {
      this.modelSubscription.unsubscribe();
    }
  }

  // Get display name for model
  getModelDisplayName(): string {
    switch(this.selectedModel) {
      case 'model1': return 'Model 1';
      case 'model2': return 'Model 2';
      case 'model3': return 'Model 3';
      default: return 'Model 1';
    }
  }

  onFileSelect(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  removeFile() {
    this.selectedFile = null;
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  sendMessage() {
    if (this.userInput.trim() === '' && !this.selectedFile) return;

    const messageText = this.userInput.trim();
    
    const userMessage: Message = {
      id: this.messageIdCounter++,
      text: messageText || 'File attached',
      isUser: true,
      timestamp: new Date()
    };

    if (this.selectedFile) {
      userMessage.file = {
        name: this.selectedFile.name,
        size: this.selectedFile.size,
        type: this.selectedFile.type
      };
    }

    this.messages.push(userMessage);
    this.userInput = '';
    this.selectedFile = null;

    setTimeout(() => {
      const aiResponse: Message = {
        id: this.messageIdCounter++,
        text: this.generateResponse(messageText),
        isUser: false,
        timestamp: new Date()
      };
      this.messages.push(aiResponse);
    }, 800);
  }

  generateResponse(text: string): string {
    return text ? `You said: "${text}"` : 'I received your file!';
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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Your browser does not support audio recording');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      this.mediaStream = stream;
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.recordingTime = '0:00';
      this.audioChunks = [];
      
      const options: MediaRecorderOptions = {
        mimeType: 'audio/webm'
      };
      
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/mp4';
      }
      
      this.mediaRecorder = new MediaRecorder(stream, options);
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.start(100);
      
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
      }, 1000);

      this.animateFrequencyBars();
      
    } catch (error: any) {
      console.error('Error accessing microphone:', error);
      
      let errorMessage = 'Could not access microphone. ';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage += 'Please allow microphone access in your browser settings.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No microphone found on your device.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Microphone is already in use by another application.';
      } else {
        errorMessage += 'Error: ' + error.message;
      }
      
      alert(errorMessage);
      this.isRecording = false;
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
      
      this.animationFrameId = requestAnimationFrame(animate);
    };
    
    animate();
  }

  stopRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    
    this.stopRecordingTimers();
    this.mediaRecorder.stop();
    
    const finalTime = this.recordingTime;
    
    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { 
        type: this.mediaRecorder?.mimeType || 'audio/webm' 
      });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const voiceMessage: Message = {
        id: this.messageIdCounter++,
        text: `🎤 Voice message (${finalTime})`,
        isUser: true,
        timestamp: new Date(),
        audioUrl: audioUrl
      };
      this.messages.push(voiceMessage);

      setTimeout(() => {
        const aiResponse: Message = {
          id: this.messageIdCounter++,
          text: 'I received your voice message!',
          isUser: false,
          timestamp: new Date()
        };
        this.messages.push(aiResponse);
      }, 800);
      
      this.cleanupAudioResources();
    };
    
    this.isRecording = false;
    this.recordingTime = '0:00';
    this.frequencyBars = [];
    this.audioChunks = [];
  }

  cancelRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    this.stopRecordingTimers();
    this.cleanupAudioResources();
    
    this.isRecording = false;
    this.recordingTime = '0:00';
    this.frequencyBars = [];
    this.audioChunks = [];
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