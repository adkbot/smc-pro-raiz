# Vision Trading Agent Backend Service

🤖 **Complete automation service for SMC Alpha Dashboard Vision Trading Agent**

This NestJS backend service provides full automation and orchestration for the Vision Trading Agent system, eliminating the need for manual intervention.

## 🎯 Features

### 1. **Automatic Supabase Configuration**
- ✅ Automatically applies database migrations on startup
- ✅ Deploys Edge Functions to Supabase
- ✅ Creates initial configuration tables
- ✅ Seeds default settings

### 2. **Python Vision Agent Management**
- ✅ Automatically starts/stops the Python vision trading agent
- ✅ Monitors agent health and auto-restarts on failures
- ✅ Processes videos from configured YouTube playlists/channels
- ✅ Tracks processing status and errors
- ✅ Provides real-time logs and metrics

### 3. **REST API Control**
- `POST /api/vision-agent/start` - Start the Vision Agent
- `POST /api/vision-agent/stop` - Stop the Vision Agent
- `POST /api/vision-agent/restart` - Restart the Vision Agent
- `GET /api/vision-agent/status` - Get current agent status
- `GET /api/vision-agent/logs` - Get real-time logs
- `POST /api/vision-agent/process-video` - Process a specific video
- `GET /api/monitoring/dashboard` - System monitoring dashboard
- `GET /api/monitoring/metrics` - Prometheus metrics

### 4. **Monitoring & Observability**
- 📊 Prometheus metrics for monitoring
- 📝 Structured logging with Winston
- 🟢 Health check endpoints
- 📈 Performance metrics tracking
- ⚠️ Error tracking and alerting

### 5. **Auto-Initialization**
- 🚀 Service starts automatically with the system
- 🔄 Auto-applies Supabase configurations
- 🤖 Auto-starts Vision Agent if configured
- 🔍 Continuously monitors settings and processes videos

## 🛠️ Tech Stack

- **Framework**: NestJS
- **Language**: TypeScript
- **Runtime**: Node.js
- **Database**: Supabase (PostgreSQL)
- **Monitoring**: Prometheus + Winston
- **Process Management**: Node.js child_process
- **Scheduling**: @nestjs/schedule

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and yarn installed
- Supabase project configured
- Python Vision Agent service available at `/home/ubuntu/smc-alpha-dashboard-main/vision-agent-service/`

### Installation

```bash
# Install dependencies
cd /home/ubuntu/vision-agent-backend-service/nodejs_space
yarn install
```

### Configuration

Create or update `.env` file with your credentials:

```env
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_PROJECT_ID=your_project_id
PYTHON_SERVICE_PATH=/home/ubuntu/smc-alpha-dashboard-main/vision-agent-service
YOUTUBE_API_KEY=your_youtube_api_key
```

**Important**: Replace all placeholder values with your actual credentials!

### Running the Service

```bash
# Development mode (with hot reload)
yarn start:dev

# Production mode
yarn build
yarn start:prod
```

The service will:
1. ✅ Initialize Supabase (migrations + edge functions)
2. ✅ Check auto-process settings
3. ✅ Start Vision Agent if enabled
4. ✅ Begin monitoring and processing videos

### API Documentation

Once running, access the complete API documentation at:

**http://localhost:3000/api-docs**

## 📚 Usage Examples

### Start the Vision Agent

```bash
curl -X POST http://localhost:3000/api/vision-agent/start
```

### Check Agent Status

```bash
curl http://localhost:3000/api/vision-agent/status
```

### Process a Specific Video

```bash
curl -X POST http://localhost:3000/api/vision-agent/process-video \
  -H "Content-Type: application/json" \
  -d '{"videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID"}'
```

### View Real-Time Logs

```bash
curl http://localhost:3000/api/vision-agent/logs
```

### Monitor System Health

```bash
curl http://localhost:3000/api/monitoring/dashboard
```

## ⚙️ Configuration Management

### Enable Auto-Processing

Update the `vision_agent_settings` table in Supabase:

```sql
UPDATE vision_agent_settings
SET auto_process_enabled = true,
    youtube_playlist_id = 'YOUR_PLAYLIST_ID',
    check_interval_minutes = 15,
    max_videos_per_run = 5;
```

The service will automatically:
1. Detect the configuration change
2. Start the Vision Agent
3. Fetch videos from the playlist
4. Process unprocessed videos
5. Continue monitoring every 15 minutes

## 📦 Database Schema

The service automatically creates these tables:

### `vision_agent_settings`
- `id` - UUID primary key
- `auto_process_enabled` - Enable/disable auto-processing
- `youtube_playlist_id` - YouTube playlist to monitor
- `youtube_channel_id` - Alternative: YouTube channel to monitor
- `check_interval_minutes` - How often to check for new videos
- `max_videos_per_run` - Max videos to process per cycle

### `processed_videos`
- `id` - UUID primary key
- `video_id` - YouTube video ID (unique)
- `video_title` - Video title
- `video_url` - Full YouTube URL
- `processed_at` - Processing timestamp
- `status` - Processing status
- `signals_detected` - Number of trading signals found
- `error_message` - Error details if failed

### `trading_signals`
- `id` - UUID primary key
- `video_id` - Reference to processed video
- `signal_type` - Type of trading signal
- `confidence` - Confidence score
- `timestamp_in_video` - When signal appears in video
- `detected_at` - Detection timestamp
- `metadata` - Additional signal data (JSONB)

## 🐛 Troubleshooting

### Agent Won't Start

1. Check if Python service path is correct:
   ```bash
   ls /home/ubuntu/smc-alpha-dashboard-main/vision-agent-service/main.py
   ```

2. Verify Python dependencies are installed

3. Check logs:
   ```bash
   curl http://localhost:3000/api/vision-agent/logs
   ```

### No Videos Being Processed

1. Verify `auto_process_enabled` is `true` in Supabase
2. Check YouTube API key is valid
3. Ensure playlist/channel ID is correct
4. Check monitoring logs

### Supabase Connection Issues

1. Verify credentials in `.env`
2. Check Supabase project is active
3. Ensure service role key has proper permissions

## 📊 Monitoring

### Prometheus Metrics

Metrics available at `/api/monitoring/metrics`:

- `vision_agent_videos_processed_total` - Total videos processed
- `vision_agent_processing_errors_total` - Total errors
- `vision_agent_processing_duration_seconds` - Processing time histogram
- `vision_agent_uptime_seconds` - Agent uptime
- `system_memory_usage_bytes` - Memory usage
- `system_cpu_usage_percent` - CPU usage

### Health Checks

- `/health` - Basic health check
- `/api/monitoring/health` - Detailed health check
- `/api/monitoring/dashboard` - Complete system status

## 🚀 Deployment

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the service
cd /home/ubuntu/vision-agent-backend-service/nodejs_space
pm2 start yarn --name "vision-agent-backend" -- start:prod

# Enable auto-start on system boot
pm2 startup
pm2 save

# Monitor
pm2 logs vision-agent-backend
pm2 status
```

### Using systemd

Create `/etc/systemd/system/vision-agent-backend.service`:

```ini
[Unit]
Description=Vision Trading Agent Backend Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/vision-agent-backend-service/nodejs_space
ExecStart=/usr/bin/yarn start:prod
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable vision-agent-backend
sudo systemctl start vision-agent-backend
sudo systemctl status vision-agent-backend
```

## 📝 Logs

Logs are output to:
- Console (stdout/stderr)
- Available via API: `/api/vision-agent/logs`
- System logs if using systemd: `journalctl -u vision-agent-backend -f`

## 🔒 Security Notes

- ⚠️ Never commit `.env` file to version control
- 🔑 Use environment variables for all secrets
- 🛡️ Restrict Supabase service role key to backend only
- 🌐 Configure CORS properly for production
- 🔐 Use HTTPS in production environments

## 💬 Support

For issues or questions:
1. Check logs: `/api/vision-agent/logs`
2. Review monitoring dashboard: `/api/monitoring/dashboard`
3. Verify configuration in Supabase
4. Check Python service logs

## 📦 Project Structure

```
src/
├── app.module.ts              # Main application module
├── main.ts                    # Application entry point
├── supabase/                  # Supabase integration
│   ├── supabase.module.ts
│   └── supabase.service.ts      # Auto migrations & setup
├── vision-agent/              # Vision Agent management
│   ├── vision-agent.module.ts
│   ├── vision-agent.service.ts  # Python process management
│   ├── vision-agent.controller.ts # REST API endpoints
│   ├── config-watcher.service.ts # Settings monitoring
│   └── youtube-fetcher.service.ts # YouTube integration
└── monitoring/                # Monitoring & metrics
    ├── monitoring.module.ts
    ├── monitoring.controller.ts
    └── metrics.service.ts       # Prometheus metrics
```

## ✅ Testing

```bash
# Unit tests
yarn test

# E2E tests
yarn test:e2e

# Test coverage
yarn test:cov
```

---

**🎉 Your Vision Trading Agent is now fully automated!**

The service will handle everything automatically:
- ✅ Database setup
- ✅ Agent lifecycle management
- ✅ Video processing
- ✅ Health monitoring
- ✅ Error recovery

Just configure your settings in Supabase and let it run! 🚀
