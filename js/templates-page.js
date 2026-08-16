import {
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplate,
  ratioLabel,
  templateDuration,
} from './templates.js';

const grid = document.getElementById('template-grid');
const categories = document.getElementById('template-categories');
const search = document.getElementById('template-search');
const count = document.getElementById('template-count');
const empty = document.getElementById('template-empty');
const dialog = document.getElementById('template-dialog');
const dialogContent = document.getElementById('template-dialog-content');
let activeCategory = 'All';

function durationLabel(seconds) {
  return `0:${String(Math.round(seconds)).padStart(2, '0')}`;
}

function coverMarkup(template, large = false) {
  return `<div class="template-cover ${large ? 'large' : ''}" data-motif="${template.cover.motif}" style="--template-accent:${template.accent}">
    <span class="template-cover-orbit one"></span><span class="template-cover-orbit two"></span>
    <span class="template-cover-rule"></span>
    <strong>${template.cover.label}</strong>
    <small>CAPYSTUDIO ORIGINAL</small>
    <span class="template-cover-step">${template.slots.length} CUTS</span>
  </div>`;
}

function cardMarkup(template) {
  return `<article class="template-card" data-template-id="${template.id}">
    <button class="template-preview-button" aria-label="Preview ${template.name}">${coverMarkup(template)}</button>
    <div class="template-card-copy">
      <div><strong>${template.name}</strong><span>${template.category}</span></div>
      <p>${template.description}</p>
      <div class="template-meta">
        <span>${ratioLabel(template)}</span><span>${durationLabel(templateDuration(template))}</span><span>${template.slots.length} clips</span>
      </div>
      <button class="template-use primary" data-use-template="${template.id}">Use template</button>
    </div>
  </article>`;
}

function visibleTemplates() {
  const query = search.value.trim().toLowerCase();
  return TEMPLATES.filter((template) => {
    const categoryMatch = activeCategory === 'All' || template.category === activeCategory;
    const haystack = [template.name, template.category, template.description, ...template.tags].join(' ').toLowerCase();
    return categoryMatch && (!query || haystack.includes(query));
  });
}

function renderTemplates() {
  const items = visibleTemplates();
  grid.innerHTML = items.map(cardMarkup).join('');
  count.textContent = `${items.length} ${items.length === 1 ? 'template' : 'templates'}`;
  empty.hidden = !!items.length;
  grid.querySelectorAll('.template-card').forEach((card) => {
    const template = getTemplate(card.dataset.templateId);
    card.querySelector('.template-preview-button').addEventListener('click', () => openPreview(template));
  });
  grid.querySelectorAll('[data-use-template]').forEach((button) => {
    button.addEventListener('click', () => useTemplate(button.dataset.useTemplate));
  });
}

function renderCategories() {
  categories.innerHTML = '';
  for (const category of TEMPLATE_CATEGORIES) {
    const button = document.createElement('button');
    button.textContent = category;
    button.className = category === activeCategory ? 'active' : '';
    button.setAttribute('aria-pressed', String(category === activeCategory));
    button.addEventListener('click', () => {
      activeCategory = category;
      renderCategories();
      renderTemplates();
    });
    categories.appendChild(button);
  }
}

function openPreview(template) {
  const total = templateDuration(template);
  dialogContent.innerHTML = `<div class="template-dialog-layout">
    ${coverMarkup(template, true)}
    <div class="template-dialog-copy">
      <span class="template-eyebrow">${template.category} template</span>
      <h2>${template.name}</h2>
      <p>${template.description}</p>
      <div class="template-detail-meta"><span><b>${template.slots.length}</b> media slots</span><span><b>${durationLabel(total)}</b> duration</span><span><b>${ratioLabel(template)}</b> canvas</span></div>
      <div class="template-recipe">
        <span>Timeline recipe</span>
        <div>${template.slots.map((slot, index) => `<i style="--slot:${slot.duration / total * 100}%" title="Clip ${index + 1}: ${slot.duration.toFixed(1)} seconds"></i>`).join('')}</div>
        <small>Includes ${template.slots.slice(1).filter((slot) => slot.transition !== 'none').length} transitions and ${template.text.length} editable text layers</small>
      </div>
      <ol class="template-steps"><li>Choose ${template.slots.length} photos or videos</li><li>CapyStudio builds the editable timeline</li><li>Fine-tune text, music, and framing</li></ol>
      <button class="primary template-dialog-use" data-use-template="${template.id}">Use this template</button>
    </div>
  </div>`;
  dialogContent.querySelector('[data-use-template]').addEventListener('click', () => useTemplate(template.id));
  dialog.showModal();
}

function useTemplate(id) {
  location.href = `./editor.html?template=${encodeURIComponent(id)}`;
}

document.getElementById('template-dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
search.addEventListener('input', renderTemplates);

renderCategories();
renderTemplates();
