import { redisKey } from './redis-keys';

describe('redisKey', () => {
  it('namespaces keys by deployment', () => {
    expect(redisKey('uat', 'otp', 'abc123')).toBe('flinger:uat:otp:abc123');
  });

  it('keeps environments apart', () => {
    expect(redisKey('local', 'rl', 'ip', '1.2.3.4')).not.toBe(
      redisKey('production', 'rl', 'ip', '1.2.3.4'),
    );
  });
});
