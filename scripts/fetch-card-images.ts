// Download card images for the trainer's card pool into public/cards/.
// Images are Bandai's copyrighted art, fetched from the official site for local, personal use.
// They are gitignored on purpose: run this script after cloning.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { CARDS, TOKENS } from '../src/game/cards';

const OUT = 'public/cards';
mkdirSync(OUT, { recursive: true });
const ids = [...Object.keys(CARDS), ...Object.keys(TOKENS).filter(t => t.startsWith('T-'))];
let ok = 0, skipped = 0, failed: string[] = [];
for (const id of ids) {
  const path = `${OUT}/${id}.webp`;
  if (existsSync(path)) { skipped++; continue; }
  const url = `https://www.gundam-gcg.com/en/images/cards/card/${id}.webp`;
  try {
    const res = await fetch(url);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('image')) { failed.push(id); continue; }
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    ok++;
    await new Promise(r => setTimeout(r, 120)); // be polite
  } catch { failed.push(id); }
}
console.log(`downloaded ${ok}, already present ${skipped}, failed ${failed.length}${failed.length ? ': ' + failed.join(', ') : ''}`);
