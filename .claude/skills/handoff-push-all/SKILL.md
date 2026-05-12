---
name: handoff-push-all
description: End-of-session skill — writes a dated SESSION_HANDOFF.md entry for every touched Lime Investments project, commits and pushes all dirty repos (fmplus-beta, voltauto-pricing, kareemhady, etsy, voltauto-website), rebases any active worktree onto origin/main, deploys kareemhady to Vercel if code changed, and prints a "SAFE TO /clear" confirmation. Trigger on: "handoff", "push-all", "wrap up", "end session", "safe to clear", "commit and close", "push and close".
---

# /handoff-push-all — session close: summarise, commit, push, deploy

One command to end a session cleanly across all five Lime projects.

## Projects

> **Machine-specific paths** — update this table when working from a different machine.
> Current machine: `KAREE-PC` (Windows, `C:\` root layout)

| Directory | GitHub repo | Vercel? |
|-----------|-------------|---------|
| `C:\kareemhady` | kareemhadylime/kareemhady | ✓ prod |
| `C:\fmplus-beta` | kareemhadylime/fmplus-beta | — |
| `C:\Voltauto-pricing` | kareemhadylime/voltauto-pricing | — |
| *(not cloned)* | kareemhadylime/etsy-store | — |
| `C:\voltauto-website` | kareemhadylime/VOLTAUTO-WEB | — |

---

## Step 1 — Scan all repos for local changes

Run in parallel for each repo:

```powershell
Set-Location <path>
git fetch origin
$ahead = git rev-list "origin/main..HEAD" --count
$dirty = git status --short | Where-Object { $_ -notmatch "^\?\? \.claude/" }
$recent = git log --oneline -3
Write-Host "=== <repo> | ahead=$ahead ==="
Write-Host $recent
if ($dirty) { Write-Host "Dirty: $($dirty -join ', ')" }
```

A repo is **touched** if: ahead > 0, has staged/modified tracked files, or you wrote/edited files in it this session. Untracked `.claude/` dirs are always harmless — ignore them.

---

## Step 2 — Write SESSION_HANDOFF.md for each touched repo

Prepend a new dated entry to `SESSION_HANDOFF.md` (create the file if absent — H1: `# <Repo Name> — Session Handoff`):

```markdown
## <emoji> <YYYY-MM-DD> — <one-line title of what was done>

<2-5 sentence prose: what changed, why, what was NOT done.>

**Commits this session:**
- `<sha>` <commit message>

**State left in:** <deployed / pending / open decisions>

**Next session:** <what to pick up, or "nothing pending">

---
```

**Emoji key:** 🟢 shipped & deployed, 🟡 in-progress / partial, 🔵 Q&A / no-code, 🔴 hotfix

**Rules:**
- Newest entry at top, below the H1.
- Be specific — file paths, function names, commit SHAs, exact numbers.
- Only describe what happened *this session*. Do NOT summarise prior entries.
- If nothing happened in a project, do not touch its handoff file.

---

## Step 3 — Commit, rebase, push each touched repo

Process in any order; always do **kareemhady last** so its handoff captures the full session.

```powershell
Set-Location <path>

# Stage modified tracked files
git add -u
git add SESSION_HANDOFF.md    # in case it was untracked

# NEVER stage: .env.local, *.secret, .claude/worktrees/, .claude/sessions/

git commit -m "docs: session handoff <YYYY-MM-DD> — <one-line summary>"

# Rebase onto latest origin/main before pushing
git fetch origin main
$behind = [int](git rev-list "HEAD..origin/main" --count)
if ($behind -gt 0) {
    git rebase origin/main
    # .gitignore conflict: keep both sides (additive), git add .gitignore, git rebase --continue
}

git push origin HEAD:main
```

---

## Step 4 — Rebase active worktree(s) onto origin/main

The stop hook checks `SESSION_HANDOFF.md` mtime in the **worktree**, not the main checkout. After pushing kareemhady, rebase the current worktree so it picks up the fresh file:

```powershell
# Find the active worktree path (the one Claude Code is running in)
$wt = git worktree list --porcelain | Select-String "^worktree" | Select-Object -Last 1
Set-Location <worktree-path>
git fetch origin main
git rebase origin/main
```

This also satisfies the stop hook (mtime on `SESSION_HANDOFF.md` is refreshed by the rebase).

---

## Step 5 — Deploy kareemhady to Vercel (if code changed)

Only if kareemhady had non-docs changes (anything outside `SESSION_HANDOFF.md` and `docs/`):

```powershell
Set-Location C:\Users\karee\projects\kareemhady
vercel --prod --yes
```

Skip the explicit `vercel --prod` for docs-only commits — the GitHub → Vercel integration handles it automatically on push. Note in the confirmation: `✓ shipped via GitHub push`.

---

## Step 6 — Print confirmation

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SESSION HANDOFF COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Repos:
    ✓ kareemhady      →  <sha>  →  pushed
    ✓ fmplus-beta     →  <sha>  →  pushed
    — voltauto-pricing  →  no changes, skipped
    — etsy              →  no changes, skipped
    — voltauto-website  →  no changes, skipped

  Vercel: ✓ kareemhady  OR  — skipped (docs-only / shipped via GitHub push)

  ✅ SAFE TO /clear
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Known quirks

- **Worktree quirk** — `vercel --prod` from inside `.claude/worktrees/*` deploys to a sandbox project, not real production. Real prod goes out via `git push origin HEAD:main`. Mark confirmation as `✓ shipped via GitHub push`.
- **Stop hook** — the hook checks `SESSION_HANDOFF.md` mtime in the worktree directory. Step 4 (rebase worktree) refreshes it. If the hook still fires after Step 4, touch the file: `(Get-Item SESSION_HANDOFF.md).LastWriteTime = Get-Date`.
- **Rebase conflict on .gitignore** — always safe to keep both sides (ignore patterns only grow). Resolve, `git add .gitignore`, `git rebase --continue`.
- **Nothing touched** — if all repos are clean, write no handoff entries, print the table with all rows as `— no changes`, and confirm safe to clear anyway.
- **etsy / voltauto-website / fmplus-beta** — no Vercel project; push to GitHub only.
- **Never force-push** — if a push is rejected and rebase doesn't resolve it, stop and report. Do not `--force`.
