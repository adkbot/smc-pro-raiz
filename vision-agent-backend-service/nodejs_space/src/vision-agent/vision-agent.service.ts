import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface AgentStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  lastHealthCheck?: string;
  processedVideos?: number;
  errors?: number;
}

@Injectable()
export class VisionAgentService implements OnApplicationBootstrap {
  private readonly logger = new Logger(VisionAgentService.name);
  private pythonProcess: ChildProcess | null = null;
  private status: AgentStatus = { running: false };
  private startTime: number | null = null;
  private processedVideosCount = 0;
  private errorsCount = 0;
  private logs: string[] = [];
  private maxLogs = 1000;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private autoRestartEnabled = true;

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) { }

  async onApplicationBootstrap() {
    this.logger.log('🤖 Vision Agent Service initializing...');

    try {
      // Check if auto-start is enabled in settings
      const settings = await this.supabaseService.getSettings();
      if (settings?.auto_process_new_videos) {
        this.logger.log('🚀 Auto-process enabled, starting Vision Agent...');
        await this.startAgent();
      } else {
        this.logger.log('⏸️ Auto-process disabled, Vision Agent will not start automatically');
      }

      // Start health check interval
      this.startHealthCheck();
    } catch (error) {
      this.logger.warn(`⚠️ Failed to initialize Vision Agent: ${error.message}`);
      this.logger.warn('Vision Agent will be available for manual control via API');
    }
  }

  async startAgent(): Promise<{ success: boolean; message: string }> {
    if (this.pythonProcess) {
      return { success: false, message: 'Agent is already running' };
    }

    try {
      const pythonServicePath = this.configService.get<string>('PYTHON_SERVICE_PATH');

      if (!pythonServicePath || !fs.existsSync(pythonServicePath)) {
        throw new Error(`Python service path not found: ${pythonServicePath}`);
      }

      const mainScriptPath = path.join(pythonServicePath, 'src', 'main.py');

      if (!fs.existsSync(mainScriptPath)) {
        throw new Error(`Python main script not found: ${mainScriptPath}`);
      }

      this.logger.log(`🐍 Starting Python process: ${mainScriptPath}`);

      // Spawn Python process
      this.pythonProcess = spawn('python', ['-m', 'src.main'], {
        cwd: pythonServicePath,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION: 'python',
        },
      });

      this.startTime = Date.now();
      this.status.running = true;
      this.status.pid = this.pythonProcess.pid;

      // Handle stdout
      this.pythonProcess.stdout?.on('data', (data) => {
        const logLine = data.toString().trim();
        this.logger.log(`[Python] ${logLine}`);
        this.addLog(`[STDOUT] ${logLine}`);

        // Track processed videos
        if (logLine.includes('Video processed') || logLine.includes('successfully processed')) {
          this.processedVideosCount++;
        }
      });

      // Handle stderr
      this.pythonProcess.stderr?.on('data', (data) => {
        const errorLine = data.toString().trim();
        this.logger.error(`[Python Error] ${errorLine}`);
        this.addLog(`[STDERR] ${errorLine}`);
        this.errorsCount++;
      });

      // Handle process exit
      this.pythonProcess.on('exit', (code, signal) => {
        this.logger.warn(`Python process exited with code ${code} and signal ${signal}`);
        this.status.running = false;
        this.pythonProcess = null;
        this.addLog(`[EXIT] Process exited with code ${code}`);

        // Auto-restart if enabled and exit was unexpected
        if (this.autoRestartEnabled && code !== 0) {
          this.logger.log('🔄 Auto-restarting Python agent in 5 seconds...');
          setTimeout(() => this.startAgent(), 5000);
        }
      });

      // Handle errors
      this.pythonProcess.on('error', (error) => {
        this.logger.error(`Python process error: ${error.message}`);
        this.addLog(`[ERROR] ${error.message}`);
        this.errorsCount++;
      });

      this.logger.log(`✅ Python agent started successfully (PID: ${this.pythonProcess.pid})`);
      return { success: true, message: `Agent started with PID ${this.pythonProcess.pid}` };

    } catch (error) {
      this.logger.error(`❌ Failed to start agent: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async stopAgent(): Promise<{ success: boolean; message: string }> {
    if (!this.pythonProcess) {
      return { success: false, message: 'Agent is not running' };
    }

    try {
      this.autoRestartEnabled = false;
      this.pythonProcess.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.pythonProcess) {
          this.logger.warn('Force killing Python process...');
          this.pythonProcess.kill('SIGKILL');
        }
      }, 5000);

      this.status.running = false;
      this.logger.log('✅ Agent stopped successfully');
      return { success: true, message: 'Agent stopped' };

    } catch (error) {
      this.logger.error(`❌ Failed to stop agent: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  async restartAgent(): Promise<{ success: boolean; message: string }> {
    this.logger.log('🔄 Restarting agent...');
    await this.stopAgent();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return await this.startAgent();
  }

  async processVideo(videoUrl: string): Promise<{ success: boolean; message: string }> {
    if (!this.pythonProcess || !this.status.running) {
      return { success: false, message: 'Agent is not running. Start the agent first.' };
    }

    try {
      this.logger.log(`🎥 Processing video: ${videoUrl}`);

      // Send video URL to Python process via stdin
      this.pythonProcess.stdin?.write(`${videoUrl}\n`);

      return { success: true, message: 'Video queued for processing' };
    } catch (error) {
      this.logger.error(`❌ Failed to process video: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  getStatus(): AgentStatus {
    return {
      running: this.status.running,
      pid: this.status.pid,
      uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : undefined,
      lastHealthCheck: this.status.lastHealthCheck,
      processedVideos: this.processedVideosCount,
      errors: this.errorsCount,
    };
  }

  getLogs(limit: number = 100): string[] {
    return this.logs.slice(-limit);
  }

  private addLog(logLine: string) {
    const timestamp = new Date().toISOString();
    this.logs.push(`[${timestamp}] ${logLine}`);

    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  private startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      if (this.pythonProcess && this.status.running) {
        // Simple health check - process is running
        this.status.lastHealthCheck = new Date().toISOString();
        this.logger.debug('✅ Health check passed');
      }
    }, 30000); // Every 30 seconds
  }

  onModuleDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.pythonProcess) {
      this.pythonProcess.kill('SIGTERM');
    }
  }
}
