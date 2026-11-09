# DEPLOY.md – KEA by Atiana

Last update: 2026-11-09. Cost: EUR 0 per month (all free plans).

## What exists

| Part | Name / place | Notes |
|---|---|---|
| Code folder | `all_projects/atiana/app/` | This folder is the git repo root. Design files stay outside the repo. |
| GitHub repo | `github.com/fed17fed/atiana` (private) | Owner creates it. Remote: `git@github.com:fed17fed/atiana.git` (SSH, like bestdoors). |
| Vercel project | `atiana` (Hobby, free) | Team `fed17feds-projects`. Functions region `fra1` (set in `vercel.json`). |
| Production URL | https://atiana.vercel.app | Deploys from branch `main`. |
| Neon project | `atiana` (free) | Region `aws-eu-central-1` (Frankfurt), Postgres 17. Project id `delicate-surf-44982840`. |
| Neon branches | `main` = production/demo, `dev` = development and previews | Database name `neondb`. |
| CI | `.github/workflows/ci.yml` | On every PR and push to `main`: `npm ci`, lint, typecheck, unit tests (Vitest). |

Git author for this repo (local config): `fedorov.kav17@gmail.com`. Vercel blocks other emails. Do not change it.

## Environment variables (names only)

| Name | Production (Vercel) | Preview (Vercel) | Development / local |
|---|---|---|---|
| `DATABASE_URL` (pooled connection, for the app) | Neon `main` | Neon `dev` | Neon `dev` |
| `DIRECT_URL` (direct connection, for migrations) | Neon `main` | Neon `dev` | Neon `dev` |

How they were set: Neon connection strings from `neonctl cs`, added with `vercel env add`. Local copy is in `app/.env` (not in git). Values are never written in files, chat or git.

Rules:
- App uses `DATABASE_URL` (pooled). Prisma migrations use `DIRECT_URL` (direct).
- Never run migrations on Neon `main` without the owner's OK.
- Names of all future variables are in `.env.example` (empty values).
- Stripe, Resend and Turnstile keys: **keys added later** (task 0.4). No accounts created yet.

## Checks before a push

```
npm run lint
npm run typecheck
npm test
npm run build
```

## Owner steps (by hand)

### 1. Create the GitHub repo (needed first)
1. Open github.com (account `fed17fed`) -> New repository.
2. Name `atiana`, **Private**, no README, no .gitignore, no licence (empty repo).
3. Tell the DevOps employee. Then the first push to `main` and the Vercel link are done.

### 2. Connect Vercel to GitHub (after the repo exists)
Vercel -> project `atiana` -> Settings -> Git -> Connect Git Repository -> `fed17fed/atiana`.
After this, every push to `main` makes a production deploy and every PR makes a preview deploy.
(The DevOps employee can also try `vercel git connect` once the repo exists.)

### 3. Branch protection on `main` (web steps; no `gh` CLI)
1. GitHub -> repo `atiana` -> Settings -> Branches -> Add branch ruleset (or Add classic branch protection rule).
2. Branch name pattern: `main`.
3. Turn on: **Require a pull request before merging**.
4. Turn on: **Require status checks to pass before merging**. Search and add the check `checks` (job name in the CI workflow). It appears only after the first CI run.
5. Turn on: **Block force pushes**. Leave "Restrict deletions" on.
6. Save.
Note: private repos on the free GitHub plan may not allow branch protection or rulesets. If GitHub shows "upgrade" message, tell the DevOps employee. Do not pay without a decision.

## What is still open
- GitHub repo not created yet (owner) -> no push, no CI run, no auto-deploy from git yet.
- Branch protection (owner steps above).
- Task 0.4: Stripe (test mode), Resend, Turnstile keys -> later.
- Prisma and migrations: task 2.2 (developer).
- Vercel Hobby is for non-commercial use only. Real business use needs a paid plan or another host.
