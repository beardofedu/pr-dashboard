let comparisonChart = null;
let distributionChart = null;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

async function loadData() {
    try {
        const response = await fetch('data/pr-metrics.yml');
        const yamlText = await response.text();
        const data = parseYAML(yamlText);
        displayMetrics(data);
    } catch (error) {
        console.error('Error loading data:', error);
        displayError('Failed to load metrics data');
    }
}

function parseYAML(yaml) {
    const lines = yaml.split('\n');
    const data = {
        pull_requests: [],
        metrics: {},
        last_updated: ''
    };

    let inPRList = false;
    let currentPR = null;
    let inMetrics = false;

    for (let line of lines) {
        line = line.trim();

        if (line.startsWith('last_updated:')) {
            data.last_updated = line.split(':')[1].trim().replace(/"/g, '');
        }

        if (line === 'pull_requests:') {
            inPRList = true;
            inMetrics = false;
            continue;
        }

        if (line === 'metrics:') {
            inMetrics = true;
            inPRList = false;
            continue;
        }

        if (inPRList && line.startsWith('- number:')) {
            if (currentPR) {
                data.pull_requests.push(currentPR);
            }
            currentPR = { number: parseInt(line.split(':')[1]) };
        } else if (inPRList && currentPR && line.includes(':')) {
            const [key, value] = line.split(':').map(s => s.trim());
            if (key === 'number') {
                currentPR.number = parseInt(value);
            } else if (key === 'days_to_close') {
                currentPR.days_to_close = parseFloat(value);
            } else if (key === 'with_copilot') {
                currentPR.with_copilot = value === 'true';
            } else if (key === 'copilot_code_review_used') {
                currentPR.copilot_code_review_used = value === 'true';
            } else if (key === 'title') {
                currentPR.title = value.replace(/"/g, '');
            } else if (key === 'repository') {
                currentPR.repository = value.replace(/"/g, '');
            } else if (key === 'author') {
                currentPR.author = value.replace(/"/g, '');
            } else if (key === 'date_opened') {
                currentPR.date_opened = value.replace(/"/g, '');
            } else if (key === 'date_closed') {
                currentPR.date_closed = value.replace(/"/g, '');
            }
        }

        if (inMetrics && line.includes(':')) {
            const [key, value] = line.split(':').map(s => s.trim());
            if (key === 'average_days' || key === 'min_days' || key === 'max_days') {
                data.metrics[key] = parseFloat(value);
            } else if (key === 'total_prs') {
                data.metrics[key] = parseInt(value);
            }
        }
    }

    if (currentPR) {
        data.pull_requests.push(currentPR);
    }

    return data;
}

function displayMetrics(data) {
    const withCopilot = data.pull_requests.filter(pr => pr.with_copilot);
    const withoutCopilot = data.pull_requests.filter(pr => !pr.with_copilot);
    const withCopilotReview = data.pull_requests.filter(pr => pr.copilot_code_review_used);
    const withoutCopilotReview = data.pull_requests.filter(pr => !pr.copilot_code_review_used);

    const avgWith = calculateAverage(withCopilot.map(pr => pr.days_to_close));
    const avgWithout = calculateAverage(withoutCopilot.map(pr => pr.days_to_close));
    const avgWithReview = calculateAverage(withCopilotReview.map(pr => pr.days_to_close));
    const avgWithoutReview = calculateAverage(withoutCopilotReview.map(pr => pr.days_to_close));
    const improvement = calculateImprovement(avgWith, avgWithout);
    const reviewImprovement = calculateImprovement(avgWithReview, avgWithoutReview);

    document.getElementById('avgWithCopilot').textContent = avgWith.toFixed(2);
    document.getElementById('avgWithoutCopilot').textContent = avgWithout.toFixed(2);
    document.getElementById('improvement').textContent = improvement + '%';
    document.getElementById('countWithCopilot').textContent = `${withCopilot.length} PRs`;
    document.getElementById('countWithoutCopilot').textContent = `${withoutCopilot.length} PRs`;
    document.getElementById('avgWithCopilotReview').textContent = avgWithReview.toFixed(2);
    document.getElementById('avgWithoutCopilotReview').textContent = avgWithoutReview.toFixed(2);
    document.getElementById('reviewImprovement').textContent = reviewImprovement + '%';
    document.getElementById('countWithCopilotReview').textContent = `${withCopilotReview.length} PRs`;
    document.getElementById('countWithoutCopilotReview').textContent = `${withoutCopilotReview.length} PRs`;

    const lastUpdated = new Date(data.last_updated);
    document.getElementById('lastUpdated').textContent = 
        `Last updated: ${lastUpdated.toLocaleDateString()} ${lastUpdated.toLocaleTimeString()}`;

    updateStatistics(withCopilot, withoutCopilot, withCopilotReview, withoutCopilotReview);
    displayPRLists(withCopilot, withoutCopilot);
    displayCharts(withCopilot, withoutCopilot, withCopilotReview, withoutCopilotReview);
}

function updateStatistics(withCopilot, withoutCopilot, withCopilotReview, withoutCopilotReview) {
    const statsWith = {
        average: calculateAverage(withCopilot.map(pr => pr.days_to_close)),
        min: Math.min(...withCopilot.map(pr => pr.days_to_close)),
        max: Math.max(...withCopilot.map(pr => pr.days_to_close)),
        count: withCopilot.length
    };

    const statsWithout = {
        average: calculateAverage(withoutCopilot.map(pr => pr.days_to_close)),
        min: Math.min(...withoutCopilot.map(pr => pr.days_to_close)),
        max: Math.max(...withoutCopilot.map(pr => pr.days_to_close)),
        count: withoutCopilot.length
    };
    const statsReviewYes = {
        average: calculateAverage(withCopilotReview.map(pr => pr.days_to_close)),
        min: Math.min(...withCopilotReview.map(pr => pr.days_to_close)),
        max: Math.max(...withCopilotReview.map(pr => pr.days_to_close)),
        count: withCopilotReview.length
    };
    const statsReviewNo = {
        average: calculateAverage(withoutCopilotReview.map(pr => pr.days_to_close)),
        min: Math.min(...withoutCopilotReview.map(pr => pr.days_to_close)),
        max: Math.max(...withoutCopilotReview.map(pr => pr.days_to_close)),
        count: withoutCopilotReview.length
    };

    document.getElementById('statAvgCopilot').textContent = statsWith.average.toFixed(2);
    document.getElementById('statAvgNoCopilot').textContent = statsWithout.average.toFixed(2);
    document.getElementById('statMinCopilot').textContent = statsWith.min.toFixed(1);
    document.getElementById('statMinNoCopilot').textContent = statsWithout.min.toFixed(1);
    document.getElementById('statMaxCopilot').textContent = statsWith.max.toFixed(1);
    document.getElementById('statMaxNoCopilot').textContent = statsWithout.max.toFixed(1);
    document.getElementById('statCountCopilot').textContent = statsWith.count;
    document.getElementById('statCountNoCopilot').textContent = statsWithout.count;
    document.getElementById('statAvgReviewYes').textContent = statsReviewYes.average.toFixed(2);
    document.getElementById('statAvgReviewNo').textContent = statsReviewNo.average.toFixed(2);
    document.getElementById('statMinReviewYes').textContent = statsReviewYes.min.toFixed(1);
    document.getElementById('statMinReviewNo').textContent = statsReviewNo.min.toFixed(1);
    document.getElementById('statMaxReviewYes').textContent = statsReviewYes.max.toFixed(1);
    document.getElementById('statMaxReviewNo').textContent = statsReviewNo.max.toFixed(1);
    document.getElementById('statCountReviewYes').textContent = statsReviewYes.count;
    document.getElementById('statCountReviewNo').textContent = statsReviewNo.count;
}

function displayPRLists(withCopilot, withoutCopilot) {
    const sortedCopilot = withCopilot.sort((a, b) => a.days_to_close - b.days_to_close).slice(0, 10);
    const sortedNoCopilot = withoutCopilot.sort((a, b) => a.days_to_close - b.days_to_close).slice(0, 10);

    const copilotList = document.getElementById('prListCopilot');
    const noCopilotList = document.getElementById('prListNoCopilot');

    copilotList.innerHTML = sortedCopilot.map(pr => createPRElement(pr, true)).join('');
    noCopilotList.innerHTML = sortedNoCopilot.map(pr => createPRElement(pr, false)).join('');
}

function createPRElement(pr, withCopilot) {
    const className = withCopilot ? 'pr-item pr-item-copilot' : 'pr-item pr-item-no-copilot';
    const reviewBadge = pr.copilot_code_review_used
        ? '<span class="pr-review-badge review-yes">Copilot review</span>'
        : '<span class="pr-review-badge review-no">No Copilot review</span>';
    return `
        <div class="${className}">
            <div class="pr-item-title">
                <span class="pr-item-number">#${pr.number}</span>
                ${pr.title}
            </div>
            <div class="pr-item-meta">
                <span>${pr.repository} ${reviewBadge}</span>
                <span class="pr-item-days">${pr.days_to_close} days</span>
            </div>
        </div>
    `;
}

function displayCharts(withCopilot, withoutCopilot, withCopilotReview, withoutCopilotReview) {
    displayComparisonChart(withCopilot, withoutCopilot, withCopilotReview, withoutCopilotReview);
    displayDistributionChart(withCopilot, withoutCopilot);
}

function displayComparisonChart(withCopilot, withoutCopilot, withCopilotReview, withoutCopilotReview) {
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    
    const avgWith = calculateAverage(withCopilot.map(pr => pr.days_to_close));
    const avgWithout = calculateAverage(withoutCopilot.map(pr => pr.days_to_close));
    const avgWithReview = calculateAverage(withCopilotReview.map(pr => pr.days_to_close));
    const avgWithoutReview = calculateAverage(withoutCopilotReview.map(pr => pr.days_to_close));

    if (comparisonChart) {
        comparisonChart.destroy();
    }

    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['With Copilot', 'Without Copilot', 'With Copilot Review', 'Without Copilot Review'],
            datasets: [
                {
                    label: 'Average Days to Close',
                    data: [avgWith, avgWithout, avgWithReview, avgWithoutReview],
                    backgroundColor: ['#1a7f37', '#d1444a', '#0a7ea4', '#8957e5'],
                    borderColor: ['#1a7f37', '#d1444a', '#0a7ea4', '#8957e5'],
                    borderWidth: 2,
                    borderRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: Math.ceil(Math.max(avgWithout, avgWithoutReview)) + 1,
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(1) + ' days';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y.toFixed(2) + ' days';
                        }
                    }
                }
            }
        }
    });
}

function displayDistributionChart(withCopilot, withoutCopilot) {
    const ctx = document.getElementById('distributionChart').getContext('2d');

    const copilotDays = withCopilot.map(pr => pr.days_to_close).sort((a, b) => a - b);
    const noCopilotDays = withoutCopilot.map(pr => pr.days_to_close).sort((a, b) => a - b);

    if (distributionChart) {
        distributionChart.destroy();
    }

    distributionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: Math.max(copilotDays.length, noCopilotDays.length)}, (_, i) => i + 1),
            datasets: [
                {
                    label: 'With Copilot',
                    data: copilotDays,
                    borderColor: '#1a7f37',
                    backgroundColor: 'rgba(26, 127, 55, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#1a7f37'
                },
                {
                    label: 'Without Copilot',
                    data: noCopilotDays,
                    borderColor: '#d1444a',
                    backgroundColor: 'rgba(209, 68, 74, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#d1444a'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(1) + ' days';
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'PR Index'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + ' days';
                        }
                    }
                }
            }
        }
    });
}

function calculateAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateImprovement(fasterAverage, slowerAverage) {
    if (slowerAverage === 0) {
        return '0.0';
    }
    return ((slowerAverage - fasterAverage) / slowerAverage * 100).toFixed(1);
}

function displayError(message) {
    document.body.innerHTML = `
        <div class="container">
            <div style="padding: 40px; text-align: center; background: white; border-radius: 12px; margin-top: 40px;">
                <h1>⚠️ Error</h1>
                <p>${message}</p>
            </div>
        </div>
    `;
}
