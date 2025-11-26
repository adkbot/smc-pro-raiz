import { Injectable, Logger } from '@nestjs/common';
import { Registry, Counter, Gauge, Histogram } from 'prom-client';
import * as os from 'os';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry: Registry;
  
  // Metrics
  private videosProcessedCounter: Counter;
  private processingErrorsCounter: Counter;
  private processingDurationHistogram: Histogram;
  private agentUptimeGauge: Gauge;
  private systemMemoryGauge: Gauge;
  private systemCpuGauge: Gauge;

  constructor() {
    this.registry = new Registry();
    this.initializeMetrics();
    this.startSystemMetricsCollection();
  }

  private initializeMetrics() {
    // Videos processed counter
    this.videosProcessedCounter = new Counter({
      name: 'vision_agent_videos_processed_total',
      help: 'Total number of videos processed by the Vision Agent',
      registers: [this.registry],
    });

    // Processing errors counter
    this.processingErrorsCounter = new Counter({
      name: 'vision_agent_processing_errors_total',
      help: 'Total number of video processing errors',
      registers: [this.registry],
    });

    // Processing duration histogram
    this.processingDurationHistogram = new Histogram({
      name: 'vision_agent_processing_duration_seconds',
      help: 'Duration of video processing in seconds',
      buckets: [10, 30, 60, 120, 300, 600, 1200],
      registers: [this.registry],
    });

    // Agent uptime gauge
    this.agentUptimeGauge = new Gauge({
      name: 'vision_agent_uptime_seconds',
      help: 'Uptime of the Vision Agent in seconds',
      registers: [this.registry],
    });

    // System memory gauge
    this.systemMemoryGauge = new Gauge({
      name: 'system_memory_usage_bytes',
      help: 'System memory usage in bytes',
      registers: [this.registry],
    });

    // System CPU gauge
    this.systemCpuGauge = new Gauge({
      name: 'system_cpu_usage_percent',
      help: 'System CPU usage percentage',
      registers: [this.registry],
    });

    this.logger.log('✅ Prometheus metrics initialized');
  }

  private startSystemMetricsCollection() {
    // Collect system metrics every 15 seconds
    setInterval(() => {
      try {
        const memUsage = process.memoryUsage();
        this.systemMemoryGauge.set(memUsage.heapUsed);

        const cpus = os.cpus();
        const avgLoad = os.loadavg()[0];
        const cpuPercent = (avgLoad / cpus.length) * 100;
        this.systemCpuGauge.set(cpuPercent);
      } catch (error) {
        this.logger.error(`Failed to collect system metrics: ${error.message}`);
      }
    }, 15000);
  }

  async getMetrics(): Promise<string> {
    return await this.registry.metrics();
  }

  incrementVideosProcessed() {
    this.videosProcessedCounter.inc();
  }

  incrementProcessingErrors() {
    this.processingErrorsCounter.inc();
  }

  recordProcessingDuration(durationSeconds: number) {
    this.processingDurationHistogram.observe(durationSeconds);
  }

  setAgentUptime(uptimeSeconds: number) {
    this.agentUptimeGauge.set(uptimeSeconds);
  }

  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    return {
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: totalMemory - freeMemory,
        usedPercent: ((totalMemory - freeMemory) / totalMemory) * 100,
        heap: {
          total: memUsage.heapTotal,
          used: memUsage.heapUsed,
          usedPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        },
      },
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model,
        loadAverage: os.loadavg(),
      },
      uptime: {
        system: os.uptime(),
        process: process.uptime(),
      },
      platform: os.platform(),
      nodeVersion: process.version,
    };
  }
}
