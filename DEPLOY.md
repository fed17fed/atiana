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
- Phase 4 names (all empty until the keys exist; the features stay OFF and show a "Demo: ... not active yet" message): `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (payments need both), `AUTH_SECRET` + `AUTH_RESEND_KEY` (or `RESEND_API_KEY`) + `EMAIL_FROM` (email login needs all three), `CRON_SECRET` (daily cron route; closed without it), `ALLOW_DEV_LOGIN` (LOCAL ONLY, never set on Vercel).
- Stripe webhook URL to add later: `<site>/api/stripe/webhook`, events `checkout.session.completed`, `checkout.session.expired` and (new, for money-back refunds) `charge.refunded`.
- Daily cron: `vercel.json` runs `/api/cron/daily` at 06:00 UTC once a day (Hobby plan allows only daily crons; check current Vercel docs). Vercel sends `Authorization: Bearer <CRON_SECRET>` itself.
- Stripe, Resend and Turnstile keys: **keys added later** (task 0.4). No accounts created yet.

## Checks before a push

```
npm run lint
npm run typecheck
npm test
npm run build
```

## Status (2026-11-09)
- GitHub repo `fed17fed/atiana` exists; `main` is pushed.
- Vercel project `atiana` is connected to the repo (push to `main` = production deploy, PR = preview deploy).
- CI: see https://github.com/fed17fed/atiana/actions (owner checks the first run).

## Owner steps (by hand)

### 3. Branch protection on `main` – SKIPPED (2026-11-09)
GitHub asks for payment for branch protection on a private repo (Free plan). The owner decided not to pay. Instead: the team rule "no push without the owner's OK" + CI on every push. The steps below are kept for later (paid plan or public repo).

1. GitHub -> repo `atiana` -> Settings -> Branches -> Add branch ruleset (or Add classic branch protection rule).
2. Branch name pattern: `main`.
3. Turn on: **Require a pull request before merging**.
4. Turn on: **Require status checks to pass before merging**. Search and add the check `checks` (job name in the CI workflow). It appears only after the first CI run.
5. Turn on: **Block force pushes**. Leave "Restrict deletions" on.
6. Save.
Note: private repos on the free GitHub plan may not allow branch protection or rulesets. If GitHub shows "upgrade" message, tell the DevOps employee. Do not pay without a decision.

## What is still open
- Branch protection on `main`: skipped (needs a paid GitHub plan), see section 3.
- CI: green (owner checked on 2026-11-09). Repo is private.
- Task 0.4: Stripe (test mode), Resend, Turnstile keys -> later.
- Prisma: first migration applied on Neon **dev** only. Neon **main**: later, when the site needs the database (owner decision 2026-11-09). Command then: `npm run db:deploy` with the main DIRECT_URL, after a Neon backup branch.
- Vercel Hobby is for non-commercial use only. Real business use needs a paid plan or another host.
