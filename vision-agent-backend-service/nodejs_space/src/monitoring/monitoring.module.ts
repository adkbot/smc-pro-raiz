import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { BinanceController } from './binance.controller';
import { MetricsService } from './metrics.service';
import { VisionAgentModule } from '../vision-agent/vision-agent.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [VisionAgentModule, SupabaseModule],
  controllers: [MonitoringController, BinanceController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MonitoringModule { }
