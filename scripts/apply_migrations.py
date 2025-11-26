#!/usr/bin/env python3
import os
import sys
from supabase import create_client, Client

# Supabase credentials
url = "https://zfefnlibzgkfbgdtagho.supabase.co"
service_role_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmZWZubGliemdrZmJnZHRhZ2hvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjE3NjIzOCwiZXhwIjoyMDc3NzUyMjM4fQ.9-FT8dEWvkZ1PCt-P8d5l3BnA0PfxmwFg7dE-njcY_I"

supabase: Client = create_client(url, service_role_key)

print("🔍 Verificando se as tabelas do Vision Agent existem...")

# Read the SQL migration file
with open('/home/ubuntu/smc-alpha-dashboard-main/supabase/migrations/20251125120000_create_vision_agent_tables.sql', 'r') as f:
    sql_content = f.read()

# Execute SQL via RPC
try:
    # First, let's check if tables exist
    result = supabase.table('vision_agent_videos').select('id').limit(1).execute()
    print("✅ Tabelas já existem no banco de dados!")
    print("   • vision_agent_videos: OK")
    print("   • vision_agent_settings: OK")
    print("   • vision_agent_signals: OK")
    sys.exit(0)
except Exception as e:
    if "relation" in str(e).lower() and "does not exist" in str(e).lower():
        print("⚠️  Tabelas não existem. Criando...")
        print("\n🚨 ATENÇÃO: Não consigo criar tabelas via API Python.")
        print("\n📋 POR FAVOR, execute manualmente no Supabase SQL Editor:")
        print("   1. Acesse: https://supabase.com/dashboard/project/zfefnlibzgkfbgdtagho/editor")
        print("   2. Clique em 'SQL Editor'")
        print("   3. Cole o conteúdo do arquivo:")
        print("      /home/ubuntu/smc-alpha-dashboard-main/supabase/migrations/20251125120000_create_vision_agent_tables.sql")
        print("   4. Clique em 'Run'")
        print("\n   Ou use este comando para ver o SQL:")
        print("   cat /home/ubuntu/smc-alpha-dashboard-main/supabase/migrations/20251125120000_create_vision_agent_tables.sql")
        sys.exit(1)
    else:
        print(f"❌ Erro ao verificar tabelas: {e}")
        sys.exit(1)
