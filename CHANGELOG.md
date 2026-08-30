# Changelog

All notable changes to this project are documented here, newest first. Dates are UTC and match the commits that shipped each entry.

This project doesn't yet cut formal GitHub Releases or git tags - version numbers below track `package.json` and exist so entries have something stable to reference.

## [Unreleased]

## [0.6.0] - 2026-08-30

### Added

- CI: a GitHub Actions workflow runs format/lint/typecheck/test/build on every push and pull request to `main` - the same checklist CONTRIBUTING.md already asked contributors to run locally, now enforced automatically.

### Removed

- **Goals** and **chart annotations** - both features are gone: the database tables (`site_goals`, `annotations`), their RLS policies, the `manage-portfolio` Edge Function actions that wrote to them, the UI sections on the site detail page, chart markers, the goals page of the PDF report, and their fields in the AI-agent JSON export. Trajectory forecasting, the refresh queue, tracked queries, and uptime monitoring are unaffected.
- `projectGoal`/`GoalProjection` from the forecast engine and the now-fully-unused `src/lib/briefing.ts` (already orphaned since the AI briefing UI became a placeholder in 0.3.0).

### Migration

- New migration `0010_remove_goals_and_annotations.sql` drops both tables (and their policies/indexes, via cascade) on an already-deployed project. Run it after `0009` in the SQL Editor, same as any other migration.

## [0.5.0] - 2026-08-30

### Added

- **Export all data → JSON** is now a complete, AI-agent-ready bundle: every table (including goals, annotations, tracked queries, and uptime checks) plus a `computed` section with portfolio insights at 30/90/180-day windows, per-site and portfolio-wide traffic forecasts, the content refresh queue, and goal pace projections. Enough to hand your whole portfolio to an AI assistant in one file, with no live connection.

### Fixed

- The export's privacy-mode anonymizer didn't yet mask two new free-text fields (`annotations.label`, `site_goals.note`).

## [0.4.0] - 2026-08-30

### Added

- Trajectory forecasting now covers every metric - sessions, active users, page views, engaged sessions, and Google/Bing clicks and impressions - switchable via a metric picker, instead of a single auto-picked metric.
- A portfolio-wide trajectory on the Overview page: every active site's numbers summed into one combined forecast, alongside each site's own.

### Changed

- Extracted the trajectory chart/KPI rendering into a shared panel used by both the per-site and portfolio views.

## [0.3.0] - 2026-08-30

### Added

- **Traffic trajectory forecasting** - a locally-computed Holt-Winters model (weekly seasonality, linear fallback for short history) projects the next 28 days per site, with a confidence band on the chart.
- **Goals** - set a trailing-30-day target (e.g. "10,000 Google clicks a month by December") per site and metric; scored against the forecast as achieved / on track / at risk / off track.
- **Content refresh queue** - pages across the portfolio that lost 25%+ of their Google clicks versus their own prior 28 days, ranked by lost volume.
- **Tracked queries** - star a Search Console query in the top-terms table to chart its average position over time, using data already synced (no new provider calls, no scraping).
- **Chart annotations** - log deploys, content changes, and SEO updates as markers on the trajectory chart, scoped per-site or portfolio-wide.
- **Uptime monitoring** - an hourly check of each site's public URL, with a 7-day availability card.
- The PDF site report gained a "Trajectory & goals" page.
- (Backend only, not yet in the UI) An `ai-briefing` Edge Function that turns the portfolio's aggregates into an analyst-style narrative via the Claude API, gated behind an operator-supplied `ANTHROPIC_API_KEY` secret.

### Security

- Every new table (`site_goals`, `annotations`, `tracked_queries`, `uptime_checks`) follows the existing RLS model: admin + `aal2` (MFA) required for browser reads, all writes through a new `manage-portfolio` Edge Function with server-side row caps and input validation.
- The uptime prober only fetches admin-registered `http(s)` URLs, with a request timeout, bounded concurrency, and 90-day self-pruning retention.

## [0.2.0] - 2026-08-30

### Added

- Light, dark, and system theme with a per-device preference, applied before first paint to avoid a flash of the wrong theme.

## [0.1.0] - 2026-07-14

### Added

- Initial release: portfolio dashboard for Google Analytics 4, Google Search Console, and Bing Webmaster Tools across multiple sites, with daily scheduled and manual syncs, sync history, integration health, CSV/ZIP and PDF exports, a privacy mode for screensharing, and mandatory TOTP two-factor authentication.
