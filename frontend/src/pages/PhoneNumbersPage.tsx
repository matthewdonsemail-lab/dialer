import React from "react";
import { Pill } from "@/primitives";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { DataTable, useDataTable, type DataColumn } from "@/components/table";
import { Phone } from "@/components/ui/icons";
import { CountryBadge, CountryFlag } from "@/components/common/CountryBadge";
import { countryCode, countryName } from "@/lib/country";

interface AgencyPhone {
  id: string;
  phoneNumber: string;
  provider: string;
  city: string;
  state: string;
  country: string;
  status: string;
  created_at: string;
  updated_at: string;
  callState?: string | null;
  claimedByMemberId?: string | null;
  claimedByEmail?: string | null;
  claimedAt?: string | null;
  currentCallId?: string | null;
}

/** Who holds the number right now, or null when it is free. */
function holderOf(phone: AgencyPhone): string | null {
  if ((phone.callState || "IDLE") === "IDLE" || !phone.claimedByMemberId) return null;
  return `${phone.callState} · ${phone.claimedByEmail || phone.claimedByMemberId}`;
}

export function PhoneNumbersPage() {
  const { data: phones, isLoading } = useQuery<AgencyPhone[]>({
    queryKey: ["twentyPhones"],
    queryFn: async () => api.twentyPhones.list(),
    // Holder state is live: poll so a member grabbing a number shows up here
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // Single canonical agency number: all dialing derives from this row.
  const { data: primary } = useQuery<{ phone: { id: string } | null }>({
    queryKey: ["primaryPhone"],
    queryFn: async () => api.twentyPhones.primary(),
    staleTime: 60_000,
  });
  const primaryId = (primary as any)?.phone?.id ?? null;

  const table = useDataTable("phone-numbers");

  const columns: DataColumn<AgencyPhone>[] = [
    {
      key: "phone",
      label: "Phone Number",
      type: "phone",
      width: 220,
      value: (p) => p.phoneNumber,
      render: (p) => (
        <span className="inline-flex items-center gap-2">
          {p.phoneNumber}
          {primaryId === p.id && (
            <Pill tone="info">Primary</Pill>
          )}
        </span>
      ),
    },
    { key: "provider", label: "Provider", type: "text", width: 130, value: (p) => p.provider, filterable: true },
    { key: "city", label: "City", type: "text", width: 140, value: (p) => p.city },
    { key: "state", label: "State", type: "text", width: 120, value: (p) => p.state },
    {
      key: "country",
      label: "Country",
      type: "text",
      width: 150,
      value: (p) => countryName(p.country),
      render: (p) => <CountryBadge country={p.country} />,
      filterable: true,
      filterIcon: (name) => <CountryFlag code={countryCode(name)} />,
    },
    { key: "status", label: "Status", type: "status", width: 120, value: (p) => p.status, filterable: true },
    {
      key: "holder",
      label: "Holder",
      type: "custom",
      width: 220,
      value: holderOf,
      text: (p) => holderOf(p) ?? "Free",
      render: (p) => {
        const holder = holderOf(p);
        return holder ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--ods-text-primary)]" title={`Since ${p.claimedAt || "—"}`}>
            <span className="w-1.5 h-1.5 rounded-md bg-green-500 animate-pulse" />
            {holder}
          </span>
        ) : (
          <span className="text-[var(--ods-text-tertiary)]">Free</span>
        );
      },
    },
    { key: "created", label: "Created", type: "date", value: (p) => p.created_at },
  ];

  return (
    <DataTable
      state={table}
      title="Phone Numbers"
      info={{
        title: "Phone Numbers",
        icon: Phone,
        what: "The caller IDs your team dials out from.",
        use: "Check Reports → Number Health to see which ones are flagged as spam.",
      }}
      columns={columns}
      rows={phones}
      loading={isLoading}
      getRowId={(p) => p.id}
      emptyMessage="No phone numbers found in Twenty CRM"
    />
  );
}
