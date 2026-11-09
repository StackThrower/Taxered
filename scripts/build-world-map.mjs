/**
 * Generates `src/app/widgets/tax-map/world-shapes.ts`: projected SVG paths of the countries on
 * the investment tax map, one merged background path for every other country, and view boxes
 * for the region views. Run with `npm run world-map` after changing the country list.
 *
 * Source: Natural Earth 1:50m via `world-atlas`. Natural Earth draws Crimea as part of
 * russia; it is moved back to Ukraine here.
 */
import { writeFileSync } from 'node:fs';
import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature, merge } from 'topojson-client';
import { presimplify, quantile, simplify, sphericalTriangleArea } from 'topojson-simplify';
import source from 'world-atlas/countries-50m.json' with { type: 'json' };

const OUT = new URL('../src/app/widgets/tax-map/world-shapes.ts', import.meta.url);
const WIDTH = 1000;
/** Points closer than this (in projected units) to the previous one are dropped. */
const MIN_STEP = 0.12;
/** Countries narrower than this get a dot so they can still be found and clicked. */
const MARKER_BELOW = 5;
/** Share of arc points kept by the topology-preserving simplification. */
const KEEP = Number(process.env.KEEP ?? 0.12);

/** ISO 3166 numeric → alpha-2 for the countries that have tax data. */
const CODES = {
  352: 'IS',
  578: 'NO',
  752: 'SE',
  246: 'FI',
  372: 'IE',
  826: 'GB',
  208: 'DK',
  233: 'EE',
  528: 'NL',
  276: 'DE',
  616: 'PL',
  428: 'LV',
  56: 'BE',
  442: 'LU',
  203: 'CZ',
  703: 'SK',
  440: 'LT',
  250: 'FR',
  756: 'CH',
  40: 'AT',
  348: 'HU',
  804: 'UA',
  724: 'ES',
  20: 'AD',
  492: 'MC',
  705: 'SI',
  191: 'HR',
  642: 'RO',
  268: 'GE',
  620: 'PT',
  380: 'IT',
  499: 'ME',
  688: 'RS',
  100: 'BG',
  470: 'MT',
  300: 'GR',
  196: 'CY',
  51: 'AM',
  398: 'KZ',
  156: 'CN',
  410: 'KR',
  392: 'JP',
  376: 'IL',
  48: 'BH',
  634: 'QA',
  356: 'IN',
  344: 'HK',
  682: 'SA',
  784: 'AE',
  764: 'TH',
  458: 'MY',
  702: 'SG',
  124: 'CA',
  840: 'US',
  484: 'MX',
  136: 'KY',
  44: 'BS',
  188: 'CR',
  591: 'PA',
  76: 'BR',
  600: 'PY',
  152: 'CL',
  858: 'UY',
};

/** [west, south, east, north] in degrees. */
const VIEWS = {
  world: [-180, -57, 180, 84],
  europe: [-25, 34, 46, 71.5],
  asia: [33, -4, 147, 56],
  americas: [-170, -57, -28, 72],
};

const ANTARCTICA = 10;

// Simplify arcs (shared borders stay shared), keeping every ring of tiny countries.
const pre = presimplify(source, sphericalTriangleArea);
const topology = simplify(pre, quantile(pre, KEEP));

// ── Crimea is Ukraine ──────────────────────────────────────────────────────
const geometries = topology.objects.countries.geometries;
const ukraine = geometries.find((g) => Number(g.id) === 804);
const russia = geometries.find((g) => Number(g.id) === 643);
const isCrimea = (arcs) => {
  const [lon, lat] = geoCentroid(feature(topology, { type: 'Polygon', arcs }));
  return lon > 32 && lon < 37 && lat > 44 && lat < 46.5;
};
const crimea = russia.arcs.filter(isCrimea);
if (crimea.length === 0) {
  throw new Error('Crimea polygon not found — check the source data.');
}
russia.arcs = russia.arcs.filter((arcs) => !isCrimea(arcs));
const ukraineGeometry = merge(topology, [
  { type: 'MultiPolygon', arcs: [...ukraine.arcs, ...crimea] },
]);

// ── Projection and compact path output ─────────────────────────────────────
const projection = geoNaturalEarth1().precision(0).fitWidth(WIDTH, { type: 'Sphere' });

function pathOf(geometry) {
  let d = '';
  let last = null;
  let start = null;
  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  const context = {
    moveTo(x, y) {
      d += `M${fmt(x)} ${fmt(y)}`;
      last = start = [x, y];
    },
    lineTo(x, y) {
      if (Math.hypot(x - last[0], y - last[1]) < MIN_STEP) return;
      d += `L${fmt(x)} ${fmt(y)}`;
      last = [x, y];
    },
    closePath() {
      d += 'Z';
      last = start;
    },
    arc() {},
  };
  geoPath(projection, context)(geometry);
  // Drop degenerate rings (a move followed straight by a close).
  return d.replace(/M[\d.\- ]+Z/g, '');
}

const shapes = [];
let background = '';
for (const geometry of geometries) {
  const id = Number(geometry.id);
  if (id === ANTARCTICA) continue;
  const geo =
    id === 804 ? { type: 'Feature', geometry: ukraineGeometry } : feature(topology, geometry);
  const code = CODES[id];
  const d = pathOf(geo);
  if (!code) {
    background += d;
    continue;
  }
  const [[x0], [x1]] = geoPath(projection).bounds(geo);
  const [cx, cy] = geoPath(projection).centroid(geo);
  // Small countries: the dot goes on the main body (largest polygon), not the overall centroid.
  shapes.push({
    code,
    d,
    marker: x1 - x0 < MARKER_BELOW ? [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10] : null,
  });
}

const missing = Object.values(CODES).filter((code) => !shapes.some((s) => s.code === code));
if (missing.length) {
  throw new Error(`No shapes for: ${missing.join(', ')}`);
}

function viewBox([west, south, east, north]) {
  const points = [];
  for (let i = 0; i <= 40; i++) {
    const lon = west + ((east - west) * i) / 40;
    const lat = south + ((north - south) * i) / 40;
    points.push([lon, south], [lon, north], [west, lat], [east, lat]);
  }
  const xy = points.map((p) => projection(p));
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  const [w, h] = [Math.max(...xs) - x, Math.max(...ys) - y];
  return [x, y, w, h].map((n) => Math.round(n * 10) / 10);
}

const views = Object.fromEntries(Object.entries(VIEWS).map(([k, box]) => [k, viewBox(box)]));

shapes.sort((a, b) => a.code.localeCompare(b.code));
const out = `// Generated by scripts/build-world-map.mjs from Natural Earth 1:50m (world-atlas). Do not edit.
// Crimea is drawn as part of Ukraine.
/* eslint-disable */

export interface CountryShape {
  code: string;
  d: string;
  /** Dot position for countries too small to click on the map. */
  marker: readonly [number, number] | null;
}

/** [x, y, width, height] in projected units. */
export type ViewBox = readonly [number, number, number, number];

export const MAP_VIEWS = ${JSON.stringify(views)} as const satisfies Record<string, ViewBox>;

export const BACKGROUND_PATH = ${JSON.stringify(background)};

export const COUNTRY_SHAPES: readonly CountryShape[] = [
${shapes.map((s) => `  { code: '${s.code}', marker: ${s.marker ? `[${s.marker.join(', ')}]` : 'null'}, d: ${JSON.stringify(s.d)} },`).join('\n')}
];
`;
writeFileSync(OUT, out);
console.log(
  `world-shapes.ts: ${(out.length / 1024).toFixed(0)} KB, ${shapes.length} countries, markers: ${shapes
    .filter((s) => s.marker)
    .map((s) => s.code)
    .join(' ')}`,
);
