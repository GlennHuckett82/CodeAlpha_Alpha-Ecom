'use strict';

const request = require('supertest');
const app = require('../server');

describe('GET /health', () => {
  it('responds with HTTP 200', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
  });

  it('returns { status: "ok" } in the response body', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('includes the env field in the response body', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('env');
  });
});
