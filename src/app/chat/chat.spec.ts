import {
  DeferBlockState,
  TestBed,
  type ComponentFixture,
  type DeferBlockFixture,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { analyzeLedger, parseLedgerCsv } from '../lib/ledger-csv';
import { LEDGER_CSV } from '../../agent/testing/fixtures';
import { ArtifactView } from './artifacts/artifact-view';
import { ChatPage } from './chat-page';
import { ChatService, applyEvent, readEvents, type ChatMessage } from './chat.service';
import type { ChatArtifact, ChatStreamEvent } from './protocol';

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of readEvents(body)) {
    events.push(event);
  }
  return events;
}

const sse = (event: ChatStreamEvent) => `data: ${JSON.stringify(event)}\n\n`;

const operations = parseLedgerCsv(LEDGER_CSV);
const ledgerAnalysis = analyzeLedger(operations);

const ARTIFACTS: ChatArtifact[] = [
  {
    kind: 'f1',
    id: 'f1-1',
    year: '2025',
    options: {},
    positions: [
      {
        id: 'p1',
        assetType: 'stocks',
        currency: 'UAH',
        purchaseDate: '2025-01-10',
        saleDate: '2025-06-20',
        purchasePriceForeign: '',
        salePriceForeign: '',
        purchaseRate: '1',
        saleRate: '1',
        purchasePrice: '50000',
        salePrice: '80000',
        expenses: '',
      },
    ],
  },
  {
    kind: 'returns',
    id: 'r-1',
    currency: 'USD',
    initialCapital: 10000,
    includeTaxes: true,
    taxesPaidSeparately: false,
    usdRates: { 2024: 42, 2025: 41.5 },
    years: [{ year: 2025, files: [], deposits: 0, inflation: 3, accountGainUsd: 1000 }],
  },
  {
    kind: 'tax-map',
    id: 't-1',
    metric: 'dividends',
    view: 'europe',
    selected: 'UA',
    highlight: ['UA', 'PL'],
  },
  {
    kind: 'spreads',
    id: 's-1',
    fileName: 'ledger.csv',
    includeLinked: true,
    analysis: ledgerAnalysis,
  },
  {
    kind: 'chart',
    id: 'c-1',
    title: 'Після податку',
    chart: 'bar',
    categories: ['Україна', 'Польща'],
    series: [{ label: 'Після податку', values: [860, 810] }],
    unit: 'money',
    currency: 'USD',
  },
  {
    kind: 'file',
    id: 'o-1',
    name: 'F0121215.pdf',
    mime: 'application/pdf',
    size: 2048,
    url: '/api/chat/threads/x/outputs/o-1',
    description: 'Розрахунок Ф1 (PDF)',
  },
];

/** Renders the component's @defer blocks, including the ones nested in them. */
async function renderDeferred(fixture: ComponentFixture<unknown>): Promise<void> {
  const render = async (blocks: DeferBlockFixture[]) => {
    for (const block of blocks) {
      await block.render(DeferBlockState.Complete);
      await render(await block.getDeferBlocks());
    }
  };
  fixture.detectChanges();
  await render(await fixture.getDeferBlocks());
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('chat stream', () => {
  it('reads server-sent events split across chunks', async () => {
    const all =
      sse({ type: 'status', agent: 'f1', text: 'Розраховую Ф1…' }) +
      sse({ type: 'token', text: 'Привіт' }) +
      sse({ type: 'done' });
    const events = await collect(stream([all.slice(0, 17), all.slice(17, 60), all.slice(60)]));
    expect(events.map((e) => e.type)).toEqual(['status', 'token', 'done']);
  });

  it('applies events to the answer', () => {
    let m: ChatMessage = {
      id: 1,
      role: 'assistant',
      text: '',
      files: [],
      artifacts: [],
      status: { agent: null, text: 'Думаю…' },
      error: null,
      pending: true,
    };
    const events: ChatStreamEvent[] = [
      { type: 'status', agent: 'tax_map', text: 'Будую карту…' },
      { type: 'artifact', artifact: ARTIFACTS[2] },
      { type: 'token', text: 'Ось ' },
      { type: 'token', text: 'карта.' },
    ];
    for (const event of events) {
      m = { ...m, ...applyEvent(m, event) };
    }
    expect(m).toMatchObject({ text: 'Ось карта.', status: null, artifacts: [ARTIFACTS[2]] });
  });
});

describe('chat UI', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('fetch', async () => new Response('{}'));
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal(
      'WebSocket',
      class {
        close() {}
      },
    );
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders every kind of artifact', async () => {
    for (const artifact of ARTIFACTS) {
      const fixture = TestBed.createComponent(ArtifactView);
      fixture.componentRef.setInput('artifact', artifact);
      await renderDeferred(fixture);
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text, artifact.kind).not.toMatch(/Завантаження/);
      expect(text.length, artifact.kind).toBeGreaterThan(10);
    }
  });

  it('shows the Ф1 totals and opens one editable form at a time', async () => {
    const fixture = TestBed.createComponent(ArtifactView);
    fixture.componentRef.setInput('artifact', ARTIFACTS[0]);
    await renderDeferred(fixture);
    const element = fixture.nativeElement as HTMLElement;
    // 30 000 profit: 18% PDFO and 5% military levy (2025). Amounts use non-breaking spaces.
    const digits = (element.textContent ?? '').replace(/[\s\u00a0\u202f]/g, '');
    expect(digits).toContain('5400,00');
    expect(digits).toContain('1500,00');

    const toggle = [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('редагованій формі'),
    )!;
    toggle.click();
    await renderDeferred(fixture);
    expect(TestBed.inject(ChatService).editingF1()).toBe('f1-1');
    expect(element.querySelector('app-form-f0121214')).toBeTruthy();
  });

  it('renders the user message and the assistant Markdown safely', async () => {
    const chat = TestBed.inject(ChatService);
    chat.messages.set([
      {
        id: 1,
        role: 'user',
        text: 'Порахуй Ф1',
        files: [{ id: 'f_1', name: 'ib.xml', size: 10, kind: 'ib_xml' }],
        artifacts: [],
        status: null,
        error: null,
        pending: false,
      },
      {
        id: 2,
        role: 'assistant',
        text: '**Податок:** 5 400 грн <img src=x onerror="alert(1)">',
        files: [],
        artifacts: [],
        status: null,
        error: null,
        pending: false,
      },
    ]);
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('ib.xml');
    expect(element.querySelector('.chat-markdown strong')?.textContent).toBe('Податок:');
    expect(element.querySelector('.chat-markdown img')?.getAttribute('onerror')).toBeFalsy();
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Відповідь готова');
  });

  it('sends from the Send button without a native form submission', async () => {
    const chat = TestBed.inject(ChatService);
    const send = vi.spyOn(chat, 'send').mockResolvedValue();
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const textarea = element.querySelector('textarea')!;
    textarea.value = 'Порахуй Ф1';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const event = new SubmitEvent('submit', { cancelable: true, bubbles: true });
    element.querySelector('form')!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledWith('Порахуй Ф1');
  });
});
