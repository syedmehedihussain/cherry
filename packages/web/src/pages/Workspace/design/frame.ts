/**
 * What the canvas adds to each screen's HTML (V3 r7). The frame is sandboxed without
 * same-origin, so this script can only talk to Cherry through postMessage: it sets the light
 * or dark theme, and in comment mode it outlines the element under the pointer and sends the
 * clicked element's CSS selector.
 */
export type PickMessage = {
  type: 'cherry:pick';
  selector: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

const SCRIPT = `
(function () {
  var comment = false;
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #5b8def;border-radius:3px;background:rgba(91,141,239,.08);display:none';
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(box); });
  function esc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s; }
  function selector(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement && parts.length < 4) {
      if (el.id) { parts.unshift('#' + esc(el.id)); break; }
      var p = el.tagName.toLowerCase();
      var cls = Array.prototype.slice.call(el.classList, 0, 2);
      if (cls.length) p += '.' + cls.map(esc).join('.');
      else if (el.parentElement) {
        var same = Array.prototype.filter.call(el.parentElement.children, function (c) { return c.tagName === el.tagName; });
        if (same.length > 1) p += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
      }
      parts.unshift(p);
      el = el.parentElement;
    }
    return parts.join(' > ') || 'body';
  }
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'cherry:mode') { comment = !!d.comment; box.style.display = 'none'; document.documentElement.style.cursor = comment ? 'crosshair' : ''; }
  });
  document.addEventListener('mouseover', function (e) {
    if (!comment || !e.target.getBoundingClientRect) return;
    var r = e.target.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (a) e.preventDefault();
    if (!comment) return;
    e.preventDefault(); e.stopPropagation();
    var r = e.target.getBoundingClientRect();
    parent.postMessage({ type: 'cherry:pick', selector: selector(e.target), text: (e.target.textContent || '').trim().slice(0, 80), x: r.left, y: r.top, w: r.width, h: r.height }, '*');
  }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);
})();
`;

/** The screen's HTML with the theme set on <html> and the canvas script added. */
export function frameDoc(html: string, theme: 'light' | 'dark'): string {
  const head = `<script>document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});document.documentElement.style.colorScheme = ${JSON.stringify(theme)};${SCRIPT}</script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${head}`);
  if (/<html[^>]*>/i.test(html))
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
}

export const SIZES = { phone: { w: 375, h: 812 }, desktop: { w: 1280, h: 800 } } as const;
export type Device = keyof typeof SIZES;

/** The zoom that fits `count` artboards of `size` in a box, with a gap and a margin. */
export function fitZoom(
  count: number,
  size: { w: number; h: number },
  box: { w: number; h: number },
  gap = 48,
  margin = 64,
): number {
  if (count === 0 || box.w <= 0 || box.h <= 0) return 1;
  const w = count * size.w + (count - 1) * gap;
  const h = size.h + 28;
  const z = Math.min((box.w - margin * 2) / w, (box.h - margin * 2) / h, 1);
  return Math.max(0.1, Math.round(z * 100) / 100);
}
