import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTokensCss } from '../src/css';

const out = fileURLToPath(new URL('../tokens.css', import.meta.url));
writeFileSync(out, buildTokensCss());
console.log(`wrote ${out}`);
