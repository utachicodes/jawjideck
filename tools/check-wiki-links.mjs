#!/usr/bin/env node
// Validates GitHub-wiki-style [[Page Name]] links in wiki/*.md.
//
// lychee (.github/workflows/links.yml) only understands standard Markdown
// links and bare URLs, so it silently ignores Gollum-style [[...]] links —
// this script covers that gap by resolving each reference to an actual
// wiki/<Page-Name>.md file (GitHub's wiki convention: spaces -> dashes).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WIKI_DIR = join(import.meta.dirname, '..', 'wiki');
const LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

function pageNameToFile(pageName) {
  // Support both [[Page Name]] and [[Display Text|Page Name]]
  const target = pageName.includes('|') ? pageName.split('|')[1].trim() : pageName.trim();
  return `${target.replace(/\s+/g, '-')}.md`;
}

function main() {
  const files = readdirSync(WIKI_DIR).filter((f) => f.endsWith('.md'));
  const errors = [];

  for (const file of files) {
    const content = readFileSync(join(WIKI_DIR, file), 'utf8');
    for (const match of content.matchAll(LINK_PATTERN)) {
      const raw = match[1];
      const targetFile = pageNameToFile(raw);
      if (!existsSync(join(WIKI_DIR, targetFile))) {
        errors.push(`${file}: [[${raw}]] -> wiki/${targetFile} does not exist`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Found ${errors.length} broken wiki link(s):\n`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  console.log(`Checked ${files.length} wiki pages — all [[links]] resolve.`);
}

main();
