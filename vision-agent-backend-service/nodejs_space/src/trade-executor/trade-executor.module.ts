import { Module } from '@nestjs/common';
import { TradeExecutorController } from './trade-executor.controller';
import { TradeExecutorService } from './trade-executor.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [ConfigModule],
    controllers: [TradeExecutorController],
    providers: [TradeExecutorService, SupabaseService],
    exports: [TradeExecutorService],
})
export class TradeExecutorModule { }
