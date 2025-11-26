import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Vision Trading Agent Backend Service is running! Check /api-docs for API documentation.';
  }
}
