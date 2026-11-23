import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Store } from 'src/app/Store/store';

import { IbProgramComponent } from './ib-program.component';
import { CommonModules } from 'src/app/common/common.module';
import { contentKey } from 'src/app/core/config/content-keys';
import { NATIVE_I18N_VERSION } from 'src/app/core/config/i18n-coverage';

describe('IbProgramComponent', () => {
  let component: IbProgramComponent;
  let fixture: ComponentFixture<IbProgramComponent>;
  let translations: TranslateService;
  let catalogs: Record<string, any>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    router = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      imports: [CommonModule, CommonModules, TranslateModule.forRoot()],
      declarations: [IbProgramComponent],
      providers: [
        { provide: Router, useValue: router },
        { provide: Store, useValue: jasmine.createSpyObj('Store', {
          s3BaseUrl: '', setContactUsData: undefined,
        }) },
      ],
    });
    translations = TestBed.inject(TranslateService);
    catalogs = {};
    // Fetch the real JSON assets served by Karma, rather than duplicating the
    // component's translations in the test.
    for (const language of ['en', 'hi']) {
      catalogs[language] = await fetch(`/assets/i18n/${language}.json`).then(response => response.json());
      const chunk = await fetch(`/assets/i18n/native/${NATIVE_I18N_VERSION}/${language}/${contentKey('/partnerships/ib-programs')}.json`).then(response => response.json());
      translations.setTranslation(language, { ...catalogs[language], ...chunk });
    }
    translations.setDefaultLang('en');
    await firstValueFrom(translations.use('en'));
    fixture = TestBed.createComponent(IbProgramComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the complete Hindi body from local catalogs without Google Translate', async () => {
    await firstValueFrom(translations.use('hi'));
    fixture.detectChanges();
    const content: HTMLElement = fixture.nativeElement;
    const hindi = catalogs['hi'].IB;
    expect(content.querySelector('h1')!.textContent!.trim()).toBe(hindi.TITLE);
    expect(content.querySelectorAll('h5').length).toBe(19);
    for (const item of [...hindi.BENEFITS, ...hindi.STEPS, ...hindi.REASONS]) {
      expect(content.textContent).toContain(item.boldText);
      expect(content.textContent).toContain(item.subText);
    }
    expect(content.querySelector('[translate="no"]')).not.toBeNull();
    expect(content.textContent).not.toContain('IB.TITLE');
  });

  it('preserves the English page and both contact actions', () => {
    const content: HTMLElement = fixture.nativeElement;
    expect(content.querySelector('h1')!.textContent!.trim()).toBe(catalogs['en'].IB.TITLE);
    content.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.click());
    expect(router.navigate).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenCalledWith(['/contact-us'], { fragment: 'contact-us' });
  });

  it('keeps the existing auto-translation fallback available for other languages', async () => {
    translations.setTranslation('ar', {});
    await firstValueFrom(translations.use('ar'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[translate="no"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('h1').textContent.trim()).toBe(catalogs['en'].IB.TITLE);
  });
});
