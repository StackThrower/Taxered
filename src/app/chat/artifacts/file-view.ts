import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Download, FileCode, FileSpreadsheet, FileText } from 'lucide';
import { Icon } from '../../shared/icon';
import type { FileArtifact } from '../protocol';

/** A generated file to download. */
@Component({
  selector: 'app-file-view',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      class="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
      [href]="artifact().url"
      [attr.download]="artifact().name"
    >
      <svg [appIcon]="icon()" class="size-8 text-primary"></svg>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium">{{ artifact().name }}</span>
        <span class="block text-xs text-muted-foreground">
          {{ artifact().description }} · {{ size() }}
        </span>
      </span>
      <svg [appIcon]="icons.Download" class="size-4 text-muted-foreground"></svg>
      <span class="sr-only">Завантажити</span>
    </a>
  `,
})
export class FileView {
  readonly artifact = input.required<FileArtifact>();
  protected readonly icons = { Download };

  protected readonly icon = computed(() => {
    const mime = this.artifact().mime;
    return mime.includes('spreadsheet') || mime.includes('csv')
      ? FileSpreadsheet
      : mime.includes('xml')
        ? FileCode
        : FileText;
  });
  protected readonly size = computed(() => {
    const bytes = this.artifact().size;
    return bytes < 1024 ? `${bytes} Б` : `${Math.ceil(bytes / 1024)} КБ`;
  });
}
