# Firebase Setup — Google Sign-in + Cloud Project Library

CapyStudio's cloud layer (Google login + saving projects to your account) is
already coded but **dormant**: it activates only when you put a Firebase
config into `js/firebase-config.js`. Firebase is the "server side" — there is
no server code to deploy; the static GitHub Pages site talks to Firebase
directly, secured by Auth + Firestore rules.

Everything below stays inside Firebase's free **Spark** plan.

## 1. Create the Firebase project (~2 min)

1. Go to https://console.firebase.google.com and sign in with your Google
   account.
2. **Add project** → name it `capystudio` → Continue.
3. Google Analytics: **disable** (not needed) → **Create project**.

## 2. Register the web app and get the config (~1 min)

1. On the project overview page, click the **`</>` (Web)** icon.
2. App nickname: `CapyStudio` — do **not** tick "Firebase Hosting" (we host
   on GitHub Pages).
3. **Register app**. It shows a `firebaseConfig = { ... }` object — copy it.
4. Open `js/firebase-config.js` in this repo, delete the `export const
   firebaseConfig = null;` line, and paste your object as:

   ```js
   export const firebaseConfig = {
     apiKey: "...",
     authDomain: "capystudio-xxxxx.firebaseapp.com",
     projectId: "capystudio-xxxxx",
     storageBucket: "capystudio-xxxxx.appspot.com",
     messagingSenderId: "...",
     appId: "...",
   };
   ```

   This config is public by design (it identifies the project, like a URL) —
   committing it is safe and normal. Security comes from steps 3 and 5.

## 3. Turn on Google sign-in (~1 min)

1. In the console sidebar: **Build → Authentication** → **Get started**.
2. **Sign-in method** tab → **Google** → toggle **Enable**.
3. Pick your support email → **Save**.

## 4. Authorize your site's domains (~1 min)

1. **Authentication → Settings → Authorized domains**.
2. `localhost` and the `*.firebaseapp.com` domain are pre-authorized.
   Click **Add domain** and add:
   - `capyshibara.github.io`  ← the live site
   - `127.0.0.1`  ← only if you test locally via `http://127.0.0.1:8901`
     (the `serve.py` dev server binds to 127.0.0.1, which is *not* covered
     by the `localhost` entry)

Without this, the Google popup fails with `auth/unauthorized-domain`.

## 5. Create the Firestore database + security rules (~2 min)

1. **Build → Firestore Database** → **Create database**.
2. Location: pick a nearby region (e.g. `asia-southeast1` — Singapore).
   This cannot be changed later.
3. Start in **production mode** → **Create**.
4. **Rules** tab → replace everything with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Each user can read/write only their own documents.
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. **Publish**.

Data layout the app uses: `users/{uid}/projects/{name}` containing
`{ name, json, updatedAt }` — project timings + style only; audio/video/image
files stay on the user's machine.

## 6. Ship it

```bash
git add js/firebase-config.js
git commit -m "Enable Firebase cloud layer"
git push
```

Wait ~1 minute for GitHub Pages to rebuild, then open
https://capyshibara.github.io/capystudio/ — a **Sign in with Google** button
appears in the header. After signing in you get **☁ Save** and **☁ Open**.

## 7. Verify (2-minute test)

1. Sign in → your avatar + first name appear in the header chip.
2. Load a song, time two lyric lines, **☁ Save** under a name.
3. Reload the page, sign in, **☁ Open** → the project (timings + style)
   comes back; re-attach the media files when prompted.
4. In the console: **Firestore Database → Data** — you should see
   `users/<your-uid>/projects/<name>`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| No Sign-in button at all | `firebaseConfig` still `null`, or JS error — check browser console |
| `auth/unauthorized-domain` | Step 4: add the exact domain you're browsing from |
| `auth/operation-not-allowed` | Step 3: Google provider not enabled |
| `permission-denied` on save | Step 5 rules not published, or not signed in |
| Popup closes instantly | Browser blocking third-party popups — allow popups for the site |
