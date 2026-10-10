"use client";

import Link from "next/link";
import { BriefInput } from "./BriefInput";
import { RecentRuns } from "./RecentRuns";
import type { ConnectionStatus } from "@/lib/runTypes";

interface SidebarProps {
  busy: boolean;
  connection: ConnectionStatus;
  error: string | null;
  runId: string | null;
  refreshKey: number;
  onRun: (brief: string) => Promise<void>;
  onSelectRun: (runId: string) => void;
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="run-sidebar">
      <div className="sidebar-home-row">
        <Link className="sidebar-home-link" href="/">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M14.5 5 7.5 12l7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Chroma</span>
        </Link>
        <span className="sidebar-page-label">RUN CANVAS</span>
      </div>
      <BriefInput
        busy={props.busy}
        connection={props.connection}
        error={props.error}
        onRun={props.onRun}
      />
      <RecentRuns
        selectedRunId={props.runId}
        refreshKey={props.refreshKey}
        onSelect={props.onSelectRun}
      />
      <div className="sidebar-footer">
        <span className="sidebar-footer-mark" aria-hidden="true">
          ◈
        </span>
        <span>Multi-agent image engine</span>
      </div>
    </aside>
  );
}
