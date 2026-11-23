import { Component } from '@angular/core';
import { columns, data } from './constant';

@Component({
  standalone: false,
  selector: 'app-account-types',
  templateUrl: './account-types.component.html',
  styleUrls: ['./account-types.component.scss'],
})
export class AccountTypesComponent {
  columns = columns;
  data: any = data;
}
