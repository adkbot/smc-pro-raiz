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
                options: { recvWindow: 60000 },
            });

            // 1. Fetch Spot Balance
            let totalUsdt = 0;
            try {
                const spotBalance = await exchange.fetchBalance();
                totalUsdt += spotBalance.total['USDT'] || 0;
            } catch (e) {
                this.logger.warn(`Failed to fetch Spot balance for user ${user.user_id}: ${e.message}`);
            }

            // 2. Fetch Futures Balance
            try {
                // @ts-ignore
                const futuresExchange = new ccxt.binance({
                    apiKey: user.api_key,
                    secret: user.api_secret,
                    enableRateLimit: true,
                    options: { defaultType: 'future', recvWindow: 60000 },
                });
                const futuresBalance = await futuresExchange.fetchBalance();
                totalUsdt += futuresBalance.total['USDT'] || 0;
            } catch (e) {
                // Ignore error if futures are not enabled or permission denied
                // this.logger.warn(`Failed to fetch Futures balance for user ${user.user_id}: ${e.message}`);
            }

            const supabase = this.supabaseService.getClient();
            if (!supabase) {
                throw new Error('Supabase client not initialized');
            }

            // Update Supabase
            const { error } = await supabase
                .from('user_settings')
                .update({ balance: totalUsdt, updated_at: new Date().toISOString() })
                .eq('user_id', user.user_id);

            if (error) {
                this.logger.error(`Failed to update balance for user ${user.user_id}: ${error.message}`);
            } else {
                this.logger.debug(`Updated balance for user ${user.user_id}: ${totalUsdt} USDT (Spot + Futures)`);
            }

        } catch (error) {
            this.logger.error(`Failed to sync balance for user ${user.user_id}: ${error.message}`);
        }
    }
}
