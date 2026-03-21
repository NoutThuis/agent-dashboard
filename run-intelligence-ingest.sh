#!/bin/zsh
set -euo pipefail
cd /Users/noutthuis/.openclaw/workspace/agent-dashboard
set -a
source ./.env.intelligence
set +a
node ./intelligence-ingest.js
