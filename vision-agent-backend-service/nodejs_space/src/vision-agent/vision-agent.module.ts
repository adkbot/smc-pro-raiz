import { Module } from '@nestjs/common';
import { VisionAgentService } from './vision-agent.service';
import { VisionAgentController } from './vision-agent.controller';
import { ConfigWatcherService } from './config-watcher.service';
import { YoutubeFetcherService } from './youtube-fetcher.service';
import { SupabaseModule } from '../supabase/supabase.module';

import { BalanceSyncService } from './balance-sync.service';

@Module({
  imports: [SupabaseModule],
  controllers: [VisionAgentController],
  providers: [VisionAgentService, ConfigWatcherService, YoutubeFetcherService, BalanceSyncService],
  exports: [VisionAgentService],
})
export class VisionAgentModule { }
