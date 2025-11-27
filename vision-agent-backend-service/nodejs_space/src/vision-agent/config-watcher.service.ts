import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { VisionAgentService } from './vision-agent.service';
import { YoutubeFetcherService } from './youtube-fetcher.service';

@Injectable()
export class ConfigWatcherService {
  private readonly logger = new Logger(ConfigWatcherService.name);
  private lastAutoProcessState = false;
  private isProcessing = false;

  constructor(
    private supabaseService: SupabaseService,
    private visionAgentService: VisionAgentService,
    private youtubeFetcherService: YoutubeFetcherService,
    private configService: ConfigService,
  ) { }

  @Cron(CronExpression.EVERY_MINUTE)
  async watchConfiguration() {
    try {
      const settings = await this.supabaseService.getSettings();

      if (!settings) {
        this.logger.warn('No settings found in database');
        return;
      }

      // Check if auto-process state changed
      if (settings.auto_process_new_videos !== this.lastAutoProcessState) {
        this.logger.log(`🔄 Auto-process state changed: ${settings.auto_process_new_videos}`);
        this.lastAutoProcessState = settings.auto_process_new_videos;

        if (settings.auto_process_new_videos) {
          // Start the agent if not running
          const status = await this.visionAgentService.getStatus();
          if (!status.running) {
            this.logger.log('🚀 Starting agent due to auto-process enabled');
            await this.visionAgentService.startAgent();
          }
        }
        if (settings.mode !== 'PAPER') {
          this.logger.log(`🔄 Enforcing PAPER mode (current: ${settings.mode})`);
          const client = this.supabaseService.getClient();
          if (client) {
            await client
              .from('vision_agent_settings')
              .update({ mode: 'PAPER' })
              .eq('user_id', settings.user_id);
          }
        }
      }

      // If auto-process is enabled, fetch and process videos
      if (settings.auto_process_new_videos && !this.isProcessing) {
        await this.autoProcessVideos(settings);
      }

    } catch (error) {
      this.logger.error(`Error watching configuration: ${error.message}`);
    }
  }

  private async autoProcessVideos(settings: any) {
    this.isProcessing = true;

    try {
      let { youtube_playlist_id, youtube_channel_id, max_videos_per_run, youtube_playlist_url } = settings;
      this.logger.log(`📋 Configuration: Playlist=${youtube_playlist_id}, Channel=${youtube_channel_id}, URL=${youtube_playlist_url}`);

      // Extract playlist ID from URL if needed
      if (!youtube_playlist_id && youtube_playlist_url) {
        const match = youtube_playlist_url.match(/[?&]list=([^&]+)/);
        if (match) {
          youtube_playlist_id = match[1];
        }
      }

      if (!youtube_playlist_id && !youtube_channel_id && !youtube_playlist_url) {
        this.logger.warn('⚠️ No YouTube playlist or channel configured');
        return;
      }

      this.logger.log('🔍 Fetching videos from YouTube...');

      let videos: any[] = [];
      if (youtube_playlist_id) {
        videos = await this.youtubeFetcherService.fetchPlaylistVideos(
          youtube_playlist_id,
          max_videos_per_run || 5
        );
      } else if (youtube_channel_id) {
        videos = await this.youtubeFetcherService.fetchChannelVideos(
          youtube_channel_id,
          max_videos_per_run || 5
        );
      } else if (youtube_playlist_url) {
        this.logger.log(`⚠️ No ID found, delegating to Python agent with URL: ${youtube_playlist_url}`);
        await this.visionAgentService.processVideo(youtube_playlist_url);
        return;
      }

      if (videos.length === 0) {
        const apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
        const fallbackUrl = youtube_playlist_url || (youtube_playlist_id ? `https://www.youtube.com/playlist?list=${youtube_playlist_id}` : null);

        if ((!apiKey || apiKey === 'your_youtube_api_key') && fallbackUrl) {
          this.logger.log(`⚠️ No YouTube API Key configured. Falling back to direct processing via Python agent: ${fallbackUrl}`);
          await this.visionAgentService.processVideo(fallbackUrl);
          // We return here because the Python agent will handle the playlist
          return;
        }

        this.logger.log('No new videos to process');
        return;
      }

      this.logger.log(`🎥 Found ${videos.length} videos to process`);

      // Check which videos have already been processed
      const unprocessedVideos = await this.filterUnprocessedVideos(videos);

      if (unprocessedVideos.length === 0) {
        this.logger.log('All videos already processed');
        return;
      }

      this.logger.log(`🎬 Processing ${unprocessedVideos.length} new videos`);

      // Process each video
      for (const video of unprocessedVideos) {
        try {
          // Mark video as processed (create record)
          await this.markVideoAsProcessed(video);

          // Start processing
          await this.visionAgentService.processVideo(video.url);

          // Wait a bit between videos to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          this.logger.error(`Failed to process video ${video.id}: ${error.message}`);
        }
      }

    } catch (error) {
      this.logger.error(`Auto-process failed: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async filterUnprocessedVideos(videos: any[]) {
    const unprocessed = [];
    const client = this.supabaseService.getClient();

    if (!client) {
      // If no client, consider all videos as unprocessed
      return videos;
    }

    for (const video of videos) {
      const { data } = await client
        .from('vision_agent_videos')
        .select('video_id')
        .eq('video_id', video.id)
        .single();

      if (!data) {
        unprocessed.push(video);
      }
    }

    return unprocessed;
  }

  private async markVideoAsProcessed(video: any) {
    try {
      const client = this.supabaseService.getClient();
      if (!client) {
        this.logger.warn('⚠️ Cannot mark video as processed - Supabase client not initialized');
        return;
      }

      // Get user_id from settings to link the video
      const settings = await this.supabaseService.getSettings();
      const userId = settings?.user_id;

      if (!userId) {
        this.logger.warn('⚠️ Cannot mark video as processed - User ID not found in settings');
        return;
      }

      await client
        .from('vision_agent_videos')
        .upsert({
          video_id: video.id,
          title: video.title,
          youtube_url: video.url,
          status: 'processing',
          user_id: userId,
          updated_at: new Date().toISOString()
        }, { onConflict: 'video_id' });
    } catch (error) {
      this.logger.error(`Failed to mark video as processed: ${error.message}`);
    }
  }
}
