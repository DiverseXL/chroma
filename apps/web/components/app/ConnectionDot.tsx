"use client";

import type { ConnectionStatus } from "@/lib/runTypes";

const labels: Record<ConnectionStatus, string> = {
  connected: "connected",
  reconnecting: "reconnecting",
  closed: "closed",
};

export function ConnectionDot({ status }: { status: ConnectionStatus }) {
  return (
    <span className="connection-state" data-status={status}>
      <span className="connection-dot" aria-hidden="true" />
      <span>{labels[status]}</span>
    </span>
  );
}
