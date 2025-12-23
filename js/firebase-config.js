// Firebase Configuration and Initialization
// Note: Using Firebase v9 compat mode for easier migration

const firebaseConfig = {
    apiKey: "AIzaSyBIvsnCd2apt1rNQAY1FESN_enD_UOte6w",
    authDomain: "photographer-contest.firebaseapp.com",
    projectId: "photographer-contest",
    storageBucket: "photographer-contest.firebasestorage.app",
    messagingSenderId: "147304996816",
    appId: "1:147304996816:web:f41d39a37485afa010a3d5"
};

// Initialize Firebase (compat mode)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Export Firebase services
export const db = firebase.firestore();
export const auth = firebase.auth();
export const storage = firebase.storage();
