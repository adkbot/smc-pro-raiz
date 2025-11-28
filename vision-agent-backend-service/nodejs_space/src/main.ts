import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  app.enableCors(); // Enable CORS for all origins (dev mode)
  app.setGlobalPrefix('api'); // Set global prefix for all routes

  // Enable CORS for frontend at localhost:8080
  // Swagger configuration with custom styling
  const config = new DocumentBuilder()
    .setTitle('Vision Trading Agent API')
    .setDescription('Complete automation API for SMC Alpha Dashboard Vision Trading Agent')
    .setVersion('1.0')
    .addTag('vision-agent', 'Vision Trading Agent Management')
    .addTag('monitoring', 'System Monitoring & Health')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Custom CSS for professional, production-grade documentation
  const customCss = `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #1a1a1a;
      font-size: 2.5rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    .swagger-ui .info .description { 
      color: #4a4a4a;
      font-size: 1.1rem;
      line-height: 1.6;
    }
    .swagger-ui { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #fafafa;
    }
    .swagger-ui .opblock-tag { 
      font-size: 1.5rem;
      color: #2c3e50;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 0.5rem;
      margin-top: 2rem;
    }
    .swagger-ui .opblock { 
      border: 1px solid #d0d0d0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border-radius: 6px;
      margin-bottom: 1rem;
    }
    .swagger-ui .opblock .opblock-summary { 
      padding: 1rem;
      cursor: pointer;
    }
    .swagger-ui .opblock.opblock-post { 
      border-color: #49cc90;
      background: rgba(73, 204, 144, 0.05);
    }
    .swagger-ui .opblock.opblock-get { 
      border-color: #61affe;
      background: rgba(97, 175, 254, 0.05);
    }
    .swagger-ui .btn.execute { 
      background-color: #4990e2;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      font-weight: 500;
      border-radius: 4px;
      cursor: pointer;
    }
    .swagger-ui .btn.execute:hover { 
      background-color: #357abd;
    }
    .swagger-ui .response-col_status { 
      font-weight: 600;
    }
    .swagger-ui .scheme-container { 
      background-color: #f5f5f5;
      border-radius: 6px;
      padding: 1rem;
      box-shadow: none;
    }
    body { margin: 0; background-color: #fafafa; }
  `;

  SwaggerModule.setup('api-docs', app, document, {
    customCss,
    customSiteTitle: 'Vision Trading Agent API',
    customfavIcon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📊</text></svg>',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 Vision Trading Agent Backend Service started on port ${port}`);
  logger.log(`📚 API Documentation available at http://localhost:${port}/api-docs`);
  logger.log(`🤖 Python Vision Agent will be managed automatically`);
}

bootstrap();
