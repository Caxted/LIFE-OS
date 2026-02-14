import { supabase } from './auth.js';

export function formatDateKey(date) {
    // Fix: Use local date instead of UTC to avoid timezone shifts
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().split('T')[0];
}

export const DataManager = {
    async load(date) {
        // 1. Try Supabase if logged in
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data, error } = await supabase
                    .from('daily_logs')
                    .select('data')
                    .eq('user_id', session.user.id)
                    .eq('date', date) // date column in DB should be date type or text YYYY-MM-DD
                    .single();

                if (data) return data.data;
            }
        }

        // 2. Fallback to LocalStorage
        const stored = localStorage.getItem(`lifeos-${date}`);
        return stored ? JSON.parse(stored) : {};
    },

    async save(date, logs) {
        // 1. Save to LocalStorage (Optimistic update)
        localStorage.setItem(`lifeos-${date}`, JSON.stringify(logs));

        // 2. Save to Supabase if logged in
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                await supabase
                    .from('daily_logs')
                    .upsert({ user_id: session.user.id, date: date, data: logs }, { onConflict: 'user_id, date' });
            }
        }
    },

    async getHistory(days = 30) {
        const history = {};
        const today = new Date();
        const startDate = new Date();
        startDate.setDate(today.getDate() - days);

        // Proper local date strings for query range
        const startKey = formatDateKey(startDate);
        const endKey = formatDateKey(today);

        // 1. Try Bulk Fetch from Supabase
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data, error } = await supabase
                    .from('daily_logs')
                    .select('date, data')
                    .eq('user_id', session.user.id)
                    .gte('date', startKey)
                    .lte('date', endKey);

                if (data) {
                    data.forEach(row => {
                        history[row.date] = row.data;
                    });
                    return history;
                }
            }
        }

        // 2. Fallback to LocalStorage Loop
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const dateKey = formatDateKey(d);
            const stored = localStorage.getItem(`lifeos-${dateKey}`);
            if (stored) {
                history[dateKey] = JSON.parse(stored);
            }
        }
        return history;
    }
};

// Default Systems List
import { systems as defaultSystems } from './config.js';

export const SystemsManager = {
    load() {
        // Try LocalStorage first
        const stored = localStorage.getItem('lifeos-systems');
        if (stored) return JSON.parse(stored);

        // Return defaults if nothing saved
        return [...defaultSystems];
    },

    save(systems) {
        localStorage.setItem('lifeos-systems', JSON.stringify(systems));
        // Note: For now, we only sync systems locally. 
        // Syncing definitions to Supabase would require a 'settings' table.
    },

    add(label) {
        const current = this.load();
        const id = label.toLowerCase().replace(/[^a-z0-9]/g, '-');

        // Prevent duplicates
        if (current.find(s => s.id === id)) return current;

        const newSystem = { id, label };
        const updated = [...current, newSystem];
        this.save(updated);
        return updated;
    },

    remove(id) {
        const current = this.load();
        const updated = current.filter(s => s.id !== id);
        this.save(updated);
        return updated;
    }
};
