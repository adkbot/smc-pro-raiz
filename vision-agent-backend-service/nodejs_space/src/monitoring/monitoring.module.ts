import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MetricsService } from './metrics.service';
import { VisionAgentModule } from '../vision-agent/vision-agent.module';

@Module({
  imports: [VisionAgentModule],
  controllers: [MonitoringController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MonitoringModule {}
