import React, { useState, useEffect } from 'react';
import { ChevronDown } from "@/domains/ui/icons";
import { contactStatusMachine, toContactStatus, toLegacyStatus } from "@dialer/shared";
import { TONE_DOT } from "@/domains/ui/tokens";
import { SelectMenu } from "@/domains/ui/menu";
import { Modal } from '@/domains/ui/modal';
import { Button } from '@/domains/ui/legacyButton';
import { Input } from '@/domains/ui/input';

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

const COUNTRY_CODES = [
  { code: '+1', label: '+1 (US)' },
  { code: '+91', label: '+91 (IN)' },
  { code: '+44', label: '+44 (UK)' },
  { code: '+353', label: '+353 (IE)' },
  { code: '+61', label: '+61 (AU)' },
];

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
    if (initialData?.phone) {
      const trimmed = initialData.phone.trim();
      const matched = COUNTRY_CODES.find((c) => trimmed.startsWith(c.code));
      if (matched) {
        setFormData((prev) => ({
          ...prev,
          phone_country: matched.code,
          phone: trimmed.slice(matched.code.length),
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          phone: trimmed,
        }));
      }
    }
  }, [initialData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned: LeadFormData = { ...formData };
    if (!cleaned.campaign_id) cleaned.campaign_id = null as any;

    let rawDigits = (cleaned.phone || '').trim();
    if (rawDigits.startsWith(cleaned.phone_country)) {
      rawDigits = rawDigits.slice(cleaned.phone_country.length).trim();
    } else if (rawDigits.startsWith('+')) {
      rawDigits = rawDigits.replace(/^\+/, '').trim();
    }

    const fullPhone = rawDigits ? `${cleaned.phone_country}${rawDigits}` : '';
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
            <label className="block text-[14px] font-medium text-[var(--ods-text-primary)] mb-1">Phone</label>
            <div className="flex">
              <SelectMenu
                value={formData.phone_country}
                onChange={(v) => setFormData((prev) => ({ ...prev, phone_country: v }))}
                width={200}
                searchable
                sections={[{ options: COUNTRY_CODES.map((c) => ({ value: c.code, label: c.label })) }]}
                triggerTitle="Country code"
                triggerClassName="w-24 h-9 px-2 rounded-l-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-secondary)] text-[14px] inline-flex items-center justify-between gap-1"
                trigger={
                  <>
                    <span className="truncate">{COUNTRY_CODES.find((c) => c.code === formData.phone_country)?.label ?? formData.phone_country}</span>
                    <ChevronDown className="w-3 h-3 opacity-60" aria-hidden="true" />
                  </>
                }
              />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="(862) 366-7732"
                className="flex-1 px-3 py-2 border border-l-0 border-[var(--ods-border-strong)] rounded-r-lg text-[14px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
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
            <label className="block text-[14px] font-medium text-[var(--ods-text-primary)] mb-1">Status</label>
            <SelectMenu
              value={formData.status}
              onChange={(v) => setFormData((prev) => ({ ...prev, status: v as typeof prev.status }))}
              width={260}
              sections={[
                {
                  options: contactStatusMachine.states.map((s) => ({
                    value: toLegacyStatus(s),
                    label: contactStatusMachine.def(s).label,
                    dot: TONE_DOT[contactStatusMachine.def(s).tone],
                    description: contactStatusMachine.def(s).description,
                  })),
                },
              ]}
              triggerClassName="w-full h-9 px-3 rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[14px] inline-flex items-center gap-2"
              trigger={
                <>
                  <span className={`w-2.5 h-2.5 rounded-md ${TONE_DOT[contactStatusMachine.def(toContactStatus(formData.status) ?? "NEW").tone]}`} aria-hidden="true" />
                  <span className="flex-1 text-left">{contactStatusMachine.label(toContactStatus(formData.status))}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" aria-hidden="true" />
                </>
              }
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
