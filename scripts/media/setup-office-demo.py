#!/usr/bin/env python3
"""Builds a demo HOME for the V4 screenshots and video.

Copies one real office project (its folder, and its chats and usage from ~/.cherry) and adds
made-up projects at other stages, so Home shows client and personal work. Nothing else from
~/.cherry is kept: other projects' rows are deleted from the copied cache.

    python3 scripts/media/setup-office-demo.py <demo-home> [source-project-dir]
"""

import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

D = Path(sys.argv[1]).resolve()
SRC = Path(sys.argv[2] if len(sys.argv) > 2 else Path.home() / 'Projects/water-demo').resolve()
CH = Path.home() / '.cherry'
PID = SRC.name

if D.exists():
    shutil.rmtree(D)
(D / 'Projects').mkdir(parents=True)
home = D / '.cherry'
(home / 'transcripts').mkdir(parents=True)

# The real project, with its git history and _project/.
shutil.copytree(SRC, D / 'Projects' / PID, symlinks=True)

# The cache: a consistent copy, then only this project's rows.
src = sqlite3.connect(f'file:{CH / "cache.db"}?mode=ro', uri=True)
dst = sqlite3.connect(home / 'cache.db')
src.backup(dst)
src.close()
tables = [r[0] for r in dst.execute("select name from sqlite_master where type='table'")]
for t in tables:
    cols = [r[1] for r in dst.execute(f'pragma table_info({t})')]
    if 'project_id' in cols:
        dst.execute(f'delete from {t} where project_id is null or project_id != ?', (PID,))
    elif t == 'projects':
        dst.execute('delete from projects where id != ?', (PID,))
    elif t not in ('usage_days',):
        dst.execute(f'delete from {t}')
dst.execute('update projects set path = ? where id = ?', (str(D / 'Projects' / PID), PID))
dst.commit()
for (tid,) in dst.execute('select transcript from sessions where transcript is not null'):
    f = CH / 'transcripts' / Path(tid).name
    if f.exists():
        shutil.copy(f, home / 'transcripts' / f.name)
for (sid,) in dst.execute('select id from sessions'):
    f = CH / 'transcripts' / f'{sid}.jsonl'
    if f.exists():
        shutil.copy(f, home / 'transcripts' / f.name)
dst.close()

ENV = {
    **os.environ,
    'GIT_AUTHOR_NAME': 'Ada Park',
    'GIT_AUTHOR_EMAIL': 'ada@example.com',
    'GIT_COMMITTER_NAME': 'Ada Park',
    'GIT_COMMITTER_EMAIL': 'ada@example.com',
    'GIT_CONFIG_GLOBAL': '/dev/null',
}


def stage(state, ready=False, by=None, date=None, internal=False, sent=None):
    offs = [{'by': by, 'date': date, 'notes': '', 'internal': internal, 'at': f'{date}T10:00:00.000Z'}] if by else []
    return {'state': state, 'ready': ready, 'sentAt': sent, 'signOffs': offs}


ORDER = ['idea', 'requirements', 'plan', 'design', 'development', 'testing', 'deployment']


def office(kind, client, cycles, rate=60, costs=None, time=None):
    return {
        'schema': 1, 'kind': kind, 'client': client, 'rate': rate, 'currency': 'USD',
        'budgetTokens': 8000000, 'cycles': cycles, 'changes': [], 'changelog': [],
        'costs': costs or [], 'time': time or [], 'actions': [],
        'models': {},
        'createdAt': '2026-10-20T09:00:00.000Z', 'updatedAt': '2026-11-09T09:00:00.000Z',
    }


def cycle(version, title, states, live=False, gate='build'):
    st = {}
    for s, spec in zip(ORDER, states):
        st[s] = spec
    return {
        'version': version, 'title': title, 'stages': st, 'devGate': gate,
        'prototypeReady': gate != 'build', 'startedAt': '2026-10-20T09:00:00.000Z',
        'liveAt': '2026-11-01T12:00:00.000Z' if live else None,
    }


def project(pid, summary, off, docs, left_off, next_steps):
    p = D / 'Projects' / pid
    (p / '_project').mkdir(parents=True)
    (p / '_project/office.json').write_text(json.dumps(off, indent=2))
    (p / '_project/project.json').write_text(json.dumps(
        {'schema': 1, 'name': pid, 'summary': summary, 'phase': 'plan', 'stack': [], 'docs': {}}, indent=2))
    (p / '_project/STATUS.md').write_text(
        f'---\nname: {pid}\nstatus: active\nsummary: {summary}\n---\n\n## Where we left off\n\n{left_off}\n\n'
        '## Next steps\n\n' + ''.join(f'- [ ] {n}\n' for n in next_steps))
    (p / 'README.md').write_text(f'# {pid}\n\n{summary}\n')
    for rel, text in docs.items():
        f = p / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text)
    subprocess.run(['git', 'init', '-q', '-b', 'main'], cwd=p, env=ENV, check=True)
    (p / '.git/info/exclude').write_text('_project/\n')
    subprocess.run(['git', 'add', '-A'], cwd=p, env=ENV, check=True)
    subprocess.run(['git', 'commit', '-q', '-m', 'docs: first documents'], cwd=p, env=ENV, check=True)


S, A = 'signed', 'active'
project(
    'clinic-booking',
    'Online booking for a two-room physiotherapy clinic: patients pick a slot, staff see the day.',
    office('client', {'name': 'Northwind Physio', 'contact': 'Maya Chen'}, [cycle('1.0', '', [
        stage(S, True, 'Maya Chen', '2026-10-22'),
        stage(S, True, 'Maya Chen', '2026-10-27'),
        stage(S, True, 'Maya Chen', '2026-11-02'),
        stage('waiting', True, sent='2026-11-08T15:00:00.000Z'),
        stage('locked'), stage('locked'), stage('locked'),
    ])], costs=[{'id': 'c1', 'item': 'Domain', 'vendor': 'Namecheap', 'period': 'year', 'amount': 14, 'bill': True, 'addedAt': '2026-10-25T09:00:00.000Z'}],
        time=[{'id': 't1', 'stage': 'requirements', 'hours': 3, 'note': 'Workshop with the clinic', 'date': '2026-10-24'}]),
    {'docs/idea/client/brief.md': '# Brief\n\nPatients book a slot online; staff see the day.\n'},
    'Design sent to Northwind Physio on 2026-11-08: booking flow, staff day view and the reminder email.',
    ['Wait for Maya to approve the design', 'Start the prototype after the approval'],
)
project(
    'tipsplit',
    'Split a restaurant bill with tip and rounding, offline, on a phone.',
    office('personal', None, [cycle('1.0', '', [
        stage(S, True, 'you', '2026-11-03', True),
        stage(S, True, 'you', '2026-11-04', True),
        stage(S, True, 'you', '2026-11-05', True),
        stage(S, True, 'you', '2026-11-06', True),
        stage(A), stage('locked'), stage('locked'),
    ], gate='approved')]),
    {'docs/idea/client/summary.md': '# Summary\n\nA bill splitter that works offline.\n'},
    'Prototype approved. The Development Team is building the rest: rounding rules and the share sheet.',
    ['Finish rounding rules', 'Hand over to Testing'],
)
project(
    'fieldnotes-api',
    'A small API and admin page for a survey team to upload field notes and photos.',
    office('client', {'name': 'Harbor & Co', 'contact': 'Sam Ortiz'}, [
        cycle('1.0', '', [stage(S, True, 'Sam Ortiz', '2026-09-10') for _ in ORDER], live=True, gate='approved'),
        cycle('2.0', 'Offline sync', [stage('carried'), stage(A)] + [stage('locked')] * 5),
    ]),
    {'docs/requirements/client/summary.md': '# Requirements\n\nOffline sync for field tablets.\n'},
    'v1.0 is live. v2.0 (offline sync) is in Requirements: three questions for Sam are open.',
    ['Get answers to the sync questions from Sam'],
)
project(
    'recipe-box',
    'Save recipes from any site into one clean, searchable list.',
    office('personal', None, [cycle('1.0', '', [stage(A)] + [stage('locked')] * 6)]),
    {},
    'New project. The Business Analyst has the idea and waits for a job.',
    ['Give the Business Analyst the idea'],
)

projects = [{'id': p, 'path': str(D / 'Projects' / p)} for p in
            [PID, 'clinic-booking', 'tipsplit', 'fieldnotes-api', 'recipe-box']]
cfg = json.loads((CH / 'config.json').read_text())
cfg.update({'projectsDir': str(D / 'Projects'), 'projects': projects, 'onboarded': True})
cfg['agents']['worktreeDir'] = str(D / 'Projects/.cherry-worktrees')
cfg['claude']['chrome'] = False
(home / 'config.json').write_text(json.dumps(cfg, indent=2))
# Claude Code's sign-in, so the health check passes. The demo never sends a message.
for name in ('.claude', '.claude.json'):
    if (Path.home() / name).exists():
        (D / name).symlink_to(Path.home() / name)
print('demo home:', D)
