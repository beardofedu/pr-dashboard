# PR Dashboard

A GitHub Pages dashboard that visualizes pull request metrics, comparing time-to-close with and without Copilot coding agent involvement.

## Overview

This dashboard automatically pulls PR metrics from a YAML data file every morning at 9am UTC and displays:

- **Average time to close PRs** with Copilot coding agent involvement
- **Average time to close PRs** without Copilot coding agent involvement
- **Performance metrics** comparing both approaches
- **Trend analysis** over time

## Data Format

PR metrics are stored in `data/pr-metrics.yml`. Each entry contains:

```yaml
pull_requests:
  - number: 1
    repository: repo-name
    with_copilot: true
    days_to_close: 2.5
    date_closed: "2024-01-15"
```

## GitHub Pages

The dashboard is deployed to GitHub Pages and accessible at: `https://beardofedu.github.io/pr-dashboard/`

## Automation

A GitHub Actions workflow runs daily at 9am UTC to refresh the data. You can trigger manual runs by calling the workflow endpoint.

## Local Development

Open `index.html` in your browser to view the dashboard.

## Files

- `index.html` - Main dashboard interface
- `js/dashboard.js` - Dashboard logic and visualization
- `css/style.css` - Dashboard styling
- `data/pr-metrics.yml` - PR metrics data
- `.github/workflows/refresh-data.yml` - Daily data refresh workflow
