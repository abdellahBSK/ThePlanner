import webpush from "web-push";
import type { Config } from "./config";
import type { Repo } from "./repo";

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** Sends a notification to every device of a user; returns how many got it. Dead subscriptions are removed. */
export async function sendToUser(repo: Repo, config: Config, userId: string, message: PushMessage): Promise<number> {
  let sent = 0;
  for (const sub of repo.pushSubscriptions(userId)) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
        { TTL: 60 * 30, vapidDetails: { subject: config.vapid.subject, publicKey: config.vapid.publicKey, privateKey: config.vapid.privateKey } },
      );
      sent++;
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) repo.deletePushSubscription(sub.endpoint);
      else console.warn("Push failed:", error?.statusCode ?? error?.message);
    }
  }
  return sent;
}
