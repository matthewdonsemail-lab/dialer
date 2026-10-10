import { useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Star,
  Trash2,
  User,
  Users,
} from "@/components/ui/icons";
import { Chip, statusIcon } from "@/components/ui/Chip";
import { StatusSelect } from "@/components/common/StatusSelect";
import { CountryFlag } from "@/components/common/CountryBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { api } from "@/lib/api-client";
import { countryCode, countryName } from "@/lib/country";
import { mapLeadProspectStatusOptions } from "@/lib/twenty/options";
import { useDialer } from "@/components/dialer/DialerProvider";
import { INPUT, initials, type Contact } from "./model";
import { ContactPeople, usePeople } from "./ContactPeople";


type Patch = Record<string, unknown>;

interface FieldDef {
  key: string;
  label: string;
  /** Shown value; null renders as "--". */
  value: (c: Contact) => ReactNode | null;
  /** Text for search and the editor. */
  text: (c: Contact) => string | null;
  /** Present when the contact's PATCH route accepts this field. */
  patch?: (c: Contact, v: string) => Patch;
  inputType?: "text" | "tel" | "email" | "url";
}

const link = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[var(--ods-brand-600)] hover:underline inline-flex items-center gap-1 min-w-0">
    <span className="truncate">{label}</span>
    <ExternalLink className="w-3 h-3 shrink-0" />
  </a>
);

/** Prospect address fields are saved together (the API rebuilds the full address). */
const addressPatch = (c: Contact, key: "address" | "city" | "state" | "zip", v: string): Patch => ({
  address: c.address ?? "",
  city: c.city ?? "",
  state: c.state ?? "",
  zip: c.zip ?? "",
  [key]: v,
});

function folders(type: Contact["type"]): { title: string; fields: FieldDef[] }[] {
  const prospect = type === "prospect";
  return [
    {
      title: "Contact",
      fields: [
        { key: "first", label: "First name", text: (c) => c.firstName || null, value: (c) => c.firstName || null, patch: (c, v) => ({ first_name: v, last_name: c.lastName }) },
        { key: "last", label: "Last name", text: (c) => c.lastName || null, value: (c) => c.lastName || null, patch: (c, v) => ({ first_name: c.firstName, last_name: v }) },
        {
          key: "company",
          label: "Company",
          text: (c) => c.company,
          value: (c) => c.company,
          ...(prospect ? {} : { patch: (_c: Contact, v: string) => ({ company: v }) }),
        },
        {
          key: "phone",
          label: "Phone",
          inputType: "tel",
          text: (c) => [c.phone, ...c.extraPhones].filter(Boolean).join(" "),
          value: (c) => (c.phone ? <span className="tabular-nums">{[c.phone, ...c.extraPhones].join(", ")}</span> : null),
          patch: (_c, v) => ({ phone: v }),
        },
        {
          key: "email",
          label: "Email",
          inputType: "email",
          text: (c) => [c.email, ...c.extraEmails].filter(Boolean).join(" "),
          value: (c) => (c.email ? [c.email, ...c.extraEmails].join(", ") : null),
          patch: (_c, v) => ({ email: v }),
        },
        {
          key: "website",
          label: "Website",
          inputType: "url",
          text: (c) => c.website,
          value: (c) => (c.website ? link(c.website, c.website.replace(/^https?:\/\//, "")) : null),
          ...(prospect ? { patch: (_c: Contact, v: string) => ({ website: v }) } : {}),
        },
      ],
    },
    {
      title: "Location",
      fields: [
        { key: "address", label: "Address", text: (c) => c.address, value: (c) => c.address, ...(prospect ? { patch: (c: Contact, v: string) => addressPatch(c, "address", v) } : {}) },
        { key: "city", label: "City", text: (c) => c.city, value: (c) => c.city, ...(prospect ? { patch: (c: Contact, v: string) => addressPatch(c, "city", v) } : {}) },
        { key: "state", label: "State / region", text: (c) => c.state, value: (c) => c.state, ...(prospect ? { patch: (c: Contact, v: string) => addressPatch(c, "state", v) } : {}) },
        { key: "zip", label: "Postcode", text: (c) => c.zip, value: (c) => c.zip, ...(prospect ? { patch: (c: Contact, v: string) => addressPatch(c, "zip", v) } : {}) },
        {
          key: "country",
          label: "Country",
          text: (c) => (c.country ? countryName(c.country) : null),
          value: (c) =>
            c.country ? (
              <span className="inline-flex items-center gap-1.5">
                <CountryFlag code={countryCode(c.country)} />
                {countryName(c.country)}
              </span>
            ) : null,
        },
      ],
    },
    {
      title: "Business",
      fields: [
        {
          key: "niche",
          label: "Industry",
          text: (c) => c.niche ?? c.source,
          value: (c) => c.niche ?? c.source,
          patch: (_c, v) => (prospect ? { source: v, niche: v } : { source: v }),
        },
        { key: "label", label: "Label", text: (c) => c.label, value: (c) => c.label },
        {
          key: "rating",
          label: "Rating",
          text: (c) => (c.rating != null ? String(c.rating) : null),
          value: (c) =>
            c.rating != null ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                {c.rating.toFixed(1)}
                {c.reviewCount != null && <span className="text-[var(--ods-text-tertiary)]">({c.reviewCount} reviews)</span>}
              </span>
            ) : null,
        },
        { key: "reviews", label: "Google reviews", text: (c) => c.googleReviewsUrl, value: (c) => (c.googleReviewsUrl ? link(c.googleReviewsUrl, "Open reviews") : null) },
      ],
    },
    {
      title: "Pipeline",
      fields: [
        { key: "outbound", label: "Outbound state", text: (c) => c.outboundState, value: (c) => c.outboundState },
        { key: "outboundLabel", label: "Outbound label", text: (c) => c.outboundLabel, value: (c) => c.outboundLabel },
        { key: "video", label: "Video", text: (c) => c.videoStatus, value: (c) => c.videoStatus },
        { key: "whatsapp", label: "WhatsApp", text: (c) => c.whatsappStatus, value: (c) => c.whatsappStatus },
        { key: "created", label: "Created", text: (c) => c.createdAt, value: (c) => (c.createdAt ? new Date(c.createdAt).toLocaleString() : null) },
        { key: "updated", label: "Last updated", text: (c) => c.updatedAt, value: (c) => (c.updatedAt ? new Date(c.updatedAt).toLocaleString() : null) },
      ],
    },
  ];
}

export function ContactSidebar({
  contact,
  onSave,
  onDelete,
  onCompose,
}: {
  contact: Contact;
  /** Optimistic save; resolves false when the write failed (and was undone). */
  onSave: (patch: Patch) => Promise<boolean>;
  onDelete: () => Promise<void>;
  onCompose: (mode: "sms" | "note") => void;
}) {
  const navigate = useNavigate();
  const { dial } = useDialer();
  const { success } = useToast();
  const [query, setQuery] = useState("");
  const [hideEmpty, setHideEmpty] = usePersistedState("contact-hide-empty", false);
  const [closed, setClosed] = usePersistedState<string[]>("contact-closed-folders", []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: people } = usePeople(contact);
  const primary = people?.[0] ?? null;

  const plural = contact.type === "lead" ? "agencyLeads" : "agencyProspects";
  const { data: meta } = useQuery<{ fields: Record<string, Array<{ label: string; value: string; color: string }>> }>({
    queryKey: ["twenty-meta", plural],
    queryFn: () => api.twentyMeta.fields(plural),
    staleTime: Infinity,
  });
  const statusOptions = meta?.fields["coldCallStatus"] ? mapLeadProspectStatusOptions(meta.fields["coldCallStatus"]) : [];

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return folders(contact.type)
      .map((g) => ({
        ...g,
        fields: g.fields.filter((f) => {
          const text = f.text(contact);
          if (hideEmpty && !text) return false;
          if (!q) return true;
          return g.title.toLowerCase().includes(q) || f.label.toLowerCase().includes(q) || (text ?? "").toLowerCase().includes(q);
        }),
      }))
      .filter((g) => g.fields.length > 0);
  }, [contact, query, hideEmpty]);

  const toggleFolder = (title: string) => setClosed(closed.includes(title) ? closed.filter((t) => t !== title) : [...closed, title]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="h-12 px-3 shrink-0 flex items-center justify-between gap-2 border-b border-[var(--ods-border)]">
        <button
          onClick={() => navigate("/contacts")}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Contacts
        </button>
        <Chip icon={contact.type === "lead" ? User : Users}>{contact.type === "lead" ? "Lead" : "Prospect"}</Chip>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-3">
        {/* contact card */}
        <div className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-3 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-md bg-[var(--ods-brand-600)]/15 text-[var(--ods-brand-600)] flex items-center justify-center text-[14px] font-semibold">
              {initials(contact.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold truncate" title={contact.name}>
                {contact.name}
              </div>
              <div className="text-[12px] text-[var(--ods-text-tertiary)] truncate">
                {primary ? (
                  <>
                    <span className="font-semibold text-[var(--ods-text-secondary)]">{primary.name}</span>
                    {primary.jobTitle ? ` · ${primary.jobTitle}` : ""}
                  </>
                ) : (
                  contact.niche || contact.company || "No industry"
                )}
              </div>
            </div>
            <button
              onClick={() => setConfirmDelete(true)}
              title={`Delete this ${contact.type}`}
              className="w-8 h-8 shrink-0 rounded-[8px] inline-flex items-center justify-center text-[var(--ods-text-tertiary)] hover:text-red-600 hover:bg-[var(--ods-hover)]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {statusOptions.length > 0 && <StatusSelect value={contact.status || "new"} options={statusOptions} onChange={(status) => void onSave({ status })} />}
            {contact.qualification && (
              <Chip icon={statusIcon(contact.qualification)} iconClassName={contact.qualification === "QUALIFIED" ? "text-emerald-600" : "text-red-600"}>
                {contact.qualification === "QUALIFIED" ? "Qualified" : contact.qualification === "DISQUALIFIED" ? "Disqualified" : contact.qualification}
              </Chip>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <QuickAction
              icon={Phone}
              label="Call"
              tone="text-emerald-600"
              disabled={!contact.phone}
              onClick={() =>
                contact.phone &&
                void dial({ contactType: contact.type, contactId: contact.id, phone: contact.phone, name: contact.name, campaignId: contact.campaignId })
              }
            />
            <QuickAction icon={MessageSquare} label="SMS" tone="text-sky-600" disabled={!contact.phone} onClick={() => onCompose("sms")} />
            <QuickAction icon={Mail} label="Email" tone="text-violet-600" disabled={!contact.email} onClick={() => contact.email && window.open(`mailto:${contact.email}`)} />
            <QuickAction icon={FileText} label="Note" tone="text-amber-600" onClick={() => onCompose("note")} />
          </div>
        </div>

        <ContactPeople contact={contact} />

        {/* field search */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2 h-9 px-2.5 rounded-[8px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] focus-within:border-[var(--ods-brand-500)]">
            <Search className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fields"
              className="flex-1 min-w-0 bg-transparent text-[14px] outline-none placeholder:text-[var(--ods-text-tertiary)]"
            />
          </div>
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            aria-pressed={hideEmpty}
            title={hideEmpty ? "Show empty fields" : "Hide empty fields"}
            className={`h-9 px-2.5 shrink-0 rounded-[8px] border text-[12px] font-semibold whitespace-nowrap ${
              hideEmpty
                ? "border-[var(--ods-brand-600)] bg-[var(--ods-brand-600)]/10 text-[var(--ods-text-primary)]"
                : "border-[var(--ods-border)] text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)]"
            }`}
          >
            Hide empty
          </button>
        </div>

        {/* field folders */}
        {groups.length === 0 && <p className="p-4 text-center text-[13px] text-[var(--ods-text-tertiary)]">No fields match "{query}".</p>}
        {groups.map((g) => {
          const open = query.trim() !== "" || !closed.includes(g.title);
          return (
            <div key={g.title} className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)]">
              <button
                onClick={() => toggleFolder(g.title)}
                aria-expanded={open}
                className="w-full h-10 px-3 flex items-center justify-between text-[14px] font-semibold"
              >
                {g.title}
                {open ? <ChevronDown className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />}
              </button>
              {open && (
                <div className="px-3 pb-2 border-t border-[var(--ods-border)]">
                  {g.fields.map((f) => (
                    <FieldRow key={f.key} field={f} contact={contact} onSave={onSave} onCopied={() => success("Copied", f.label)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        variant="danger"
        title={`Delete ${contact.name}?`}
        message={`This removes the ${contact.type} from Twenty. Calls stay in call history.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void onDelete();
        }}
      />
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  tone,
  disabled,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  tone: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="h-14 rounded-md bg-[var(--ods-bg-tertiary)] hover:bg-[var(--ods-hover)] disabled:opacity-40 flex flex-col items-center justify-center gap-1 text-[12px] font-semibold"
    >
      <Icon className={`w-4 h-4 ${tone}`} />
      {label}
    </button>
  );
}

/** Label above value. Click an editable value to change it; Enter or leaving the field saves, Escape cancels. */
function FieldRow({ field, contact, onSave, onCopied }: { field: FieldDef; contact: Contact; onSave: (p: Patch) => Promise<boolean>; onCopied: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const cancelled = useRef(false);
  const value = field.value(contact);
  const text = field.text(contact);

  const start = () => {
    if (!field.patch) return;
    cancelled.current = false;
    setDraft(field.key === "phone" ? contact.phone ?? "" : field.key === "email" ? contact.email ?? "" : text ?? "");
    setEditing(true);
  };
  const commit = async () => {
    setEditing(false);
    if (cancelled.current || !field.patch) return;
    const next = draft.trim();
    const current = field.key === "phone" ? contact.phone ?? "" : field.key === "email" ? contact.email ?? "" : text ?? "";
    if (next === current) return;
    if (await onSave(field.patch(contact, next))) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  return (
    <div className="group py-2 border-b last:border-b-0 border-[var(--ods-border)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[var(--ods-text-tertiary)]">{field.label}</span>
        <span className="flex items-center gap-1">
          {saved && <Check className="w-3 h-3 text-emerald-600" aria-label="Saved" />}
          {text && !editing && (
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(text);
                onCopied();
              }}
              title={`Copy ${field.label.toLowerCase()}`}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)]"
            >
              <Copy className="w-3 h-3" />
            </button>
          )}
        </span>
      </div>
      {editing ? (
        <input
          autoFocus
          type={field.inputType ?? "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              cancelled.current = true;
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`${INPUT} mt-1`}
        />
      ) : (
        <div
          onClick={field.patch ? start : undefined}
          title={field.patch ? "Click to edit" : undefined}
          className={`mt-0.5 min-h-[22px] text-[14px] break-words ${
            field.patch ? "cursor-text rounded-[6px] -mx-1 px-1 hover:bg-[var(--ods-hover)]" : ""
          } ${value ? "text-[var(--ods-text-primary)]" : "text-[var(--ods-text-tertiary)]"}`}
        >
          {value ?? "--"}
        </div>
      )}
    </div>
  );
}
