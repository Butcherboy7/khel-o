'use client';

import { useState, type FormEvent } from 'react';
import { Modal, Button, Input } from '@/components/ui';
import { updateCafeDetails, type OwnerSettings } from '@/lib/api/settings';

interface EditCafeModalProps {
  isOpen: boolean;
  onClose: () => void;
  cafeId: string;
  settings: OwnerSettings;
  onSaved: (updated: { name: string; phoneNumber: string; addressLine1: string; city: string; state: string; pincode: string }) => void;
}

export function EditCafeModal({ isOpen, onClose, cafeId, settings, onSaved }: EditCafeModalProps) {
  const [name, setName] = useState(settings.cafeName);
  const [phoneNumber, setPhoneNumber] = useState(settings.phoneNumber);
  const [addressLine1, setAddressLine1] = useState(settings.addressLine1);
  const [city, setCity] = useState(settings.city);
  const [state, setState] = useState(settings.state);
  const [pincode, setPincode] = useState(settings.pincode);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await updateCafeDetails(cafeId, {
        name,
        phoneNumber,
        addressLine1,
        city,
        state,
        pincode,
      });
      onSaved({ name, phoneNumber, addressLine1, city, state, pincode });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update café details';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Café Profile"
      description="Update your café's public details"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={isSaving} loadingText="Saving...">
            Save Changes
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">
            {error}
          </div>
        )}
        <Input label="Café Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Phone Number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
        <Input label="Address" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} required />
        <div className="grid grid-cols-2 gap-4">
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} required />
          <Input label="State" value={state} onChange={(e) => setState(e.target.value)} required />
        </div>
        <Input label="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} required />
      </form>
    </Modal>
  );
}
