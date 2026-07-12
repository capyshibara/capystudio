// Home screen: module launcher + recent cloud projects.
// The recent-projects section only exists when the cloud layer is
// configured; it shows a sign-in affordance when signed out.

import { cloudEnabled, initCloud, signIn, listCloudProjects } from './cloud.js';
import { relTime } from './formats.js';

const section = document.getElementById('recent-section');
const list = document.getElementById('recent-list');

function showState(text, withSignIn) {
  list.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'recent-state';
  const p = document.createElement('p');
  p.textContent = text;
  p.style.margin = '0';
  box.appendChild(p);
  if (withSignIn) {
    const btn = document.createElement('button');
    btn.textContent = 'Sign in with Google';
    btn.addEventListener('click', async () => {
      try {
        await signIn();
      } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') alert('Sign-in failed: ' + err.message);
      }
    });
    box.appendChild(btn);
  }
  list.appendChild(box);
}

function showRows(items) {
  list.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('button');
    row.className = 'recent-row';
    row.title = `Open "${item.name}" in the editor`;
    const icon = document.createElement('span');
    icon.className = 'recent-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🎬';
    const name = document.createElement('span');
    name.className = 'recent-name';
    name.textContent = item.name;
    const time = document.createElement('span');
    time.className = 'recent-time';
    time.textContent = `Updated ${relTime(item.updatedAt)}`;
    row.append(icon, name, time);
    row.addEventListener('click', () => {
      location.href = './editor.html?project=' + encodeURIComponent(item.name);
    });
    list.appendChild(row);
  }
}

if (cloudEnabled) {
  section.hidden = false;
  showState('Loading…');
  initCloud(async (user) => {
    if (!user) {
      showState('Sign in to see your cloud projects here.', true);
      return;
    }
    try {
      const items = (await listCloudProjects()).slice(0, 5);
      if (items.length) showRows(items);
      else showState('No cloud projects yet — make one in the editor and ☁ Save it.');
    } catch (err) {
      console.warn('recent projects failed', err);
      showState("Couldn't load your projects. Refresh to try again.");
    }
  }).catch((err) => {
    console.warn('Cloud unavailable:', err);
    section.hidden = true;
  });
}
