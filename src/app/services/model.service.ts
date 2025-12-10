import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ModelService {
  // BehaviorSubject to store and share the selected model
  private selectedModelSubject = new BehaviorSubject<string>('model1');
  
  // Observable that components can subscribe to
  public selectedModel$: Observable<string> = this.selectedModelSubject.asObservable();

  constructor() { }

  // Method to update the selected model
  setSelectedModel(model: string): void {
    this.selectedModelSubject.next(model);
  }

  // Method to get the current model value
  getCurrentModel(): string {
    return this.selectedModelSubject.value;
  }
}