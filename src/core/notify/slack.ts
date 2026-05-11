export interface SlackMessage {
  text: string;
}

/**
 * Delivers a message to a Slack incoming webhook. No OAuth — just a POST.
 * Throws on network failure or non-2xx response so callers can exit non-zero.
 */
export class SlackNotifier {
  constructor(private readonly webhookUrl: string) {}

  async send(message: SlackMessage): Promise<void> {
    let response: Response;
    try {
      response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch (e) {
      throw new Error(`Slack webhook POST failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Slack webhook returned ${response.status}: ${body}`);
    }
  }
}
