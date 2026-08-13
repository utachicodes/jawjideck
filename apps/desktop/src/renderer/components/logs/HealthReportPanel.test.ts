import { describe, it, expect } from 'vitest';
import { extractInsightCards } from './log-ai-tools';

const CARDS = [{ id: 'a', name: 'A', status: 'warn', summary: 's', details: 'd', recommendation: 'r' }];

describe('extractInsightCards', () => {
  it('parses a plain JSON array', () => {
    expect(extractInsightCards(JSON.stringify(CARDS))).toEqual(CARDS);
  });

  it('parses JSON wrapped in markdown code fences', () => {
    expect(extractInsightCards(`Here you go:\n\n\`\`\`json\n${JSON.stringify(CARDS)}\n\`\`\``)).toEqual(CARDS);
  });

  it('parses uppercase JSON fence variants', () => {
    expect(extractInsightCards(`\`\`\`JSON\n${JSON.stringify(CARDS)}\n\`\`\``)).toEqual(CARDS);
  });

  it('extracts the array when prose surrounds the JSON', () => {
    expect(extractInsightCards(`Analysis complete. ${JSON.stringify(CARDS)} Let me know if you need more.`)).toEqual(CARDS);
  });

  it('tolerates a trailing comma', () => {
    expect(extractInsightCards('[{"id":"a","name":"A","status":"warn","summary":"s","details":"d"},]')).toEqual([
      { id: 'a', name: 'A', status: 'warn', summary: 's', details: 'd' },
    ]);
  });

  it('returns null for a JSON object (not an array)', () => {
    expect(extractInsightCards('{"status":"ok"}')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(extractInsightCards('The model refused to comply.')).toBeNull();
    expect(extractInsightCards('')).toBeNull();
  });
});
