"use client";
import { use } from "react";
import ProductEditor from "@/components/product-editor";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div>
      <h2 className="text-lg font-black text-white">Edit product</h2>
      <div className="mt-4"><ProductEditor mode="edit" productId={id} /></div>
    </div>
  );
}
