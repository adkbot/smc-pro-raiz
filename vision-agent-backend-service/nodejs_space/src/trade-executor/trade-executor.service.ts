import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
// @ts-ignore
import * as ccxt from 'ccxt';

@Injectable()
export class TradeExecutorService {
    private readonly logger = new Logger(TradeExecutorService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    async executeSignal(signal: any) {
        this.logger.log(`Received signal: ${JSON.stringify(signal)}`);

        if (signal.action === 'IGNORE' || signal.confidence < 0.7) {
            this.logger.log('Signal ignored due to low confidence or IGNORE action');
            return { status: 'ignored' };
        }

        const supabase = this.supabaseService.getClient();
        if (!supabase) {
            this.logger.error('Supabase client not available');
            return { status: 'error', message: 'Supabase client not available' };
        }

        // 1. Fetch all users with auto_trading_enabled = true
        // Note: We are fetching ALL users who have enabled auto trading.
        const { data: users, error } = await supabase
            .from('user_settings')
            .select('user_id, paper_mode, risk_per_trade, leverage')
            .eq('auto_trading_enabled', true);

        if (error) {
            this.logger.error(`Failed to fetch users: ${error.message}`);
            return { status: 'error', message: error.message };
        }

        if (!users || users.length === 0) {
            this.logger.log('No users with auto-trading enabled found.');
            return { status: 'no_users' };
        }

        this.logger.log(`Found ${users.length} users for trade execution.`);

        // 2. Execute trade for each user
        const results = await Promise.all(users.map(async (user) => {
            return this.executeForUser(user, signal);
        }));

        return { status: 'executed', results };
    }

    private async executeForUser(user: any, signal: any) {
        const supabase = this.supabaseService.getClient();
        if (!supabase) {
            return { user_id: user.user_id, status: 'error', message: 'Supabase client unavailable' };
        }

        try {
            // Get API Credentials
            const { data: creds } = await supabase
                .from('user_api_credentials')
                .select('encrypted_api_key, encrypted_api_secret')
                .eq('user_id', user.user_id)
                .eq('broker_type', 'binance') // Assuming Binance for now
                .single();

            if (!creds) {
                this.logger.warn(`No credentials found for user ${user.user_id}`);
                return { user_id: user.user_id, status: 'no_creds' };
            }

            // Decrypt keys (Fallback to plain text if encryption failed previously)
            const apiKey = creds.encrypted_api_key;
            const apiSecret = creds.encrypted_api_secret;

            const symbol = signal.asset; // e.g. 'BTCUSDT'

            // Determine side
            let side: 'buy' | 'sell';
            if (signal.action === 'ENTER') {
                side = signal.direction === 'LONG' ? 'buy' : 'sell';
            } else if (signal.action === 'EXIT') {
                side = signal.direction === 'LONG' ? 'sell' : 'buy';
            } else {
                return { user_id: user.user_id, status: 'ignored_action' };
            }

            if (user.paper_mode) {
                this.logger.log(`[PAPER] Executing trade for user ${user.user_id}: ${side} ${symbol}`);
                // TODO: Implement paper trading logic (update balance in DB)
                // For now, just log it.
                return { user_id: user.user_id, status: 'paper_success' };
            }

            // Real Trade
            this.logger.log(`[REAL] Initializing exchange for user ${user.user_id}`);

            // @ts-ignore
            const exchange = new ccxt.binance({
                apiKey: apiKey,
                secret: apiSecret,
                enableRateLimit: true,
                options: { defaultType: 'future' } // Assuming Futures
            });

            // Set leverage
            try {
                await exchange.setLeverage(user.leverage || 20, symbol);
            } catch (e) {
                this.logger.warn(`Failed to set leverage: ${e.message}`);
            }

            // Calculate amount (Simplified: Fixed small amount for safety initially)
            // TODO: Implement proper position sizing based on risk_per_trade and balance
            const amount = 0.001; // BTC minimum is usually 0.001 or 0.002 depending on price

            this.logger.log(`[REAL] Executing ${side} order for ${amount} ${symbol}`);

            // Execute Order
            const order = await exchange.createMarketOrder(symbol, side, amount);

            this.logger.log(`[REAL] Order executed! ID: ${order.id}`);

            // Log to database
            await supabase.from('operations').insert({
                user_id: user.user_id,
                symbol: symbol,
                type: side.toUpperCase(),
                price: order.price || order.average,
                amount: amount,
                status: 'OPEN', // Simplified
                pnl: 0,
                entry_time: new Date().toISOString()
            });

            return { user_id: user.user_id, status: 'success', orderId: order.id };

        } catch (error) {
            this.logger.error(`Trade failed for user ${user.user_id}: ${error.message}`);
            return { user_id: user.user_id, status: 'failed', error: error.message };
        }
    }
}
