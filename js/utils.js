// Utility Functions

import { state } from './state.js';

export function getFormattedDeadline() {
    const now = new Date();
    // Get the last second of the current month
    // (Month + 1, Day 0) gives the last day of the current month
    const deadline = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    // Format: "31st December at 11:59 PM"
    const options = { weekday: 'short', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true };
    return deadline.toLocaleString('en-GB', options);
}

/**
 * Calculates ID/Name for BOTH Current and Next month.
 * Fixes the bug where Dashboard defaulted to "Next Month".
 */
export function calculateNextMonth() {
    const now = new Date();

    // 1. Calculate CURRENT Month (e.g. December)
    const currentY = now.getFullYear();
    const currentM = String(now.getMonth() + 1).padStart(2, '0');
    
    // Set these new properties on state
    state.currentMonthId = `${currentY}-${currentM}`; 
    state.currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    // 2. Calculate NEXT Month (e.g. January)
    // We keep this because Admin tools might need to create next month's contest
    let nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    
    state.nextMonthId = `${y}-${m}`;
    state.nextMonthName = nextDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    console.log(`📅 Date Sync: Current=${state.currentMonthName} (${state.currentMonthId}), Next=${state.nextMonthName}`);
}

/**
 * Show toast notification
 */
export function showToast(message, type = 'success') {
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}