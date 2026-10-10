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
  Lock,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Search,
  Star,
  Trash2,
  User,
  Users,
} from "@/domains/ui/icons";
import { Chip, statusIcon } from "@/domains/ui/chip";
import { CountryFlag } from "@/domains/country/badge";
import { ConfirmDialog } from "@/domains/ui/modal";
import { useToast } from "@/domains/ui/toast";
import { usePersistedState } from "@/domains/app/persistedState";
import { api } from "@/domains/api/client";
import { countryCode, countryName } from "@/domains/country/lookup";
import { useDialer } from "@/domains/dialer/provider";
import { Button } from "@/domains/ui/button";
import { Pill } from "@/domains/ui/pill";
import { Section } from "@/domains/ui/section";
import { StateSelect } from "@/domains/ui/stateSelect";
import { inputClass as INPUT } from "@/domains/ui/input";
import { contactStatusMachine, toContactStatus, toLegacyStatus } from "@dialer/shared";
import type { Contact } from "@/domains/contact/model";
import { initials } from "@/domains/contact/model";
import { ContactPeople } from "@/domains/contact/people";
import { usePeople } from "@/domains/contact/people";


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
  <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ods-link inline-flex items-center gap-1 min-w-0">
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
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate("/contacts")}>
          Contacts
        </Button>
        <Pill icon={contact.type === "lead" ? User : Users}>{contact.type === "lead" ? "Lead" : "Prospect"}</Pill>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-3">
        {/* who this is, where they are in the pipeline, and what to do next */}
        <section className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] overflow-hidden">
          <div className="p-3 flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-md bg-[color-mix(in_srgb,var(--ods-brand-600)_15%,transparent)] text-[var(--ods-brand-600)] flex items-center justify-center text-[14px] font-semibold">
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
            <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Delete this ${contact.type}`} title={`Delete this ${contact.type}`} onClick={() => setConfirmDelete(true)} />
          </div>
          <div className="px-3 pb-3 space-y-2">
            <div className="text-[12px] font-semibold text-[var(--ods-text-secondary)]">Status</div>
            <StateSelect
              machine={contactStatusMachine}
              value={toContactStatus(contact.status)}
              onChange={(next, { override }) => void onSave({ status: toLegacyStatus(next), ...(override ? { reopen: true } : {}) })}
            />
            {contact.qualification && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[12px] font-semibold text-[var(--ods-text-secondary)]">Qualification</span>
                <Pill tone={contact.qualification === "QUALIFIED" ? "positive" : "negative"}>
                  {contact.qualification === "QUALIFIED" ? "Qualified" : contact.qualification === "DISQUALIFIED" ? "Disqualified" : contact.qualification}
                </Pill>
              </div>
            )}
          </div>
          <div className="grid grid-cols-4 border-t border-[var(--ods-border)] divide-x divide-[var(--ods-border)]">
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
        </section>

        <ContactPeople contact={contact} />

        {/* field search */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2 h-9 px-3 rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] focus-within:border-[var(--ods-brand-500)]">
            <Search className="w-3.5 h-3.5 shrink-0 text-[var(--ods-text-tertiary)]" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fields"
              aria-label="Search fields"
              className="flex-1 min-w-0 bg-transparent text-[14px] outline-none placeholder:text-[var(--ods-text-tertiary)]"
            />
          </div>
          <Button
            variant="secondary"
            aria-pressed={hideEmpty}
            title={hideEmpty ? "Show empty fields" : "Hide empty fields"}
            onClick={() => setHideEmpty(!hideEmpty)}
            className={hideEmpty ? "!border-[var(--ods-brand-600)] !bg-[color-mix(in_srgb,var(--ods-brand-600)_10%,transparent)]" : ""}
          >
            Hide empty
          </Button>
        </div>

        {/* field folders: rows run edge to edge so every divider meets the border */}
        {groups.length === 0 && <p className="p-4 text-center text-[13px] text-[var(--ods-text-tertiary)]">No fields match "{query}".</p>}
        {groups.map((g) => {
          const open = query.trim() !== "" || !closed.includes(g.title);
          return (
            <Section key={g.title} title={g.title} count={g.fields.length} collapsed={!open} onToggle={() => toggleFolder(g.title)}>
              {g.fields.map((f) => (
                <FieldRow key={f.key} field={f} contact={contact} onSave={onSave} onCopied={() => success("Copied", f.label)} />
              ))}
            </Section>
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="h-14 hover:bg-[var(--ods-hover)] disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 text-[12px] font-semibold"
    >
      <Icon className={`w-4 h-4 ${tone}`} aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * Label above value. Editable fields show a pencil and, when empty, an
 * "Add ..." prompt; read-only fields show a lock that says where they come
 * from. Enter or leaving the input saves, Escape cancels; every save is
 * recorded in Twenty and shows up in Record history.
 */
function FieldRow({ field, contact, onSave, onCopied }: { field: FieldDef; contact: Contact; onSave: (p: Patch) => Promise<boolean>; onCopied: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const cancelled = useRef(false);
  const value = field.value(contact);
  const text = field.text(contact);
  const editable = !!field.patch;
  const raw = field.key === "phone" ? contact.phone ?? "" : field.key === "email" ? contact.email ?? "" : text ?? "";

  const start = () => {
    if (!editable) return;
    cancelled.current = false;
    setDraft(raw);
    setEditing(true);
  };
  const commit = async () => {
    setEditing(false);
    if (cancelled.current || !field.patch) return;
    const next = draft.trim();
    if (next === raw) return;
    if (await onSave(field.patch(contact, next))) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="group px-3 py-2">
      <div className="flex items-center justify-between gap-2 h-6">
        <span className="text-[12px] font-semibold text-[var(--ods-text-secondary)] inline-flex items-center gap-1">
          {field.label}
          {!editable && (
            <span title="Filled by enrichment or Twenty. Edit it in Twenty." className="inline-flex">
              <Lock className="w-2.5 h-2.5" aria-label="Read only" />
            </span>
          )}
        </span>
        <span className="flex items-center gap-0.5">
          {saved && <Pill tone="positive">Saved</Pill>}
          {text && !editing && (
            <Button
              variant="ghost"
              size="sm"
              icon={Copy}
              aria-label={`Copy ${field.label.toLowerCase()}`}
              title={`Copy ${field.label.toLowerCase()}`}
              onClick={() => {
                void navigator.clipboard?.writeText(text);
                onCopied();
              }}
              className="!h-6 !w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
            />
          )}
          {editable && !editing && (
            <Button
              variant="ghost"
              size="sm"
              icon={Pencil}
              aria-label={`Edit ${field.label.toLowerCase()}`}
              title={`Edit ${field.label.toLowerCase()}`}
              onClick={start}
              className="!h-6 !w-6 opacity-60 group-hover:opacity-100 focus:opacity-100"
            />
          )}
        </span>
      </div>
      {editing ? (
        <input
          autoFocus
          type={field.inputType ?? "text"}
          value={draft}
          aria-label={field.label}
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
      ) : value ? (
        <div onClick={editable ? start : undefined} className={`mt-0.5 text-[14px] font-semibold break-words text-[var(--ods-text-primary)] ${editable ? "cursor-text" : ""}`}>
          {value}
        </div>
      ) : editable ? (
        <button type="button" onClick={start} className="mt-0.5 text-[14px] font-semibold ods-link">
          Add {field.label.toLowerCase()}
        </button>
      ) : (
        <div className="mt-0.5 text-[14px] text-[var(--ods-text-tertiary)]">Not set</div>
      )}
    </div>
  );
}
