// rate-limit.test.ts
import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limit';

function makeReq(ip = '1.2.3.4') {
  return { ip } as any;
}

function makeRes() {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('rate-limit', () => {
  it('allows requests within the limit', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
    const res = makeRes();
    let calls = 0;
    for (let i = 0; i < 3; i++) {
      limiter(makeReq(), res, () => { calls++; });
    }
    expect(calls).toBe(3);
    expect(res.statusCode).toBe(0);
  });

  it('rejects requests over the limit with 429', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
    const res = makeRes();
    let calls = 0;
    for (let i = 0; i < 3; i++) {
      limiter(makeReq(), res, () => { calls++; });
    }
    expect(calls).toBe(2);
    expect(res.statusCode).toBe(429);
  });

  it('tracks clients independently by IP', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    const resA = makeRes();
    const resB = makeRes();
    let callsA = 0;
    let callsB = 0;
    limiter(makeReq('10.0.0.1'), resA, () => { callsA++; });
    limiter(makeReq('10.0.0.2'), resB, () => { callsB++; });
    limiter(makeReq('10.0.0.1'), resA, () => { callsA++; });
    expect(callsA).toBe(1);
    expect(resA.statusCode).toBe(429);
    expect(callsB).toBe(1);
    expect(resB.statusCode).toBe(0);
  });
});
