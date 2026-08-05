import Pusher from "pusher";

export function getPusher() {
  return new Pusher({
    appId: process.env.PUSHER_APP_ID ?? "",
    key: process.env.NEXT_PUBLIC_PUSHER_KEY ?? "",
    secret: process.env.PUSHER_SECRET ?? "",
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "us2",
    useTLS: true,
  });
}

export function branchChannel(branchId: string) {
  return `private-branch-${branchId}`;
}

export function parseBranchChannel(channelName: string): string | null {
  const prefix = "private-branch-";
  if (!channelName.startsWith(prefix)) return null;
  const branchId = channelName.slice(prefix.length).trim();
  return branchId || null;
}

export async function notifyBranchNewOrder(
  branchId: string,
  payload: { orderId: string; orderNumber: string },
) {
  if (!process.env.PUSHER_APP_ID || !process.env.NEXT_PUBLIC_PUSHER_KEY) {
    return;
  }
  await getPusher().trigger(branchChannel(branchId), "order:new", payload);
}

export async function notifyBranchOrderUpdated(
  branchId: string,
  payload: { orderId: string; orderNumber: string; status: string },
) {
  if (!process.env.PUSHER_APP_ID || !process.env.NEXT_PUBLIC_PUSHER_KEY) {
    return;
  }
  await getPusher().trigger(branchChannel(branchId), "order:updated", payload);
}
