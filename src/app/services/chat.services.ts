import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface ChatSession {
  chatId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatDetail extends ChatSession {
  patientId: string;
  messages: ChatMessage[];
}

export interface ReportAnalysis {
  report_type: string;
  summary: string;
  abnormal_values: { name: string; value: string; normal_range: string; status: 'HIGH' | 'LOW' }[];
  key_observations: string[];
  advice: string;
  disclaimer: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private nodeUrl = 'http://localhost:8000';
  private flaskUrl = 'http://localhost:5000';

  private activeChatIdSubject = new BehaviorSubject<string | null>(null);
  activeChatId$ = this.activeChatIdSubject.asObservable();

  private chatListSubject = new BehaviorSubject<ChatSession[]>([]);
  chatList$ = this.chatListSubject.asObservable();

  constructor(private http: HttpClient) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') ?? '';
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  private getAuthToken(): string {
    return localStorage.getItem('token') ?? '';
  }

  private getPatientName(): string {
    const raw = localStorage.getItem('currentUser');
    if (raw) {
      const user = JSON.parse(raw);
      return `${user.firstName} ${user.lastName}`.trim();
    }
    return 'Patient';
  }

  // ─── Chat List ────────────────────────────────────────────────────────────

  loadChatList(): Observable<{ success: boolean; chats: ChatSession[] }> {
    return this.http
      .get<{ success: boolean; chats: ChatSession[] }>(`${this.nodeUrl}/api/chats`, {
        headers: this.getHeaders(),
      })
      .pipe(
        tap((res) => {
          if (res.success) this.chatListSubject.next(res.chats);
        })
      );
  }

  // ─── Single Chat ──────────────────────────────────────────────────────────

  createNewChat(): Observable<{ success: boolean; chat: ChatDetail }> {
    return this.http
      .post<{ success: boolean; chat: ChatDetail }>(
        `${this.nodeUrl}/api/chats/new`,
        {},
        { headers: this.getHeaders() }
      )
      .pipe(
        tap((res) => {
          if (res.success) {
            const current = this.chatListSubject.getValue();
            const newEntry: ChatSession = {
              chatId: res.chat.chatId,
              title: res.chat.title,
              createdAt: res.chat.createdAt,
              updatedAt: res.chat.updatedAt,
            };
            this.chatListSubject.next([newEntry, ...current]);
            this.setActiveChat(res.chat.chatId);
          }
        })
      );
  }

  loadChat(chatId: string): Observable<{ success: boolean; chat: ChatDetail }> {
    return this.http.get<{ success: boolean; chat: ChatDetail }>(
      `${this.nodeUrl}/api/chats/${chatId}`,
      { headers: this.getHeaders() }
    );
  }

  saveMessage(
    chatId: string,
    role: 'user' | 'assistant',
    content: string
  ): Observable<{ success: boolean; title: string }> {
    return this.http
      .post<{ success: boolean; title: string }>(
        `${this.nodeUrl}/api/chats/${chatId}/message`,
        { role, content },
        { headers: this.getHeaders() }
      )
      .pipe(
        tap((res) => {
          if (res.success) {
            const current = this.chatListSubject.getValue();
            const updated = current.map((c) =>
              c.chatId === chatId ? { ...c, title: res.title, updatedAt: new Date() } : c
            );
            const idx = updated.findIndex((c) => c.chatId === chatId);
            if (idx > 0) {
              const [moved] = updated.splice(idx, 1);
              updated.unshift(moved);
            }
            this.chatListSubject.next(updated);
          }
        })
      );
  }

  renameChat(chatId: string, title: string): Observable<any> {
    return this.http
      .put(`${this.nodeUrl}/api/chats/${chatId}/rename`, { title }, { headers: this.getHeaders() })
      .pipe(
        tap(() => {
          const current = this.chatListSubject.getValue();
          this.chatListSubject.next(
            current.map((c) => (c.chatId === chatId ? { ...c, title } : c))
          );
        })
      );
  }

  deleteChat(chatId: string): Observable<any> {
    return this.http
      .delete(`${this.nodeUrl}/api/chats/${chatId}`, { headers: this.getHeaders() })
      .pipe(
        tap(() => {
          const current = this.chatListSubject.getValue();
          const remaining = current.filter((c) => c.chatId !== chatId);
          this.chatListSubject.next(remaining);
          if (this.activeChatIdSubject.getValue() === chatId) {
            this.setActiveChat(remaining.length ? remaining[0].chatId : null);
          }
        })
      );
  }

  // ─── Active Chat State ────────────────────────────────────────────────────

  setActiveChat(chatId: string | null) {
    this.activeChatIdSubject.next(chatId);
  }

  getActiveChatId(): string | null {
    return this.activeChatIdSubject.getValue();
  }

  // ─── Flask AI ─────────────────────────────────────────────────────────────

  sendMessage(message: string): Observable<{ reply: string; state: string }> {
    return this.http.post<{ reply: string; state: string }>(
      `${this.flaskUrl}/chat`,
      { message, patientName: this.getPatientName() },
      { headers: this.getHeaders() }
    );
  }

  resetSession(): Observable<any> {
    return this.http.post(
      `${this.flaskUrl}/chat/reset`,
      { patientName: this.getPatientName() },
      { headers: this.getHeaders() }
    );
  }

  // ─── Report Analyzer ──────────────────────────────────────────────────────

  /** Upload a medical report PDF and get back a structured analysis */
  analyzeReport(file: File): Observable<{ patient: string; analysis: ReportAnalysis }> {
    const formData = new FormData();
    formData.append('file', file);

    // NOTE: Do NOT set Content-Type header manually — browser sets it
    // automatically with the correct multipart boundary for FormData
    return this.http.post<{ patient: string; analysis: ReportAnalysis }>(
      `${this.flaskUrl}/analyze-report`,
      formData,
      {
        headers: new HttpHeaders({
          Authorization: `Bearer ${this.getAuthToken()}`,
        }),
      }
    );
  }
}