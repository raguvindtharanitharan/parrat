import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlackNotifier } from '../../../src/core/notify/slack.js';

const WEBHOOK_URL = 'https://hooks.slack.com/services/test/webhook';

function mockFetch(status: number, body = 'ok') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  });
}

describe('core/notify/slack', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs to the webhook URL with JSON body and correct headers', async () => {
    const fetch = mockFetch(200);
    vi.stubGlobal('fetch', fetch);

    const notifier = new SlackNotifier(WEBHOOK_URL);
    await notifier.send({ text: 'hello' });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'hello' });
  });

  it('resolves without error on 200', async () => {
    vi.stubGlobal('fetch', mockFetch(200));
    const notifier = new SlackNotifier(WEBHOOK_URL);
    await expect(notifier.send({ text: 'ok' })).resolves.toBeUndefined();
  });

  it('throws with status code on non-2xx response', async () => {
    vi.stubGlobal('fetch', mockFetch(400, 'invalid_payload'));
    const notifier = new SlackNotifier(WEBHOOK_URL);
    await expect(notifier.send({ text: 'bad' })).rejects.toThrow('400');
  });

  it('includes the response body in the error on non-2xx', async () => {
    vi.stubGlobal('fetch', mockFetch(500, 'server_error'));
    const notifier = new SlackNotifier(WEBHOOK_URL);
    await expect(notifier.send({ text: 'bad' })).rejects.toThrow('server_error');
  });

  it('throws on network failure (fetch rejects)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const notifier = new SlackNotifier(WEBHOOK_URL);
    await expect(notifier.send({ text: 'bad' })).rejects.toThrow('ECONNREFUSED');
  });
});
