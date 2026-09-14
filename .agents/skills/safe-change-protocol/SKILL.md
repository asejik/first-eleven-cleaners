---
name: safe-change-protocol
description: >-
  Protocol for making ANY change on an existing codebase (bug fix, feature, refactor, database, or config change).
  Mandatory for all code, database, and configuration modifications. Enforces 4 phases: Orient & Plan, Implement, Verify, and Report.
---

# SAFE CHANGE PROTOCOL

Use for ANY change on an existing/unfamiliar codebase (bug
fix, feature, refactor, database change). Works with zero setup: the operating rules are built in.

Paste this, then fill in TASK and TYPE.

TASK: [describe the change]
TYPE: [FEATURE / BUG FIX / REFACTOR / DATABASE / CONFIG]

---

OPERATING RULES (follow for the whole task)
- One change at a time. Change only what the task needs. No unrequested
  refactors, renames, reformatting, or dependency installs/upgrades - ask
  first.
- Follow the patterns already in this codebase. If none exists, ask before
  inventing one.
- Never do these to make an error go away: @ts-ignore / @ts-expect-error /
  "any" / eslint-disable; deleting or skipping tests; disabling access
  control or adding allow-all policies; deleting "unused" code without
  listing it for me; fake variable reads; hardcoding IDs/emails/test data.
- Security basics: no secrets in code or client-exposed vars (VITE_,
  NEXT_PUBLIC_, EXPO_PUBLIC_); authorization enforced server/database-side,
  not just in the UI; never trust prices, amounts, or permissions from the
  client.
- Never open URLs in a browser; I test manually.
- Never claim a check passed without running it. If you can't run something,
  say so and give me the command.
- Stop and ask when: checks were already failing before your change; the
  code/database differs from what you expected; the same error survives two
  attempts; the change would affect features outside the task.

---

PHASE 1 - ORIENT & PLAN (then STOP for approval)
- Confirm the working tree is clean; if not, tell me to commit a checkpoint
  first (and give me the git commands).
- Find and report the project's commands for type check, lint, build, tests
  (from package.json/config). Run them as a BASELINE and report results;
  list any pre-existing failures (not yours to hide or silently fix).
- Restate the task. Identify the files and areas involved by reading the
  code, and list:
  - Files you'll create or modify, and why
  - Existing features that could be affected (impact analysis)
  - Any database, config, or dependency changes needed
- BUG FIX, additionally:
  - Reproduce the bug first (exact steps or a failing test)
  - Find the root cause with evidence (code, logs, data) and explain it in
    plain language BEFORE proposing a fix - no guess-and-patch
  - Propose the fix and a test that would catch this bug if it returned
- DATABASE, additionally:
  - Inspect the live schema with READ-ONLY queries: affected tables,
    columns, types, constraints, access policies, and any views/functions/
    triggers referencing them
  - The migration (or rules change), marked ADDITIVE or DESTRUCTIVE, with
    every table/query/policy/feature it affects
  - A rollback script
  - Whether a backup is recommended first
  - Do NOT run schema changes on production directly; use a migration, and
    dev first if a dev database exists

PHASE 2 - IMPLEMENT (after approval)
- Make only the approved changes.
- Regenerate database types after schema changes and fix errors they reveal
  (usually a query no longer matches the schema).

PHASE 3 - VERIFY (show real output)
- Type check, lint, build, tests; compare to the Phase 1 baseline - nothing
  that passed before may fail now
- Check changed files for unused variables/imports (or run a tool like knip);
  list removals for approval, don't delete silently
- Bug fixes: the reproduction steps no longer trigger the bug

PHASE 4 - REPORT (exactly this format)
1. Summary - what changed, plain language
2. Files changed - one line each
3. Database changes - applied? where? rollback script location
4. Check results - pass/fail with output
5. ACTIONS FOR ME - env vars to add (and where), migrations to run, settings
   to change, packages to install, commits to make. "None" if none.
6. MANUAL TEST CHECKLIST - steps to confirm the change works AND nearby
   features still work
7. Risks and follow-ups - anything uncertain, skipped, or worth watching

ONE-TIME HARDENING (optional; offer, don't assume)
If this is a TypeScript project, offer to set "noUnusedLocals" and
"noUnusedParameters" in tsconfig.json so unused code fails the type check
from now on. Offer to create a short CLAUDE.md capturing these operating
rules and the project's commands, so future sessions load them automatically.
