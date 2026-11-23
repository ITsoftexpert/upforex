import { Pipe, PipeTransform } from '@angular/core';
import { NativeTranslationService } from '../services/native-translation.service';

@Pipe({
  standalone: false, name: 'localize', pure: false })
export class LocalizePipe implements PipeTransform {
  constructor(private translations: NativeTranslationService) {}

  transform(value: unknown, parameters?: unknown[], originalEnglish = false): string {
    if (originalEnglish) return this.translations.translateSource(value);
    return this.translations.translate(value, parameters);
  }
}
