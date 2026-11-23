import { Component, Inject, Optional } from '@angular/core';
import { RESPONSE } from '../core/tokens/ssr-request.tokens';

@Component({
  standalone: false,
  selector: 'app-not-found',
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.scss']
})
export class NotFoundComponent {
  constructor(@Optional() @Inject(RESPONSE) response: { status(code: number): unknown } | null) {
    response?.status(404);
  }
}
