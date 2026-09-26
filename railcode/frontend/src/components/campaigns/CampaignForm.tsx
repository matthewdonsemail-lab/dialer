import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Database } from '@/types/database';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

interface CampaignFormProps {
  onClose: () => void;
  onSubmit: (data: { name: string; type: 'outbound' | 'inbound' | 'blended'; status: 'active' | 'paused' | 'completed'; settings: Record<string, unknown> | null }) => Promise<void>;
  initialData?: Campaign;
}

export function CampaignForm({ onClose, onSubmit, initialData }: CampaignFormProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [type, setType] = useState<'outbound' | 'inbound' | 'blended'>(initialData?.type ?? 'outbound');
  const [status, setStatus] = useState<'active' | 'paused' | 'completed'>(initialData?.status ?? 'active');
  const [settingsText, setSettingsText] = useState<string>(JSON.stringify(initialData?.settings ?? {}, null, 2));
  const [settingsError, setSettingsError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError('');

    let parsedSettings: Record<string, unknown> | null = null;
    const trimmed = settingsText.trim();
    if (trimmed && trimmed !== '{}') {
      try {
        parsedSettings = JSON.parse(trimmed);
      } catch {
        setSettingsError('Invalid JSON. Please check your syntax.');
        return;
      }
    }

    await onSubmit({ name, type, status, settings: parsedSettings });
    onClose();
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={initialData ? 'Edit Campaign' : 'New Campaign'}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="campaign-form">
            Save Campaign
          </Button>
        </div>
      }
    >
      <form id="campaign-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Campaign Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
            >
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
              <option value="blended">Blended</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Settings (JSON)</label>
          <textarea
            id="campaign-settings"
            value={settingsText}
            onChange={(e) => setSettingsText(e.target.value)}
            rows={4}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none ${
              settingsError ? 'border-red-300 bg-red-50' : 'border-gray-300'
            }`}
          />
          {settingsError && (
            <p className="text-xs text-red-600 mt-1">{settingsError}</p>
          )}
        </div>
      </form>
    </Modal>
  );
}
