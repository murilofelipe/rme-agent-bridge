import { validateRequest, validateResponse, SUPPORTED_VERSION } from './index';

describe('index', () => {
  it('re-exporta o contrato', () => {
    expect(typeof validateRequest).toBe('function');
    expect(typeof validateResponse).toBe('function');
    expect(SUPPORTED_VERSION).toBe(1);
  });
});
