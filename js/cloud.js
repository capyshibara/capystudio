// Optional cloud layer: Google sign-in + per-user project storage in
// Firestore. Loaded lazily from the Firebase CDN only when a config exists
// in firebase-config.js, so the core editor stays dependency-free.
//
// Firestore layout: users/{uid}/projects/{name} -> { name, json, updatedAt }
// Only project JSON (timings + style) is stored; media files stay local.

import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.6.0';

let auth = null;
let db = null;
let A = null; // firebase-auth module
let F = null; // firebase-firestore module

export const cloudEnabled = !!firebaseConfig;

export async function initCloud(onUserChanged) {
  if (!cloudEnabled) return false;
  const [{ initializeApp }, authMod, fsMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  A = authMod;
  F = fsMod;
  const app = initializeApp(firebaseConfig);
  auth = A.getAuth(app);
  db = F.getFirestore(app);
  A.onAuthStateChanged(auth, onUserChanged);
  return true;
}

export async function signIn() {
  await A.signInWithPopup(auth, new A.GoogleAuthProvider());
}

export async function signOutUser() {
  await A.signOut(auth);
}

function projectRef(name) {
  return F.doc(db, 'users', auth.currentUser.uid, 'projects', name);
}

export async function saveProjectToCloud(name, json) {
  await F.setDoc(projectRef(name), { name, json, updatedAt: F.serverTimestamp() });
}

export async function listCloudProjects() {
  const col = F.collection(db, 'users', auth.currentUser.uid, 'projects');
  const snap = await F.getDocs(col);
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

export async function loadProjectFromCloud(name) {
  const snap = await F.getDoc(projectRef(name));
  return snap.exists() ? snap.data().json : null;
}

export async function deleteCloudProject(name) {
  await F.deleteDoc(projectRef(name));
}
