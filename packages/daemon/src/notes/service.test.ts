import { describe, expect, it } from 'vitest';
import { insertNote, noteSections } from './service.ts';

const notes = `# Notes

## Ideas

- Dark mode

## Links

- https://example.com
`;

describe('insertNote', () => {
  it('adds to the end of a matching section, without case', () => {
    const out = insertNote(notes, 'ideas', '- Hero video');
    expect(out).toBe(`# Notes

## Ideas

- Dark mode

- Hero video

## Links

- https://example.com
`);
  });

  it('adds a new section at the end when none fits', () => {
    expect(insertNote(notes, 'Meetings', '- Call on Monday')).toBe(
      `${notes}\n## Meetings\n\n- Call on Monday\n`,
    );
  });

  it('starts an empty file', () => {
    expect(insertNote('', '## Ideas', '- One')).toBe('## Ideas\n\n- One\n');
  });

  it('never changes existing text', () => {
    const out = insertNote(notes, 'Links', '- https://two.example');
    expect(out.startsWith(notes.trimEnd())).toBe(true);
    expect(noteSections(out)).toEqual(['Ideas', 'Links']);
  });
});
