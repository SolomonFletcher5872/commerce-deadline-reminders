import { createServer, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { ZodError } from "zod";
import { createInfraiClient, InfraiError, type InfraiClient } from "./infrai_cron.js";
import { orderDeadlineSchema, planOrderReminders } from "./reminder_policy.js";

const webhookBaseUrl = process.env.REMINDER_WEBHOOK_BASE_URL ?? "http://localhost:3000/";

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

export async function scheduleOrderDeadlines(
  input: unknown,
  infrai: InfraiClient,
  now = new Date()
) {
  const order = orderDeadlineSchema.parse(input);
  const plans = planOrderReminders(order, webhookBaseUrl, now);
  const scheduled = [];

  for (const plan of plans) {
    const idempotencyKey = `order:${order.orderId}:${plan.milestone}:${plan.cronExpr}`;
    const result = await infrai.cron.create(
      { cron_expr: plan.cronExpr, task: plan.taskUrl },
      idempotencyKey
    );
    scheduled.push({ milestone: plan.milestone, jobId: result.job_id, dueCron: plan.cronExpr });
  }

  return { orderId: order.orderId, scheduled };
}

function clientStatus(error: InfraiError): number {
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}

export function startService(infrai: InfraiClient, port = 3000) {
  return createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/orders/deadline-reminders") {
      try {
        sendJson(response, 201, await scheduleOrderDeadlines(await readJson(request), infrai));
      } catch (error) {
        if (error instanceof ZodError) return sendJson(response, 400, { error: "Invalid order deadline", issues: error.issues });
        if (error instanceof InfraiError) return sendJson(response, clientStatus(error), { error: error.code, message: error.message });
        return sendJson(response, 502, { error: "Reminder scheduling failed" });
      }
      return;
    }
    sendJson(response, 404, { error: "Route not found" });
  }).listen(port);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  const infrai = createInfraiClient(apiKey);

  if (process.argv.includes("--example")) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = await scheduleOrderDeadlines({
      orderId: "course-order-1042",
      milestones: [{ kind: "receipt", dueAt: tomorrow, completed: false }]
    }, infrai);
    console.log(JSON.stringify(result, null, 2));
  } else {
    startService(infrai);
    console.log("Order deadline service listening on http://localhost:3000");
  }
}
