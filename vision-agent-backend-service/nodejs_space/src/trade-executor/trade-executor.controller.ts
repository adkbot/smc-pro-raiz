import { Controller, Post, Body, Logger } from '@nestjs/common';
import { TradeExecutorService } from './trade-executor.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('trade-executor')
@Controller('trade-executor')
export class TradeExecutorController {
    private readonly logger = new Logger(TradeExecutorController.name);

    constructor(private readonly tradeExecutorService: TradeExecutorService) { }

    @Post('signal')
    @ApiOperation({ summary: 'Execute a trading signal for all subscribed users' })
    @ApiResponse({ status: 201, description: 'Signal processed' })
    async receiveSignal(@Body() signal: any) {
        this.logger.log('Received external signal via HTTP');
        return await this.tradeExecutorService.executeSignal(signal);
    }
}
