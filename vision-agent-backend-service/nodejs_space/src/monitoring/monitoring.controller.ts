import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { VisionAgentService } from '../vision-agent/vision-agent.service';

@ApiTags('monitoring')
@Controller('api/monitoring')
export class MonitoringController {
  private readonly logger = new Logger(MonitoringController.name);

  constructor(
    private readonly metricsService: MetricsService,
    private readonly visionAgentService: VisionAgentService,
  ) { }

  @Get('metrics')
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiResponse({ status: 200, description: 'Returns Prometheus metrics in text format' })
  async getMetrics() {
    return await this.metricsService.getMetrics();
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get monitoring dashboard data' })
  @ApiResponse({ status: 200, description: 'Returns comprehensive system status' })
  async getDashboard() {
    const agentStatus = await this.visionAgentService.getStatus();
    const systemMetrics = this.metricsService.getSystemMetrics();

    return {
      timestamp: new Date().toISOString(),
      visionAgent: agentStatus,
      system: systemMetrics,
      health: {
        overall: agentStatus.running ? 'healthy' : 'degraded',
        components: {
          pythonAgent: agentStatus.running ? 'up' : 'down',
          backend: 'up',
        },
      },
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint for load balancers' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
