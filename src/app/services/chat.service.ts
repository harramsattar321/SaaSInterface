import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  // Current selected model
  private selectedModelSubject = new BehaviorSubject<string>('model1');
  selectedModel$ = this.selectedModelSubject.asObservable();

  setSelectedModel(model: string) {
    this.selectedModelSubject.next(model);
  }

  getSelectedModel(): string {
    return this.selectedModelSubject.value;
  }
}