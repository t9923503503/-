import { GoSchedulePrintClient } from '@/components/go-next/GoSchedulePrintClient';
import { getGoAdminBundle } from '@/lib/go-next';

export const dynamic = 'force-dynamic';

export default async function GoSchedulePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getGoAdminBundle(id);
  return <GoSchedulePrintClient state={bundle.state} matches={bundle.matches} />;
}
