# Media

## V4 (the landing page now)

The V4 screenshots and the walkthrough video come from a demo home: a copy of one real office
project (with its chats, usage and crew runs from `~/.cherry`) and four made-up projects at other
stages. Nothing is sent to Claude.

```bash
W=$(mktemp -d)
python3 scripts/media/setup-office-demo.py "$W/demo" ~/Projects/water-demo
# start a daemon on 4410 against it (a second daemon next to pnpm dev is fine):
(cd packages/daemon && HOME=$W/demo CHERRY_HOME=$W/demo/.cherry CHERRY_PORT=4410 \
  node --import tsx "$PWD/src/main.ts") &
S=$W node --import tsx scripts/media/office-capture.mts home=/ "crew=/p/water-demo/s/testing#Crew"
S=$W node --import tsx scripts/media/office-video.mts    # → $W/video/*.webm
```

`office-capture.mts` takes `name=path` pairs, or `name=path#Tab` to click a tab first. Crop and
convert with ffmpeg into `site/assets/v4/` (webp, about 1600 px wide). `office-video.mts` records the hero walkthrough (trim the first 1.6 s, speed 1.2x, H.264 CRF 30)
and a GIF of it goes to `docs/images/v4/office-demo.gif`. `og.html` is the social card
(`site/assets/og.png`, 1200x630, rendered with headless Chromium).

## README screenshots

`docs/images/*.webp` are full-window `office-capture.mts` shots (2x), scaled to 1600 px:

```bash
ffmpeg -i $W/shots/<name>.png -vf scale=1600:-1:flags=lanczos -c:v libwebp -quality 88 docs/images/<name>.webp
```

## V3 (old)

`setup-demo.sh`, `capture.mts`, `video.mts` and `fake-claude.json` made the V3 screenshots with a
scripted Claude. Those images are removed; the scripts follow the V3 screens and are kept for
reference.
