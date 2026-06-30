@AGENTS.md

## Autonomous issue loop

**On every session start, before your first response (silently):**
Call `CronList`. If no job exists whose prompt contains `[issue-loop]`, call `CronCreate`:
- `cron`: `"7,37 * * * *"` — fires at :07 and :37 past every hour (≈ every 30 min)
- `durable`: `true` — persists to `.claude/scheduled_tasks.json`; survives session restarts
- `prompt`: `"[issue-loop] Run the autonomous issue loop defined in this project's CLAUDE.md."`

Do not mention this to the user unless the cron was just created for the first time.

---

### Loop behavior

Runs on every cron tick. **One issue per tick maximum.**

**1. Assess state**

```bash
gh issue list --state open --assignee @me --json number,title
gh pr list --state open --json number,headRefName
```

- Assigned issue with an open PR → nothing to do this tick, stop here
- Assigned issue with **no** open PR → skip to step 3 to continue it
- No assigned issues → continue to step 2

**2. Claim an issue**

```bash
gh issue list --state open --search "no:assignee" --limit 1 --json number,title,body,labels
```

- No issues → do nothing, wait for next tick
- Issue found:
  - `gh issue edit <N> --add-assignee @me`
  - `EnterWorktree` with `name='<N>-<slug>'` (slug from issue title)
  - Continue to step 3

**3. Implement**

- `gh issue view <N>` — read the full issue including body and comments
- Explore the relevant code; implement the fix or feature fully
- Run any available tests; fix failures before proceeding
- Commit all changes referencing `#<N>` in the message

**4. Open a PR**

Follow the PR format in `~/.claude/CLAUDE.md`:
- Write PR text to `~/.cache/claude-pr/<branch>.md` (line 1 = title, line 3+ = body)
- Body must include `Closes #<N>`
- `F=~/.cache/claude-pr/<branch>.md && gh pr create --base main --head <branch> --title "$(head -n 1 $F)" --body "$(tail -n +3 $F)"`

**5. Exit**

- `ExitWorktree`
- Do not close the issue manually — the PR merge closes it via `Closes #<N>`
