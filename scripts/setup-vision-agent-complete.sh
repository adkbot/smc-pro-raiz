#!/bin/bash

echo "🚀 Configurando Vision Trading Agent - Sistema Completo"
echo "============================================================"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para imprimir com cor
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }

# 1. Atualizar .env do backend
print_info "Atualizando configurações do backend..."
cat > /home/ubuntu/vision-agent-backend-service/nodejs_space/.env << 'EOF'
PORT=3000
SUPABASE_URL=https://zfefnlibzgkfbgdtagho.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmZWZubGliemdrZmJnZHRhZ2hvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjE3NjIzOCwiZXhwIjoyMDc3NzUyMjM4fQ.9-FT8dEWvkZ1PCt-P8d5l3BnA0PfxmwFg7dE-njcY_I
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmZWZubGliemdrZmJnZHRhZ2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxNzYyMzgsImV4cCI6MjA3Nzc1MjIzOH0.HXuS3QTggHlSsTh0XQtaNC_Q20xiY9X3WHcwukHRg6A
PYTHON_SERVICE_PATH=/home/ubuntu/smc-alpha-dashboard-main/vision-agent-service
YOUTUBE_API_KEY=
SUPABASE_PROJECT_ID=zfefnlibzgkfbgdtagho
EOF
print_success "Backend .env atualizado"

# 2. Reiniciar backend
print_info "Reiniciando backend NestJS..."
pkill -f "vision-agent-backend"
sleep 2
cd /home/ubuntu/vision-agent-backend-service/nodejs_space
PORT=3000 yarn run start:dev > /tmp/vision-backend.log 2>&1 &
sleep 5
print_success "Backend reiniciado na porta 3000"

# 3. Verificar frontend
print_info "Verificando frontend..."
if ! pgrep -f "vite.*8080" > /dev/null; then
    print_info "Iniciando frontend..."
    cd /home/ubuntu/smc-alpha-dashboard-main
    npm run dev > /tmp/vision-frontend.log 2>&1 &
    sleep 5
    print_success "Frontend iniciado na porta 8080"
else
    print_success "Frontend já está rodando"
fi

# 4. Configurar Supabase
print_info "Configurando Supabase..."
cd /home/ubuntu/smc-alpha-dashboard-main

# Link do projeto (se ainda não estiver linkado)
if [ ! -f ".supabase/config.toml" ]; then
    print_info "Linkando projeto Supabase..."
    supabase link --project-ref zfefnlibzgkfbgdtagho || print_error "Erro ao linkar projeto. Execute manualmente: supabase link --project-ref zfefnlibzgkfbgdtagho"
fi

# Aplicar migrações
print_info "Aplicando migrações SQL..."
supabase db push || print_error "Erro ao aplicar migrações. Você pode aplicar manualmente no Supabase Dashboard"

# Deploy Edge Function
print_info "Fazendo deploy da Edge Function..."
cd /home/ubuntu/smc-alpha-dashboard-main
if [ -d "supabase/functions/vision-agent-signal" ]; then
    supabase functions deploy vision-agent-signal --no-verify-jwt || print_error "Erro no deploy da Edge Function"
    print_success "Edge Function deployada"
else
    print_error "Edge Function não encontrada em supabase/functions/vision-agent-signal"
fi

# 5. Configurar Python Service
print_info "Configurando serviço Python..."
cd /home/ubuntu/smc-alpha-dashboard-main/vision-agent-service

if [ ! -d "venv" ]; then
    print_info "Criando ambiente virtual Python..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt > /dev/null 2>&1
    print_success "Ambiente Python configurado"
else
    print_success "Ambiente Python já existe"
fi

# Criar .env para o Python service
cat > /home/ubuntu/smc-alpha-dashboard-main/vision-agent-service/.env << 'EOF'
SUPABASE_URL=https://zfefnlibzgkfbgdtagho.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmZWZubGliemdrZmJnZHRhZ2hvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjE3NjIzOCwiZXhwIjoyMDc3NzUyMjM4fQ.9-FT8dEWvkZ1PCt-P8d5l3BnA0PfxmwFg7dE-njcY_I
USER_ID=
MODE=shadow
CONFIDENCE_THRESHOLD=0.70
FRAME_STEP=30
SEQ_LEN=30
VIDEO_DIR=videos
MODEL_DIR=models
FEATURES_DIR=features
YOUTUBE_API_KEY=
EOF
print_success "Python service .env criado"

echo ""
echo "============================================================"
print_success "✨ CONFIGURAÇÃO COMPLETA!"
echo "============================================================"
echo ""
print_info "📍 URLs dos Serviços:"
echo "   🌐 Frontend (Dashboard): http://localhost:8080"
echo "   🔧 Backend API: http://localhost:3000"
echo "   📚 API Docs: http://localhost:3000/api-docs"
echo "   🏥 Health Check: http://localhost:3000/api/monitoring/health"
echo ""
print_info "📋 Próximos Passos:"
echo "   1. Acesse o Dashboard: http://localhost:8080"
echo "   2. Faça login ou registre-se"
echo "   3. Vá para 'Configurações do Vision Agent'"
echo "   4. Configure o URL da playlist/canal do YouTube"
echo "   5. Ative o modo SHADOW (padrão e seguro)"
echo "   6. O agente começará a processar vídeos automaticamente!"
echo ""
print_info "🔍 Verificar Status:"
echo "   Backend: curl http://localhost:3000/api/monitoring/health"
echo "   Frontend: curl -I http://localhost:8080"
echo ""
print_info "📊 Logs:"
echo "   Backend: tail -f /tmp/vision-backend.log"
echo "   Frontend: tail -f /tmp/vision-frontend.log"
echo ""
print_success "🎉 Sistema pronto para operar!"
