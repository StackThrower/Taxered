// Writes sitemap.xml into the browser build output so static hosts (which never
// run the Express server) serve it too. Runs as the npm `postbuild` script.
import { writeFileSync } from 'node:fs';
import { buildSitemap } from '../dist/Taxered/server/server.mjs';

const file = new URL('../dist/Taxered/browser/sitemap.xml', import.meta.url);
writeFileSync(file, buildSitemap(new Date().toISOString()));
console.log(`Wrote ${file.pathname}`);
