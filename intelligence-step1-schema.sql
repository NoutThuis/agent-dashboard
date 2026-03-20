-- Agent OS Intelligence tab — Step 1 foundation
-- Creates a table for discovered use cases and seeds it with initial rows.
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.agent_intelligence_items (
  id text primary key,
  title text not null,
  source_type text not null check (source_type in ('twitter', 'reddit', 'devto', 'forum', 'other')),
  source_label text not null,
  source_badge text not null,
  momentum_score integer not null check (momentum_score between 0 and 100),
  skill_match_score integer not null check (skill_match_score between 0 and 100),
  skill_match_note text,
  trend_score integer not null check (trend_score between 0 and 100),
  trend_note text,
  complexity_score integer not null check (complexity_score between 0 and 100),
  complexity_label text not null,
  description text not null,
  preview_kind text not null default 'component-grid',
  unread boolean not null default true,
  bookmarked boolean not null default false,
  dismissed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_agent_intelligence_items()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agent_intelligence_items_updated_at on public.agent_intelligence_items;
create trigger trg_agent_intelligence_items_updated_at
before update on public.agent_intelligence_items
for each row execute function public.set_updated_at_agent_intelligence_items();

alter table public.agent_intelligence_items enable row level security;

create policy if not exists "agent_intelligence_items_select_authenticated"
on public.agent_intelligence_items
for select
to authenticated
using (true);

create policy if not exists "agent_intelligence_items_insert_authenticated"
on public.agent_intelligence_items
for insert
to authenticated
with check (true);

create policy if not exists "agent_intelligence_items_update_authenticated"
on public.agent_intelligence_items
for update
to authenticated
using (true)
with check (true);

create index if not exists idx_agent_intelligence_items_discovered_at
on public.agent_intelligence_items (discovered_at desc);

create index if not exists idx_agent_intelligence_items_momentum
on public.agent_intelligence_items (momentum_score desc);

insert into public.agent_intelligence_items (
  id, title, source_type, source_label, source_badge,
  momentum_score, skill_match_score, skill_match_note,
  trend_score, trend_note, complexity_score, complexity_label,
  description, preview_kind, unread, bookmarked, dismissed, metadata, discovered_at
)
values
(
  'ui-library-generator',
  'Automated UI Component Library Generator',
  'twitter',
  '@designengineer',
  'Found on Twitter/X via @designengineer',
  94, 96, 'Mira designs, Ari architects, Noah builds',
  82, 'gaining traction this week', 62, 'Medium — needs multi-agent coordination',
  'AI agents scan popular design systems like Shadcn, Radix, and Tailwind UI, then automatically generate custom branded component variants for a product or client. The pipeline can cover design direction, component architecture, implementation, and accessibility review.\n\nIt is valuable because it compresses one of the most repetitive frontend tasks into a reusable agent workflow. Teams that need bespoke UI systems fast could use this to spin up polished internal design libraries without manually rebuilding every button, input, or card pattern.',
  'component-grid', true, false, false,
  '{"deployAgents":["Mira","Ari","Noah"],"deployTasks":3}'::jsonb,
  now() - interval '45 minutes'
),
(
  'landing-ab-pipeline',
  'Landing Page A/B Test Pipeline',
  'reddit',
  'Reddit r/SaaS',
  'Found on Reddit r/SaaS',
  87, 88, 'All 4 agents involved',
  71, 'steady discussion in founder communities', 32, 'Low — can be built with existing agent capabilities',
  'Agents create multiple landing page variants, deploy them, and track conversion metrics in a repeatable loop. Mira designs the variants, Ari defines the testing structure, Noah builds the pages, and Lena reviews experiment outcomes and findings.\n\nThis is valuable because it turns growth experiments into a pipeline instead of a one-off project. Small SaaS teams and agencies could iterate much faster when the full cycle from concept to deployed variation is mostly automated.',
  'ab-test', true, false, false,
  '{"deployAgents":["Mira","Ari","Noah","Lena"],"deployTasks":4}'::jsonb,
  now() - interval '2 hours'
),
(
  'dashboard-template-factory',
  'Client Dashboard Template Factory',
  'twitter',
  '@indiehacker',
  'Found on Twitter/X via @indiehacker',
  81, 90, 'Strong Noah + Mira alignment',
  65, 'steady niche demand', 58, 'Medium — straightforward but still structured',
  'Generate custom client-facing dashboards from a brief. Feed in requirements and the agents produce a fully styled, data-connected dashboard as a single HTML deliverable.\n\nThis lines up closely with the workflow you already used to ship the Agent OS dashboard. That makes it especially attractive as a reusable productized capability for client work or internal tools.',
  'dashboard-wireframe', false, true, false,
  '{"deployAgents":["Mira","Noah"],"deployTasks":3}'::jsonb,
  now() - interval '5 hours'
),
(
  'seo-optimizer',
  'Automated SEO Content Optimizer',
  'twitter',
  '@growthhacker',
  'Found on Twitter/X via @growthhacker',
  68, 52, 'Partial — mostly Lena for review',
  88, 'strong momentum right now', 84, 'High — needs content and review depth',
  'Agents analyze existing site content, suggest SEO improvements, rewrite copy, and update pages automatically. The use case is compelling because it promises an ongoing optimization loop rather than isolated content edits.\n\nRight now it is less aligned with your strongest frontend-heavy agent pack, which makes it interesting but not the first thing to deploy if the goal is high-confidence execution with existing strengths.',
  'seo-callouts', true, false, false,
  '{"deployAgents":["Lena"],"deployTasks":2}'::jsonb,
  now() - interval '9 hours'
),
(
  'design-system-docs',
  'Design System Documentation Generator',
  'devto',
  'Dev.to article',
  'Found via Dev.to article',
  76, 85, 'Mira + Ari + Lena',
  54, 'solid but not exploding', 28, 'Low — very buildable now',
  'Agents crawl an existing codebase, extract component patterns, and auto-generate a living documentation site with examples, props tables, and usage guidance.\n\nThis is valuable because documentation often lags behind implementation. Automating the generation and refresh cycle would turn a commonly neglected asset into something that stays alive with far less manual effort.',
  'docs-page', false, false, false,
  '{"deployAgents":["Mira","Ari","Lena"],"deployTasks":3}'::jsonb,
  now() - interval '15 hours'
),
(
  'saas-cloner',
  'Micro-SaaS Frontend Cloner',
  'twitter',
  '@buildinpublic',
  'Found on Twitter/X via @buildinpublic',
  72, 79, 'Noah + Mira primary',
  91, 'surging in builder circles', 82, 'High — needs careful interaction recreation',
  'Point agents at a SaaS landing page and they analyze the structure, design, and interactions, then rebuild a custom branded version. This is useful for rapid prototyping, client pitches, and testing demand around new offers.\n\nThe appeal is speed: instead of starting from a blank canvas, the system gives you a structured first version fast. The risk is that higher-fidelity cloning requires stronger interaction analysis and careful originality boundaries.',
  'before-after', true, false, false,
  '{"deployAgents":["Noah","Mira"],"deployTasks":3}'::jsonb,
  now() - interval '22 hours'
)
on conflict (id) do update set
  title = excluded.title,
  source_type = excluded.source_type,
  source_label = excluded.source_label,
  source_badge = excluded.source_badge,
  momentum_score = excluded.momentum_score,
  skill_match_score = excluded.skill_match_score,
  skill_match_note = excluded.skill_match_note,
  trend_score = excluded.trend_score,
  trend_note = excluded.trend_note,
  complexity_score = excluded.complexity_score,
  complexity_label = excluded.complexity_label,
  description = excluded.description,
  preview_kind = excluded.preview_kind,
  unread = excluded.unread,
  bookmarked = excluded.bookmarked,
  dismissed = excluded.dismissed,
  metadata = excluded.metadata,
  discovered_at = excluded.discovered_at,
  updated_at = now();
