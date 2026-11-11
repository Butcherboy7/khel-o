'use client';

import { use } from 'react';
import { DropManage } from '@/components/drops/DropManage';

/** The same run-the-drop screen the café sees, so an admin can do everything on its behalf. */
export default function AdminDropPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="mx-auto w-full max-w-3xl">
      <DropManage id={id} base="/admin/drops" admin />
    </div>
  );
}
