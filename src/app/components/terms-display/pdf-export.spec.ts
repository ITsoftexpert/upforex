import jsPDF from 'jspdf';
import { ActivatedRoute } from '@angular/router';
import { TermsData, TermsService } from '../../core/services/terms.service';
import { TermsDisplayComponent } from './terms-display.component';

describe('Terms PDF export with the patched jsPDF library', () => {
  it('loads the PDF libraries on demand and preserves the actual download action', async () => {
    const element = document.createElement('div');
    element.className = 'terms-content';
    element.style.cssText = 'width:100px;height:400px;background:white;color:black;';
    element.textContent = 'Terms and conditions';
    document.body.appendChild(element);
    const component = new TermsDisplayComponent({} as ActivatedRoute, {} as TermsService);
    component.terms = { version: 'security-test' } as TermsData;
    let savedFilename = '';
    let pdfBlob: Blob | undefined;
    spyOn(URL, 'createObjectURL').and.callFake((blob: Blob | MediaSource) => {
      if (blob instanceof Blob && blob.type === 'application/pdf') pdfBlob = blob;
      return 'blob:upforex-security-pdf-test';
    });
    const dispatch = HTMLAnchorElement.prototype.dispatchEvent;
    spyOn(HTMLAnchorElement.prototype, 'dispatchEvent').and.callFake(function(this: HTMLAnchorElement, event: Event) {
      if (this.download.startsWith('terms-and-conditions-')) {
        savedFilename = this.download;
        return true; // Capture the browser save action without downloading a file.
      }
      return dispatch.call(this, event);
    });
    const fallback = spyOn(component as any, 'downloadAsHTML').and.stub();
    try {
      component.downloadTerms();
      expect(component.downloadingPdf).toBeTrue();
      const deadline = Date.now() + 10000;
      while ((component.downloadingPdf || !savedFilename) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(component.downloadingPdf).toBeFalse();
      expect(savedFilename).toBe('terms-and-conditions-security-test.pdf');
      expect(pdfBlob).toBeDefined();
      const pdfText = await pdfBlob!.text();
      expect(pdfText.startsWith('%PDF-')).toBeTrue();
      const pageCount = /\/Count (\d+)/.exec(pdfText);
      expect(Number(pageCount?.[1])).toBeGreaterThan(1);
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      element.remove();
    }
  });

  it('exports browser canvas images into a multi-page PDF', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 60;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    context.fillText('Terms', 2, 20);
    const image = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(image, 'PNG', 10, 10, 190, 285);
    pdf.addPage();
    pdf.addImage(image, 'PNG', 10, -20, 190, 285);
    expect(pdf.getNumberOfPages()).toBe(2);
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
