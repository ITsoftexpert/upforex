import { Component } from '@angular/core';
import { privacyPolicyData } from './constant';

@Component({
  standalone: false,
  selector: 'app-privacy-policy',
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.scss'],
})
export class PrivacyPolicyComponent {
  privacyPolicyData = privacyPolicyData;
}
