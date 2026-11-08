import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown.tsx';

const html = (source: string) =>
  render(
    <MemoryRouter>
      <Markdown source={source} />
    </MemoryRouter>,
  ).container.innerHTML;

// Finding #11: a brief's header lines stay on their own lines.
describe('Markdown field lines', () => {
  it('keeps the lines of a paragraph made of fields', () => {
    const out = html('**Client:** IUB\n**Site name:** Web course\nVersion: 1.0\n\nText.');
    expect(out.match(/<br>/g)).toHaveLength(2);
  });

  it('leaves normal soft breaks alone', () => {
    expect(html('A sentence that\nwraps on two lines.')).not.toContain('<br>');
  });
});
