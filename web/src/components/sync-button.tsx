"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type SyncStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface SyncButtonProps {
  onSyncComplete?: () => void;
}

export function SyncButton({ onSyncComplete }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<SyncStatus | null>(null);

  // Poll sync status while syncing
  useEffect(() => {
    if (!syncing) return;

    const interval = setInterval(async () => {
      try {
        const s = await api.getSyncStatus();
        setStatus(s);
        if (s.status === "done" || s.status === "error" || s.status === "idle") {
          setSyncing(false);
          clearInterval(interval);
          if (s.status === "done") onSyncComplete?.();
        }
      } catch {
        // ignore polling errors
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [syncing, onSyncComplete]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setStatus(null);
    try {
      await api.triggerSync();
    } catch {
      setSyncing(false);
    }
  }, []);

  return (
    <div>
      <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
        {syncing ? "Syncing..." : "Sync Stars"}
      </Button>
      {status && syncing && (
        <p className="text-xs text-muted-foreground mt-1">
          {status.message || status.status}
        </p>
      )}
    </div>
  );
}
