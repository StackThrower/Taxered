import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AlertCircle, FileText, LoaderCircle } from 'lucide';
import { marked } from 'marked';
import { Icon } from '../shared/icon';
import { ArtifactView } from './artifacts/artifact-view';
import type { ChatMessage } from './chat.service';
import { AGENT_LABELS } from './protocol';

/**
 * One message. The assistant's Markdown is rendered with `marked` and bound through
 * `[innerHTML]`, so Angular's sanitizer strips anything executable the model might write.
 */
@Component({
  selector: 'app-chat-message',
  imports: [ArtifactView, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let m = message();
    @if (m.role === 'user') {
      <div class="flex justify-end">
        <div
          class="max-w-[85%] space-y-2 rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground"
        >
          <h2 class="sr-only">Ваше повідомлення</h2>
          @if (m.text) {
            <p class="break-words whitespace-pre-wrap">{{ m.text }}</p>
          }
          @if (m.files.length > 0) {
            <ul class="flex flex-wrap gap-1.5" aria-label="Прикріплені файли">
              @for (file of m.files; track file.id) {
                <li
                  class="inline-flex items-center gap-1 rounded-md bg-primary-foreground/15 px-2 py-1 text-xs"
                >
                  <svg [appIcon]="icons.FileText" class="size-3.5"></svg>{{ file.name }}
                </li>
              }
            </ul>
          }
        </div>
      </div>
    } @else {
      <div class="space-y-4">
        <h2 class="sr-only">Відповідь Taxered</h2>
        @if (html()) {
          <div class="chat-markdown" [innerHTML]="html()"></div>
        }
        @if (m.status; as status) {
          <p class="flex items-center gap-2 text-sm text-muted-foreground">
            <svg
              [appIcon]="icons.LoaderCircle"
              class="size-4 animate-spin motion-reduce:animate-none"
            ></svg>
            @if (status.agent) {
              <span class="badge">{{ agentLabels[status.agent] }}</span>
            }
            {{ status.text }}
          </p>
        }
        @if (m.error) {
          <div class="alert border-destructive/50 text-destructive" role="alert">
            <svg [appIcon]="icons.AlertCircle" class="size-4"></svg>
            <p>{{ m.error }}</p>
          </div>
        }
        @for (artifact of m.artifacts; track artifact.id) {
          <app-artifact-view [artifact]="artifact" />
        }
      </div>
    }
  `,
})
export class ChatMessageView {
  readonly message = input.required<ChatMessage>();

  protected readonly icons = { AlertCircle, FileText, LoaderCircle };
  protected readonly agentLabels = AGENT_LABELS;

  protected readonly html = computed(() => {
    const text = this.message().text;
    return text ? (marked.parse(text, { async: false, gfm: true, breaks: true }) as string) : '';
  });
}
