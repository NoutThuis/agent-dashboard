#!/usr/bin/env node
/**
 * Agent OS Intelligence ingestion scaffold
 *
 * Step 3 foundation:
 * - fetch candidate signals from source adapters
 * - score / normalize them into dashboard rows
 * - upsert them into Supabase
 *
 * Safe by design:
 * - runs server-side only
 * - expects SUPABASE_SERVICE_ROLE_KEY in env, never frontend
 * - source adapters are pluggable so Reddit/X can be added separately
 */

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

function requireEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

async function supabaseUpsert(rows) {
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/agent_intelligence_items`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed (${res.status}): ${text}`);
  }

  return res.json().catch(() => []);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function complexityLabel(score) {
  if (score <= 35) return 'Low — can be built with existing agent capabilities';
  if (score <= 70) return 'Medium — needs structured multi-agent execution';
  return 'High — needs broader capability coverage';
}

function inferPreviewKind(title = '', description = '') {
  const hay = `${title} ${description}`.toLowerCase();
  if (hay.includes('dashboard')) return 'dashboard-wireframe';
  if (hay.includes('a/b') || hay.includes('landing page')) return 'ab-test';
  if (hay.includes('docs') || hay.includes('documentation')) return 'docs-page';
  if (hay.includes('seo') || hay.includes('content')) return 'seo-callouts';
  if (hay.includes('clone') || hay.includes('before') || hay.includes('after')) return 'before-after';
  return 'component-grid';
}

function sourceTypeFromLabel(label = '') {
  const s = label.toLowerCase();
  if (s.includes('twitter') || s.includes('x ') || s.includes('@')) return 'twitter';
  if (s.includes('reddit')) return 'reddit';
  if (s.includes('dev.to') || s.includes('devto')) return 'devto';
  if (s.includes('forum')) return 'forum';
  return 'other';
}

function hostnameFromUrl(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function scoreCandidate(candidate) {
  const title = candidate.title || 'Untitled use case';
  const description = candidate.description || '';
  const tags = candidate.tags || [];
  const host = hostnameFromUrl(candidate.url);

  const positiveSignals = [
    ['dashboard', 18],
    ['frontend', 18],
    ['ui', 16],
    ['design system', 16],
    ['landing page', 15],
    ['automation', 12],
    ['component', 14],
    ['workflow', 12],
    ['documentation', 12],
    ['agent', 10],
    ['orchestration', 14],
    ['research', 14],
    ['brief', 10],
    ['review', 8],
  ];

  const negativeSignals = [
    ['awesome', 18],
    ['collection', 16],
    ['directory', 14],
    ['list of', 12],
    ['job board', 16],
    ['crypto', 22],
    ['trading bot', 20],
    ['casino', 30],
    ['adult', 30],
    ['seo agency', 10],
  ];

  const hay = `${title} ${description} ${tags.join(' ')} ${candidate.sourceLabel || ''} ${host}`.toLowerCase();

  let skillMatch = 42;
  for (const [needle, points] of positiveSignals) {
    if (hay.includes(needle)) skillMatch += points;
  }
  for (const [needle, penalty] of negativeSignals) {
    if (hay.includes(needle)) skillMatch -= penalty;
  }

  const trustedHostBonuses = {
    'reddit.com': 6,
    'x.com': 8,
    'twitter.com': 8,
    'dev.to': 4,
    'github.com': 2,
  };
  skillMatch += trustedHostBonuses[host] || 0;
  skillMatch = clamp(skillMatch);

  let trendScore = clamp(candidate.trendScore ?? candidate.engagementScore ?? 65);
  if (candidate.sourceType === 'twitter') trendScore = clamp(trendScore + 5);
  if (candidate.sourceType === 'reddit') trendScore = clamp(trendScore + 3);

  const complexity = clamp(candidate.complexityScore ?? 45);
  const momentum = Math.round(skillMatch * 0.5 + trendScore * 0.35 + (100 - complexity) * 0.15);

  const deployAgents = candidate.deployAgents || inferAgents(hay);
  const qualityScore = clamp(momentum + (description.length >= 140 ? 6 : 0) + (deployAgents.length >= 2 ? 4 : 0) - (hay.includes('awesome') ? 15 : 0));

  return {
    id: candidate.id || slugify(`${title}-${candidate.sourceLabel || candidate.url || Date.now()}`),
    title,
    source_type: candidate.sourceType || sourceTypeFromLabel(candidate.sourceLabel),
    source_label: candidate.sourceLabel || candidate.url || 'Unknown source',
    source_badge: candidate.sourceBadge || `Found via ${candidate.sourceLabel || candidate.url || 'source'}`,
    momentum_score: momentum,
    skill_match_score: skillMatch,
    skill_match_note: candidate.skillNote || inferSkillNote(deployAgents),
    trend_score: trendScore,
    trend_note: candidate.trendNote || 'measured from current source momentum',
    complexity_score: complexity,
    complexity_label: candidate.complexityLabel || complexityLabel(complexity),
    description,
    preview_kind: candidate.previewKind || inferPreviewKind(title, description),
    unread: true,
    bookmarked: false,
    dismissed: false,
    discovered_at: candidate.discoveredAt || new Date().toISOString(),
    metadata: {
      url: candidate.url || null,
      tags,
      deployAgents,
      deployTasks: Math.max(2, Math.min(4, deployAgents.length || 3)),
      ingestedBy: 'intelligence-ingest-script',
      rawSource: candidate.rawSource || null,
      host,
      qualityScore,
    },
  };
}

function shouldKeepCandidate(row) {
  const text = `${row.title} ${row.description} ${row.source_label}`.toLowerCase();
  if (!row.title || row.title.length < 12) return false;
  if (!row.description || row.description.length < 90) return false;
  if (row.skill_match_score < 58) return false;
  if (row.momentum_score < 64) return false;
  if ((row.metadata?.qualityScore || 0) < 66) return false;
  if (text.includes('awesome ') || text.includes('collection') || text.includes('directory')) return false;
  if (text.includes('casino') || text.includes('crypto') || text.includes('adult')) return false;
  return true;
}

function dedupeRows(rows) {
  const seen = new Map();
  for (const row of rows) {
    const key = slugify(`${row.title}-${row.source_label}`);
    const existing = seen.get(key);
    if (!existing || (row.metadata?.qualityScore || 0) > (existing.metadata?.qualityScore || 0)) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values());
}

function inferAgents(hay) {
  const agents = [];
  if (hay.includes('design') || hay.includes('ui')) agents.push('Mira');
  if (hay.includes('architecture') || hay.includes('workflow') || hay.includes('system')) agents.push('Ari');
  if (hay.includes('build') || hay.includes('frontend') || hay.includes('dashboard')) agents.push('Noah');
  if (hay.includes('review') || hay.includes('docs') || hay.includes('audit')) agents.push('Lena');
  return agents.length ? [...new Set(agents)] : ['Mira', 'Noah'];
}

function inferSkillNote(agents) {
  if (!agents.length) return 'Partial alignment with current agent pack';
  return `${agents.join(' + ')} alignment`;
}

async function fetchRedditCandidates() {
  if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET || !process.env.REDDIT_USER_AGENT) {
    return [];
  }

  const auth = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });
  if (!tokenRes.ok) return [];
  const tokenJson = await tokenRes.json();
  const token = tokenJson.access_token;
  if (!token) return [];

  const subreddits = ['aiagents', 'automation', 'SaaS', 'LocalLLaMA', 'frontend'];
  const queries = ['agent workflow', 'automation use case', 'frontend agent', 'dashboard automation'];
  const candidates = [];

  for (const subreddit of subreddits) {
    for (const query of queries) {
      const url = new URL(`https://oauth.reddit.com/r/${subreddit}/search`);
      url.searchParams.set('q', query);
      url.searchParams.set('sort', 'new');
      url.searchParams.set('limit', '6');
      url.searchParams.set('restrict_sr', 'on');
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': process.env.REDDIT_USER_AGENT,
        },
      });
      if (!res.ok) continue;
      const json = await res.json();
      for (const child of json.data?.children || []) {
        const post = child.data;
        const description = (post.selftext || '').slice(0, 1200) || post.title;
        candidates.push({
          id: `reddit-${post.id}`,
          title: post.title,
          description,
          sourceLabel: `Reddit r/${subreddit}`,
          sourceBadge: `Found on Reddit r/${subreddit}`,
          sourceType: 'reddit',
          url: `https://reddit.com${post.permalink}`,
          trendScore: clamp(Math.round(((post.score || 0) * 0.35) + ((post.num_comments || 0) * 1.1)), 35, 95),
          complexityScore: 45,
          rawSource: 'reddit-api',
          tags: [subreddit, query],
        });
      }
    }
  }

  return candidates;
}

async function fetchXCandidates() {
  if (!process.env.X_BEARER_TOKEN) return [];
  const queries = [
    'AI agent workflow frontend lang:en -is:retweet',
    'automation dashboard AI agents lang:en -is:retweet',
    'OpenClaw OR agent orchestration lang:en -is:retweet',
  ];
  const candidates = [];

  for (const query of queries) {
    const url = new URL('https://api.twitter.com/2/tweets/search/recent');
    url.searchParams.set('query', query);
    url.searchParams.set('max_results', '10');
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id');
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', 'username,name');

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
    });
    if (!res.ok) continue;
    const json = await res.json();
    const users = new Map((json.includes?.users || []).map((u) => [u.id, u]));
    for (const tweet of json.data || []) {
      const user = users.get(tweet.author_id);
      const metrics = tweet.public_metrics || {};
      candidates.push({
        id: `x-${tweet.id}`,
        title: (tweet.text || '').split('\n')[0].slice(0, 120),
        description: tweet.text || '',
        sourceLabel: user?.username ? `@${user.username}` : 'Twitter/X',
        sourceBadge: user?.username ? `Found on Twitter/X via @${user.username}` : 'Found on Twitter/X',
        sourceType: 'twitter',
        url: user?.username ? `https://x.com/${user.username}/status/${tweet.id}` : null,
        trendScore: clamp(Math.round((metrics.like_count || 0) * 0.7 + (metrics.retweet_count || 0) * 1.2 + (metrics.reply_count || 0) * 1.1), 35, 98),
        complexityScore: 48,
        rawSource: 'x-api',
        tags: ['twitter', query],
      });
    }
  }

  return candidates;
}

async function fetchCandidates() {
  const candidates = [];

  // Adapter 1 — Brave/web-search style discovery (manual query list for now)
  // TODO: replace with richer query generation and pagination.
  if (process.env.BRAVE_API_KEY) {
    const queries = [
      'AI automation use case Twitter Reddit dashboard frontend agent workflow',
      'OpenClaw automation idea frontend agents use case',
      'Reddit AI agents dashboard automation SaaS workflow',
    ];

    for (const query of queries) {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', '5');
      const res = await fetch(url, {
        headers: {
          'X-Subscription-Token': process.env.BRAVE_API_KEY,
          Accept: 'application/json',
        },
      });
      if (!res.ok) continue;
      const json = await res.json();
      for (const item of json.web?.results || []) {
        candidates.push({
          title: item.title,
          description: item.description || item.extra_snippets?.join(' ') || '',
          sourceLabel: item.meta_url?.hostname || item.url,
          sourceBadge: `Found via web search: ${item.meta_url?.hostname || item.url}`,
          url: item.url,
          trendScore: 62,
          complexityScore: 48,
          rawSource: 'brave-search',
        });
      }
    }
  }

  // Adapter 2 — direct Reddit API when credentials are available.
  candidates.push(...await fetchRedditCandidates());

  // Adapter 3 — direct X API when credentials are available.
  candidates.push(...await fetchXCandidates());

  // Adapter 4 — local scaffold batch so the script is testable before APIs exist.
  // Remove once real adapters are live.
  candidates.push(
    {
      title: 'Agent Handoff Console',
      description: 'A control surface where one agent can hand work to another with context, status, and approvals. Strong fit for Agent OS orchestration and dashboard workflows.',
      sourceLabel: '@opsbuilder',
      sourceBadge: 'Found on Twitter/X via @opsbuilder',
      sourceType: 'twitter',
      trendScore: 69,
      complexityScore: 46,
      deployAgents: ['Ari', 'Noah', 'Lena'],
      rawSource: 'scaffold-batch',
    },
    {
      title: 'Research Brief Generator for New Topics',
      description: 'Feed a topic or paper cluster in and get a concise research brief with why it matters, key approaches, and next reads. Good fit for literature workflows and thesis prep.',
      sourceLabel: 'Reddit r/LocalLLaMA',
      sourceBadge: 'Found on Reddit r/LocalLLaMA',
      sourceType: 'reddit',
      trendScore: 74,
      complexityScore: 38,
      deployAgents: ['Lena', 'Ari'],
      rawSource: 'scaffold-batch',
    }
  );

  return candidates;
}

async function main() {
  requireEnv();
  const candidates = await fetchCandidates();
  const scoredRows = candidates.map(scoreCandidate);
  const curatedRows = dedupeRows(scoredRows)
    .filter(shouldKeepCandidate)
    .sort((a, b) => {
      const q = (b.metadata?.qualityScore || 0) - (a.metadata?.qualityScore || 0);
      if (q !== 0) return q;
      return b.momentum_score - a.momentum_score;
    })
    .slice(0, 10);

  const result = await supabaseUpsert(curatedRows);
  console.log(`Fetched ${candidates.length} candidates.`);
  console.log(`Curated ${curatedRows.length} intelligence items.`);
  if (result?.length) {
    console.log(result.map((row) => `- ${row.id}`).join('\n'));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
