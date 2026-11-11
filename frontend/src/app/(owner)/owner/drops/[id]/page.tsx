'use client';

import { use } from 'react';
import { DropManage } from '@/components/drops/DropManage';

export default function OwnerDropPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DropManage id={id} />;
}
