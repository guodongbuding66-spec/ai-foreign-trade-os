import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/ecosystem-nav.css'), 'utf8');

const expected = [
  'https://container-load-planner.pages.dev/',
  'https://isunor-industry-daily.pages.dev/',
  'https://github.com/guodongbuding66-spec/galaxy-downloader',
];

for (const href of expected) {
  if (!html.includes(href)) throw new Error(`Missing ecosystem link: ${href}`);
}
if (!html.includes('class="ecosystem-menu"')) throw new Error('Missing ecosystem menu trigger');
if (!html.includes('/assets/ecosystem-nav.css')) throw new Error('Missing ecosystem stylesheet');
if (!css.includes('.ecosystem-popover')) throw new Error('Missing ecosystem popover styles');
console.log('Galaxy ecosystem navigation contract passed');
