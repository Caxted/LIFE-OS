import { supabase } from './auth.js';

export function formatDateKey(date) {
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().split('T')[0];
}

export const DataManager = {
    async load(date) {
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data, error } = await supabase
                    .from('daily_logs')
                    .select('data')
                    .eq('user_id', session.user.id)
                    .eq('date', date)
                    .single();

                if (data) return data.data;
            }
        }
        const stored = localStorage.getItem(`lifeos-${date}`);
        return stored ? JSON.parse(stored) : {};
    },

    async save(date, logs) {
        localStorage.setItem(`lifeos-${date}`, JSON.stringify(logs)); // Optimistic

        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { error } = await supabase
                    .from('daily_logs')
                    .upsert({ user_id: session.user.id, date: date, data: logs }, { onConflict: 'user_id, date' });

                if (error) {
                    console.error("Save failed:", error);
                    showToast("Failed to save to cloud", "error");
                }
            }
        }
    },

    async getHistory(days = 30) {
        const history = {};
        const today = new Date();
        const startDate = new Date();
        startDate.setDate(today.getDate() - days);
        const startKey = formatDateKey(startDate);
        const endKey = formatDateKey(today);

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
                    data.forEach(row => history[row.date] = row.data);
                    return history;
                }
            }
        }

        // Fallback
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const dateKey = formatDateKey(d);
            const stored = localStorage.getItem(`lifeos-${dateKey}`);
            if (stored) history[dateKey] = JSON.parse(stored);
        }
        return history;
    },

    subscribe(date, onUpdate) {
        if (!supabase) return;

        const channel = supabase.channel(`public:daily_logs:${date}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'daily_logs', filter: `date=eq.${date}` },
                (payload) => {
                    console.log('Real-time update:', payload);
                    if (payload.new && payload.new.data) {
                        onUpdate(payload.new.data);
                    }
                }
            )
            .subscribe();

        return channel;
    }
};

// Default Systems List
import { systems as defaultSystems } from './config.js';

export const SystemsManager = {
    async load() {
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data } = await supabase
                    .from('user_settings')
                    .select('systems')
                    .eq('user_id', session.user.id)
                    .single();

                if (data?.systems) {
                    // Sync local storage as backup
                    localStorage.setItem('lifeos-systems', JSON.stringify(data.systems));
                    return data.systems;
                }
            }
        }

        const stored = localStorage.getItem('lifeos-systems');
        return stored ? JSON.parse(stored) : [...defaultSystems];
    },

    async save(systems) {
        localStorage.setItem('lifeos-systems', JSON.stringify(systems)); // Optimistic

        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                await supabase
                    .from('user_settings')
                    .upsert({ user_id: session.user.id, systems: systems });
            }
        }
    },

    async add(label) {
        const current = await this.load();
        const id = label.toLowerCase().replace(/[^a-z0-9]/g, '-');
        if (current.find(s => s.id === id)) return current;
        const updated = [...current, { id, label }];
        await this.save(updated);
        return updated;
    },

    async remove(id) {
        const current = await this.load();
        const updated = current.filter(s => s.id !== id);
        await this.save(updated);
        return updated;
    }
};

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Add wait for animation
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function createToastContainer() {
    const div = document.createElement('div');
    div.id = 'toast-container';
    div.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 1000;
        display: flex; flex-direction: column; gap: 10px;
    `;
    document.body.appendChild(div);
    return div;
}
