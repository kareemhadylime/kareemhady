---
name: pull-all
description: Pull and sync the latest commits from origin/main for all five Lime Investments projects — fmplus-beta, voltauto-pricing, kareemhady, etsy, and voltauto-website. Handles common local-only .gitignore diffs by stashing, pulling, then popping. Reports the final safety status of each repo. Use before starting any new work session.
---

# /pull-all — sync all Lime projects to latest

Pull origin/main for **fmplus-beta**, **voltauto-pricing**, **kareemhady**, **etsy**, and **voltauto-website** in sequence.
Handle the common case where `.gitignore` has local-only additions that block a fast-forward merge.

## Projects

> **Machine-specific paths** — update this table when working from a different machine.
> Current machine: `KAREE-PC` (Windows, `C:\` root layout)

| Directory | GitHub repo | Notes |
|-----------|-------------|-------|
| `C:\fmplus-beta` | kareemhadylime/fmplus-beta | FM+ CAFM app |
| `C:\Voltauto-pricing` | kareemhadylime/voltauto-pricing | pricing tool |
| `C:\kareemhady` | kareemhadylime/kareemhady | main dashboard (prod) |
| *(not cloned)* | kareemhadylime/etsy-store | Etsy store mgmt — skip if absent |
| `C:\voltauto-website` | kareemhadylime/VOLTAUTO-WEB | VoltAuto website |

## Steps

### 1. Check current state of all five repos

Run these status checks in parallel:

```powershell
# For each of:
#   C:\fmplus-beta
#   C:\Voltauto-pricing
#   C:\kareemhady
#   C:\voltauto-website
#   (etsy not cloned — skip)
Set-Location <path>
git fetch origin
$branch = git rev-parse --abbrev-ref HEAD
$behind = git rev-list "HEAD..origin/$branch" --count
git status --short
git log --oneline -1
```

Report a one-line summary per repo: **name | ahead/behind | dirty files**.

### 2. Pull each repo

For every repo that is behind origin:

```powershell
Set-Location <path>

# If .gitignore (or any tracked file) is locally modified, stash first
$dirty = git diff --name-only
if ($dirty) {
    git stash push -m "pull-all: stash local changes"
    $stashed = $true
} else {
    $stashed = $false
}

# Fast-forward pull
git pull --ff-only

# Pop stash — if a conflict occurs, resolve by keeping ALL lines
# (upstream + stashed additions) — they are always purely additive
if ($stashed) {
    $result = git stash pop 2>&1
    if ($LASTEXITCODE -ne 0) {
        # Conflict: read the file, strip conflict markers, write back, then git add
        $conflicted = git diff --name-only --diff-filter=U
        foreach ($f in $conflicted) {
            $content = [System.IO.File]::ReadAllText("$PWD\$f")
            $resolved = $content `
                -replace "<<<<<<< Updated upstream`r`n", "" `
                -replace "<<<<<<< Updated upstream`n", "" `
                -replace "=======`r`n", "" `
                -replace "=======`n", "" `
                -replace ">>>>>>> Stashed changes`r`n", "" `
                -replace ">>>>>>> Stashed changes`n", ""
            [System.IO.File]::WriteAllText("$PWD\$f", $resolved)
            git add $f
        }
        git stash drop
    }
}
```

### 3. Push kareemhady if it has unpushed commits

kareemhady is the main production repo. If the local branch is ahead of origin after resolving the stash (e.g. from a `.gitignore` merge commit made during this pull), push it:

```powershell
Set-Location C:\kareemhady
$ahead = git rev-list "origin/main..HEAD" --count
if ([int]$ahead -gt 0) {
    git push origin main
}
```

### 4. Final safety report

Print a table:

| Repo | Branch | Ahead | Behind | Dirty |
|------|--------|-------|--------|-------|
| fmplus-beta | main | N | N | list or CLEAN |
| voltauto-pricing | main | N | N | list or CLEAN |
| kareemhady | main | N | N | list or CLEAN |
| etsy | main | N | N | list or CLEAN |
| voltauto-website | main | N | N | list or CLEAN |

Mark a repo **SAFE** if: behind=0 and no staged/modified tracked files (untracked `.claude/` dirs are always harmless — ignore them in the dirty check).

## Known quirks

- **`.gitignore` conflicts** are always safe to auto-resolve by keeping both sides — the upstream and local additions are additive (ignore patterns only grow).
- **Untracked `.claude/worktrees/` and `.claude/FM+/`** — these are local session artefacts, never a sign of danger.
- **kareemhady 1-commit-ahead** after a pull — normal if the `.gitignore` conflict produced a merge commit; push it to clean up.
- **fmplus-beta `.claude/` untracked** — harmless; do not add or commit it unless explicitly asked.
