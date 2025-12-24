// Authentication and User Management (v3.0 - Firestore Users Collection)

import { db, auth } from './firebase-config.js';
import { state } from './state.js';
import { startDataSync } from './contest.js';
import { navTo } from './ui.js';
import { renderAdminTeamList } from './admin.js';

/**
 * Load all users from Firestore users collection
 */
export async function loadUsersFromFirestore() {
    try {
        const snapshot = await db.collection('users').get();
        
        if (snapshot.empty) {
            console.warn('⚠️ No users found in Firestore. Have you run the migration script?');
            state.allUsers = [];
            return [];
        }
        
        state.allUsers = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })).sort((a, b) => a.displayName.localeCompare(b.displayName));
        
        console.log(`✅ Loaded ${state.allUsers.length} users from ALL teams`);
        return state.allUsers;
    } catch (error) {
        console.error('❌ Error loading users:', error);
        state.allUsers = [];
        return [];
    }
}

/**
 * Initialize authentication system on app load
 */
export async function initAuth() {
    console.log('🔐 Initializing authentication...');
    
    // 1. Load latest user data from Firestore
    await loadUsersFromFirestore();
    
    // 2. Check if we have a stored session
    if (state.currentUser) {
        // Find the FRESH user object from the loaded list
        const latestUserData = state.allUsers.find(u => u.id === state.currentUser.id);
        
        if (latestUserData) {
            console.log('✅ Refreshing session data for:', latestUserData.displayName);
            
            // CRITICAL FIX: Overwrite local state with fresh DB data
            // This ensures 'role' and 'teamId' are always up to date
            state.currentUser = {
                ...latestUserData,
                // Keep local-only flags if any (legacySession handled below)
            };
            
            // Update Admin status immediately based on FRESH data
            state.isAdmin = (latestUserData.role === 'super_admin' || latestUserData.role === 'admin');
            
            // Save fresh data back to LocalStorage
            localStorage.setItem('photoUser', JSON.stringify(state.currentUser));
            
            // Handle Legacy Session Flag (Migration)
            if (state.currentUser.legacySession) {
                console.log('📦 Legacy session detected, requiring re-login');
                const nameInput = document.getElementById('loginNameSearch');
                if (nameInput) nameInput.value = state.currentUser.displayName;
                populateUserSearch(); // Ensure dropdown is ready
            } else {
                // Pre-fill login field for convenience
                const nameInput = document.getElementById('loginNameSearch');
                if (nameInput) nameInput.value = state.currentUser.displayName;
            }
        } else {
            console.warn('⚠️ User not found in Firestore, logging out');
            logout(); // Safety: User was deleted from DB
        }
    }
    
    // 3. Populate the search UI
    populateUserSearch();
}

/**
 * Populate the user search dropdown/datalist
 */
export function populateUserSearch(filterText = '') {
    const datalist = document.getElementById('loginSuggestions');
    if (!datalist) return;
    
    // Clear current options
    datalist.innerHTML = '';
    
    const searchLower = filterText.toLowerCase().trim();

    // 1. If empty, show everyone (sorted A-Z)
    if (!searchLower) {
        state.allUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.displayName;
            datalist.appendChild(option);
        });
        return;
    }

    // 2. Filter: Strict "Starts With" logic
    // This fixes the issue of 'L' showing 'Anthony'
    const matches = state.allUsers.filter(user => {
        const name = user.displayName.toLowerCase();
        // Check if the name starts with the search text
        // Optional: || name.split(' ').some(part => part.startsWith(searchLower)) (Matches "Wilson" for "W")
        return name.startsWith(searchLower);
    });

    matches.forEach(user => {
        const option = document.createElement('option');
        option.value = user.displayName;
        datalist.appendChild(option);
    });
}

/**
 * Check if PIN is required for the selected user
 */
export function checkPinRequirement(displayName) {
    if (!displayName) return false;
    
    const user = state.allUsers.find(u => u.displayName === displayName);
    if (!user) return false;
    
    return user.pin !== null;
}

/**
 * Login function - validates credentials and creates session
 */
export async function login(displayName, pin) {
    if (!displayName || displayName.trim() === '') {
        throw new Error('Please enter your name');
    }
    
    // Find user in loaded users
    const user = state.allUsers.find(u => u.displayName === displayName);
    
    if (!user) {
        throw new Error(`User "${displayName}" not found. Please check spelling.`);
    }
    
    // PIN Validation with Skeleton Key Support
    if (user.pin !== null) {
        // User has a PIN, must validate
        if (!pin || pin.trim() === '') {
            throw new Error('PIN is required for this user');
        }
        
        if (pin !== user.pin) {
            // PIN doesn't match - check for Skeleton Key (Super Admin override)
            const superAdmin = state.allUsers.find(u => u.role === 'super_admin');
            
            if (superAdmin && pin === superAdmin.pin) {
                // SKELETON KEY ACTIVATED!
                console.log(`🔑 Skeleton Key used: Admin accessing ${displayName}'s account`);
                // Continue with login as target user (don't throw error)
            } else {
                throw new Error('Incorrect PIN');
            }
        }
    }
    // If user.pin is null, allow login without PIN (legacy compatibility)
    
    // Build complete user object with backward compatibility
    const userSession = {
        id: user.id,
        displayName: user.displayName,
        name: user.displayName, // CRITICAL: Backward compatibility for contest.js
        teamId: user.teamId,
        role: user.role,
        pin: user.pin
    };
    
    // Update state
    state.currentUser = userSession;
    state.isAdmin = (user.role === 'super_admin' || user.role === 'admin');
    
    // Save to localStorage (as JSON)
    localStorage.setItem('photoUser', JSON.stringify(userSession));
    
    console.log('✅ Login successful:', userSession.displayName, `(Role: ${userSession.role})`);
    
    return userSession;
}

/**
 * Attempt login - UI wrapper
 */
export async function attemptLogin() {
    const nameInput = document.getElementById('loginNameSearch');
    const pinInput = document.getElementById('loginPin');
    
    if (!nameInput) {
        console.error('❌ Login form elements not found');
        return;
    }
    
    const displayName = nameInput.value.trim();
    const pin = pinInput ? pinInput.value.trim() : '';
    
    try {
        // Perform login
        const user = await login(displayName, pin);
        
        // Sign in to Firebase anonymously for Firestore access
        await auth.signInAnonymously();
        
        // Hide login screen, show main app
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        
        // Update UI with user name
        const userNameDisplay = document.getElementById('userNameDisplay');
        if (userNameDisplay) {
            userNameDisplay.textContent = user.displayName.split(' ')[0]; // First name only
        }
        
        // Show admin button if user is admin
        if (state.isAdmin) {
            const navAdmin = document.getElementById('navAdmin');
            if (navAdmin) navAdmin.classList.remove('hidden');
            
            // Populate admin team list if on admin page
            if (document.getElementById('adminTeamList')) {
                renderAdminTeamList();
            }
        }
        
        // Start data synchronization
        startDataSync();
        
        // Navigate to landing page
        navTo('landing');
        
    } catch (error) {
        console.error('❌ Login error:', error);
        alert(error.message || 'Login failed. Please try again.');
    }
}

/**
 * Logout function
 */
export function logout() {
    state.currentUser = null;
    state.isAdmin = false;
    localStorage.removeItem('photoUser');
    
    // Sign out from Firebase
    auth.signOut().then(() => {
        location.reload();
    });
}

// Legacy compatibility exports (deprecated but kept for Phase 2 transition)
export async function initTeam() {
    console.warn('⚠️ initTeam() is deprecated, use initAuth() instead');
    return initAuth();
}
