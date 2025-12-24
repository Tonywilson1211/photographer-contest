// Admin Panel Logic (v3.0 - User Management)

import { db, storage } from './firebase-config.js';
import { state } from './state.js';
import { loadUsersFromFirestore, populateUserSearch } from './auth.js';
import { navTo } from './ui.js';
import { showToast } from './utils.js';

/**
 * Security check - ensures user has admin privileges
 */
function requireAdmin() {
    if (!state.currentUser || 
        (state.currentUser.role !== 'super_admin' && state.currentUser.role !== 'admin')) {
        throw new Error('Unauthorized: Admin access required');
    }
}

/**
 * Security check - ensures user has super admin privileges
 */
function requireSuperAdmin() {
    if (!state.currentUser || state.currentUser.role !== 'super_admin') {
        throw new Error('Unauthorized: Super Admin access required');
    }
}

/**
 * Load all teams from Firestore
 */
export async function loadTeamsFromFirestore() {
    try {
        const snapshot = await db.collection('teams').get();
        state.allTeams = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log(`✅ Loaded ${state.allTeams.length} teams`);
    } catch (error) {
        console.error('Error loading teams:', error);
        state.allTeams = [];
    }
}

/**
 * Show admin panel and initialize
 */
export function showAdminPanel() { 
    requireAdmin();
    
    const view = document.getElementById('view-admin');
    view.classList.remove('hidden');
    
    // Show appropriate tab content
    showAdminTab('contests'); // Default to contests tab
    updateStorageDropdown();
}

/**
 * Switch between admin tabs
 */
export function showAdminTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-[#94c120]', 'text-black');
        btn.classList.add('bg-gray-700', 'text-gray-400');
    });
    
    const activeBtn = document.getElementById(`admin-tab-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-gray-700', 'text-gray-400');
        activeBtn.classList.add('active', 'bg-[#94c120]', 'text-black');
    }
    
    // Show/hide panels
    document.querySelectorAll('.admin-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    const activePanel = document.getElementById(`admin-panel-${tabName}`);
    if (activePanel) {
        activePanel.classList.remove('hidden');
    }
    
    // Load content for the active tab
    if (tabName === 'users') {
        renderUserManagementTable();
    }
}

// ==================== USER MANAGEMENT ====================

/**
 * Render the user management table
 */
export async function renderUserManagementTable() {
    requireAdmin();
    
    const container = document.getElementById('userManagementTable');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-4 text-gray-500">Loading users...</div>';
    
    // Ensure users and teams are loaded
    if (state.allUsers.length === 0) {
        await loadUsersFromFirestore();
    }
    if (state.allTeams.length === 0) {
        await loadTeamsFromFirestore();
    }
    
    if (state.allUsers.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-red-500">No users found. Run migration script.</div>';
        return;
    }
    
    // Get users to display (filtered or all)
    const usersToDisplay = state.filteredUsers.length > 0 ? state.filteredUsers : state.allUsers;
    
    // Build table with Team and Role columns
    let html = `
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-900/50 border-b border-gray-700">
                    <tr>
                        <th class="text-left p-3 text-gray-400 font-bold">Name</th>
                        <th class="text-left p-3 text-gray-400 font-bold">Team</th>
                        <th class="text-left p-3 text-gray-400 font-bold">Role</th>
                        <th class="text-center p-3 text-gray-400 font-bold">PIN Status</th>
                        <th class="text-center p-3 text-gray-400 font-bold">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    const isSuperAdmin = state.currentUser.role === 'super_admin';
    
    usersToDisplay.forEach(user => {
        const pinStatus = user.pin ? 
            '<span class="text-green-400">✅ Set</span>' : 
            '<span class="text-yellow-400">⚠️ Not Set</span>';
        
        // Only show Generate PIN button if user is not super admin or if PIN is not set
        const showGenerateBtn = user.role !== 'super_admin' || !user.pin;
        
        // Build Team dropdown
        let teamDropdown = '<select class="bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600" onchange="window.updateUserTeam(\'' + user.id + '\', this.value)">';
        state.allTeams.forEach(team => {
            const selected = team.id === user.teamId ? 'selected' : '';
            teamDropdown += `<option value="${team.id}" ${selected}>${team.name}</option>`;
        });
        teamDropdown += '</select>';
        
        // Build Role dropdown (only for super admin)
        let roleDisplay;
        if (isSuperAdmin && user.id !== state.currentUser.id) {
            roleDisplay = `
                <select class="bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600" onchange="window.updateUserRole('${user.id}', this.value)">
                    <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                </select>
            `;
        } else {
            const roleClass = user.role === 'super_admin' ? 'text-red-400' : user.role === 'admin' ? 'text-yellow-400' : 'text-gray-400';
            const roleText = user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'User';
            roleDisplay = `<span class="${roleClass} text-xs font-bold uppercase">${roleText}</span>`;
        }
        
        html += `
            <tr class="border-b border-gray-800 hover:bg-gray-800/30">
                <td class="p-3">
                    <div class="font-bold text-white">${user.displayName}</div>
                    <div class="text-xs text-gray-500">${user.id}</div>
                </td>
                <td class="p-3">
                    ${teamDropdown}
                </td>
                <td class="p-3">
                    ${roleDisplay}
                </td>
                <td class="p-3 text-center">${pinStatus}</td>
                <td class="p-3 text-center">
                    ${showGenerateBtn ? `
                        <button 
                            onclick="window.adminGeneratePin('${user.id}')" 
                            class="bg-blue-900/30 text-blue-400 border border-blue-500/30 px-3 py-1 rounded text-xs font-bold hover:bg-blue-900/50 transition"
                        >
                            ${user.pin ? 'Regenerate PIN' : 'Generate PIN'}
                        </button>
                    ` : '<span class="text-gray-600 text-xs">Protected</span>'}
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

/**
 * Generate a random 4-digit PIN
 */
function generate4DigitPin() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Generate/Regenerate PIN for a user
 */
export async function generateUserPin(userId) {
    requireAdmin();
    
    try {
        const user = state.allUsers.find(u => u.id === userId);
        if (!user) {
            throw new Error('User not found');
        }
        
        // Don't allow regenerating super admin PIN through this interface
        if (user.role === 'super_admin' && user.pin) {
            alert('Cannot regenerate Super Admin PIN. This is protected for security.');
            return;
        }
        
        const newPin = generate4DigitPin();
        
        // Update Firestore
        await db.collection('users').doc(userId).update({
            pin: newPin
        });
        
        // Update local state
        const userIndex = state.allUsers.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            state.allUsers[userIndex].pin = newPin;
        }
        
        // Show PIN to admin
        alert(`✅ New PIN for ${user.displayName}:\n\n${newPin}\n\nPlease share this PIN securely with the user.`);
        
        // Refresh table
        renderUserManagementTable();
        
        console.log(`✅ Generated PIN for ${user.displayName}`);
        
    } catch (error) {
        console.error('Error generating PIN:', error);
        alert('Error generating PIN: ' + error.message);
    }
}

/**
 * Add a new user to the team
 */
export async function addNewUser() {
    requireAdmin();
    
    const input = document.getElementById('newUserNameInput');
    const name = input ? input.value.trim() : '';
    
    if (!name) {
        alert('Please enter a name');
        return;
    }
    
    try {
        // Check for duplicates (case-insensitive)
        const duplicate = state.allUsers.find(
            u => u.displayName.toLowerCase() === name.toLowerCase()
        );
        
        if (duplicate) {
            alert(`User "${name}" already exists in the system.`);
            return;
        }
        
        // Generate user ID (lowercase, hyphenated)
        const userId = name.toLowerCase().replace(/\s+/g, '-');
        
        // Check if userId already exists (extra safety)
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            alert(`User ID "${userId}" already exists. Please use a different name.`);
            return;
        }
        
        // Generate PIN
        const newPin = generate4DigitPin();
        
        // Create user document
        await db.collection('users').doc(userId).set({
            displayName: name,
            teamId: state.currentUser.teamId,
            role: 'user',
            pin: newPin,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Reload users from Firestore
        await loadUsersFromFirestore();
        
        // Update UI
        populateUserSearch(); // Update login dropdown
        renderUserManagementTable();
        
        // Clear input
        input.value = '';
        
        // Show success message with PIN
        alert(`✅ User "${name}" added successfully!\n\nGenerated PIN: ${newPin}\n\nPlease share this PIN securely with the user.`);
        
        console.log(`✅ Created new user: ${name} (${userId})`);
        
    } catch (error) {
        console.error('Error adding user:', error);
        alert('Error adding user: ' + error.message);
    }
}

// ==================== LEGACY TEAM MANAGEMENT (DEPRECATED) ====================

/**
 * @deprecated Use renderUserManagementTable instead
 */
export function renderAdminTeamList() {
    console.warn('⚠️ renderAdminTeamList is deprecated, use renderUserManagementTable');
}

// ==================== CONTEST MANAGEMENT ====================

export function updateStorageDropdown() {
    const sel = document.getElementById('storagePurgeSelect');
    if(!sel) return;
    sel.innerHTML = '<option value="" disabled selected>Select Archive to Purge...</option>';
    state.archives.forEach(a => {
        const o = document.createElement('option');
        o.value = a.id;
        o.textContent = `${a.monthName} (${a.entries.length} images)`;
        sel.appendChild(o);
    });
}

export async function adminPurgeImages() {
    requireAdmin();
    
    const id = document.getElementById('storagePurgeSelect').value;
    if(!id) return;
    if(!confirm(`WARNING: This will permanently delete all image files for ${id}. Continue?`)) return;
    try {
        const archive = state.archives.find(a => a.id === id);
        if(!archive) return;
        let deletedCount = 0;
        for (const entry of archive.entries) {
            if(entry.url) {
                try {
                    const ref = storage.refFromURL(entry.url);
                    await ref.delete();
                    deletedCount++;
                } catch(err) { console.log("Skip", entry.url); }
            }
        }
        alert(`Purged ${deletedCount} images.`);
    } catch (e) { console.error(e); alert("Error purging."); }
}

export async function adminCreateContest() {
    requireAdmin();
    
    const n = document.getElementById('newContestName').value;
    const i = document.getElementById('newContestId').value;
    if(!n || !i) return;
    await db.collection("contests").doc(i).set({ monthName: n, status: "voting" });
    alert("Created!"); 
    document.getElementById('view-admin').classList.add('hidden');
    navTo('landing');
}

export async function adminCheckVotes() {
    requireAdmin();
    
    if (!state.activeContest) return alert("No active contest.");
    const list = document.getElementById('adminVoteList');
    if(!list) return;
    list.classList.remove('hidden');
    const snap = await db.collection("contests").doc(state.activeContest.id).collection("votes").get();
    const voters = new Set(snap.docs.map(d => d.id)); 
    
    // FIX: Use state.allUsers instead of deprecated state.teamMembers
    const allNames = state.allUsers.map(u => u.displayName);
    const voted = allNames.filter(m => voters.has(m));
    const pending = allNames.filter(m => !voters.has(m));
    
    list.innerHTML = `
        <div class="text-xs text-gray-400 mb-2">Voted: ${voted.length}/${allNames.length}</div>
        <div class="grid grid-cols-2 gap-2 text-xs">
            ${voted.map(n => `<div class="text-green-400">✅ ${n}</div>`).join('')}
            ${pending.map(n => `<div class="text-red-400">⏳ ${n}</div>`).join('')}
        </div>
    `;
}

export async function adminFinalizeArchive() {
    requireAdmin();
    
    if(!state.activeContest || !confirm("Finalize & Close?")) return;
    
    const votesSnap = await db.collection("contests").doc(state.activeContest.id).collection("votes").get();
    const votes = votesSnap.docs.map(d => d.data().votes);
    
    let tally = {};
    state.entries.forEach(e => { 
        tally[e.id] = { points: 0, gold: 0, silver: 0, bronze: 0, id: e.id, ...e }; 
    });
    
    // CRITICAL: Preserve 3-2-1 points system
    votes.forEach(v => {
        if(v['1'] && tally[v['1']]) { tally[v['1']].points += 3; tally[v['1']].gold++; }
        if(v['2'] && tally[v['2']]) { tally[v['2']].points += 2; tally[v['2']].silver++; }
        if(v['3'] && tally[v['3']]) { tally[v['3']].points += 1; tally[v['3']].bronze++; }
    });
    
    const results = Object.values(tally).sort((a,b) => b.points - a.points);
    if(results.length < 3) return alert("Not enough entries/votes.");
    
    await db.collection("archives").doc(state.activeContest.id).set({
        id: state.activeContest.id,
        monthName: state.activeContest.monthName,
        winners: {gold: results[0].id, silver: results[1].id, bronze: results[2].id},
        entries: results
    });
    
    await db.collection("contests").doc(state.activeContest.id).update({status:'closed'});
    location.reload();
}

export async function refreshAdminUploads() {
    requireAdmin();
    
    const grid = document.getElementById('adminUploadsGrid');
    if(!grid) return;

    grid.innerHTML = '<div class="col-span-full text-center py-8 text-[#94c120] animate-pulse">Scanning Database...</div>';

    let targetId = state.nextMonthId;
    let targetName = state.nextMonthName;
    
    if (state.submissionContest && state.submissionContest.status === 'submissions_open') {
        targetId = state.submissionContest.id;
        targetName = state.submissionContest.monthName;
    }

    try {
        const snapshot = await db.collection("contests").doc(targetId).collection("entries").get();
        const entries = snapshot.docs.map(d => d.data());

        const tally = {};
        
        // FIX: Use state.allUsers to populate the list, not deprecated state.teamMembers
        if (state.allUsers.length === 0) {
            // Safety check: ensure users are loaded
            await loadUsersFromFirestore();
        }
        
        state.allUsers.forEach(user => {
            tally[user.displayName] = 0;
        });

        entries.forEach(e => {
            if (tally[e.photographer] !== undefined) {
                tally[e.photographer]++;
            } else {
                tally[e.photographer] = 1;
            }
        });

        grid.innerHTML = '';
        
        const sortedNames = Object.keys(tally).sort((a,b) => tally[b] - tally[a]);

        sortedNames.forEach(name => {
            const count = tally[name];
            let statusClass = "border-gray-700 opacity-50";
            let statusIcon = "⚪";
            
            if (count === 3) {
                statusClass = "border-green-500 bg-green-900/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]";
                statusIcon = "✅";
            } else if (count > 0) {
                statusClass = "border-yellow-500 bg-yellow-900/10";
                statusIcon = "⏳";
            }

            grid.innerHTML += `
                <div class="bg-gray-900 rounded-xl border ${statusClass} p-3 transition flex items-center justify-between">
                    <div>
                        <div class="font-bold text-gray-200 text-sm truncate w-32">${name}</div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-wider">Entries</div>
                    </div>
                    <div class="text-right">
                        <div class="text-xl font-mono font-bold text-white">${count}<span class="text-gray-600 text-sm">/3</span></div>
                        <div class="text-xs">${statusIcon}</div>
                    </div>
                </div>
            `;
        });

    } catch (e) {
        console.error(e);
        grid.innerHTML = `<div class="col-span-full text-center text-red-500">Error scanning uploads: ${e.message}</div>`;
    }
}

// ==================== PHASE 4: CONTEST MANAGEMENT ====================

/**
 * Create a new contest (monthly or custom)
 */
export async function adminCreateCustomContest() {
    requireAdmin();
    
    const nameInput = document.getElementById('newContestName');
    const typeSelect = document.getElementById('newContestType');
    const metadataCheckbox = document.getElementById('contestMetadataRequired');
    
    if (!nameInput || !typeSelect) {
        alert('Form elements not found');
        return;
    }
    
    const name = nameInput.value.trim();
    const type = typeSelect.value;
    const isMetadataRequired = metadataCheckbox ? metadataCheckbox.checked : true; // Default to true for backwards compatibility
    
    if (!name) {
        alert('Please enter a contest name');
        return;
    }
    
    try {
        // Generate contest ID based on type
        let contestId;
        if (type === 'monthly') {
            // Use current month format: YYYY-MM
            const now = new Date();
            contestId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        } else {
            // Custom contest: use timestamp-based ID
            contestId = `custom-${Date.now()}`;
        }
        
        // Check if contest already exists
        const existing = await db.collection('contests').doc(contestId).get();
        if (existing.exists) {
            alert(`Contest with ID "${contestId}" already exists. Please use a different name or type.`);
            return;
        }
        
        // Create contest document with metadata flag
        await db.collection('contests').doc(contestId).set({
            id: contestId,
            monthName: name,
            type: type,
            status: 'submissions_open',
            teamId: state.currentUser.teamId,
            is_metadata_required: isMetadataRequired,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Clear inputs
        nameInput.value = '';
        typeSelect.selectedIndex = 0;
        if (metadataCheckbox) metadataCheckbox.checked = true;
        
        showToast(`✅ Contest "${name}" created!`);
        console.log(`✅ Created new contest: ${name} (${contestId}) - Metadata required: ${isMetadataRequired}`);
        
    } catch (error) {
        console.error('Error creating contest:', error);
        showToast('Error creating contest: ' + error.message, 'error');
    }
}

/**
 * Skip the current month
 */
export async function adminSkipCurrentMonth() {
    requireAdmin();
    
    // Get current month ID
    const now = new Date();
    const monthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    
    if (!confirm(`Mark ${monthName} as skipped?\n\nThis will create a "skipped" status for this month. No contest will run.`)) {
        return;
    }
    
    try {
        // Check if contest already exists
        const existingDoc = await db.collection('contests').doc(monthId).get();
        
        if (existingDoc.exists) {
            // Update existing contest to skipped
            await db.collection('contests').doc(monthId).update({
                status: 'skipped',
                skippedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Create new skipped contest
            await db.collection('contests').doc(monthId).set({
                id: monthId,
                monthName: monthName,
                status: 'skipped',
                teamId: state.currentUser.teamId,
                skippedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        alert(`✅ ${monthName} marked as skipped\n\nUsers will see a "No Competition This Month" message.`);
        
        console.log(`⏸️ Skipped month: ${monthName}`);
        
        // Reload to refresh contest list
        setTimeout(() => location.reload(), 1000);
        
    } catch (error) {
        console.error('Error skipping month:', error);
        alert('Error skipping month: ' + error.message);
    }
}

// ==================== PHASE 6: TEAM MANAGEMENT & SEARCH ====================

/**
 * Filter users based on search query
 * Uses "starts with" logic to match login screen behavior
 */
export function filterUsers(searchQuery) {
    const query = searchQuery.toLowerCase().trim();
    
    if (!query) {
        state.filteredUsers = [];
    } else {
        // "Starts With" logic (matches login screen)
        state.filteredUsers = state.allUsers.filter(user => 
            user.displayName.toLowerCase().startsWith(query)
        );
    }
    
    renderUserManagementTable();
}

/**
 * Create a new team
 */
export async function createTeam() {
    requireSuperAdmin();
    
    const input = document.getElementById('newTeamNameInput');
    const teamName = input ? input.value.trim() : '';
    
    if (!teamName) {
        showToast('Please enter a team name', 'error');
        return;
    }
    
    try {
        // Generate team ID (lowercase, hyphenated)
        const teamId = teamName.toLowerCase().replace(/\s+/g, '-');
        
        // Check if team already exists
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (teamDoc.exists) {
            showToast(`Team "${teamName}" already exists`, 'error');
            return;
        }
        
        // Create team document
        await db.collection('teams').doc(teamId).set({
            name: teamName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: state.currentUser.id
        });
        
        // Reload teams
        await loadTeamsFromFirestore();
        
        // Clear input
        input.value = '';
        
        showToast(`✅ Team "${teamName}" created successfully!`);
        console.log(`✅ Created new team: ${teamName} (${teamId})`);
        
        // Refresh user table to show new team in dropdowns
        renderUserManagementTable();
        
    } catch (error) {
        console.error('Error creating team:', error);
        showToast('Error creating team: ' + error.message, 'error');
    }
}

/**
 * Update user's team
 */
export async function updateUserTeam(userId, newTeamId) {
    requireAdmin();
    
    try {
        const user = state.allUsers.find(u => u.id === userId);
        if (!user) {
            throw new Error('User not found');
        }
        
        // Update Firestore
        await db.collection('users').doc(userId).update({
            teamId: newTeamId
        });
        
        // Update local state
        const userIndex = state.allUsers.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            state.allUsers[userIndex].teamId = newTeamId;
        }
        
        const teamName = state.allTeams.find(t => t.id === newTeamId)?.name || newTeamId;
        showToast(`✅ ${user.displayName} moved to ${teamName}`);
        console.log(`✅ Updated team for ${user.displayName} to ${newTeamId}`);
        
    } catch (error) {
        console.error('Error updating user team:', error);
        showToast('Error updating team: ' + error.message, 'error');
    }
}

/**
 * Update user's role
 */
export async function updateUserRole(userId, newRole) {
    requireSuperAdmin();
    
    try {
        const user = state.allUsers.find(u => u.id === userId);
        if (!user) {
            throw new Error('User not found');
        }
        
        // Prevent changing your own role
        if (userId === state.currentUser.id) {
            showToast('Cannot change your own role', 'error');
            return;
        }
        
        // Update Firestore
        await db.collection('users').doc(userId).update({
            role: newRole
        });
        
        // Update local state
        const userIndex = state.allUsers.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            state.allUsers[userIndex].role = newRole;
        }
        
        showToast(`✅ ${user.displayName} role updated to ${newRole}`);
        console.log(`✅ Updated role for ${user.displayName} to ${newRole}`);
        
        // Refresh table to update UI
        renderUserManagementTable();
        
    } catch (error) {
        console.error('Error updating user role:', error);
        showToast('Error updating role: ' + error.message, 'error');
    }
}

// Expose functions to window for inline onclick handlers
window.adminGeneratePin = generateUserPin;
window.adminAddNewUser = addNewUser;
window.adminCreateCustomContest = adminCreateCustomContest;
window.adminSkipCurrentMonth = adminSkipCurrentMonth;
window.filterUsers = filterUsers;
window.createTeam = createTeam;
window.updateUserTeam = updateUserTeam;
window.updateUserRole = updateUserRole;
