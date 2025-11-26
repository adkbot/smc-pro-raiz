import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 30000);

  it('/ (GET) - should return welcome message', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .expect(200);
    
    expect(response.text).toContain('Vision Trading Agent Backend Service');
  });

  it('/health (GET) - should return health status', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
  });

  it('/api/vision-agent/status (GET) - should return agent status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/vision-agent/status')
      .expect(200);
    
    expect(response.body).toHaveProperty('running');
  });

  it('/api/monitoring/dashboard (GET) - should return dashboard data', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/monitoring/dashboard')
      .expect(200);
    
    expect(response.body).toHaveProperty('visionAgent');
    expect(response.body).toHaveProperty('system');
    expect(response.body).toHaveProperty('health');
  });
});
