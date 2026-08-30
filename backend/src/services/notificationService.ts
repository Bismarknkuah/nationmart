import { notify as pgNotify, notifyMany, NotifyInput } from '../repos/notificationRepo';

/**
 * Notifications. Kept as a thin service so existing call sites don't change.
 * Never throws: a failed notification must not break the payment or delivery
 * that triggered it.
 */
export async function notify(input: {
  user: string; type?: string; title: string; message?: string; link?: string;
}): Promise<void> {
  await pgNotify({
    userId: String(input.user),
    type: (input.type as any) ?? 'system',
    title: input.title,
    message: input.message,
    link: input.link,
  });
}

export { notifyMany };
export type { NotifyInput };
export default notify;
