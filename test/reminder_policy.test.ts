import assert from "node:assert/strict";
import test from "node:test";
import { planOrderReminders } from "../src/reminder_policy.js";

test("plans reminders only for unfinished future order milestones", () => {
  const plans = planOrderReminders({
    orderId: "course-order-1042",
    milestones: [
      { kind: "checkout", dueAt: "2026-09-07T09:30:00.000Z", completed: true },
      { kind: "fulfillment", dueAt: "2026-09-08T10:45:00.000Z", completed: false },
      { kind: "receipt", dueAt: "2026-09-05T08:00:00.000Z", completed: false },
      { kind: "customer_update", dueAt: "2026-09-09T12:00:00.000Z", completed: false }
    ]
  }, "https://learning-shop.example/webhooks/", new Date("2026-09-06T00:00:00.000Z"));

  assert.deepEqual(plans, [
    {
      milestone: "fulfillment",
      cronExpr: "45 10 8 9 *",
      taskUrl: "https://learning-shop.example/webhooks/reminders/order-deadline?orderId=course-order-1042&milestone=fulfillment"
    },
    {
      milestone: "customer_update",
      cronExpr: "0 12 9 9 *",
      taskUrl: "https://learning-shop.example/webhooks/reminders/order-deadline?orderId=course-order-1042&milestone=customer_update"
    }
  ]);
});
