import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ModelService {
  private selectedModelSubject = new BehaviorSubject<string>('Model 1');
  public selectedModel$: Observable<string> = this.selectedModelSubject.asObservable();

  constructor() { }

  setModel(model: string): void {
    this.selectedModelSubject.next(model);
  }

  getModel(): string {
    return this.selectedModelSubject.value;
  }
}