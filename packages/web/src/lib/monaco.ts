import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import './monaco.css';

/**
 * Monaco, served from Cherry itself (ADR-0048): the workers are bundled, and the loader uses
 * this copy instead of a CDN, so nothing leaves the machine.
 */
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};
loader.config({ monaco });

export { monaco };

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS colour as #rrggbb or #rrggbbaa, which is what Monaco's themes take. */
export function toHex(color: string): string {
  probe ??= document.createElement('canvas').getContext('2d');
  if (!probe) return '#000000';
  probe.fillStyle = '#000000';
  probe.fillStyle = color.trim();
  const v = String(probe.fillStyle);
  if (v.startsWith('#')) return v;
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (!m) return '#000000';
  const [r, g, b, a = '1'] = m[1]!.split(',').map((x) => x.trim());
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  const alpha = Number(a);
  return `#${hex(Number(r))}${hex(Number(g))}${hex(Number(b))}${alpha < 1 ? hex(alpha * 255) : ''}`;
}

/** The editor theme from the page's tokens, so every Cherry theme carries over. */
export function defineCherryTheme(mode: 'dark' | 'light'): string {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => toHex(css.getPropertyValue(name) || '#888888');
  const bare = (name: string) => v(name).slice(1, 7);
  const name = `cherry-${mode}`;
  monaco.editor.defineTheme(name, {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: bare('--t-code') },
      { token: 'keyword', foreground: bare('--edited') },
      { token: 'string', foreground: bare('--diff-add-text') },
      { token: 'number', foreground: bare('--ft-json') },
      { token: 'comment', foreground: bare('--t3'), fontStyle: 'italic' },
      { token: 'type', foreground: bare('--ft-ts') },
      { token: 'type.identifier', foreground: bare('--ft-ts') },
      { token: 'delimiter', foreground: bare('--t2') },
      { token: 'tag', foreground: bare('--accent-text') },
      { token: 'attribute.name', foreground: bare('--ft-ts') },
      { token: 'attribute.value', foreground: bare('--diff-add-text') },
      { token: 'regexp', foreground: bare('--ft-css') },
    ],
    colors: {
      'editor.background': v('--code-bg'),
      'editor.foreground': v('--t-code'),
      'editorLineNumber.foreground': v('--t-gutter'),
      'editorLineNumber.activeForeground': v('--t1'),
      'editor.lineHighlightBackground': v('--neutral-fill'),
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': v('--accent-fill'),
      'editor.inactiveSelectionBackground': v('--accent-fill-weak'),
      'editorCursor.foreground': v('--t1'),
      'editorWidget.background': v('--s-float'),
      'editorWidget.border': v('--bs'),
      'editorSuggestWidget.background': v('--s-float'),
      'editorSuggestWidget.selectedBackground': v('--s3'),
      'input.background': v('--s2'),
      'input.border': v('--bs'),
      'editorIndentGuide.background1': v('--b-faint'),
      'editorIndentGuide.activeBackground1': v('--b'),
      'editorGutter.addedBackground': v('--success'),
      'editorGutter.modifiedBackground': v('--accent'),
      'editorGutter.deletedBackground': v('--danger'),
      'diffEditor.insertedTextBackground': v('--diff-add-bg'),
      'diffEditor.removedTextBackground': v('--diff-del-bg'),
      'diffEditor.insertedLineBackground': v('--diff-add-bg'),
      'diffEditor.removedLineBackground': v('--diff-del-bg'),
      'scrollbarSlider.background': v('--scroll-thumb'),
      'scrollbarSlider.hoverBackground': v('--scroll-thumb-hover'),
      'editorOverviewRuler.border': '#00000000',
      focusBorder: '#00000000',
    },
  });
  return name;
}

/** Shiki's language names (the file API) to Monaco's. */
export function monacoLanguage(lang: string): string {
  const map: Record<string, string> = {
    tsx: 'typescript',
    jsx: 'javascript',
    shellscript: 'shell',
    text: 'plaintext',
    dockerfile: 'dockerfile',
  };
  return map[lang] ?? lang;
}
