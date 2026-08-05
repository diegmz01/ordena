import OrderPageClient from "./order-client";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; t?: string }>;
}) {
  const { id } = await params;
  const { success, t } = await searchParams;

  return <OrderPageClient id={id} success={success} viewToken={t} />;
}
