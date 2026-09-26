import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface LeadFormData {
  first_name: string;
  last_name: string;
  company: string;
  phone_country: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  source: string;
  status: string;
  campaign_id: string;
}

interface LeadFormProps {
  onClose: () => void;
  onSubmit: (data: LeadFormData) => Promise<void>;
  initialData?: Partial<LeadFormData>;
}

export function LeadForm({ onClose, onSubmit, initialData }: LeadFormProps) {
  const [formData, setFormData] = useState<LeadFormData>({
    first_name: initialData?.first_name ?? '',
    last_name: initialData?.last_name ?? '',
    company: initialData?.company ?? '',
    phone_country: '+1',
    phone: initialData?.phone ?? '',
    email: initialData?.email ?? '',
    website: initialData?.website ?? '',
    address: initialData?.address ?? '',
    city: initialData?.city ?? '',
    state: initialData?.state ?? '',
    zip: initialData?.zip ?? '',
    source: initialData?.source ?? '',
    status: initialData?.status ?? 'new',
    campaign_id: initialData?.campaign_id ?? '',
  });

  useEffect(() => {
    if (initialData?.phone && initialData.phone.startsWith('+1')) {
      setFormData((prev) => ({
        ...prev,
        phone_country: '+1',
        phone: initialData?.phone?.slice(2) ?? '',
      }));
    }
  }, [initialData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned: LeadFormData = { ...formData };
    if (!cleaned.campaign_id) cleaned.campaign_id = null as any;
    const fullPhone = `${cleaned.phone_country}${cleaned.phone}`;
    await onSubmit({ ...cleaned, phone: fullPhone, phone_country: undefined as any });
    onClose();
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={initialData?.first_name ? 'Edit Lead' : 'New Lead'}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="lead-form">
            Save Lead
          </Button>
        </div>
      }
    >
      <form id="lead-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            value={formData.first_name}
            onChange={(e) => setFormData((prev) => ({ ...prev, first_name: e.target.value }))}
          />
          <Input
            label="Last Name"
            value={formData.last_name}
            onChange={(e) => setFormData((prev) => ({ ...prev, last_name: e.target.value }))}
          />
        </div>

        <Input
          label="Company"
          value={formData.company}
          onChange={(e) => setFormData((prev) => ({ ...prev, company: e.target.value }))}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <div className="flex">
              <select
                value={formData.phone_country}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone_country: e.target.value }))}
                className="w-20 px-2 py-2 border border-gray-300 rounded-l-lg text-sm bg-gray-50 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                <option value="+1">+1 (US)</option>
              </select>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="(862) 366-7732"
                className="flex-1 px-3 py-2 border border-l-0 border-gray-300 rounded-r-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>
          <Input
            label="Email"
            type="email"
            icon="email"
            value={formData.email}
            onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
          />
        </div>

        <Input
          label="Website"
          type="url"
          value={formData.website}
          onChange={(e) => setFormData((prev) => ({ ...prev, website: e.target.value }))}
        />

        <Input
          label="Address"
          value={formData.address}
          onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
        />

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="City"
            value={formData.city}
            onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
          />
          <Input
            label="State"
            value={formData.state}
            onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
          />
          <Input
            label="ZIP"
            value={formData.zip}
            onChange={(e) => setFormData((prev) => ({ ...prev, zip: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Source"
            value={formData.source}
            onChange={(e) => setFormData((prev) => ({ ...prev, source: e.target.value }))}
            placeholder="e.g. website, referral"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="interested">Interested</option>
              <option value="not_interested">Not Interested</option>
              <option value="callback">Callback</option>
              <option value="converted">Converted</option>
              <option value="do_not_contact">Do Not Contact</option>
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
}
