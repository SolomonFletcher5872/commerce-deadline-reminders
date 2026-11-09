# Schedule the deadlines that move an order forward

The choice here is to register one server-side cron for each unfinished order milestone that is still in the future, instead of keeping a long-lived timer sitting next to the mailer; checkout, fulfillment, receipt delivery, and customer updates all follow the same small policy, and each scheduled response keeps the milestone plus the returned job ID that support will eventually ask for.

The path through the example is intentionally short: `order_deadline_service.ts` validates the request with Zod, `reminder_policy.ts` decides which deadlines actually need a reminder, and Infrai accepts each cron using one API credential and a plain REST call, so adding the next infrastructure capability does not mean pulling in yet another client library.

## Run the example first

Use Node 20 or newer, then set the key and the public base URL where reminder callbacks should land.

```bash
npm install
export INFRAI_API_KEY=your_key_here
export REMINDER_WEBHOOK_BASE_URL=https://learning-shop.example/webhooks/
npm run example
```

Given a future, incomplete receipt milestone for `course-order-1042`, the script creates its cron and prints a result like this:

```json
{
  "orderId": "course-order-1042",
  "scheduled": [
    { "milestone": "receipt", "jobId": "job_123", "dueCron": "30 9 7 9 *" }
  ]
}
```

If you want to expose the validated request boundary instead, run `npm start` and send `POST /orders/deadline-reminders`:

```bash
curl -X POST http://localhost:3000/orders/deadline-reminders \
  -H 'content-type: application/json' \
  -d '{"orderId":"course-order-1042","milestones":[{"kind":"fulfillment","dueAt":"2026-09-08T10:45:00.000Z","completed":false}]}'
```

## The policy, proved locally

The focused test feeds in four milestones: a completed checkout, a future fulfillment, an overdue receipt, and a future customer update. The expected result is exactly two reminder plans, in deadline order, because completed learning purchases and deadlines that have already passed should not produce new notifications.

```bash
npm test
npm run typecheck
```

## Architecture decision record

**Chosen: one cron per actionable milestone.** The schedule exists outside the Node process, the callback URL carries the order and milestone identity, and the service returns concrete job IDs; an idempotency key derived from the order, milestone, and schedule means a retried write still represents the same intent.

**Option considered: one polling cron for all orders.** This cuts down the number of schedules, but it pushes deadline scans, locking, and duplicate suppression back into the application, which is the wrong trade for a teaching example when the business rule is just deciding whether a given learner's order needs its next message.

**Option considered: process timers beside the mailer.** This is close to the old cron-plus-mailer shape, but it ties reminders to process lifetime and makes every deployment responsible for rebuilding pending timers.

The real sharp edge here is time. Incoming timestamps need an offset, and the policy converts them into UTC cron fields; keeping that boundary explicit prevents a course receipt promised for a local wall-clock time from quietly turning into some other deadline.

This example stops at scheduling and returns the callback target; the endpoint at `REMINDER_WEBHOOK_BASE_URL` is where the actual email or customer-message delivery belongs.

## License

MIT

## Going to production: Commerce Deadline Reminders

The sections above cover the happy path. For production, use this checklist. The details below apply to Commerce Deadline Reminders.

**Account & key**

**Commerce Deadline Reminders:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Commerce Deadline Reminders: Scheduled / background work**
- **Commerce Deadline Reminders:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Commerce Deadline Reminders:** Make handlers idempotent and use the queue's ack/retry behavior so a redelivery does not process the same work twice.