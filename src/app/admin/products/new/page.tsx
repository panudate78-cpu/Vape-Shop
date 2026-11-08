"use client";
import ProductEditor from "@/components/product-editor";

export default function NewProductPage() {
  return (
    <div>
      <h2 className="text-lg font-black text-white">New product</h2>
      <p className="text-xs text-zinc-400">Create item, assign category/tags, then generate the Flavor × Nicotine variant matrix.</p>
      <div className="mt-4"><ProductEditor mode="create" /></div>
    </div>
  );
}
