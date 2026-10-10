import { ScriptsHeader, ScriptsWorkspace } from "@/components/scripts/ScriptsWorkspace";

/**
 * Call scripts page: the same workspace the Contacts "Scripts" button opens
 * in a modal (create, edit, delete, objections, performance), full height.
 */
export function ScriptsPage() {
  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--ods-bg-primary)]">
      <ScriptsHeader />
      <ScriptsWorkspace />
    </div>
  );
}
