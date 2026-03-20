# Intelligence ingestion scaffold

This is the backend/server-side foundation for turning the Intelligence tab into a real source-driven feed.

## What it does now

- fetches candidate signals from source adapters
- scores and normalizes them into `agent_intelligence_items` rows
- upserts them into Supabase using the **service role key**
- includes a scaffold batch so the pipeline is testable before full APIs are wired

## Files

- `intelligence-ingest.js` — ingestion script
- `intelligence-ingest.env.example` — required env vars
- `intelligence-step1-schema.sql` — table + RLS + seed setup

## Why this is the right architecture

The dashboard is static frontend code. It should **read** intelligence rows, not hold secrets and not scrape sources directly.

That means:
- source fetching happens server-side
- scoring happens server-side
- Supabase writes happen server-side with `SUPABASE_SERVICE_ROLE_KEY`
- the dashboard remains a DB-backed reader/editor

## What Nout still needs to provide

### Required for safe Supabase writes

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

These must live in a server-side env file or secret store, **never** in `index.html`.

### For real source ingestion

You can pick one path first:

#### Option A — easiest early path

- `BRAVE_API_KEY`

This gives broad web discovery quickly and is enough to prove the ingestion loop before platform APIs are added.

#### Option B — true platform ingestion

For X/Twitter:
- `X_BEARER_TOKEN`

For Reddit:
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USER_AGENT`

## Suggested rollout

1. Run the script with only Supabase + scaffold batch
2. Add Brave API for better discovery
3. Add Reddit API
4. Add X API
5. Put the script on a cron / worker schedule
6. Later add LLM summarization + ranking refinement

## Example local run

```bash
cd /Users/noutthuis/.openclaw/workspace/agent-dashboard
cp intelligence-ingest.env.example .env.intelligence
# fill in secrets
export $(grep -v '^#' .env.intelligence | xargs)
node intelligence-ingest.js
```

## Next implementation step

Once secrets exist, the next good move is:
- wire one real adapter first (Brave or Reddit)
- test inserts
- then add cron automation
