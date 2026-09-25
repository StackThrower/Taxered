import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the header, main landmark and footer', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('header')?.textContent).toContain('Taxered');
    expect(element.querySelector('main#main')).toBeTruthy();
    expect(element.querySelector('footer')?.textContent).toContain('Політика конфіденційності');
  });
});
