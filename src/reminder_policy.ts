import { z } from "zod";

export const milestoneSchema = z.object({
  kind: z.enum(["checkout", "fulfillment", "receipt", "customer_update"]),
  dueAt: z.string().datetime({ offset: true }),
  completed: z.boolean().default(false)
});

export const orderDeadlineSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  milestones: z.array(milestoneSchema).min(1).max(12)
});

export type OrderDeadline = z.infer<typeof orderDeadlineSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;

export type ReminderPlan = {
  milestone: Milestone["kind"];
  cronExpr: string;
  taskUrl: string;
};

function cronFor(date: Date): string {
  return `${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;
}

export function planOrderReminders(
  order: OrderDeadline,
  webhookBaseUrl: string,
  now: Date
): ReminderPlan[] {
  const base = new URL(webhookBaseUrl);

  return order.milestones
    .filter((milestone) => !milestone.completed && new Date(milestone.dueAt) > now)
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
    .map((milestone) => {
      const task = new URL("reminders/order-deadline", base);
      task.searchParams.set("orderId", order.orderId);
      task.searchParams.set("milestone", milestone.kind);
      return {
        milestone: milestone.kind,
        cronExpr: cronFor(new Date(milestone.dueAt)),
        taskUrl: task.toString()
      };
    });
}
