import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SwipeDirective } from './directives/swipe.directive';
import { ConfettiComponent } from './confetti/confetti.component';
import { DataTableComponent } from './data-table/data-table.component';
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { NgIconsModule } from '@ng-icons/core';
import { matDelete, matEdit } from '@ng-icons/material-icons/baseline';
import { matRemoveRedEyeOutline } from '@ng-icons/material-icons/outline';
import { ReactiveFormsModule } from '@angular/forms';
import { SanitizeHtmlPipe } from './pipe/sanitize-html.pipe';
import { HybridTranslatePipe } from '../core/pipes/hybrid-translate.pipe';
import { LocalizePipe } from '../core/pipes/localize.pipe';
import { NativeCarouselLabelsDirective } from './directives/native-carousel-labels.directive';
import { DeferredVideoDirective } from './directives/deferred-video.directive';

@NgModule({
  declarations: [
    SwipeDirective,
    ConfettiComponent,
    DataTableComponent,
    SanitizeHtmlPipe,
    HybridTranslatePipe,
    LocalizePipe,
    NativeCarouselLabelsDirective,
    DeferredVideoDirective,
  ],
  imports: [
    CommonModule,
    NgbPaginationModule,
    NgIconsModule.withIcons({
      matEdit,
      matDelete,
      matRemoveRedEyeOutline,
    }),
    ReactiveFormsModule,
  ],
  exports: [
    SwipeDirective,
    ConfettiComponent,
    DataTableComponent,
    SanitizeHtmlPipe,
    HybridTranslatePipe,
    LocalizePipe,
    NativeCarouselLabelsDirective,
    DeferredVideoDirective,
  ],
})
export class CommonModules {}
