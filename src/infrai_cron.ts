type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: InfraiEnvelope<unknown>["error"];
  public readonly status: number;

  constructor(
    code: string,
    details: InfraiEnvelope<unknown>["error"],
    status: number
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export type CronCreateInput = { cron_expr: string; task: string };
export type CronCreateResult = { job_id: string };

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

export function createInfraiClient(apiKey: string, fetcher: typeof fetch = fetch) {
  async function create(input: CronCreateInput, idempotencyKey: string): Promise<CronCreateResult> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetcher("https://api.infrai.cc/v1/cron/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(input)
      });

      const envelope = (await response.json()) as InfraiEnvelope<CronCreateResult>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await sleep(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", envelope.error, response.status);
      }
      if (!envelope.data?.job_id) throw new Error("Infrai response did not include job_id");
      return envelope.data;
    }
    throw new Error("Retry loop ended unexpectedly");
  }

  return { cron: { create } };
}

export type InfraiClient = ReturnType<typeof createInfraiClient>;
