import React, { useState, useEffect } from "react";
import { BookOpen, AlertTriangle, Search, Plus, Trash2, Save, X, Check } from "lucide-react";
import { useFloating, autoUpdate, offset, flip, shift, FloatingPortal } from "@floating-ui/react";
import { Badge } from "@/components/ui/Badge";
import { PageCanvas } from "@/components/common/PageCanvas";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { StatusSelect } from "@/components/common/StatusSelect";
import { api } from "@/lib/apiClient";
import { useScripts, Script } from "@/hooks/useScripts";
import { useCreateScript, useDeleteScript, useUpdateScript } from "@/hooks/useScripts";

interface Campaign {
  id: string;
  name: string;
}

// Custom floating-ui dropdown for campaign selection
function CampaignSelect({ campaigns, value, onChange }: { campaigns: Campaign[]; value: string | null; onChange: (id: string | null) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const { refs, floatingStyles } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });

  const selectedCampaign = campaigns.find((c) => c.id === value);

  return (
    <>
      <button
        ref={refs.setReference}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-9 px-3 text-[13px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] text-left flex items-center justify-between"
      >
        <span className={selectedCampaign ? "" : "text-[var(--ods-text-tertiary)]"}>
          {selectedCampaign ? selectedCampaign.name : "No Campaign"}
        </span>
        <svg className="w-4 h-4 text-[var(--ods-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[60] w-48 py-1 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px] shadow-lg flex flex-col gap-0.5 select-none max-h-60 overflow-y-auto"
          >
            <div
              onClick={() => { onChange(null); setIsOpen(false); }}
              className={`h-7 px-2.5 mx-1 rounded-[4px] flex items-center text-[12px] cursor-pointer transition-colors ${
                !value
                  ? "bg-[var(--ods-bg-secondary)] font-medium text-[var(--ods-text-primary)]"
                  : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-bg-secondary)] hover:text-[var(--ods-text-primary)]"
              }`}
            >
              No Campaign
            </div>
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                onClick={() => { onChange(campaign.id); setIsOpen(false); }}
                className={`h-7 px-2.5 mx-1 rounded-[4px] flex items-center text-[12px] cursor-pointer transition-colors ${
                  campaign.id === value
                    ? "bg-[var(--ods-bg-secondary)] font-medium text-[var(--ods-text-primary)]"
                    : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-bg-secondary)] hover:text-[var(--ods-text-primary)]"
                }`}
              >
                {campaign.name}
              </div>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

export function ScriptsPage() {
  const { data: scripts, isLoading } = useScripts();
  const createScript = useCreateScript();
  const updateScript = useUpdateScript();
  const deleteScript = useDeleteScript();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [activeObjection, setActiveObjection] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [categories, setCategories] = useState<string[]>(["General", "Objection Handling", "Introduction", "Follow-up", "Closing"]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [saving, setSaving] = useState(false);
  const [newObjection, setNewObjection] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const [showAddObjection, setShowAddObjection] = useState(false);

  // Load campaigns for selector
  useEffect(() => {
    api.campaigns.list().then((data) => {
      setCampaigns(data.map((c: any) => ({ id: c.id, name: c.name })));
    }).catch(console.error);
  }, []);

  // Initialize edit form when selecting a script
  useEffect(() => {
    if (selectedScript) {
      setEditForm({
        name: selectedScript.name,
        campaignId: selectedScript.campaignId,
        scriptData: {
          content: selectedScript.scriptData?.content || "",
          category: selectedScript.scriptData?.category || "General",
          objection_responses: selectedScript.scriptData?.objection_responses || {},
        },
      });
    }
  }, [selectedScript]);

  const filtered = (scripts || []).filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.scriptData?.category?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  const objections = editForm?.scriptData?.objection_responses
    ? Object.entries(editForm.scriptData.objection_responses)
    : [];

  const handleCreateScript = () => {
    const newScript: Partial<Script> = {
      name: "New Script",
      campaignId: null,
      scriptData: {
        content: "",
        category: "General",
        objection_responses: {},
      },
    };
    createScript.mutate(newScript);
  };

  const handleDeleteScript = (id: string) => {
    deleteScript.mutate(id);
    if (selectedScript?.id === id) {
      setSelectedScript(null);
      setIsEditing(false);
    }
  };

  const handleSave = async () => {
    if (!selectedScript || !editForm) return;
    setSaving(true);
    try {
      await updateScript.mutateAsync({
        id: selectedScript.id,
        data: {
          name: editForm.name,
          campaignId: editForm.campaignId,
          scriptData: editForm.scriptData,
        },
      });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save script:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (selectedScript) {
      setEditForm({
        name: selectedScript.name,
        campaignId: selectedScript.campaignId,
        scriptData: {
          content: selectedScript.scriptData?.content || "",
          category: selectedScript.scriptData?.category || "General",
          objection_responses: selectedScript.scriptData?.objection_responses || {},
        },
      });
    }
  };

  const handleAddObjection = () => {
    if (!newObjection.trim() || !editForm) return;
    setEditForm({
      ...editForm,
      scriptData: {
        ...editForm.scriptData,
        objection_responses: {
          ...editForm.scriptData.objection_responses,
          [newObjection.trim()]: { response: newResponse || "", category: editForm.scriptData.category },
        },
      },
    });
    setNewObjection("");
    setNewResponse("");
    setShowAddObjection(false);
  };

  const removeObjection = (objection: string) => {
    if (editForm) {
      const newResponses = { ...editForm.scriptData.objection_responses };
      delete newResponses[objection];
      setEditForm({
        ...editForm,
        scriptData: {
          ...editForm.scriptData,
          objection_responses: newResponses,
        },
      });
    }
  };

  const updateObjection = (objection: string, field: string, value: string) => {
    if (editForm) {
      setEditForm({
        ...editForm,
        scriptData: {
          ...editForm.scriptData,
          objection_responses: {
            ...editForm.scriptData.objection_responses,
            [objection]: {
              ...editForm.scriptData.objection_responses[objection],
              [field]: value,
            },
          },
        },
      });
    }
  };

  return (
    <PageCanvas
      title="Call Scripts"
      maxWidth="6xl"
      actions={
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search scripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-[12px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] placeholder:text-[var(--ods-text-tertiary)] outline-none focus:border-[var(--ods-brand-500)]"
            />
          </div>
          <button
            onClick={handleCreateScript}
            disabled={createScript.isPending}
            className="h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--ods-brand-600)] text-white hover:opacity-90 transition-opacity flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            New Script
          </button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-[var(--ods-text-tertiary)]">Loading scripts...</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {filtered.map((script) => (
              <button
                key={script.id}
                onClick={() => {
                  setSelectedScript(script);
                  setActiveObjection(null);
                  setIsEditing(false);
                }}
                className={`text-left bg-[var(--ods-bg-secondary)] border rounded-[6px] p-4 hover:border-[var(--ods-brand-500)] transition-colors relative group ${
                  selectedScript?.id === script.id ? "border-[var(--ods-brand-500)]" : "border border-[var(--ods-border)]"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[var(--ods-brand-600)]" />
                    <h3 className="text-[13px] font-semibold text-[var(--ods-text-primary)]">{script.name}</h3>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteScript(script.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[var(--ods-text-tertiary)] hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 rounded-[4px] text-[11px] font-medium bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] text-[var(--ods-text-secondary)]">
                    {script.scriptData?.category || "General"}
                  </span>
                  {script.campaignId && (
                    <Badge variant="blue">
                      {campaigns.find((c) => c.id === script.campaignId)?.name || "Campaign"}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>

          {selectedScript && editForm && (
            <WidgetCard
              title={isEditing ? "Edit Script" : selectedScript.name}
              action={
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--ods-brand-600)] text-white hover:opacity-90 transition-opacity flex items-center gap-1 disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save
                      </button>
                      <button
                        onClick={handleCancel}
                        className="h-7 px-2.5 rounded-[6px] text-[12px] font-medium text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="h-7 px-2.5 rounded-[6px] text-[12px] font-medium text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteScript(selectedScript.id)}
                    disabled={deleteScript.isPending}
                    className="h-7 px-2.5 rounded-[6px] text-[12px] font-medium text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              }
              className="mb-6"
            >
              <div className="space-y-4">
                {/* Name Field */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2 block">
                    Script Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-2 text-[13px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)]"
                    />
                  ) : (
                    <p className="text-[13px] text-[var(--ods-text-primary)]">{selectedScript.name}</p>
                  )}
                </div>

                {/* Campaign Selector */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2 block">
                    Campaign
                  </label>
                  {isEditing ? (
                    <CampaignSelect
                      campaigns={campaigns}
                      value={editForm.campaignId}
                      onChange={(id) => setEditForm({ ...editForm, campaignId: id })}
                    />
                  ) : (
                    <Badge variant="blue">
                      {campaigns.find((c) => c.id === selectedScript.campaignId)?.name || "No Campaign"}
                    </Badge>
                  )}
                </div>

                {/* Category Selector */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2 block">
                    Category
                  </label>
                  {isEditing ? (
                    <StatusSelect
                      value={editForm.scriptData.category}
                      options={categories.map((cat) => ({
                        value: cat,
                        label: cat,
                        dotColor: "bg-gray-400",
                        bgTint: "bg-gray-50",
                        textColor: "text-gray-700",
                      }))}
                      onChange={(val) =>
                        setEditForm({
                          ...editForm,
                          scriptData: { ...editForm.scriptData, category: val },
                        })
                      }
                    />
                  ) : (
                    <span className="inline-block px-2.5 py-0.5 rounded-[4px] text-[11px] font-medium bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] text-[var(--ods-text-secondary)]">
                      {editForm.scriptData.category}
                    </span>
                  )}
                </div>

                {/* Script Content */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-2 block">
                    Script Content
                  </label>
                  {isEditing ? (
                    <textarea
                      value={editForm.scriptData.content}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          scriptData: { ...editForm.scriptData, content: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 text-[13px] border border-[var(--ods-border)] rounded-[4px] bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] outline-none focus:border-[var(--ods-brand-500)] min-h-[120px] resize-y"
                      placeholder="Enter script content..."
                    />
                  ) : (
                    <div className="bg-[var(--ods-bg-primary)] rounded-[4px] p-3 border border-[var(--ods-border)]">
                      <p className="text-[13px] text-[var(--ods-text-primary)] leading-relaxed whitespace-pre-wrap">
                        {editForm.scriptData.content || "No content yet"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Objections */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      Common Objections & Responses
                    </h3>
                    {isEditing && (
                      <button
                        onClick={() => setShowAddObjection(!showAddObjection)}
                        className="text-[11px] text-[var(--ods-brand-600)] hover:text-[var(--ods-brand-700)]"
                      >
                        + Add Objection
                      </button>
                    )}
                  </div>
                  {objections.length > 0 ? (
                    <div className="space-y-2">
                      {objections.map(([objection, data]: [string, any]) => (
                        <div key={objection} className="border border-[var(--ods-border)] rounded-[4px] p-3">
                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={objection}
                                onChange={(e) => {
                                  const newResponses = { ...editForm.scriptData.objection_responses };
                                  delete newResponses[objection];
                                  newResponses[e.target.value] = data;
                                  setEditForm({
                                    ...editForm,
                                    scriptData: { ...editForm.scriptData, objection_responses: newResponses },
                                  });
                                }}
                                className="w-full px-2 py-1 text-[12px] border border-[var(--ods-border)] rounded bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)]"
                                placeholder="Objection"
                              />
                              <textarea
                                value={data.response}
                                onChange={(e) => updateObjection(objection, "response", e.target.value)}
                                className="w-full px-2 py-1 text-[12px] border border-[var(--ods-border)] rounded bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] min-h-[60px]"
                                placeholder="Response"
                              />
                              <button
                                onClick={() => removeObjection(objection)}
                                className="text-[11px] text-red-500 hover:text-red-600"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <div>
                              <button
                                onClick={() => setActiveObjection(activeObjection === objection ? null : objection)}
                                className="w-full text-left"
                              >
                                <span className="font-medium text-[var(--ods-text-primary)]">"{objection}"</span>
                                <span className="text-[11px] text-[var(--ods-text-tertiary)] ml-2">{data.category}</span>
                              </button>
                              {activeObjection === objection && (
                                <p className="mt-1 text-[12px] text-[var(--ods-text-primary)] pl-3 border-l-2 border-[var(--ods-brand-300)]">
                                  {data.response}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : isEditing ? (
                    <p className="text-[12px] text-[var(--ods-text-tertiary)]">No objections added yet. Click "+ Add Objection" to add one.</p>
                  ) : (
                    <p className="text-[12px] text-[var(--ods-text-tertiary)]">No objections yet.</p>
                  )}

                  {/* Add Objection Form */}
                  {isEditing && showAddObjection && (
                    <div className="border border-[var(--ods-brand-300)] rounded-[4px] p-3 bg-[var(--ods-brand-50)]">
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={newObjection}
                          onChange={(e) => setNewObjection(e.target.value)}
                          className="w-full px-2 py-1 text-[12px] border border-[var(--ods-border)] rounded bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)]"
                          placeholder="Enter objection..."
                        />
                        <textarea
                          value={newResponse}
                          onChange={(e) => setNewResponse(e.target.value)}
                          className="w-full px-2 py-1 text-[12px] border border-[var(--ods-border)] rounded bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] min-h-[60px]"
                          placeholder="Enter response..."
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleAddObjection}
                            disabled={!newObjection.trim()}
                            className="h-6 px-2.5 rounded-[4px] text-[11px] font-medium bg-[var(--ods-brand-600)] text-white hover:opacity-90 transition-opacity flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Check className="w-3 h-3" />
                            Add
                          </button>
                          <button
                            onClick={() => {
                              setShowAddObjection(false);
                              setNewObjection("");
                              setNewResponse("");
                            }}
                            className="h-6 px-2.5 rounded-[4px] text-[11px] font-medium text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </WidgetCard>
          )}

          {filtered.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <BookOpen className="w-8 h-8 text-[var(--ods-text-tertiary)] mx-auto mb-3" />
              <p className="text-[13px] text-[var(--ods-text-tertiary)]">
                {searchQuery ? "No scripts found matching your search" : "No scripts yet. Create your first script!"}
              </p>
            </div>
          )}
        </>
      )}
    </PageCanvas>
  );
}
