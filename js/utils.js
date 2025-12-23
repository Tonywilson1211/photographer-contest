// Utility Functions

import { state } from './state.js';

export function getFormattedDeadline() {
    const now = new Date();
    // Get the last second of the current month
    const deadline = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    // Format: "31st January at 11:59 PM"
    const options = { weekday: 'short', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true };
    return deadline.toLocaleString('en-GB', options);
}

export function calculateNextMonth() {
    const now = new Date();
    let nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    state.nextMonthId = `${y}-${m}`;
    state.nextMonthName = nextDate.toLocaleString('default', { month: 'long', year: 'numeric' });
}
