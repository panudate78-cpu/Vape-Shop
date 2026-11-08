"use client";
import ProductEditor from "@/components/product-editor";

// params is a synchronous object in Next 14 / React 18 (only a Promise in Next 15+).
export default function EditProductPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <h2 className="text-lg font-black text-white">Edit product</h2>
      <div className="mt-4"><ProductEditor mode="edit" productId={params.id} /></div>
    </div>
  );
}
