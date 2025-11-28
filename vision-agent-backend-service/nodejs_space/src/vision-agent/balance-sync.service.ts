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

        // this.logger.debug('⏱️ Cron triggered: syncBalances');

        try {
            // 1. Fetch users who are NOT in paper mode
            const { data: settings, error: settingsError } = await supabase
                .from('user_settings')
                .select('user_id')
                .eq('paper_mode', false);

            if (settingsError) {
                this.logger.error(`Error fetching user settings: ${settingsError.message}`);
                return;
            }

            if (!settings || settings.length === 0) {
                // this.logger.debug('No users in Real Mode found.');
                return;
            }

            this.logger.log(`Found ${settings.length} users in Real Mode.`);

            const userIds = settings.map(s => s.user_id);

            // 2. Fetch credentials for these users (Binance only for now)
            const { data: credentials, error: credsError } = await supabase
                .from('user_api_credentials')
                .select('user_id, encrypted_api_key, encrypted_api_secret')
                .eq('broker_type', 'binance')
                .in('user_id', userIds);

            if (credsError) {
                this.logger.error(`Error fetching credentials: ${credsError.message}`);
                return;
            }

            if (!credentials || credentials.length === 0) {
                this.logger.warn(`Found users in Real Mode but NO credentials for them.`);
                return;
            }

            this.logger.log(`Found credentials for ${credentials.length} users. Starting sync...`);

            for (const cred of credentials) {
                await this.syncUserBalance({
                    user_id: cred.user_id,
                    api_key: cred.encrypted_api_key,
                    api_secret: cred.encrypted_api_secret
                });
            }
        } catch (error) {
            this.logger.error(`Error in syncBalances: ${error.message}`);
        }
    }

    private async syncUserBalance(user: { user_id: string, api_key: string, api_secret: string }) {
        let fetchSuccess = false;
        let totalUsdt = 0;

        this.logger.log(`🔄 Syncing balance for user ${user.user_id}...`);

        try {
            const apiKey = user.api_key.trim();
            const apiSecret = user.api_secret.trim();

            // Debug log to check key validity (without exposing the full key)
            if (apiKey.length > 5 && apiSecret.length > 5) {
                this.logger.debug(`User ${user.user_id} Key Start: ${apiKey.substring(0, 5)}..., Secret Start: ${apiSecret.substring(0, 5)}...`);
            } else {
                this.logger.warn(`User ${user.user_id} Key/Secret too short! Key: ${apiKey.length}, Secret: ${apiSecret.length}`);
            }

            // @ts-ignore
            const exchange = new ccxt.binance({
                apiKey: apiKey,
                secret: apiSecret,
                enableRateLimit: true,
                options: { recvWindow: 60000 },
            });

            // 1. Fetch Spot Balance
            try {
                this.logger.debug(`Fetching SPOT balance for ${user.user_id}...`);
                const spotBalance = await exchange.fetchBalance();
                const spotUsdt = spotBalance.total['USDT'] || 0;
                totalUsdt += spotUsdt;
                fetchSuccess = true;
                this.logger.debug(`✅ Spot Balance: ${spotUsdt} USDT`);
            } catch (e) {
                this.logger.warn(`❌ Failed to fetch Spot balance for user ${user.user_id}: ${e.message}`);
            }

            // 2. Fetch Futures Balance
            try {
                this.logger.debug(`Fetching FUTURES balance for ${user.user_id}...`);
                // @ts-ignore
                const futuresExchange = new ccxt.binance({
                    apiKey: apiKey,
                    secret: apiSecret,
                    enableRateLimit: true,
                    options: { defaultType: 'future', recvWindow: 60000 },
                });
                const futuresBalance = await futuresExchange.fetchBalance();
                const futuresUsdt = futuresBalance.total['USDT'] || 0;
                totalUsdt += futuresUsdt;
                fetchSuccess = true;
                this.logger.debug(`✅ Futures Balance: ${futuresUsdt} USDT`);
            } catch (e) {
                this.logger.warn(`⚠️ Failed to fetch Futures balance (might be disabled): ${e.message}`);
            }

            if (!fetchSuccess) {
                this.logger.warn(`❌ Skipping balance update for user ${user.user_id} because both Spot and Futures fetch failed.`);
                return;
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
                this.logger.error(`❌ Failed to update balance in DB for user ${user.user_id}: ${error.message}`);
            } else {
                this.logger.log(`💰 Balance updated for user ${user.user_id}: $${totalUsdt.toFixed(2)}`);
            }

        } catch (error) {
            this.logger.error(`🔥 Critical error syncing balance for user ${user.user_id}: ${error.message}`);
        }
    }
}
