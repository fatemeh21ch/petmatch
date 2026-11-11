import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductView from "@/components/ProductView";
import { serverApi } from "@/lib/api";
import { fa, fd } from "@/lib/format";

export const dynamic = "force-dynamic";

// Server-rendered title/description/price for search engines; the pet-specific parts load in the browser.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const d = await serverApi<any>(`/api/v1/products/${id}`);
  if (!d) return { title: "محصول پیدا نشد" };
  const best = d.offers.find((o: any) => o.listing_id === d.best_id);
  return {
    title: fd(d.product.name_fa),
    description: `مقایسه قیمت ${d.product.name_fa} در ${d.offers.length} فروشگاه${best ? `، بهترین قیمت با ارسال ${fa(best.total)} تومان` : ""}`,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await serverApi<any>(`/api/v1/products/${id}`);
  if (!d) notFound();
  return <ProductView initial={d} id={id} />;
}
