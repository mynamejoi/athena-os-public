'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface WhoopStatus {
    connected: boolean;
    lastSync: string | null;
    tokenExpiry: string | null;
    isExpired: boolean;
}

export function WhoopConnectionStatus() {
    const [status, setStatus] = useState<WhoopStatus>({ connected: false, lastSync: null, tokenExpiry: null, isExpired: false });
    const [syncing, setSyncing] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const checkStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/whoop/status');
            if (res.ok) {
                setStatus(await res.json());
            }
        } catch {
            // silently fail
        }
    }, []);

    useEffect(() => {
        checkStatus();
    }, [checkStatus]);

    // Listen for OAuth callback postMessage
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'WHOOP_CODE') return;

            const code = event.data.code;
            if (!code) return;

            try {
                const res = await fetch('/api/auth/whoop/exchange', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                });

                if (res.ok) {
                    toast.success('WHOOP connected successfully');
                    // Trigger initial sync
                    await fetch('/api/whoop/sync', { method: 'POST' });
                    toast.success('WHOOP data synced');
                    checkStatus();
                } else {
                    toast.error('Failed to connect WHOOP');
                }
            } catch {
                toast.error('Failed to connect WHOOP');
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [checkStatus]);

    const handleConnect = () => {
        window.open('/api/auth/whoop', 'whoop-auth', 'width=500,height=700');
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/whoop/sync', { method: 'POST' });
            if (res.ok) {
                toast.success('WHOOP data synced');
                checkStatus();
            } else {
                toast.error('Sync failed');
            }
        } catch {
            toast.error('Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const statusColor = status.connected
        ? status.isExpired ? 'text-athena-gold' : 'text-athena-green'
        : 'text-athena-text-muted';

    const statusDot = status.connected
        ? status.isExpired ? 'bg-athena-gold' : 'bg-athena-green'
        : 'bg-athena-text-muted/50';

    return (
        <div className="relative">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-athena-border hover:border-athena-gold/50 transition-all"
                title={status.connected ? 'WHOOP Connected' : 'WHOOP Disconnected'}
            >
                <div className={cn("w-[6px] h-[6px] rounded-full", statusDot)} />
                <Activity className={cn("w-3 h-3", statusColor)} />
            </button>

            {expanded && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-[#0a0a0a] border border-athena-border rounded-xl shadow-2xl p-4 z-50">
                    <div className="flex items-center gap-2 mb-3">
                        <Activity className={cn("w-4 h-4", statusColor)} />
                        <span className="text-sm font-serif text-athena-text-primary">WHOOP</span>
                        {status.connected ? (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold", status.isExpired ? "bg-athena-gold/20 text-athena-gold" : "bg-athena-green/20 text-athena-green")}>
                                {status.isExpired ? 'Token Expired' : 'Connected'}
                            </span>
                        ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-athena-text-muted font-semibold">Disconnected</span>
                        )}
                    </div>

                    {status.connected && status.lastSync && (
                        <div className="text-[10px] text-athena-text-muted mb-3 space-y-1">
                            <div className="flex justify-between">
                                <span>Last sync</span>
                                <span>{format(new Date(status.lastSync), 'MMM d, h:mm a')}</span>
                            </div>
                            {status.tokenExpiry && (
                                <div className="flex justify-between">
                                    <span>Token expires</span>
                                    <span>{format(new Date(status.tokenExpiry), 'MMM d, h:mm a')}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-2">
                        {status.connected && !status.isExpired ? (
                            <button
                                onClick={handleSync}
                                disabled={syncing}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-athena-gold/10 text-athena-gold hover:bg-athena-gold/20 border border-athena-gold/30 transition-all disabled:opacity-50"
                            >
                                <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
                                {syncing ? 'Syncing...' : 'Sync Now'}
                            </button>
                        ) : (
                            <button
                                onClick={handleConnect}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-athena-gold/10 text-athena-gold hover:bg-athena-gold/20 border border-athena-gold/30 transition-all"
                            >
                                <Wifi className="w-3 h-3" />
                                {status.isExpired ? 'Reconnect' : 'Connect WHOOP'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
