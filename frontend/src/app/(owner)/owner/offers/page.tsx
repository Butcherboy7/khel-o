'use client';

import { useState } from 'react';
import { Tag, Plus, CheckCircle2, Percent } from 'lucide-react';
import { Card, CardContent, Badge, Button, Input } from '@/components/ui';

export default function OwnerOffersPage() {
  const [promos, setPromos] = useState([
    { id: '1', title: 'Student Night Pass', code: 'STUDENT20', discount: '20% OFF', validDays: 'Mon - Thu', isActive: true },
    { id: '2', title: 'Weekend Night Owl', code: 'NIGHTOWL', discount: 'Flat ₹100 OFF', validDays: 'Fri - Sun', isActive: true }
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newDiscount, setNewDiscount] = useState('');

  const handleCreateOffer = () => {
    if (!newTitle || !newCode) return;
    setPromos([
      ...promos,
      { id: Date.now().toString(), title: newTitle, code: newCode.toUpperCase(), discount: newDiscount || '15% OFF', validDays: 'All Days', isActive: true }
    ]);
    setNewTitle('');
    setNewCode('');
    setNewDiscount('');
    setIsModalOpen(false);
  };

  return (
    <div className="max-w-4xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-8">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <Tag className="h-6 w-6 text-emerald-500" />
            <span>Promotional Offers & Flash Deals</span>
          </h1>
          <p className="text-caption text-text-secondary">Create student discounts, weekend promos, and time-based deals.</p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsModalOpen(true)}
          className="gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
        >
          <Plus className="h-4 w-4" />
          <span>Create Offer</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {promos.map((p) => (
          <Card key={p.id} elevation="raised" className="bg-surface border border-border">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-heading text-h3 text-text-primary">{p.title}</span>
                <Badge variant={p.isActive ? 'success' : 'default'} size="sm">
                  {p.isActive ? 'Active' : 'Paused'}
                </Badge>
              </div>

              <div className="p-3 rounded-xl bg-surface-hover border border-border flex items-center justify-between">
                <span className="font-mono text-caption font-bold text-emerald-600">{p.code}</span>
                <span className="text-caption font-bold text-text-primary">{p.discount}</span>
              </div>

              <span className="text-xs text-text-tertiary">Valid: {p.validDays}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card elevation="raised" className="max-w-md w-full bg-surface border border-border p-6 flex flex-col gap-4">
            <h3 className="font-heading text-h3 text-text-primary">Create Flash Offer</h3>
            <Input label="Offer Title" placeholder="e.g. Festival Flash Deal" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <Input label="Promo Code" placeholder="FESTIVE25" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
            <Input label="Discount Amount/Pct" placeholder="25% OFF or ₹50 OFF" value={newDiscount} onChange={(e) => setNewDiscount(e.target.value)} />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateOffer} className="bg-emerald-500 text-slate-950 font-bold">Create Deal</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
