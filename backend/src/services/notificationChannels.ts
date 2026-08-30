import { notify, notifyMany, NotifyInput } from '../repos/notificationRepo';

/**
 * Delivery channels for notifications.
 *
 * In-app is always written. SMS and email are optional add-ons; when their
 * providers aren't configured, the in-app notification still lands, so nothing
 * silently disappears.
 */
export async function send(input: NotifyInput & { sms?: boolean; email?: boolean }): Promise<void> {
  await notify(input);

  if (input.sms && process.env.SMS_API_KEY) {
    // Wire an SMS provider (Hubtel / Arkesel) here when you have one.
    console.log(`[sms] would send to ${input.userId}: ${input.title}`);
  }
  if (input.email && process.env.SMTP_URL) {
    console.log(`[email] would send to ${input.userId}: ${input.title}`);
  }
}

export { notify, notifyMany };
export default send;
