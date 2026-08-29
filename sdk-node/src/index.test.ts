import { MapBuilder, RMESession } from './index';

describe('andaime da SDK', () => {
  it('expõe RMESession com baseUrl', () => {
    const session = new RMESession({ baseUrl: 'http://127.0.0.1:8080' });
    expect(session.baseUrl).toBe('http://127.0.0.1:8080');
  });

  it('MapBuilder.setTile ainda não implementado', async () => {
    const builder = new MapBuilder(new RMESession({ baseUrl: 'http://127.0.0.1:8080' }));
    await expect(builder.setTile(1, 1, 7, 4526)).rejects.toThrow('not implemented');
  });
});
