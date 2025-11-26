import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Video, Settings, TrendingUp, PlayCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { VisionAgentSettings, VisionAgentVideo } from "@/integrations/supabase/types-vision-agent";
import { useNavigate } from "react-router-dom";

interface AgentStatus {
  enabled: boolean;
  mode: "SHADOW" | "PAPER" | "LIVE";
  signalsToday: number;
  videosProcessing: number;
  videosCompleted: number;
  lastVideo: VisionAgentVideo | null;
  youtubePlaylistUrl: string | null;
}

export const VisionAgentPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    enabled: false,
    mode: "SHADOW",
    signalsToday: 0,
    videosProcessing: 0,
    videosCompleted: 0,
    lastVideo: null,
    youtubePlaylistUrl: null,
  });
  const [loading, setLoading] = useState(false);

  const fetchAgentStatus = async () => {
    if (!user) return;

    try {
      // Buscar configurações do Vision Agent
      const { data: settings } = await supabase
        .from("vision_agent_settings")
        .select("enabled, mode, youtube_playlist_url")
        .eq("user_id", user.id)
        .maybeSingle();

      // Buscar vídeos em processamento
      const { count: processingCount } = await supabase
        .from("vision_agent_videos")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("status", "processing");

      // Buscar vídeos completados
      const { count: completedCount } = await supabase
        .from("vision_agent_videos")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("status", "completed");

      // Buscar último vídeo
      const { data: videos } = await supabase
        .from("vision_agent_videos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      // Buscar sinais gerados hoje
      const today = new Date().toISOString().split("T")[0];
      const { count: signalsCount } = await supabase
        .from("vision_agent_signals")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .gte("created_at", today)
        .neq("signal_type", "IGNORE");

      setAgentStatus({
        enabled: settings?.enabled ?? false,
        mode: settings?.mode ?? "SHADOW",
        signalsToday: signalsCount || 0,
        videosProcessing: processingCount || 0,
        videosCompleted: completedCount || 0,
        lastVideo: videos && videos.length > 0 ? videos[0] : null,
        youtubePlaylistUrl: settings?.youtube_playlist_url || null,
      });
    } catch (error) {
      console.error("Erro ao buscar status do Vision Agent:", error);
    }
  };

  useEffect(() => {
    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 10000); // Atualiza a cada 10s
    return () => clearInterval(interval);
  }, [user]);

  const toggleAgent = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Verificar se já existe configuração
      const { data: existing } = await supabase
        .from("vision_agent_settings")
        .select("id, enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        // Atualizar
        const { error } = await supabase
          .from("vision_agent_settings")
          .update({ enabled: !existing.enabled })
          .eq("user_id", user.id);

        if (error) throw error;

        toast({
          title: !existing.enabled ? "🤖 Vision Agent Ativado" : "Vision Agent Desativado",
          description: !existing.enabled
            ? "O agente começará a processar vídeos automaticamente"
            : "Processamento de vídeos pausado",
        });
      } else {
        // Criar configuração padrão
        const { error } = await supabase
          .from("vision_agent_settings")
          .insert({
            user_id: user.id,
            enabled: true,
            mode: "SHADOW",
            confidence_threshold: 0.70,
            max_signals_per_day: 50,
          });

        if (error) throw error;

        toast({
          title: "🤖 Vision Agent Ativado",
          description: "Configuração criada. Configure a URL do YouTube nas configurações.",
          action: (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/vision-agent-settings")}
            >
              Configurar
            </Button>
          ),
        });
      }

      fetchAgentStatus();
    } catch (error: any) {
      toast({
        title: "Erro ao alterar status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (!agentStatus.enabled) {
      return <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/20">🔴 DESATIVADO</Badge>;
    }
    if (agentStatus.videosProcessing > 0) {
      return <Badge variant="default" className="bg-blue-500/10 text-blue-500 border-blue-500/20">⏳ PROCESSANDO</Badge>;
    }
    return <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20">🟢 ATIVO</Badge>;
  };

  const getModeBadge = () => {
    const colors = {
      SHADOW: "bg-gray-500/10 text-gray-500 border-gray-500/20",
      PAPER: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      LIVE: "bg-red-500/10 text-red-500 border-red-500/20",
    };

    const icons = {
      SHADOW: "👁️",
      PAPER: "📄",
      LIVE: "💰",
    };

    return (
      <Badge variant="outline" className={colors[agentStatus.mode]}>
        {icons[agentStatus.mode]} {agentStatus.mode}
      </Badge>
    );
  };

  return (
    <Card className="p-4 m-4 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-bold text-foreground">Vision Agent</h3>
        </div>
        {getStatusBadge()}
      </div>

      <div className="space-y-3">
        {/* Modo */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Modo:</span>
          {getModeBadge()}
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col p-2 bg-muted/50 rounded-md">
            <span className="text-muted-foreground text-[10px]">Sinais Hoje</span>
            <span className="font-bold text-foreground text-sm flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {agentStatus.signalsToday}
            </span>
          </div>

          <div className="flex flex-col p-2 bg-muted/50 rounded-md">
            <span className="text-muted-foreground text-[10px]">Processando</span>
            <span className="font-bold text-foreground text-sm flex items-center gap-1">
              <PlayCircle className="w-3 h-3" />
              {agentStatus.videosProcessing}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Vídeos Completos:</span>
          <span className="font-bold text-foreground">{agentStatus.videosCompleted}</span>
        </div>

        {/* Último vídeo */}
        {agentStatus.lastVideo && (
          <div className="flex items-start gap-2 p-2 bg-muted/50 rounded-md">
            <Video className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {agentStatus.lastVideo.title || "Vídeo sem título"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {agentStatus.lastVideo.status === "completed" && (
                  <span className="text-green-500">
                    ✅ {agentStatus.lastVideo.signals_generated} sinais
                  </span>
                )}
                {agentStatus.lastVideo.status === "processing" && (
                  <span className="text-blue-500">
                    ⏳ {agentStatus.lastVideo.processed_frames || 0}/{agentStatus.lastVideo.total_frames || "?"} frames
                  </span>
                )}
                {agentStatus.lastVideo.status === "failed" && (
                  <span className="text-red-500">❌ Erro no processamento</span>
                )}
                {agentStatus.lastVideo.status === "pending" && (
                  <span className="text-gray-500">⏸️ Aguardando processamento</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Alerta se não configurado */}
        {agentStatus.enabled && !agentStatus.youtubePlaylistUrl && (
          <div className="flex items-start gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
            <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-yellow-500">
              Configure a URL da playlist do YouTube nas configurações
            </p>
          </div>
        )}

        {/* Alerta se configurado mas sem vídeos ainda */}
        {agentStatus.enabled && agentStatus.youtubePlaylistUrl && !agentStatus.lastVideo && (
          <div className="flex items-start gap-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-md">
            <PlayCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-blue-500">
              Aguardando processamento do primeiro vídeo...
            </p>
          </div>
        )}

        {/* Botões */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button
            onClick={toggleAgent}
            disabled={loading}
            size="sm"
            variant={agentStatus.enabled ? "destructive" : "default"}
            className="h-8"
          >
            {agentStatus.enabled ? (
              <>
                <EyeOff className="w-3 h-3 mr-1" />
                DESATIVAR
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 mr-1" />
                ATIVAR
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => navigate("/vision-agent-settings")}
          >
            <Settings className="w-3 h-3 mr-1" />
            CONFIG
          </Button>
        </div>
      </div>
    </Card>
  );
};
