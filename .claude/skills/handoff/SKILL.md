---
name: handoff
description: End-of-session skill — updates SESSION_HANDOFF.md in every active project with a summary of work done this session, commits and pushes each to GitHub, deploys kareemhady to Vercel, then prints a single confirmation message declaring the session safe to /clear. Trigger when the user says any of "handoff", "session handoff", "update handoff", "wrap up", "safe to clear", "end session", "commit and close", or "push and close".
---

# /handoff — session close + deploy

Summarise this session's work, persist it to every touched project, ship to production, and confirm safe to clear.

---

## Step 1 — Determine which projects were touched this session

Check each of the five project directories for local changes or commits made since the session started:

```powershell
$projects = @(
    "C:\Users\karee\projects\kareemhady",
    "C:\Users\karee\projects\fmplus-beta",
    "C:\Users\karee\projects\voltauto-pricing",
    "C:\Users\karee\projects\etsy",
    "C:\Users\karee\projects\voltauto-website"
)

foreach ($p in $projects) {
    Set-Location $p
    $name   = Split-Path $p -Leaf
    $ahead  = git rev-list "origin/main..HEAD" --count
    $dirty  = git status --short
    $recent = git log --oneline -5
    Write-Host "=== $name | ahead=$ahead ==="
    Write-Host $recent
    if ($dirty) { Write-Host "Dirty: $dirty" }
}
```

A project is **touched** if it has: ahead > 0, staged/modified files, or you wrote/edited files in it this session.

---

## Step 2 — Write the SESSION_HANDOFF.md update

For **each touched project**, prepend a new dated entry to its `SESSION_HANDOFF.md` (or create the file if it doesn't exist).

### Entry format

```markdown
## <emoji> <YYYY-MM-DD> — <one-line title of what was done>

<2-5 sentence prose summary: what changed, why, what was NOT done.>

**Commits this session:**
- `<sha>` <commit message>
- `<sha>` <commit message>

**State left in:**
- <bullet: what is deployed / what is pending / any open decisions>

**Next session:** <one sentence on what to pick up next, or "nothing pending".>

---
```

**Emoji key:**
- 🟢 feature shipped and deployed
- 🟡 in-progress / partially done / awaiting decision
- 🔵 Q&A / diagnostic / no code change
- 🔴 hotfix / incident

**Rules:**
- Prepend (newest at top, below the `# <Repo> — Session Handoff` heading).
- Be specific — file paths, function names, commit SHAs, exact numbers. A future session reading this cold must be able to pick up without asking.
- Do NOT summarise the handoff file itself or prior sessions — only what happened *this session*.
- If nothing happened in a project, do not touch its handoff file.

---

## Step 3 — Commit and push each touched project

For each project whose SESSION_HANDOFF.md was updated (or that has other uncommitted changes):

```powershell
Set-Location <project-path>

# Stage everything that should be committed
git add SESSION_HANDOFF.md
# Also stage any other modified tracked files if they weren't already committed mid-session
# DO NOT stage .env.local, secrets, or .claude/worktrees/

git commit -m "docs: session handoff <YYYY-MM-DD> — <one-line summary>"

# Rebase onto latest origin before pushing (worktree-behind-main is common)
git fetch origin main
$behind = git rev-list "HEAD..origin/main" --count
if ([int]$behind -gt 0) {
    git rebase origin/main
}

git push origin HEAD:main
```

---

## Step 4 — Deploy kareemhady to Vercel

Only if `kareemhady` was touched (code changed, not just docs):

```powershell
Set-Location C:\Users\karee\projects\kareemhady
vercel --prod --yes
```

If only SESSION_HANDOFF.md changed in kareemhady (docs-only), skip the Vercel deploy — the GitHub push via the Vercel integration will handle it, but a forced `vercel --prod` for a docs commit is wasteful.

---

## Step 5 — Print the confirmation message

After all pushes (and deploy if applicable) succeed, print **exactly** this block:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SESSION HANDOFF COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Projects synced:
    ✓ <repo name>  →  <commit sha>  →  pushed
    ✓ <repo name>  →  <commit sha>  →  pushed
    (one line per touched project)

  Vercel deploy: ✓ kareemhady  OR  — skipped (docs-only)

  ✅ SAFE TO /clear
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Known edge cases

- **Worktree quirk** — when run from inside a `.claude/worktrees/*` path, `vercel --prod` deploys to a sandbox project, not real production. Real prod deploys via the GitHub → Vercel integration on `git push origin main`. The confirmation message should say `✓ shipped via GitHub push` in that case.
- **Rebase conflict** — if `git rebase origin/main` hits a conflict, resolve it (`.gitignore` additions are always safe to keep-both), then `git rebase --continue` before pushing.
- **No SESSION_HANDOFF.md in a project** — create it with `# <Repo Name> — Session Handoff` as the H1, then prepend the entry.
- **etsy / voltauto-website / fmplus-beta have no Vercel project** — skip the deploy step for those; push to GitHub only.
- **Nothing touched** — if no project was touched this session, print the confirmation message anyway with "No changes — all projects already current" and mark safe to clear.
