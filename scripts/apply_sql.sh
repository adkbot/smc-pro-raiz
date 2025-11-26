#!/bin/bash

TOKEN="sbp_b00bb882648385deef3b5d3af123204814c1151c"
PROJECT_REF="zfefnlibzgkfbgdtagho"
SQL_FILE="/home/ubuntu/smc-alpha-dashboard-main/supabase/migrations/20251125120000_create_vision_agent_tables.sql"

echo "🚀 Aplicando migrações SQL no Supabase..."

# Read SQL file and escape it properly for JSON
SQL_CONTENT=$(cat "$SQL_FILE" | jq -Rs .)

# Create JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
  "query": $SQL_CONTENT
}
EOF
)

# Execute SQL via Management API
RESPONSE=$(curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

echo "Response: $RESPONSE"

# Check if successful
if echo "$RESPONSE" | grep -q "error\|Error"; then
    echo "❌ Erro ao aplicar SQL"
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    exit 1
else
    echo "✅ SQL aplicado com sucesso!"
fi
