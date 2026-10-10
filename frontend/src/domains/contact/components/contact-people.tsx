import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Mail, Pencil, Phone, Plus, Trash2, Users } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useDialer } from "@/components/dialer/DialerProvider";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { api, type Person, type PersonInput } from "@/lib/api-client";
import { Button, Section, SectionRow, buttonClass, inputClass as INPUT } from "@/primitives";
import type { Contact } from "../types/contact";
import { initials } from "../utils/to-contact";
import { usePeople } from "../lib/use-people";

const subtitle = (p: Person) => [p.jobTitle, p.role && p.role !== p.jobTitle ? p.role : null].filter(Boolean).join(" · ");

/**
 * People section of the contact sidebar, like Close's Contacts panel: each
 * person with their role and one-click call, email and LinkedIn, editable in
 * place, plus "Add person". A lead links to one person; a prospect to many.
 */
export function ContactPeople({ contact }: { contact: Contact }) {
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const { data: people = [], isLoading } = usePeople(contact);
  const [open, setOpen] = usePersistedState("contact-people-open", true);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const key = ["people", contact.type, contact.id];
  const canAdd = contact.type === "prospect" || people.length === 0;

  const save = useMutation({
    mutationFn: ({ id, data }: { id: string | null; data: PersonInput }) =>
      id ? api.people.update(id, data) : api.people.create({ ...data, ...(contact.type === "lead" ? { leadId: contact.id } : { prospectId: contact.id }) }),
    onSuccess: (person, { id }) => {
      queryClient.setQueryData<Person[]>(key, (old = []) => (id ? old.map((p) => (p.id === id ? person : p)) : [...old, person]));
      setEditing(null);
      success(id ? "Person updated" : "Person added", person.name);
    },
    onError: (err) => toastError("Not saved", err instanceof Error && err.message ? err.message : "Twenty did not accept the change. Try again."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.people.delete(id),
    onSuccess: (_r, id) => {
      queryClient.setQueryData<Person[]>(key, (old = []) => old.filter((p) => p.id !== id));
      setEditing(null);
      success("Person removed", "It can be restored from Twenty's deleted records.");
    },
    onError: () => toastError("Not removed", "Try again."),
  });

  return (
    <Section
      title="People"
      icon={Users}
      count={people.length}
      collapsed={!open}
      onToggle={() => setOpen(!open)}
      tip={{ title: "People", icon: Users, what: "The people at this business, stored in Twenty as agencyPerson. Call, email or edit them here; every change is recorded in Record history." }}
      action={
        canAdd ? (
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            onClick={() => {
              setOpen(true);
              setEditing("new");
            }}
          >
            Add
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <SectionRow>
          <div className="flex items-center gap-2.5" role="status" aria-label="Loading">
            <div className="w-8 h-8 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-1/2 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
              <div className="h-3 w-1/3 rounded-md bg-[var(--ods-bg-tertiary)] animate-pulse" />
            </div>
          </div>
        </SectionRow>
      ) : people.length === 0 && editing !== "new" ? (
        <SectionRow>
          <p className="text-[13px] text-[var(--ods-text-tertiary)]">No one recorded yet. Add the owner or whoever answers the phone.</p>
        </SectionRow>
      ) : (
        [
          ...people.map((p) =>
            editing === p.id ? (
              <PersonForm
                key={p.id}
                person={p}
                busy={save.isPending || remove.isPending}
                onCancel={() => setEditing(null)}
                onSave={(data) => save.mutate({ id: p.id, data })}
                onRemove={() => remove.mutate(p.id)}
              />
            ) : (
              <PersonRow key={p.id} person={p} contact={contact} onEdit={() => setEditing(p.id)} />
            ),
          ),
          editing === "new" ? <PersonForm key="new" busy={save.isPending} onCancel={() => setEditing(null)} onSave={(data) => save.mutate({ id: null, data })} /> : null,
        ]
      )}
    </Section>
  );
}

function PersonRow({ person, contact, onEdit }: { person: Person; contact: Contact; onEdit: () => void }) {
  const { dial } = useDialer();
  const sub = subtitle(person);
  const action = buttonClass({ variant: "ghost", size: "sm", iconOnly: true });
  return (
    <div className="group px-3 py-2.5 flex items-center gap-2.5">
      {person.avatarUrl ? (
        <img src={person.avatarUrl} alt="" className="w-8 h-8 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="w-8 h-8 shrink-0 rounded-md bg-[var(--ods-bg-tertiary)] text-[12px] font-semibold flex items-center justify-center">{initials(person.name)}</span>
      )}
      <button onClick={onEdit} className="flex-1 min-w-0 text-left" title="Edit">
        <span className="block text-[14px] font-semibold truncate">{person.name}</span>
        <span className="block text-[12px] text-[var(--ods-text-tertiary)] truncate tabular-nums">{sub || person.phone || person.email || "No details yet"}</span>
      </button>
      <span className="flex items-center">
        <button
          onClick={() =>
            person.phone &&
            void dial({
              contactType: contact.type,
              contactId: contact.id,
              phone: person.phone,
              name: contact.name && contact.name !== person.name ? `${person.name} (${contact.name})` : person.name,
              campaignId: contact.campaignId,
            })
          }
          disabled={!person.phone}
          title={person.phone ? `Call ${person.phone}` : "No phone number"}
          className={`${action} text-emerald-600`}
        >
          <Phone className="w-3.5 h-3.5" />
        </button>
        <a
          href={person.email ? `mailto:${person.email}` : undefined}
          aria-disabled={!person.email}
          title={person.email ?? "No email"}
          className={`${action} text-violet-600 ${person.email ? "" : "opacity-30 pointer-events-none"}`}
        >
          <Mail className="w-3.5 h-3.5" />
        </a>
        {person.linkedin && (
          <a href={person.linkedin} target="_blank" rel="noreferrer" title="LinkedIn" className={`${action} text-sky-600`}>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button onClick={onEdit} title="Edit" className={`${action} text-[var(--ods-text-tertiary)] opacity-0 group-hover:opacity-100 focus:opacity-100`}>
          <Pencil className="w-3 h-3" />
        </button>
      </span>
    </div>
  );
}

function PersonForm({
  person,
  busy,
  onSave,
  onCancel,
  onRemove,
}: {
  person?: Person;
  busy: boolean;
  onSave: (data: PersonInput) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const [draft, setDraft] = useState<PersonInput>({
    name: person?.name === "Unnamed person" ? "" : person?.name ?? "",
    jobTitle: person?.jobTitle ?? "",
    phone: person?.phone ?? "",
    email: person?.email ?? "",
    linkedin: person?.linkedin ?? "",
  });
  const field = (key: keyof PersonInput, label: string, type = "text", placeholder = "") => (
    <label className="block">
      <span className="block text-[12px] font-semibold text-[var(--ods-text-secondary)] mb-1">{label}</span>
      <input
        type={type}
        value={draft[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        className={INPUT}
        autoFocus={key === "name"}
      />
    </label>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.name.trim()) onSave(draft);
      }}
      className="p-3 space-y-2.5 bg-[var(--ods-bg-secondary)]"
    >
      {field("name", "Name", "text", "e.g. John Lally")}
      {field("jobTitle", "Job title", "text", "e.g. Owner")}
      {field("phone", "Phone", "tel", "+353 …")}
      {field("email", "Email", "email")}
      {field("linkedin", "LinkedIn", "url", "linkedin.com/in/…")}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" variant="primary" disabled={!draft.name.trim()} busy={busy} busyLabel="Saving…">
          {person ? "Save" : "Add person"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        {onRemove && <Button variant="danger-soft" icon={Trash2} onClick={onRemove} disabled={busy} title="Remove this person" aria-label="Remove this person" className="ml-auto" />}
      </div>
    </form>
  );
}

