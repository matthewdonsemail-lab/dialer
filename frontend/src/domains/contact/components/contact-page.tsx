import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BarChart3, BookOpen, FileText, Globe, User } from "@/components/ui/icons";
import { TabBar } from "@/components/ui/TabBar";
import { useToast } from "@/components/ui/Toast";
import { ContactWorkspaceSkeleton } from "@/components/ui/PageSkeletons";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useCallsForRecord } from "@/hooks/use-call-logs";
import { api } from "@/lib/api-client";
import { useUpdateContact, type ContactType } from "@/lib/contacts";
import { appendNote } from "@/lib/contact-notes";
import { toContact } from "@/components/contact/model";
import { ContactSidebar } from "@/components/contact/ContactSidebar";
import { ContactFeed, type ComposerMode } from "@/components/contact/ContactFeed";
import { RailIcons, RailPanel, type RailTab } from "@/components/contact/ContactRail";

type Width = "wide" | "mid" | "narrow";
type NarrowTab = "details" | "timeline" | RailTab;

/**
 * One contact (prospect or lead) as a workspace: the record on the left, the
 * timeline of calls, notes and changes with a composer in the middle, and
 * panels (summary, history, script, notes, website) behind an icon rail on
 * the right. Calls run in the global dialer dock, so they survive leaving.
 */
export function ContactPage({ type }: { type: ContactType }) {
  const params = useParams();
  const id = (type === "lead" ? params.leadId : params.prospectId) ?? "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { error: toastError, success } = useToast();
  const update = useUpdateContact(type);

  const { data: raw, isLoading } = useQuery<any>({
    queryKey: type === "lead" ? ["leads", id] : ["prospect", id],
    queryFn: () => (type === "lead" ? api.leads.get(id) : api.prospects.get(id)),
    enabled: !!id,
    staleTime: 0,
  });
  const contact = useMemo(() => (raw ? toContact(raw, type) : null), [raw, type]);
  const calls = useCallsForRecord(type === "lead" ? { leadId: id } : { prospectId: id });

  // Layout follows the space the page actually gets, not the viewport.
  // A callback ref: the root element changes between the one-pane and three-pane layouts.
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<Width>("wide");
  useLayoutEffect(() => {
    const el = rootEl;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth < 760 ? "narrow" : el.clientWidth < 1180 ? "mid" : "wide");
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rootEl]);

  const [panel, setPanel] = usePersistedState<RailTab | null>("contact-rail-panel", "summary");
  const [narrowTab, setNarrowTab] = useState<NarrowTab>("timeline");
  const [composer, setComposer] = useState<ComposerMode>("note");
  const [composerFocus, setComposerFocus] = useState(0);

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      try {
        await update.mutateAsync({ id, patch: patch as any });
        queryClient.invalidateQueries({ queryKey: ["record-activity", type, id] });
        return true;
      } catch {
        toastError("Not saved", "The change was undone. Try again.");
        return false;
      }
    },
    [update, id, type, queryClient, toastError],
  );

  const author = (user?.user_metadata?.full_name || user?.email || "Someone") as string;
  const addNote = useCallback(
    (body: string) => save({ notes: appendNote(contact?.notes, body, author) }),
    [save, contact?.notes, author],
  );

  const remove = useCallback(async () => {
    try {
      await (type === "lead" ? api.leads.delete(id) : api.prospects.delete(id));
      queryClient.invalidateQueries({ queryKey: ["contacts-page"] });
      success("Deleted", `${contact?.name ?? "The contact"} was removed.`);
      navigate("/contacts");
    } catch {
      toastError("Not deleted", "Twenty refused the delete. Try again.");
    }
  }, [type, id, queryClient, success, contact?.name, navigate, toastError]);

  const compose = (mode: ComposerMode) => {
    setComposer(mode);
    setComposerFocus((n) => n + 1);
    if (width === "narrow") setNarrowTab("timeline");
  };

  if (isLoading) return <ContactWorkspaceSkeleton />;
  if (!contact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
        <p className="text-[14px] text-[var(--ods-text-secondary)]">This {type} was not found. It may have been deleted.</p>
        <button onClick={() => navigate("/contacts")} className="h-9 px-4 rounded-[8px] border border-[var(--ods-border-strong)] text-[13px] font-semibold">
          Back to Contacts
        </button>
      </div>
    );
  }

  const sidebar = <ContactSidebar contact={contact} onSave={save} onDelete={remove} onCompose={compose} />;
  const feed = (
    <ContactFeed
      contact={contact}
      calls={calls}
      composer={composer}
      onComposerChange={setComposer}
      onAddNote={addNote}
      composerFocus={composerFocus}
    />
  );
  const railPanel = (tab: RailTab, onClose: () => void) => (
    <RailPanel tab={tab} contact={contact} calls={calls} onClose={onClose} onSaveNotes={(notes) => save({ notes })} />
  );

  if (width === "narrow") {
    const tabs = [
      { key: "details" as const, label: "Details", icon: User },
      { key: "timeline" as const, label: "Timeline", icon: Activity },
      { key: "summary" as const, label: "Summary", icon: BarChart3 },
      { key: "script" as const, label: "Script", icon: BookOpen },
      { key: "notes" as const, label: "Notes", icon: FileText },
      ...(type === "prospect" ? [{ key: "website" as const, label: "Website", icon: Globe }] : []),
    ];
    return (
      <div ref={setRootEl} className="flex flex-col flex-1 min-h-0">
        <div className="p-2 border-b border-[var(--ods-border)] shrink-0">
          <TabBar tabs={tabs} value={narrowTab} onChange={setNarrowTab} />
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          {narrowTab === "details" ? sidebar : narrowTab === "timeline" ? feed : railPanel(narrowTab, () => setNarrowTab("timeline"))}
        </div>
      </div>
    );
  }

  return (
    <div ref={setRootEl} className="relative flex flex-1 min-h-0">
      <aside className={`${width === "wide" ? "w-80" : "w-72"} shrink-0 border-r border-[var(--ods-border)] flex flex-col min-h-0 bg-[var(--ods-bg-secondary)]`}>{sidebar}</aside>
      <section className="flex flex-1 min-w-0 flex-col">{feed}</section>
      {panel &&
        (width === "wide" ? (
          <aside className="w-80 shrink-0 border-l border-[var(--ods-border)] flex flex-col min-h-0 bg-[var(--ods-bg-primary)]">{railPanel(panel, () => setPanel(null))}</aside>
        ) : (
          <aside className="absolute top-0 bottom-0 right-12 z-20 w-80 border-l border-[var(--ods-border)] flex flex-col min-h-0 bg-[var(--ods-bg-primary)] shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
            {railPanel(panel, () => setPanel(null))}
          </aside>
        ))}
      <RailIcons contact={contact} open={panel} onOpen={setPanel} />
    </div>
  );
}
