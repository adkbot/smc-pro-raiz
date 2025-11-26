import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface YouTubeVideo {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
}

@Injectable()
export class YoutubeFetcherService {
  private readonly logger = new Logger(YoutubeFetcherService.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
  }

  async fetchPlaylistVideos(playlistId: string, maxResults: number = 5): Promise<YouTubeVideo[]> {
    try {
      this.logger.log(`Fetching videos from playlist: ${playlistId}`);

      if (!this.apiKey || this.apiKey === 'your_youtube_api_key') {
        this.logger.warn('⚠️ YouTube API key not configured');
        return [];
      }

      const response = await axios.get(`${this.baseUrl}/playlistItems`, {
        params: {
          part: 'snippet',
          playlistId,
          maxResults,
          key: this.apiKey,
          order: 'date',
        },
      });

      const videos: YouTubeVideo[] = response.data.items.map((item: any) => ({
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
        publishedAt: item.snippet.publishedAt,
      }));

      this.logger.log(`✅ Found ${videos.length} videos in playlist`);
      return videos;

    } catch (error) {
      this.logger.error(`Failed to fetch playlist videos: ${error.message}`);
      if (error.response?.data) {
        this.logger.error(`YouTube API Error: ${JSON.stringify(error.response.data)}`);
      }
      return [];
    }
  }

  async fetchChannelVideos(channelId: string, maxResults: number = 5): Promise<YouTubeVideo[]> {
    try {
      this.logger.log(`Fetching videos from channel: ${channelId}`);

      if (!this.apiKey || this.apiKey === 'your_youtube_api_key') {
        this.logger.warn('⚠️ YouTube API key not configured');
        return [];
      }

      // First, get the channel's uploads playlist
      const channelResponse = await axios.get(`${this.baseUrl}/channels`, {
        params: {
          part: 'contentDetails',
          id: channelId,
          key: this.apiKey,
        },
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        this.logger.warn('Channel not found');
        return [];
      }

      const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

      // Then fetch videos from uploads playlist
      return await this.fetchPlaylistVideos(uploadsPlaylistId, maxResults);

    } catch (error) {
      this.logger.error(`Failed to fetch channel videos: ${error.message}`);
      if (error.response?.data) {
        this.logger.error(`YouTube API Error: ${JSON.stringify(error.response.data)}`);
      }
      return [];
    }
  }

  async getVideoDetails(videoId: string): Promise<YouTubeVideo | null> {
    try {
      this.logger.log(`Fetching video details: ${videoId}`);

      if (!this.apiKey || this.apiKey === 'your_youtube_api_key') {
        this.logger.warn('⚠️ YouTube API key not configured');
        return null;
      }

      const response = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'snippet',
          id: videoId,
          key: this.apiKey,
        },
      });

      if (!response.data.items || response.data.items.length === 0) {
        return null;
      }

      const item = response.data.items[0];
      return {
        id: item.id,
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id}`,
        publishedAt: item.snippet.publishedAt,
      };

    } catch (error) {
      this.logger.error(`Failed to fetch video details: ${error.message}`);
      return null;
    }
  }
}
