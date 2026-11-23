import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Store } from 'src/app/Store/store';
import { Router } from '@angular/router';

@Component({
  standalone: false,
  selector: 'app-ib-program',
  templateUrl: './ib-program.component.html',
  styleUrls: ['./ib-program.component.scss'],
})
export class IbProgramComponent {
  s3URL!: string;
  constructor(private store: Store, private router: Router, public translations: TranslateService) {
    this.s3URL = this.store.s3BaseUrl();
  }

  get usesNativeTranslation(): boolean {
    return this.translations.currentLang === 'en' || !!this.translations.translations[this.translations.currentLang]?.['COPY'];
  }

  get englishContent(): any { return this.translations.translations['en']?.['IB']; }

  openForm() {
    this.store.setContactUsData({
      subject: 'Want to Join the IB Program',
      message:
        'Hi, I’m interested in becoming an Introducing Broker. Please share the details and the application process.',
    });
    this.router.navigate(['/contact-us'], { fragment: 'contact-us' });
  }
}
