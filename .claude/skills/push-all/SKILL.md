---
name: push-all
description: End-of-session skill — commit and push all dirty Lime Investments repos (fmplus-beta, voltauto-pricing, kareemhady, etsy, voltauto-website), update SESSION_HANDOFF.md in each touched project, rebase onto origin/main before pushing to avoid conflicts. Use at end of session when multiple repos have changes to ship.
---

# /push-all — commit and push all dirty Lime projects

Stage, commit, and push every repo that has local changes. Updates SESSION_HANDOFF.md in each touched project before committing.

## Projects

| Directory | GitHub repo |
|-----------|-------------|
| `C:\Users\karee\projects\fmplus-beta` | kareemhadylime/fmplus-beta |
| `C:\Users\karee\projects\voltauto-pricing` | kareemhadylime/voltauto-pricing |
| `C:\Users\karee\projects\kareemhady` | kareemhadylime/kareemhady |
| `C:\Users\karee\projects\etsy` | kareemhadylime/etsy-store |
| `C:\Users\karee\projects\voltauto-website` | kareemhadylime/VOLTAUTO-WEB |

---

## Step 1 — Scan all repos for uncommitted changes

Run in parallel for each repo:

```powershell
Set-Location <path>
git fetch origin
$ahead  = git rev-list "origin/main..HEAD" --count
$dirty  = git status --short | Where-Object { $_ -notmatch "^\?\? \.claude/" }
Write-Host "<repo> | ahead=$ahead | dirty=$(if($dirty){$dirty -join ', '}else{'CLEAN'})"
```

Report one line per repo. A repo is **active** if: ahead > 0, or has staged/modified tracked files.

---

## Step 2 — For each active repo, update SESSION_HANDOFF.md

Prepend a brief dated entry to `SESSION_HANDOFF.md` (create if missing):

```markdown
## <emoji> <YYYY-MM-DD> — <one-line title>

<2-4 sentences: what changed, what was NOT done.>

**Commits this session:**
- `<sha>` <message>

**State left in:** <deployed / pending / open decisions>

**Next session:** <what to pick up, or "nothing pending">

---
```

**Emoji key:** 🟢 shipped, 🟡 in-progress, 🔵 Q&A/no-code, 🔴 hotfix

Rules:
- Newest entry at top (below the `# <Repo> — Session Handoff` H1).
- Be specific — file paths, function names, commit SHAs.
- Only describe what happened *this session*.

---

## Step 3 — Commit, rebase, push each active repo

For each active repo (in any order; kareemhady last so it gets all changes):

```powershell
Set-Location <path>

# Stage modified tracked files — never .env.local, secrets, or .claude/worktrees/
git add -u
git add SESSION_HANDOFF.md   # in case it was untracked

# Do NOT stage: .env.local, *.secret, .claude/worktrees/, .claude/sessions/

git commit -m "docs: session handoff <YYYY-MM-DD> — <one-line summary>"

# Rebase onto latest origin/main (worktree-behind-main is common)
git fetch origin main
$behind = [int](git rev-list "HEAD..origin/main" --count)
if ($behind -gt 0) {
    git rebase origin/main
    # If conflict on .gitignore: keep both sides (additive), then git rebase --continue
}

git push origin HEAD:main
```

---

## Step 4 — Deploy kareemhady to Vercel (if code changed)

Only if kareemhady had non-docs changes (anything outside `SESSION_HANDOFF.md` and `docs/`):

```powershell
Set-Location C:\Users\karee\projects\kareemhady
vercel --prod --yes
```

Skip the explicit `vercel --prod` if the only change was SESSION_HANDOFF.md — the GitHub → Vercel integration will pick it up from the push automatically.

---

## Step 5 — Print final status table

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PUSH-ALL COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Repos pushed:
    ✓ <repo>  →  <sha>  →  pushed
    — <repo>  →  no changes, skipped
    (one line per repo)

  Vercel: ✓ kareemhady  OR  — skipped (docs-only)

  ✅ ALL REPOS IN SYNC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Known quirks

- **Worktree quirk** — `vercel --prod` from inside `.claude/worktrees/*` deploys to a sandbox project, not real production. Real prod goes out via the GitHub push. Note `✓ shipped via GitHub push` in the confirmation.
- **Rebase conflict on .gitignore** — always safe to keep both sides (ignore patterns only grow). Resolve, `git add .gitignore`, `git rebase --continue`.
- **Nothing dirty** — if all repos are clean and up to date, print the table with all rows as `— no changes` and exit cleanly.
- **etsy / voltauto-website / fmplus-beta** — no Vercel project; push to GitHub only.
- **Never force-push** — if a push is rejected and rebase doesn't help, stop and report; do not `--force`.
