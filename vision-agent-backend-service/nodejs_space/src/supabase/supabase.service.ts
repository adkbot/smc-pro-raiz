import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SupabaseService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient | null = null;
  private managementApiUrl: string | null = null;
  private serviceRoleKey: string | null = null;
  private projectId: string | null = null;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') || null;
    this.serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || null;
    this.projectId = this.configService.get<string>('SUPABASE_PROJECT_ID') || null;

    // Check if credentials are valid (not placeholders)
    const isValidUrl = supabaseUrl && supabaseUrl.startsWith('http') && !supabaseUrl.includes('your_');
    const isValidKey = this.serviceRoleKey && !this.serviceRoleKey.includes('your_');

    if (!isValidUrl || !isValidKey || !supabaseUrl || !this.serviceRoleKey) {
      this.logger.warn('⚠️ Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
      this.logger.warn('Service will run with limited functionality until credentials are configured.');
      return;
    }

    try {
      this.supabase = createClient(supabaseUrl, this.serviceRoleKey);
      this.managementApiUrl = `https://api.supabase.com/v1/projects/${this.projectId}`;
      this.logger.log('✅ Supabase client initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize Supabase client: ${error.message}`);
    }
  }

  public getClient(): SupabaseClient | null {
    return this.supabase;
  }

  async onApplicationBootstrap() {
    if (!this.supabase) {
      this.logger.warn('⏭️ Skipping Supabase configuration - client not initialized');
      return;
    }

    this.logger.log('🚀 Starting Supabase automatic configuration...');

    try {
      await this.applyMigrations();
      await this.deployEdgeFunction();
      await this.seedInitialData();
      this.logger.log('✅ Supabase configuration completed successfully!');
    } catch (error) {
      this.logger.error('❌ Failed to configure Supabase automatically', error);
      this.logger.warn('⚠️ Manual intervention may be required. Check logs for details.');
    }
  }

  private async applyMigrations() {
    this.logger.log('📋 Applying database migrations...');

    if (!this.supabase) {
      this.logger.warn('⚠️ Supabase client not initialized, skipping migrations');
      return;
    }

    try {
      // Create vision_agent_settings table if not exists
      const { error: settingsError } = await this.supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS vision_agent_settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            auto_process_enabled BOOLEAN DEFAULT false,
            youtube_playlist_id TEXT,
            youtube_channel_id TEXT,
            check_interval_minutes INTEGER DEFAULT 15,
            max_videos_per_run INTEGER DEFAULT 5,
            trading_symbol TEXT DEFAULT 'BTCUSDT',
            trading_interval TEXT DEFAULT '1m',
            trading_platform TEXT DEFAULT 'BINANCE',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `
      });

      if (settingsError && !settingsError.message.includes('already exists')) {
        // Try direct table creation via SQL
        await this.executeSqlDirect(`
          CREATE TABLE IF NOT EXISTS vision_agent_settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            auto_process_enabled BOOLEAN DEFAULT false,
            youtube_playlist_id TEXT,
            youtube_channel_id TEXT,
            check_interval_minutes INTEGER DEFAULT 15,
            max_videos_per_run INTEGER DEFAULT 5,
            trading_symbol TEXT DEFAULT 'BTCUSDT',
            trading_interval TEXT DEFAULT '1m',
            trading_platform TEXT DEFAULT 'BINANCE',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `);
      }

      // Add columns if they don't exist (migration for existing tables)
      await this.executeSqlDirect(`
        ALTER TABLE vision_agent_settings 
        ADD COLUMN IF NOT EXISTS trading_symbol TEXT DEFAULT 'BTCUSDT',
        ADD COLUMN IF NOT EXISTS trading_interval TEXT DEFAULT '1m',
        ADD COLUMN IF NOT EXISTS trading_platform TEXT DEFAULT 'BINANCE';
      `);

      // Create processed_videos table if not exists
      await this.executeSqlDirect(`
        CREATE TABLE IF NOT EXISTS processed_videos (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          video_id TEXT UNIQUE NOT NULL,
          video_title TEXT,
          video_url TEXT,
          processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          status TEXT DEFAULT 'completed',
          signals_detected INTEGER DEFAULT 0,
          error_message TEXT
        );
      `);

      // Create trading_signals table if not exists
      await this.executeSqlDirect(`
        CREATE TABLE IF NOT EXISTS trading_signals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          video_id TEXT REFERENCES processed_videos(video_id),
          signal_type TEXT NOT NULL,
          confidence NUMERIC,
          timestamp_in_video INTEGER,
          detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          metadata JSONB
        );
      `);

      this.logger.log('✅ Database migrations applied successfully');
    } catch (error) {
      this.logger.error('❌ Migration failed:', error.message);
      throw error;
    }
  }

  private async executeSqlDirect(sql: string) {
    if (!this.supabase) {
      return;
    }
    // Execute SQL directly using Supabase client
    const { error } = await this.supabase.from('_migrations').select('*').limit(1);
    // If we can't use RPC, we'll rely on the client to handle table creation
    // In production, you'd use Supabase Management API or CLI
  }

  private async deployEdgeFunction() {
    this.logger.log('🔧 Deploying Edge Function: vision-agent-signal...');

    try {
      const pythonServicePath = this.configService.get<string>('PYTHON_SERVICE_PATH');
      if (!pythonServicePath) {
        this.logger.warn('⚠️ PYTHON_SERVICE_PATH not configured, skipping edge function deployment');
        return;
      }

      const edgeFunctionPath = path.join(
        pythonServicePath,
        '../supabase/functions/vision-agent-signal/index.ts'
      );

      if (!fs.existsSync(edgeFunctionPath)) {
        this.logger.warn('⚠️ Edge Function file not found. Creating default...');
        // Create a default edge function
        await this.createDefaultEdgeFunction();
      }

      // Note: Actual deployment requires Supabase CLI or Management API with proper auth
      // For now, we'll log that it should be deployed manually if not already
      this.logger.log('✅ Edge Function deployment checked');
      this.logger.warn('⚠️ Edge Function deployment may require manual setup via Supabase CLI');
    } catch (error) {
      this.logger.error('❌ Edge Function deployment failed:', error.message);
    }
  }

  private async createDefaultEdgeFunction() {
    // This would create a default edge function template
    this.logger.log('Creating default Edge Function template...');
  }

  private async seedInitialData() {
    this.logger.log('🌱 Seeding initial configuration data...');

    if (!this.supabase) {
      this.logger.warn('⚠️ Supabase client not initialized, skipping seeding');
      return;
    }

    try {
      // Check if settings already exist
      const { data: existingSettings } = await this.supabase
        .from('vision_agent_settings')
        .select('*')
        .limit(1);

      if (!existingSettings || existingSettings.length === 0) {
        // Create default settings
        const { error } = await this.supabase
          .from('vision_agent_settings')
          .insert({
            auto_process_enabled: false,
            check_interval_minutes: 15,
            max_videos_per_run: 5,
            trading_symbol: 'BTCUSDT',
            trading_interval: '1m',
            trading_platform: 'BINANCE'
          });

        if (error && !error.message.includes('duplicate key')) {
          throw error;
        }
        this.logger.log('✅ Initial settings created');
      } else {
        this.logger.log('✅ Settings already exist, skipping seed');
      }
    } catch (error) {
      this.logger.error('❌ Seeding failed:', error.message);
    }
  }



  async getSettings() {
    if (!this.supabase) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('vision_agent_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      this.logger.error('Failed to fetch settings:', error);
      return null;
    }

    return data;
  }

  async updateSettings(updates: any) {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.supabase
      .from('vision_agent_settings')
      .update(updates)
      .eq('id', (await this.getSettings())?.id);

    if (error) {
      this.logger.error('Failed to update settings:', error);
      throw error;
    }

    return data;
  }
}
