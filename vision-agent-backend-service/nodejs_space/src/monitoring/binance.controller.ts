import { Controller, Post, Delete, Body, Res, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
// @ts-ignore
import * as ccxt from 'ccxt';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('binance')
export class BinanceController {
    private readonly logger = new Logger(BinanceController.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    @Post('test')
    async testConnection(@Body() body: { apiKey: string; apiSecret: string; userId: string }, @Res() res: Response) {
        const { apiKey, apiSecret, userId } = body;

        if (!apiKey || !apiSecret) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                status: 'failed',
                message: 'API Key and Secret are required',
            });
        }

        // Sanitization
        const cleanKey = apiKey.trim();
        const cleanSecret = apiSecret.trim();

        // Basic Validation
        if (cleanKey.length < 64 || cleanSecret.length < 64) {
            // Log sanitized length
            this.logger.warn(`Invalid key length for user ${userId}. Key: ${cleanKey.length}, Secret: ${cleanSecret.length}`);
            return res.status(HttpStatus.BAD_REQUEST).json({
                status: 'failed',
                message: 'Invalid API Key or Secret format (length mismatch)',
            });
        }

        // Check for masked values
        if (cleanKey.includes('••••') || cleanSecret.includes('••••')) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                status: 'failed',
                message: 'Cannot use masked values for connection test. Please enter the full credentials.',
            });
        }

        try {
            this.logger.log(`Testing Binance connection for user ${userId}...`);

            // @ts-ignore
            const exchange = new ccxt.binance({
                apiKey: cleanKey,
                secret: cleanSecret,
                enableRateLimit: true,
                options: {
                    defaultType: 'future',
                }
            });

            // Try to fetch balance as a test (requires valid signature)
            // This implicitly tests HMAC SHA256 signing
            await exchange.fetchBalance();

            this.logger.log(`✅ Binance connection successful for user ${userId}`);
            return res.status(HttpStatus.OK).json({
                status: 'success',
                message: 'Connection successful! Credentials are valid.',
            });

        } catch (error: any) {
            this.logger.error(`❌ Binance connection failed for user ${userId}: ${error.message}`);

            // Return friendly error
            let message = 'Connection failed';
            if (error.message.includes('Invalid Api-Key ID')) {
                message = 'Invalid API Key. Please check your key.';
            } else if (error.message.includes('Signature for this request is not valid')) {
                message = 'Invalid API Secret. Please check your secret.';
            } else {
                message = `Connection error: ${error.message}`;
            }

            return res.status(HttpStatus.BAD_REQUEST).json({
                status: 'failed',
                message: message,
            });
        }
    }

    @Delete('keys')
    async deleteCredentials(@Body() body: { userId: string }, @Res() res: Response) {
        const { userId } = body;

        if (!userId) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                status: 'failed',
                message: 'User ID is required',
            });
        }

        try {
            const supabase = this.supabaseService.getClient();
            if (!supabase) throw new Error('Supabase client unavailable');

            const { error } = await supabase
                .from('user_api_credentials')
                .delete()
                .eq('user_id', userId)
                .eq('broker_type', 'binance');

            if (error) throw error;

            this.logger.log(`🗑️ Credentials deleted for user ${userId}`);
            return res.status(HttpStatus.OK).json({
                status: 'success',
                message: 'Credentials deleted successfully',
            });

        } catch (error: any) {
            this.logger.error(`Failed to delete credentials for user ${userId}: ${error.message}`);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                status: 'error',
                message: 'Failed to delete credentials',
            });
        }
    }
}
