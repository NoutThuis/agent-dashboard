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

function scoreCandidate(candidate) {
  const title = candidate.title || 'Untitled use case';
  const description = candidate.description || '';
  const tags = candidate.tags || [];

  const skillSignals = [
    ['dashboard', 18],
    ['frontend', 18],
    ['ui', 16],
    ['design system', 16],
    ['landing page', 15],
    ['automation', 12],
    ['component', 14],
    ['workflow', 10],
    ['documentation', 12],
  ];

  let skillMatch = 40;
  const hay = `${title} ${description} ${tags.join(' ')}`.toLowerCase();
  for (const [needle, points] of skillSignals) {
    if (hay.includes(needle)) skillMatch += points;
  }
  skillMatch = Math.max(0, Math.min(100, skillMatch));

  const trendScore = Math.max(0, Math.min(100, candidate.trendScore ?? candidate.engagementScore ?? 65));
  const complexity = Math.max(0, Math.min(100, candidate.complexityScore ?? 45));
  const momentum = Math.round(skillMatch * 0.45 + trendScore * 0.4 + (100 - complexity) * 0.15);

  const deployAgents = candidate.deployAgents || inferAgents(hay);

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
    },
  };
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

async function fetchCandidates() {
  const candidates = [];

  // Adapter 1 — Brave/web-search style discovery (manual query list for now)
  // TODO: replace with real web/X/Reddit adapters and pagination.
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

  // Adapter 2 — local scaffold batch so the script is testable before APIs exist.
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
  const rows = candidates.map(scoreCandidate);
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values());
  const result = await supabaseUpsert(uniqueRows);
  console.log(`Upserted ${uniqueRows.length} intelligence items.`);
  if (result?.length) {
    console.log(result.map((row) => `- ${row.id}`).join('\n'));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
