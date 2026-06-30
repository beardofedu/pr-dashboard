# PR Dashboard

A GitHub Pages dashboard that visualizes pull request metrics, comparing time-to-close by Copilot coding agent involvement and Copilot code review usage.

## Overview

This dashboard automatically pulls PR metrics from a YAML data file every morning at 9am UTC and displays:

- **Average time to close PRs** with Copilot coding agent involvement
- **Average time to close PRs** without Copilot coding agent involvement
- **Average time to close PRs** with Copilot code review
- **Average time to close PRs** without Copilot code review
- **Performance metrics** comparing both approaches
- **Trend analysis** over time

## Data Format

PR metrics are stored in `data/pr-metrics.yml`. Each entry contains:

```yaml
pull_requests:
  - number: 1
    repository: repo-name
    with_copilot: true
    copilot_code_review_used: true
    days_to_close: 2.5
    date_closed: "2024-01-15"
```

## GitHub Pages

The dashboard is deployed to GitHub Pages and accessible at: `https://beardofedu.github.io/pr-dashboard/`

## Automation

A GitHub Actions workflow runs daily at 9am UTC to refresh the data. You can trigger manual runs by calling the workflow endpoint.

### Configure GitHub repository secret

The refresh workflow requires a repository secret named `PR_DASHBOARD_TOKEN`.

1. Create a GitHub Personal Access Token (classic) with at least:
   - `repo` scope (read PRs and write back updated metrics file)
2. In `beardofedu/pr-dashboard`, open:
   - **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
3. Name: `PR_DASHBOARD_TOKEN`
4. Value: your token
5. (Optional) Add repository variable `PR_DASHBOARD_REPOS` with a comma-separated list of repos to analyze, for example:
   - `beardofedu/pr-dashboard,beardofedu/edgar-example`

If `PR_DASHBOARD_REPOS` is not set, the workflow uses the current repository only.

## Local Development

Open `index.html` in your browser to view the dashboard.

## Files

- `index.html` - Main dashboard interface
- `js/dashboard.js` - Dashboard logic and visualization
- `css/style.css` - Dashboard styling
- `data/pr-metrics.yml` - PR metrics data
- `scripts/generate-metrics.mjs` - GitHub API collector that regenerates metrics YAML
- `.github/workflows/refresh-data.yml` - Daily data refresh workflow
- `ARCHITECTURE.md` - Data collection API calls and implementation details

## How It Works

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed documentation on:
- GitHub API endpoints used to gather PR data
- Copilot coding-agent and code-review detection methods
- Data transformation and aggregation
- Workflow implementation
- Rate limiting and error handling
