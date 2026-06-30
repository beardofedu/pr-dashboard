import fs from "node:fs/promises";

const GH_TOKEN = process.env.GH_TOKEN;
if (!GH_TOKEN) {
  throw new Error("GH_TOKEN is required");
}

const repos = parseRepoList(process.env.MONITORED_REPOS);
const allPullRequests = [];

for (const repo of repos) {
  const pulls = await getClosedPullRequests(repo, 100);
  for (const pr of pulls) {
    if (!pr.closed_at || !pr.created_at) {
      continue;
    }

    const withCopilot = detectCopilotCodingAgent(pr);
    const codeReviewUsed = await detectCopilotCodeReview(repo, pr.number, pr.body || "");
    allPullRequests.push({
      number: pr.number,
      repository: repo,
      title: pr.title || "Untitled pull request",
      with_copilot: withCopilot,
      copilot_code_review_used: codeReviewUsed,
      days_to_close: round(daysBetween(pr.created_at, pr.closed_at), 1),
      date_opened: toDate(pr.created_at),
      date_closed: toDate(pr.closed_at),
      author: pr.user?.login || "unknown",
    });
  }
}

allPullRequests.sort((a, b) => {
  if (a.date_closed === b.date_closed) {
    return a.number - b.number;
  }
  return a.date_closed < b.date_closed ? 1 : -1;
});

const metrics = buildMetrics(allPullRequests);
const output = buildYaml({
  last_updated: new Date().toISOString(),
  summary: {
    total_prs: allPullRequests.length,
    with_copilot: metrics.with_copilot.total_prs,
    without_copilot: metrics.without_copilot.total_prs,
    with_copilot_review: metrics.with_copilot_review.total_prs,
    without_copilot_review: metrics.without_copilot_review.total_prs,
  },
  pull_requests: allPullRequests,
  metrics,
});

await fs.writeFile("data/pr-metrics.yml", output, "utf8");
console.log(`Wrote data/pr-metrics.yml with ${allPullRequests.length} pull requests from ${repos.length} repos.`);

function parseRepoList(raw) {
  if (!raw || !raw.trim()) {
    if (!process.env.GITHUB_REPOSITORY) {
      throw new Error("MONITORED_REPOS is empty and GITHUB_REPOSITORY is not set");
    }
    return [process.env.GITHUB_REPOSITORY];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function getClosedPullRequests(repo, limit) {
  const perPage = 100;
  const pages = Math.ceil(limit / perPage);
  const output = [];
  for (let page = 1; page <= pages; page += 1) {
    const rows = await ghApi(
      `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${perPage}&page=${page}`
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      break;
    }
    for (const row of rows) {
      output.push(row);
      if (output.length >= limit) {
        return output;
      }
    }
  }
  return output;
}

function detectCopilotCodingAgent(pr) {
  const labels = (pr.labels || []).map((l) => String(l?.name || "").toLowerCase());
  const text = `${pr.title || ""}\n${pr.body || ""}`.toLowerCase();
  return (
    labels.some((l) => l.includes("copilot") || l.includes("ai-assisted")) ||
    text.includes("copilot coding agent") ||
    text.includes("generated with copilot") ||
    text.includes("ai-assisted")
  );
}

async function detectCopilotCodeReview(repo, prNumber, prBody) {
  const [reviews, comments] = await Promise.all([
    ghApi(`/repos/${repo}/pulls/${prNumber}/reviews`),
    ghApi(`/repos/${repo}/pulls/${prNumber}/comments`),
  ]);

  if (containsCopilotSignal(prBody)) {
    return true;
  }

  for (const review of reviews || []) {
    const login = String(review?.user?.login || "");
    const body = String(review?.body || "");
    if (containsCopilotSignal(`${login}\n${body}`)) {
      return true;
    }
  }

  for (const comment of comments || []) {
    const login = String(comment?.user?.login || "");
    const body = String(comment?.body || "");
    if (containsCopilotSignal(`${login}\n${body}`)) {
      return true;
    }
  }

  return false;
}

function containsCopilotSignal(text) {
  const lower = String(text || "").toLowerCase();
  return (
    lower.includes("copilot") ||
    lower.includes("github-copilot") ||
    lower.includes("copilot-review")
  );
}

async function ghApi(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pr-dashboard-metrics-generator",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub API ${path} failed (${response.status}): ${message}`);
  }

  return response.json();
}

function buildMetrics(pullRequests) {
  const withCopilot = pullRequests.filter((pr) => pr.with_copilot);
  const withoutCopilot = pullRequests.filter((pr) => !pr.with_copilot);
  const withReview = pullRequests.filter((pr) => pr.copilot_code_review_used);
  const withoutReview = pullRequests.filter((pr) => !pr.copilot_code_review_used);

  const withCopilotStats = stats(withCopilot);
  const withoutCopilotStats = stats(withoutCopilot);
  const withReviewStats = stats(withReview);
  const withoutReviewStats = stats(withoutReview);

  return {
    with_copilot: withCopilotStats,
    without_copilot: withoutCopilotStats,
    with_copilot_review: withReviewStats,
    without_copilot_review: withoutReviewStats,
    improvement_percentage: improvement(withCopilotStats.average_days, withoutCopilotStats.average_days),
    review_improvement_percentage: improvement(withReviewStats.average_days, withoutReviewStats.average_days),
  };
}

function stats(rows) {
  if (rows.length === 0) {
    return { average_days: 0, min_days: 0, max_days: 0, total_prs: 0 };
  }
  const values = rows.map((row) => row.days_to_close);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    average_days: round(average, 2),
    min_days: round(Math.min(...values), 1),
    max_days: round(Math.max(...values), 1),
    total_prs: values.length,
  };
}

function improvement(fasterAvg, slowerAvg) {
  if (!slowerAvg) {
    return 0;
  }
  return round(((slowerAvg - fasterAvg) / slowerAvg) * 100, 1);
}

function daysBetween(start, end) {
  return (Date.parse(end) - Date.parse(start)) / (1000 * 60 * 60 * 24);
}

function toDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function round(value, decimals) {
  const power = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * power) / power;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function buildYaml(payload) {
  const lines = [];
  lines.push("# Pull Request Metrics Data");
  lines.push("# This file is automatically updated daily at 9am UTC");
  lines.push("");
  lines.push(`last_updated: ${yamlString(payload.last_updated)}`);
  lines.push("summary:");
  lines.push(`  total_prs: ${payload.summary.total_prs}`);
  lines.push(`  with_copilot: ${payload.summary.with_copilot}`);
  lines.push(`  without_copilot: ${payload.summary.without_copilot}`);
  lines.push(`  with_copilot_review: ${payload.summary.with_copilot_review}`);
  lines.push(`  without_copilot_review: ${payload.summary.without_copilot_review}`);
  lines.push("");
  lines.push("pull_requests:");

  for (const pr of payload.pull_requests) {
    lines.push(`  - number: ${pr.number}`);
    lines.push(`    repository: ${yamlString(pr.repository)}`);
    lines.push(`    title: ${yamlString(pr.title)}`);
    lines.push(`    with_copilot: ${pr.with_copilot}`);
    lines.push(`    copilot_code_review_used: ${pr.copilot_code_review_used}`);
    lines.push(`    days_to_close: ${pr.days_to_close}`);
    lines.push(`    date_opened: ${yamlString(pr.date_opened)}`);
    lines.push(`    date_closed: ${yamlString(pr.date_closed)}`);
    lines.push(`    author: ${yamlString(pr.author)}`);
    lines.push("");
  }

  lines.push("metrics:");
  lines.push("  with_copilot:");
  lines.push(`    average_days: ${payload.metrics.with_copilot.average_days}`);
  lines.push(`    min_days: ${payload.metrics.with_copilot.min_days}`);
  lines.push(`    max_days: ${payload.metrics.with_copilot.max_days}`);
  lines.push(`    total_prs: ${payload.metrics.with_copilot.total_prs}`);
  lines.push("  without_copilot:");
  lines.push(`    average_days: ${payload.metrics.without_copilot.average_days}`);
  lines.push(`    min_days: ${payload.metrics.without_copilot.min_days}`);
  lines.push(`    max_days: ${payload.metrics.without_copilot.max_days}`);
  lines.push(`    total_prs: ${payload.metrics.without_copilot.total_prs}`);
  lines.push("  with_copilot_review:");
  lines.push(`    average_days: ${payload.metrics.with_copilot_review.average_days}`);
  lines.push(`    min_days: ${payload.metrics.with_copilot_review.min_days}`);
  lines.push(`    max_days: ${payload.metrics.with_copilot_review.max_days}`);
  lines.push(`    total_prs: ${payload.metrics.with_copilot_review.total_prs}`);
  lines.push("  without_copilot_review:");
  lines.push(`    average_days: ${payload.metrics.without_copilot_review.average_days}`);
  lines.push(`    min_days: ${payload.metrics.without_copilot_review.min_days}`);
  lines.push(`    max_days: ${payload.metrics.without_copilot_review.max_days}`);
  lines.push(`    total_prs: ${payload.metrics.without_copilot_review.total_prs}`);
  lines.push(`  improvement_percentage: ${payload.metrics.improvement_percentage}`);
  lines.push(`  review_improvement_percentage: ${payload.metrics.review_improvement_percentage}`);
  lines.push("");

  return `${lines.join("\n")}`;
}
