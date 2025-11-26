import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
// @ts-ignore
import * as ccxt from 'ccxt';

@Injectable()
export class BalanceSyncService {
    private readonly logger = new Logger(BalanceSyncService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    @Cron(CronExpression.EVERY_10_SECONDS)
    async syncBalances() {
        const supabase = this.supabaseService.getClient();
        if (!supabase) return;

        try {
            // Fetch users with paper_mode = false and api keys configured
            const { data: users, error } = await supabase
                .from('user_settings')
                .select('user_id, api_key, api_secret, paper_mode')
                .eq('paper_mode', false)
                .not('api_key', 'is', null)
                .not('api_secret', 'is', null);

            if (error) {
                this.logger.error(`Error fetching user settings: ${error.message}`);
                return;
            }

            if (!users || users.length === 0) return;

            for (const user of users) {
                await this.syncUserBalance(user);
            }
        } catch (error) {
            this.logger.error(`Error in syncBalances: ${error.message}`);
        }
    }

    private async syncUserBalance(user: any) {
        try {
            // @ts-ignore
            const exchange = new ccxt.binance({
                apiKey: user.api_key,
                secret: user.api_secret,
                enableRateLimit: true,
            });

            // Fetch balance
            const balance = await exchange.fetchBalance();
            const usdtBalance = balance.total['USDT'] || 0;

            const supabase = this.supabaseService.getClient();
            if (!supabase) {
                throw new Error('Supabase client not initialized');
            }

            // Update Supabase
            const { error } = await supabase
                .from('user_settings')
                .update({ balance: usdtBalance, updated_at: new Date().toISOString() })
                .eq('user_id', user.user_id);

            if (error) {
                this.logger.error(`Failed to update balance for user ${user.user_id}: ${error.message}`);
            } else {
                this.logger.debug(`Updated balance for user ${user.user_id}: ${usdtBalance} USDT`);
            }

        } catch (error) {
            this.logger.error(`Failed to sync balance for user ${user.user_id}: ${error.message}`);
        }
    }
}
