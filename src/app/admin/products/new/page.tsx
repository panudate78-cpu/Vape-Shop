import ProductEditor from '@/components/product-editor';

export default function NewProductPage() {
  return (
    <div>
      <h2 className="text-lg font-black text-white">New product</h2>
      <div className="mt-4"><ProductEditor mode="create" /></div>
    </div>
  );
}
