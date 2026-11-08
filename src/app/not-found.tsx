import Link from 'next/link';
export default function NotFound() {
  return <div className="card text-center py-20"><h1 className="text-2xl font-bold">Page not found</h1><p className="text-slate-500 mt-2">The page you're looking for doesn't exist.</p><Link href="/" className="btn-primary mt-4 inline-block">Go home</Link></div>;
}
