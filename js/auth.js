// Authentication and Team Management

import { db, auth } from './firebase-config.js';
import { state, DEFAULT_TEAM } from './state.js';
import { startDataSync } from './contest.js';
import { navTo } from './ui.js';
import { renderAdminTeamList } from './admin.js';

export async function initTeam() {
    try {
        const doc = await db.collection('config').doc('settings').get();
        if (doc.exists && doc.data().teamMembers) {
            state.teamMembers = doc.data().teamMembers.sort();
        } else {
            state.teamMembers = DEFAULT_TEAM;
        }
    } catch (e) {
        state.teamMembers = DEFAULT_TEAM;
    }
    populateLoginDropdown();
    if (state.currentUser) {
        const input = document.getElementById('loginName');
        if(input) input.value = state.currentUser;
        checkPinRequirement();
    }
}

export function populateLoginDropdown() {
    const s = document.getElementById('loginName');
    if(!s) return;
    s.innerHTML = '<option value="" disabled selected>Tap to select name...</option>';
    state.teamMembers.forEach(n => {
        const o = document.createElement('option');
        o.value = n; o.textContent = n;
        s.appendChild(o);
    });
}

export function checkPinRequirement() {
    const s = document.getElementById('loginName');
    if(!s) return;
    const pinEl = document.getElementById('pinSection');
    if(pinEl) pinEl.classList.toggle('hidden', s.value !== "Anthony Wilson");
}

export function attemptLogin() {
    const s = document.getElementById('loginName');
    if(!s) return;
    const name = s.value;
    if (!name) return;
    
    // Admin PIN check - MUST remain 673191
    if (name === "Anthony Wilson") {
        const pin = document.getElementById('loginPin').value;
        if (pin !== "673191") return alert("Wrong PIN");
        state.isAdmin = true;
    }

    state.currentUser = name;
    localStorage.setItem('photoUser', name);
    
    auth.signInAnonymously().then(() => {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('userNameDisplay').textContent = name.split(' ')[0]; 
        
        if (state.isAdmin) {
            const navAdmin = document.getElementById('navAdmin');
            if(navAdmin) navAdmin.classList.remove('hidden');
            if(document.getElementById('adminTeamList')) renderAdminTeamList();
        }
        
        startDataSync(); 
        navTo('landing');
    }).catch(e => {
        console.error("Login Error", e);
        alert("Login failed: " + e.message);
    });
}
