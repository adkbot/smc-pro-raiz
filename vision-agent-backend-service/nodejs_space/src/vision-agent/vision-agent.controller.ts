import { Controller, Get, Post, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { VisionAgentService } from './vision-agent.service';

class ProcessVideoDto {
  videoUrl: string;
}

@ApiTags('vision-agent')
@Controller('api/vision-agent')
export class VisionAgentController {
  private readonly logger = new Logger(VisionAgentController.name);

  constructor(private readonly visionAgentService: VisionAgentService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start the Vision Trading Agent' })
  @ApiResponse({ status: 200, description: 'Agent started successfully' })
  @ApiResponse({ status: 400, description: 'Agent is already running' })
  async startAgent() {
    this.logger.log('Received request to start agent');
    const result = await this.visionAgentService.startAgent();
    
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    
    return result;
  }

  @Post('stop')
  @ApiOperation({ summary: 'Stop the Vision Trading Agent' })
  @ApiResponse({ status: 200, description: 'Agent stopped successfully' })
  @ApiResponse({ status: 400, description: 'Agent is not running' })
  async stopAgent() {
    this.logger.log('Received request to stop agent');
    const result = await this.visionAgentService.stopAgent();
    
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    
    return result;
  }

  @Post('restart')
  @ApiOperation({ summary: 'Restart the Vision Trading Agent' })
  @ApiResponse({ status: 200, description: 'Agent restarted successfully' })
  async restartAgent() {
    this.logger.log('Received request to restart agent');
    const result = await this.visionAgentService.restartAgent();
    
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    
    return result;
  }

  @Get('status')
  @ApiOperation({ summary: 'Get Vision Trading Agent status' })
  @ApiResponse({ status: 200, description: 'Returns current agent status' })
  getStatus() {
    return this.visionAgentService.getStatus();
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get Vision Trading Agent logs' })
  @ApiResponse({ status: 200, description: 'Returns recent logs' })
  getLogs() {
    return {
      logs: this.visionAgentService.getLogs(200),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('process-video')
  @ApiOperation({ summary: 'Process a specific YouTube video' })
  @ApiBody({ type: ProcessVideoDto })
  @ApiResponse({ status: 200, description: 'Video queued for processing' })
  @ApiResponse({ status: 400, description: 'Agent is not running or invalid request' })
  async processVideo(@Body() body: ProcessVideoDto) {
    this.logger.log(`Received request to process video: ${body.videoUrl}`);
    
    if (!body.videoUrl) {
      throw new HttpException('videoUrl is required', HttpStatus.BAD_REQUEST);
    }
    
    const result = await this.visionAgentService.processVideo(body.videoUrl);
    
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    
    return result;
  }
}
