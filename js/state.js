// Global State Management

export const DEFAULT_TEAM = [
    "Ivan Pecek", "Jack Wickes", "James Wilson", "James Denton",
    "Jemma Ridyard", "Jennifer Turnham", "Kacper Chodyra", "Kyle Plastock", 
    "Lloyd Woodger", "Luke Evans", "Paul Udogaranya", "Rainer Knappe", 
    "Raul Caramizaru", "Thomas McPherson", "William Howe", "Anthony Wilson"
];

export const state = {
    currentUser: localStorage.getItem('photoUser') || null,
    isAdmin: false,
    activeContest: null,      
    submissionContest: null,
    nextMonthId: null,
    nextMonthName: null,
    entries: [],
    archives: [],
    shuffledEntries: [],
    votes: { 1: null, 2: null, 3: null },
    hasVotedLocally: false,
    myUploads: [],
    teamMembers: []
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
