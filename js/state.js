// Global State Management

export const DEFAULT_TEAM = [
    "Ivan Pecek", "Jack Wickes", "James Wilson", "James Denton",
    "Jemma Ridyard", "Jennifer Turnham", "Kacper Chodyra", "Kyle Plastock", 
    "Lloyd Woodger", "Luke Evans", "Paul Udogaranya", "Rainer Knappe", 
    "Raul Caramizaru", "Thomas McPherson", "William Howe", "Anthony Wilson"
];

// Load user from localStorage (migrate from old string format to new object format)
function loadStoredUser() {
    const stored = localStorage.getItem('photoUser');
    if (!stored) return null;
    
    // Try to parse as JSON (new format)
    try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && parsed.displayName) {
            return parsed;
        }
    } catch (e) {
        // Fall through to legacy handling
    }
    
    // Legacy format: plain string - convert to basic object for session continuity
    if (typeof stored === 'string' && stored.length > 0) {
        return {
            displayName: stored,
            name: stored,
            legacySession: true // Flag to re-authenticate on app load
        };
    }
    
    return null;
}

export const state = {
    currentUser: loadStoredUser(), // Now a user object: { id, displayName, name, teamId, role, pin }
    isAdmin: false,
    availableContests: [],   // NEW (Phase 4): All active contests (voting, submissions_open, skipped)
    activeContest: null,     // Modified (Phase 4): Currently selected contest from availableContests
    submissionContest: null,
    nextMonthId: null,
    nextMonthName: null,
    entries: [],
    archives: [],
    shuffledEntries: [],
    votes: { 1: null, 2: null, 3: null },
    hasVotedLocally: false,
    myUploads: [],
    teamMembers: [], // Deprecated: will be removed in future
    allUsers: [], // Phase 2: Stores all users from Firestore for search/filtering
    allTeams: [], // Phase 6: All teams from Firestore
    filteredUsers: [] // Phase 6: For search functionality
};

// Firestore listeners (unsubscribe functions)
export let entriesUnsubscribe = null;
export let uploadsUnsubscribe = null;
export let myVoteUnsubscribe = null;

// Setter functions for unsubscribe handlers
export function setEntriesUnsubscribe(unsub) {
    entriesUnsubscribe = unsub;
}

export function setUploadsUnsubscribe(unsub) {
    uploadsUnsubscribe = unsub;
}

export function setMyVoteUnsubscribe(unsub) {
    myVoteUnsubscribe = unsub;
}

window.state = state; // Temporary: Expose state to console