import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Globe, Mail, MapPin, Phone, Star, X, type IconComponent } from "@/domains/ui/icons";
import { api } from "@/domains/api/client";
import { buttonClass } from "@/domains/ui/button";
import { Chip } from "@/domains/ui/chip";
import { LABEL, LINK } from "@/domains/ui/tokens";
import { toContact, initials, type Contact } from "@/domains/contact/model";
import { usePeople } from "@/domains/contact/people";
import { parseNotes } from "@/domains/contact/notes";
import { useCallsForRecord } from "@/domains/calls/data";
import { DispositionBadge } from "@/domains/calls/disposition";
import { CountryFlag } from "@/domains/country/badge";
import { countryCode } from "@/domains/country/lookup";
import { timeAgo } from "@/domains/admin/data";
import { Skeleton } from "@/domains/ui/skeleton";

/** "not_interested" -> "Not interested". */
function words(value: string): string {
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Fact({ icon: Icon, children }: { icon: IconComponent; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-[var(--ods-border)] last:border-b-0">
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--ods-text-tertiary)]" />
      <div className="min-w-0 flex-1 text-[13px] text-[var(--ods-text-primary)] break-words">{children}</div>
    </div>
  );
}

function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="px-4 py-3 border-t border-[var(--ods-border)]">
      <div className={`${LABEL} mb-1.5 flex items-center gap-1.5`}>
        {title}
        {typeof count === "number" && <span className="text-[var(--ods-text-tertiary)] font-medium">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function People({ contact }: { contact: Contact }) {
  const { data: people } = usePeople(contact);
  if (!people?.length) return null;
  return (
    <Block title="People" count={people.length}>
      {people.map((p) => (
        <div key={p.id} className="py-1.5 flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-md shrink-0 inline-flex items-center justify-center text-[12px] font-semibold bg-[var(--ods-bg-secondary)] text-[var(--ods-text-secondary)]">
            {initials(p.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold truncate">{p.name}</span>
            <span className="block text-[12px] text-[var(--ods-text-tertiary)] truncate">{[p.jobTitle, p.role, p.phone].filter(Boolean).join(" · ") || "No details"}</span>
          </span>
        </div>
      ))}
    </Block>
  );
}

/** The panel's own shape while the contact loads: header, chips, facts, blocks. */
function PanelSkeleton() {
  return (
    <div role="status" aria-label="Loading the contact">
      <div className="px-4 pt-3 flex gap-1.5">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-12" />
      </div>
      <div className="px-4 py-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2.5 py-2.5 border-b border-[var(--ods-border)] last:border-b-0">
            <Skeleton className="h-3.5 w-3.5" />
            <Skeleton className="h-3.5" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
          </div>
        ))}
      </div>
      {[0, 1].map((b) => (
        <div key={b} className="px-4 py-3 border-t border-[var(--ods-border)] space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * The business being called, beside the dock like the call script: who they
 * are, how to reach them, the people there, how earlier calls went and the
 * latest notes, with a link to the full contact page.
 */
export function DockContactPanel({ contactType, contactId, onClose }: { contactType: "prospect" | "lead"; contactId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: raw, isLoading } = useQuery<any>({
    queryKey: contactType === "lead" ? ["leads", contactId] : ["prospect", contactId],
    queryFn: () => (contactType === "lead" ? api.leads.get(contactId) : api.prospects.get(contactId)),
    staleTime: 30_000,
  });
  const contact = useMemo(() => (raw ? toContact(raw, contactType) : null), [raw, contactType]);
  const calls = useCallsForRecord(contactType === "lead" ? { leadId: contactId } : { prospectId: contactId }).slice(0, 5);
  const notes = useMemo(() => parseNotes(contact?.notes).slice(-3).reverse(), [contact?.notes]);
  const path = contactType === "lead" ? `/leads/${contactId}` : `/contacts/${contactId}`;
  const place = contact ? [contact.address, contact.city, contact.state].filter(Boolean).join(", ") : "";

  return (
    <div className="bg-[var(--ods-bg-primary)] rounded-[12px] shadow-[0_16px_40px_rgba(0,0,0,0.18)] w-full max-h-[calc(100vh-64px)] overflow-y-auto border border-[var(--ods-border)]">
      <div className="px-4 py-3 flex items-start gap-3 border-b border-[var(--ods-border)] sticky top-0 bg-[var(--ods-bg-primary)]">
        <span className="w-10 h-10 rounded-[8px] shrink-0 inline-flex items-center justify-center text-[14px] font-semibold bg-[color-mix(in_srgb,var(--ods-brand-600)_12%,transparent)] text-[var(--ods-brand-700)] dark:text-[var(--ods-brand-300)]">
          {contact ? initials(contact.name) : ""}
        </span>
        <div className="min-w-0 flex-1">
          {contact ? (
            <div className="text-[15px] font-semibold truncate">{contact.name}</div>
          ) : isLoading ? (
            <Skeleton className="h-4 w-40 my-0.5" />
          ) : (
            <div className="text-[15px] font-semibold truncate">Contact not found</div>
          )}
          <div className="text-[12px] text-[var(--ods-text-tertiary)] truncate">{[contact?.niche ?? contact?.company, contact?.city].filter(Boolean).join(" · ")}</div>
        </div>
        <button onClick={onClose} title="Close" aria-label="Close the contact panel" className={buttonClass({ variant: "ghost", size: "sm", iconOnly: true })}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {!contact && isLoading && <PanelSkeleton />}
      {contact && (
        <>
          <div className="px-4 pt-3 flex flex-wrap items-center gap-1.5">
            {contact.status && <Chip>{words(contact.status)}</Chip>}
            {contact.label && <Chip>{words(contact.label)}</Chip>}
            {contact.country && (
              <Chip>
                <span className="inline-flex items-center gap-1.5">
                  <CountryFlag code={countryCode(contact.country)} />
                  {countryCode(contact.country) ?? contact.country}
                </span>
              </Chip>
            )}
          </div>
          <div className="px-4 py-2">
            {contact.phone && <Fact icon={Phone}><span className="tabular-nums">{[contact.phone, ...contact.extraPhones].join(", ")}</span></Fact>}
            {contact.email && <Fact icon={Mail}>{contact.email}</Fact>}
            {contact.website && (
              <Fact icon={Globe}>
                <a href={contact.website} target="_blank" rel="noreferrer" className={LINK}>
                  {contact.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </Fact>
            )}
            {place && <Fact icon={MapPin}>{place}</Fact>}
            {contact.rating !== null && (
              <Fact icon={Star}>
                {contact.rating} stars{contact.reviewCount !== null ? ` from ${contact.reviewCount} reviews` : ""}
                {contact.googleReviewsUrl && (
                  <>
                    {" · "}
                    <a href={contact.googleReviewsUrl} target="_blank" rel="noreferrer" className={LINK}>
                      Read them
                    </a>
                  </>
                )}
              </Fact>
            )}
          </div>

          <People contact={contact} />

          <Block title="Earlier calls" count={calls.length}>
            {calls.length === 0 ? (
              <p className="text-[13px] text-[var(--ods-text-tertiary)]">This is the first call.</p>
            ) : (
              calls.map((c) => (
                <div key={c.id} className="py-1.5">
                  <div className="flex items-center gap-2">
                    <DispositionBadge status={c.status} />
                    <span className="text-[12px] text-[var(--ods-text-tertiary)]">{c.startedAt ? timeAgo(c.startedAt) : ""}</span>
                  </div>
                  {(c.aiSummary || c.summary) && <p className="mt-1 text-[13px] text-[var(--ods-text-secondary)] line-clamp-2">{c.aiSummary || c.summary}</p>}
                </div>
              ))
            )}
          </Block>

          {notes.length > 0 && (
            <Block title="Latest notes" count={notes.length}>
              {notes.map((n, i) => (
                <div key={i} className="py-1.5">
                  <div className="text-[12px] text-[var(--ods-text-tertiary)]">{[n.author, n.at ? timeAgo(n.at) : null].filter(Boolean).join(" · ")}</div>
                  <p className="text-[13px] text-[var(--ods-text-primary)] whitespace-pre-wrap line-clamp-4">{n.body}</p>
                </div>
              ))}
            </Block>
          )}
        </>
      )}

      <div className="p-3 border-t border-[var(--ods-border)] sticky bottom-0 bg-[var(--ods-bg-primary)]">
        <button onClick={() => navigate(path)} className={buttonClass({ variant: "secondary", size: "md", block: true })}>
          <ExternalLink className="w-3.5 h-3.5" />
          Open the full contact
        </button>
      </div>
    </div>
  );
}

