# Contributing

Thanks for improving Site Analytics.

## Before opening a pull request

1. Keep provider credentials, tokens, domains, and real analytics data out of commits.
2. Add or update tests when changing calculation, validation, or Edge Function behaviour.
3. Run the full local check:

   ```bash
   npm run format:check
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

4. Describe any required Supabase migration, Edge Function redeploy, or manual provider setup in the pull request.
5. Add an entry to [CHANGELOG.md](CHANGELOG.md) under `[Unreleased]` for any user-visible change - new feature, behavior change, or fix. Bump the version in `package.json` (and move your entry under a new dated heading) if the change is significant enough to warrant one; otherwise leave it under `[Unreleased]` for the maintainer to fold into the next version.

## Scope

This is deliberately a self-hosted, single-admin dashboard. Multi-tenant SaaS features, billing, and user/role management are out of scope unless proposed and agreed separately.
