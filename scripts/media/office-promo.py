#!/usr/bin/env python3
"""Cuts the landing page hero video from the V4 screenshots (office-capture.mts output).

Title cards in the site's style, then a short eased zoom into the part of each screenshot that
matters, joined with quick crossfades. Needs ffmpeg and /usr/bin/chromium.

    python3 scripts/media/office-promo.py <shots-dir> <out.mp4>
"""

import subprocess
import sys
import tempfile
from pathlib import Path

SHOTS = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2]).resolve()
REPO = Path(__file__).resolve().parents[2]
FPS = 30
FADE = 0.22
W, H = 1440, 900
TMP = Path(tempfile.mkdtemp())

CARD = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: Geist; src: url('{fonts}/geist.woff2'); font-weight: 100 900; }}
@font-face {{ font-family: GeistMono; src: url('{fonts}/geist-mono.woff2'); font-weight: 100 900; }}
html, body {{ margin: 0; width: 1440px; height: 900px; background: #000; color: #f4f4f5;
  font-family: Geist, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }}
body {{ display: flex; flex-direction: column; justify-content: center; padding: 0 140px;
  box-sizing: border-box; background:
  radial-gradient(70% 60% at 85% 10%, rgba(59,130,246,.16), transparent 60%), #000; }}
.k {{ font: 500 24px GeistMono, monospace; color: #93b9fa; margin: 0 0 28px; }}
h1 {{ margin: 0; font-size: {size}px; line-height: .98; letter-spacing: -.045em; font-weight: 600; }}
p {{ margin: 34px 0 0; font-size: 30px; color: #a1a1aa; max-width: 34ch; line-height: 1.4; }}
.brand {{ display: flex; align-items: center; gap: 22px; margin-bottom: 48px; }}
.brand img {{ width: 72px; height: 72px; border-radius: 16px; }}
.brand span {{ font: 600 54px Geist; letter-spacing: -.03em; }}
.brand i {{ display: inline-block; width: 30px; height: 7px; background: #3b82f6; margin-left: 4px; }}
</style></head><body>{body}</body></html>"""


def card(name, body, size=118):
    html = TMP / f'{name}.html'
    html.write_text(CARD.format(fonts=REPO / 'site/assets/fonts', body=body, size=size))
    png = TMP / f'{name}.png'
    subprocess.run(['/usr/bin/chromium', '--headless', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=2', f'--window-size={W},{H}',
                    f'--screenshot={png}', f'file://{html}'], check=True, capture_output=True)
    return png


BRAND = (f'<div class="brand"><img src="file://{REPO}/site/assets/cherry-badge.png">'
         '<span>cherry<i></i></span></div>')

# (image, seconds, zoom from, zoom to, focus x, focus y): focus is where the zoom goes, 0..1.
cards = {
    'c-open': card('c-open', BRAND + '<h1>A software team,<br>run by Claude Code.</h1>'),
    'c-stages': card('c-stages', '<p class="k">01 to 07</p><h1>Seven stages.</h1>'
                     '<p>Each one signed off before the next one opens.</p>'),
    'c-adr': card('c-adr', '<p class="k">Plan</p><h1>Every choice,<br>an ADR.</h1>'),
    'c-design': card('c-design', '<p class="k">Design</p><h1>Screens<br>before code.</h1>'),
    'c-crew': card('c-crew', '<p class="k">The crew</p><h1>Specialists<br>check the work.</h1>'
                   '<p>Accessibility, code review and security, before a stage is ready.</p>'),
    'c-build': card('c-build', '<p class="k">Development and Testing</p>'
                    '<h1>Prototype.<br>Build. Test.</h1>'),
    'c-biz': card('c-biz', '<p class="k">Client work</p><h1>Run it like<br>a business.</h1>'),
    'c-end': card('c-end', BRAND + '<h1>Claude Code,<br>with a plan.</h1>'
                  '<p>Free and open source. Runs on your machine.</p>', size=104),
}
S = lambda n: SHOTS / f'{n}.png'  # noqa: E731
SEQ = [
    (cards['c-open'], 1.7, 1.0, 1.05, 0.5, 0.5),
    (S('home'), 1.8, 1.05, 1.3, 0.3, 0.25),
    (cards['c-stages'], 1.2, 1.0, 1.04, 0.5, 0.5),
    (S('stages'), 2.2, 1.15, 1.55, 0.75, 0.3),
    (cards['c-adr'], 0.9, 1.0, 1.04, 0.5, 0.5),
    (S('plan'), 2.2, 1.35, 1.75, 0.15, 0.2),
    (cards['c-design'], 0.9, 1.0, 1.04, 0.5, 0.5),
    (S('room-design'), 2.0, 1.3, 1.7, 0.72, 0.35),
    (cards['c-crew'], 1.4, 1.0, 1.04, 0.5, 0.5),
    (S('crew-design'), 2.2, 1.9, 2.5, 1.0, 0.0),
    (cards['c-build'], 0.9, 1.0, 1.04, 0.5, 0.5),
    (S('room-dev-gate'), 1.7, 1.7, 2.1, 0.95, 0.0),
    (S('room-test'), 1.7, 1.5, 1.8, 1.0, 0.15),
    (cards['c-biz'], 0.9, 1.0, 1.04, 0.5, 0.5),
    (S('usage'), 1.6, 1.25, 1.5, 0.3, 0.3),
    (S('invoice'), 1.6, 1.4, 1.7, 0.9, 0.15),
    (S('live'), 1.6, 1.2, 1.45, 0.5, 0.1),
    (cards['c-end'], 2.4, 1.0, 1.05, 0.5, 0.5),
]

clips = []
for i, (img, sec, z0, z1, fx, fy) in enumerate(SEQ):
    n = round(sec * FPS)
    # Ease in and out (smoothstep) over the clip; the image is scaled up first so the pan is smooth.
    p = f'(on/{n - 1})'
    e = f'({p}*{p}*(3-2*{p}))'
    z = f'{z0}+({z1}-{z0})*{e}'
    vf = (f'scale=5760:3600,zoompan=z=\'{z}\':x=\'(iw-iw/zoom)*{fx}\':y=\'(ih-ih/zoom)*{fy}\''
          f':d={n}:s={W}x{H}:fps={FPS},format=yuv420p')
    clip = TMP / f'{i:02d}.mp4'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(img), '-vf', vf, '-frames:v',
                    str(n), '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', str(clip)], check=True)
    clips.append((clip, sec))

# Join with short crossfades.
inputs, graph, last, t = [], [], '[0:v]', clips[0][1]
for i, (clip, _) in enumerate(clips):
    inputs += ['-i', str(clip)]
for i in range(1, len(clips)):
    out = f'[v{i}]'
    graph.append(f'{last}[{i}:v]xfade=transition=fade:duration={FADE}:offset={t - FADE:.3f}{out}')
    last, t = out, t + clips[i][1] - FADE
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *inputs, '-filter_complex', ';'.join(graph),
                '-map', last, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt',
                'yuv420p', '-movflags', '+faststart', str(OUT)], check=True)
print(f'{OUT} ({t:.1f} s)')
