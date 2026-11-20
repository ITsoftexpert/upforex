import { Component ,ViewEncapsulation} from '@angular/core';


type DocSlug =
  | 'addendum-monthly'
  | 'addendum-quarterly'
  | 'bonus-terms'
  | 'client-agreement'
  | 'complaint-policy'
  | 'general-terms'
  | 'key-facts'
  | 'leverage-schedule'
  | 'partnership-agreement'
  | 'confidentiality-policy';

// Sabhi V2 PDFs is folder me hain (S3: upforex-assets / Legal_Documents / V2 /)
const DOCS_BASE =
  'https://upforex-assets.s3.eu-north-1.amazonaws.com/Legal_Documents/V2/';

interface LegalDoc {
  slug: DocSlug;
  name: string;
  about: string;
  viewUrl: string;    
  downloadUrl?: string; 
}


@Component({
  selector: 'app-legel-document-pge',
  templateUrl: './legel-document-pge.component.html',
  styleUrls: ['./legel-document-pge.component.scss'],
  encapsulation: ViewEncapsulation.None   // <-- string nahi, enum use karna hai

})




export class LegelDocumentPgeComponent {
docs: LegalDoc[] = [
  {
    slug: 'addendum-monthly',
    name: 'Addendum Monthly Settlement',
    about: 'Addendum to the Partnership Agreement for net revenue share with monthly settlement.',
    viewUrl: DOCS_BASE + 'Addendum-Monthly-Settlement-V2.pdf',
    downloadUrl: DOCS_BASE + 'Addendum-Monthly-Settlement-V2.pdf'
  },
  {
    slug: 'addendum-quarterly',
    name: 'Addendum Quarterly Settlement',
    about: 'Addendum to the Partnership Agreement for net revenue share with quarterly settlement.',
    viewUrl: DOCS_BASE + 'Addendum-Quarterly-Settlement-V2.pdf',
    downloadUrl: DOCS_BASE + 'Addendum-Quarterly-Settlement-V2.pdf'
  },
  {
    slug: 'bonus-terms',
    name: 'Bonus Terms & Conditions',
    about: 'Detailed terms and conditions for claiming and using bonuses on UpForex.',
    viewUrl: DOCS_BASE + 'Bonus-Terms-and-Conditions-V2.pdf',
    downloadUrl: DOCS_BASE + 'Bonus-Terms-and-Conditions-V2.pdf'
  },
  {
    slug: 'client-agreement',
    name: 'Client Agreement',
    about: 'The official agreement outlining rights and obligations between clients and UpForex.',
    viewUrl: DOCS_BASE + 'Client-Agreement-V2.pdf',
    downloadUrl: DOCS_BASE + 'Client-Agreement-V2.pdf'
  },
  {
    slug: 'complaint-policy',
    name: 'Complaints Handling Policy',
    about: 'Procedures for submitting and resolving complaints with UpForex.',
    viewUrl: DOCS_BASE + 'Complaints-Handling-Policy-V2.pdf',
    downloadUrl: DOCS_BASE + 'Complaints-Handling-Policy-V2.pdf'
  },
  {
    slug: 'general-terms',
    name: 'General Terms & Conditions',
    about: 'The master terms governing your use of UpForex services.',
    viewUrl: DOCS_BASE + 'General-Terms-and-Conditions-V2.pdf',
    downloadUrl: DOCS_BASE + 'General-Terms-and-Conditions-V2.pdf'
  },
  {
    slug: 'key-facts',
    name: 'Key Facts Statement',
    about: 'Essential facts and disclosures all traders must review before trading.',
    viewUrl: DOCS_BASE + 'Key-Facts-Statement-V2.pdf',
    downloadUrl: DOCS_BASE + 'Key-Facts-Statement-V2.pdf'
  },
  {
    slug: 'leverage-schedule',
    name: 'Leverage Schedule & Margin Requirements',
    about: 'Leverage limits and margin requirements that apply to UpForex trading instruments.',
    viewUrl: DOCS_BASE + 'Leverage-Schedule-V2.pdf',
    downloadUrl: DOCS_BASE + 'Leverage-Schedule-V2.pdf'
  },
  {
    slug: 'partnership-agreement',
    name: 'Partnership Agreement',
    about: 'Agreement outlining partnership terms for introducing brokers and affiliates.',
    viewUrl: DOCS_BASE + 'Partnership-Agreement-V2.pdf',
    downloadUrl: DOCS_BASE + 'Partnership-Agreement-V2.pdf'
  },
  {
    slug: 'confidentiality-policy',
    name: 'Privacy & Confidentiality Policy',
    about: 'Our strict privacy and confidentiality measures to protect client information.',
    viewUrl: DOCS_BASE + 'Privacy-and-Confidentiality-Policy-V2.pdf',
    downloadUrl: DOCS_BASE + 'Privacy-and-Confidentiality-Policy-V2.pdf'
  }
];


  onView(doc: LegalDoc) {
    // console.log('view', doc.slug);
  }
onDownload(doc: LegalDoc) {
  const link = document.createElement('a');
  link.href = doc.downloadUrl || doc.viewUrl;
  link.download = doc.name.replace(/\s/g, '_') + '.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

  openLiveChat() {
    // @ts-ignore
    if (window?.$crisp) { /* example */ (window as any).$crisp.push(['do', 'chat:open']); return; }
    alert('Live chat coming soon.');
  }
}