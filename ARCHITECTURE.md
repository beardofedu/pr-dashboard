# Architecture & Data Collection

This document describes the API calls and data collection strategy for the PR Dashboard.

## Overview

The PR Dashboard gathers pull request metrics from GitHub repositories and determines whether each PR involved the Copilot coding agent and whether Copilot code review was used. The data is aggregated into a YAML format for visualization.

## Data Collection Strategy

### 1. GitHub REST API - Pull Requests

**Endpoint**: `GET /repos/{owner}/{repo}/pulls`

Retrieves all closed pull requests for a repository. This is the primary data source.

```bash
curl -H "Authorization: token YOUR_TOKEN" \
  "https://api.github.com/repos/{owner}/{repo}/pulls?state=closed&per_page=100&sort=updated&direction=desc"
```

**Parameters**:
- `state=closed` - Only retrieve closed PRs
- `per_page=100` - Paginate through results
- `sort=updated` - Sort by most recently updated
- `direction=desc` - Newest first

**Response Fields Used**:
- `number` - PR number
- `title` - PR title
- `created_at` - Date PR was opened
- `closed_at` - Date PR was closed
- `user.login` - PR author
- `repository_url` - Source repository

### 2. Detect Copilot Coding-Agent Involvement

**Method 1: PR Labels**

Check if the PR has a label indicating Copilot involvement:
```
GET /repos/{owner}/{repo}/pulls/{pr_number}
```

Look for labels like:
- `copilot-assist`
- `copilot-agent`
- `ai-assisted`

**Method 2: PR Body Text**

Parse the PR description/body for indicators:
- Mentions of "Copilot"
- Commit messages referencing "Copilot"
- Author notes about AI assistance

**Method 3: GitHub Actions Context**

Check workflow runs that triggered the PR:
```
GET /repos/{owner}/{repo}/actions/runs?event=pull_request
```

Look for workflow names or steps that indicate Copilot agent execution.

### 3. Detect Copilot Code Review Usage

**Method 1: Pull Request Reviews**

Check whether Copilot submitted a review on the PR:
```
GET /repos/{owner}/{repo}/pulls/{pr_number}/reviews
```

Indicators:
- `user.login` identifies a Copilot review identity
- `body` includes Copilot code review phrasing

**Method 2: Pull Request Review Comments**

Inspect review comments for Copilot markers:
```
GET /repos/{owner}/{repo}/pulls/{pr_number}/comments
```

Indicators:
- Comment author maps to Copilot
- Comment metadata or body references Copilot review automation

### 4. Calculate Days to Close

```
days_to_close = (closed_at - created_at) / 86400000
```

Convert milliseconds between timestamps to days.

## Implementation: GitHub Actions Workflow

The daily refresh workflow (`refresh-data.yml`) handles data collection at 9am UTC.

### Workflow Steps

**1. Checkout Repository**
```yaml
- uses: actions/checkout@v4
```

**2. Fetch PR Data**
```bash
#!/bin/bash
# For each monitored repository:
# - Fetch closed PRs from the past month
# - Check commit history for Copilot involvement
# - Calculate metrics
# - Append to pr-metrics.yml

REPOS=("repo1" "repo2" "repo3")
for REPO in "${REPOS[@]}"; do
  gh pr list -R "owner/$REPO" \
    --state closed \
    --limit 100 \
    --json number,title,author,createdAt,closedAt,labels,reviews \
    --template '{{range .}}{{.number}}\t{{.title}}\t{{.createdAt}}\t{{.closedAt}}{{"\n"}}{{end}}'
done
```

**3. Process Data**
- Parse PR metadata
- Determine Copilot coding-agent involvement from labels/commits
- Determine Copilot code-review usage from PR reviews/comments
- Calculate days to close
- Generate YAML output

**4. Update Metrics**
```bash
# Generate new pr-metrics.yml with:
# - Individual PR entries
# - Aggregated statistics
# - Timestamp
```

**5. Commit & Push**
```bash
git add data/pr-metrics.yml
git commit -m "chore: update PR metrics - $(date -u +%Y-%m-%d)"
git push
```

## GitHub CLI Commands

The workflow uses `gh` CLI for efficient API interactions:

### List Closed PRs
```bash
gh pr list -R owner/repo --state closed --limit 100 \
  --json number,title,author,createdAt,closedAt,labels,reviews
```

### Get PR Details
```bash
gh pr view {pr_number} -R owner/repo \
  --json number,title,body,author,createdAt,closedAt,labels
```

### Check Commit History
```bash
gh pr view {pr_number} -R owner/repo --json commits
```

### Get PR Reviews
```bash
gh api repos/owner/repo/pulls/{pr_number}/reviews
```

### Get PR Review Comments
```bash
gh api repos/owner/repo/pulls/{pr_number}/comments
```

### Search for Copilot References
```bash
gh search issues "repo:owner/repo is:pr Copilot" --state closed
```

## Data Schema (pr-metrics.yml)

```yaml
last_updated: "2024-12-30T09:00:00Z"

summary:
  total_prs: 48
  with_copilot: 24
  without_copilot: 24

pull_requests:
  - number: 245
    repository: "repo-name"
    title: "PR title"
    with_copilot: true/false
    copilot_code_review_used: true/false
    days_to_close: 1.2
    date_opened: "YYYY-MM-DD"
    date_closed: "YYYY-MM-DD"
    author: "username"

metrics:
  with_copilot:
    average_days: 1.66
    min_days: 0.8
    max_days: 2.7
    total_prs: 24
  without_copilot:
    average_days: 3.58
    min_days: 2.6
    max_days: 4.6
    total_prs: 24
  with_copilot_review:
    average_days: 2.22
    min_days: 0.9
    max_days: 3.9
    total_prs: 22
  without_copilot_review:
    average_days: 2.86
    min_days: 0.8
    max_days: 4.6
    total_prs: 25
  improvement_percentage: 53.6
  review_improvement_percentage: 22.4
```

## Authentication

The workflow authenticates with a repository secret:

```yaml
env:
  GH_TOKEN: ${{ secrets.PR_DASHBOARD_TOKEN }}
```

### Repository setup steps

1. Create a Personal Access Token (classic) with `repo` scope.
2. Add it to the repository as secret `PR_DASHBOARD_TOKEN`.
3. (Optional) Add `PR_DASHBOARD_REPOS` as a repository variable with comma-separated `owner/repo` entries.

If `PR_DASHBOARD_TOKEN` is missing, the workflow exits with an explicit error.

For local development:

```bash
export GH_TOKEN="ghp_..."
node scripts/generate-metrics.mjs
```

## Rate Limiting

GitHub API enforces rate limits:
- **Authenticated Requests**: 5,000 requests/hour
- **Search**: 30 requests/minute

To optimize:
- Use `--cache` flag with `gh` CLI
- Batch requests where possible
- Stagger workflow runs across multiple hours

## Error Handling

The workflow should handle:

1. **Network Errors**: Retry with exponential backoff
2. **API Rate Limits**: Wait for reset time
3. **Invalid Repositories**: Skip and log
4. **Missing Data**: Use default values

```bash
set -euo pipefail
trap 'echo "Error on line $LINENO"' ERR

# Retry logic
for i in {1..3}; do
  gh pr list ... && break || sleep $((2 ** i))
done
```

## Future Enhancements

1. **Multi-Repository Support**
   - Aggregate data from multiple repos
   - Organization-level dashboards

2. **Advanced Metrics**
   - Review time analysis
   - Commit count by Copilot agent
   - File type analysis

3. **Real-time Updates**
   - Webhook integration for immediate updates
   - PR event listeners

4. **Data Export**
   - CSV/JSON export options
   - Historical data trends

## Local Development

To test data collection locally:

```bash
# Install gh CLI
brew install gh

# Authenticate
gh auth login

# List PRs manually
gh pr list -R owner/repo --state closed --limit 10

# Test YAML generation
./scripts/generate-metrics.sh > data/pr-metrics.yml
```

## References

- [GitHub REST API - Pull Requests](https://docs.github.com/en/rest/pulls)
- [GitHub REST API - Issues](https://docs.github.com/en/rest/issues)
- [GitHub CLI Documentation](https://cli.github.com/manual)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Copilot Enterprise API](https://docs.github.com/en/enterprise-cloud@latest/copilot/managing-copilot/managing-copilot-business)
