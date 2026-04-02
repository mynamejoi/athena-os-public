"use client";

import { useEffect, useCallback } from 'react';

/**
 * Global keyboard shortcut hook.
 * Registers keydown handlers and skips when user is typing in an input, textarea, select, or contenteditable element.
 *
 * Keys should be lowercase (e.g. 'arrowleft', 'arrowright', 't', 'n').
 */
export function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
    const handler = useCallback((e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement).tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement).isContentEditable) return;

        const key = e.key.toLowerCase();
        if (shortcuts[key]) {
            e.preventDefault();
            shortcuts[key]();
        }
    }, [shortcuts]);

    useEffect(() => {
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handler]);
}
