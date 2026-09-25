import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { IconNode } from 'lucide';

/**
 * Renders a Lucide icon inline. Icons are decorative (`aria-hidden`); give the
 * surrounding control an accessible name instead.
 *
 * Usage: `<svg [appIcon]="FileText" class="size-4"></svg>`
 */
@Component({
  selector: 'svg[appIcon]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'shrink-0',
  },
  template: `
    @for (node of appIcon(); track $index) {
      @let a = node[1];
      @switch (node[0]) {
        @case ('path') {
          <svg:path [attr.d]="a['d']"></svg:path>
        }
        @case ('circle') {
          <svg:circle [attr.cx]="a['cx']" [attr.cy]="a['cy']" [attr.r]="a['r']"></svg:circle>
        }
        @case ('ellipse') {
          <svg:ellipse
            [attr.cx]="a['cx']"
            [attr.cy]="a['cy']"
            [attr.rx]="a['rx']"
            [attr.ry]="a['ry']"
          ></svg:ellipse>
        }
        @case ('rect') {
          <svg:rect
            [attr.x]="a['x']"
            [attr.y]="a['y']"
            [attr.width]="a['width']"
            [attr.height]="a['height']"
            [attr.rx]="a['rx']"
            [attr.ry]="a['ry']"
          ></svg:rect>
        }
        @case ('line') {
          <svg:line
            [attr.x1]="a['x1']"
            [attr.y1]="a['y1']"
            [attr.x2]="a['x2']"
            [attr.y2]="a['y2']"
          ></svg:line>
        }
        @case ('polyline') {
          <svg:polyline [attr.points]="a['points']"></svg:polyline>
        }
        @case ('polygon') {
          <svg:polygon [attr.points]="a['points']"></svg:polygon>
        }
      }
    }
  `,
})
export class Icon {
  readonly appIcon = input.required<IconNode>();
}
