# Media

Screenshots, the demo video and the landing page images come from a made-up demo (no real
projects, a scripted Claude). To make them again:

```bash
W=$(mktemp -d)                       # work folder
bash scripts/media/setup-demo.sh "$W/demo"
# start a daemon on 4400 against the demo (HOME=$W/demo, CHERRY_HOME=$W/demo/.cherry,
# CHERRY_PORT=4400, CHERRY_FAKE_CLAUDE=scripts/media/fake-claude.json), then:
S=$W node --import tsx scripts/media/capture.mts   # screenshots → $W/media/shots
S=$W node --import tsx scripts/media/video.mts     # walkthrough → $W/media/video/*.webm
```

`fake-claude.json` is the e2e script plus a theme-toggle chat for the demo project. `og.html`
is the social preview card (`site/assets/og.png`, 1200×630).
