// Original CapyStudio template recipes. Templates contain edit decisions only;
// users supply every photo, video, and audio file from their own device.

export const TEMPLATE_CATEGORIES = ['All', 'Trending', 'Social', 'Memories', 'Business'];

export const TEMPLATES = [
  {
    id: 'beat-snap',
    name: 'Beat Snap',
    category: 'Trending',
    description: 'Fast cuts, punchy zooms, and a bold opening title for vertical edits.',
    tags: ['beat', 'fast', 'reels', 'tiktok', 'energy'],
    canvas: { width: 1080, height: 1920, fps: 30, fit: 'cover', background: '#08090d' },
    accent: '#a5f24b',
    cover: { label: 'BEAT', motif: 'burst' },
    slots: [
      { duration: 1.2, transform: { scale: 1.08 }, transition: 'none' },
      { duration: 1.0, transform: { scale: 1.22, rotation: -2 }, transition: 'zoom' },
      { duration: 1.4, transform: { scale: 1.12, x: 4 }, transition: 'slide' },
      { duration: 1.0, transform: { scale: 1.28, rotation: 2 }, transition: 'zoom' },
      { duration: 2.4, transform: { scale: 1.04 }, transition: 'crossfade' },
    ],
    text: [
      { text: 'TURN IT UP', start: 0.12, end: 1.1, position: 'center', size: 0.068, animation: 'pop' },
      { text: 'YOUR MOMENT', start: 4.65, end: 6.8, position: 'bottom', size: 0.047, animation: 'fade' },
    ],
  },
  {
    id: 'soft-memories',
    name: 'Soft Memories',
    category: 'Memories',
    description: 'Gentle crossfades and warm journal typography for personal moments.',
    tags: ['soft', 'memory', 'family', 'couple', 'journal'],
    canvas: { width: 1080, height: 1920, fps: 30, fit: 'cover', background: '#17120f' },
    accent: '#ffc8a2',
    cover: { label: 'US', motif: 'soft' },
    slots: [
      { duration: 3, transform: { scale: 1.02 }, transition: 'none' },
      { duration: 3, transform: { scale: 1.08, x: -3 }, transition: 'crossfade' },
      { duration: 3, transform: { scale: 1.06, x: 3 }, transition: 'crossfade' },
      { duration: 3, transform: { scale: 1.02 }, transition: 'fade' },
    ],
    text: [
      { text: 'the little things', start: 0.3, end: 2.7, position: 'bottom', size: 0.046, animation: 'fade', fontFamily: 'Georgia', background: 'transparent' },
      { text: 'always with me', start: 9.2, end: 11.7, position: 'center', size: 0.05, animation: 'fade', fontFamily: 'Georgia', background: '#2a171299' },
    ],
  },
  {
    id: 'travel-postcard',
    name: 'Travel Postcard',
    category: 'Memories',
    description: 'A cinematic landscape sequence with relaxed pacing and destination cards.',
    tags: ['travel', 'cinematic', 'landscape', 'vlog', 'holiday'],
    canvas: { width: 1920, height: 1080, fps: 30, fit: 'cover', background: '#0b1118' },
    accent: '#54d6e7',
    cover: { label: 'AWAY', motif: 'postcard' },
    slots: [
      { duration: 3, transform: { scale: 1.04 }, transition: 'none' },
      { duration: 3, transform: { scale: 1.08, x: 2 }, transition: 'crossfade' },
      { duration: 3, transform: { scale: 1.08, x: -2 }, transition: 'crossfade' },
      { duration: 3, transform: { scale: 1.05 }, transition: 'slide' },
      { duration: 3, transform: { scale: 1.02 }, transition: 'fade' },
    ],
    text: [
      { text: 'POSTCARD FROM', start: 0.35, end: 1.55, position: 'top', size: 0.04, animation: 'fade', background: 'transparent' },
      { text: 'SOMEWHERE BEAUTIFUL', start: 1.2, end: 3.0, position: 'center', size: 0.064, animation: 'pop' },
      { text: 'see you on the next adventure', start: 12.3, end: 14.8, position: 'bottom', size: 0.036, animation: 'fade', background: 'transparent' },
    ],
  },
  {
    id: 'product-pop',
    name: 'Product Pop',
    category: 'Business',
    description: 'Crisp product cuts and ready-to-edit launch messaging for social promos.',
    tags: ['product', 'shop', 'business', 'promo', 'launch'],
    canvas: { width: 1080, height: 1920, fps: 30, fit: 'cover', background: '#0a0a10' },
    accent: '#ffcf4a',
    cover: { label: 'DROP', motif: 'product' },
    slots: [
      { duration: 2, transform: { scale: 1.08 }, transition: 'none' },
      { duration: 1.5, transform: { scale: 1.18, rotation: -2 }, transition: 'slide' },
      { duration: 1.5, transform: { scale: 1.18, rotation: 2 }, transition: 'slide' },
      { duration: 3, transform: { scale: 1.04 }, transition: 'zoom' },
    ],
    text: [
      { text: 'NEW DROP', start: 0.15, end: 1.75, position: 'center', size: 0.075, animation: 'pop', color: '#101014', background: '#ffcf4aee' },
      { text: 'MADE FOR YOUR EVERYDAY', start: 3.7, end: 5.0, position: 'top', size: 0.038, animation: 'fade' },
      { text: 'SHOP NOW', start: 5.35, end: 7.85, position: 'bottom', size: 0.052, animation: 'pop', color: '#101014', background: '#a5f24bee' },
    ],
  },
  {
    id: 'before-after',
    name: 'Before / After',
    category: 'Social',
    description: 'A clean two-clip reveal for makeovers, renovations, and transformations.',
    tags: ['before', 'after', 'reveal', 'transformation', 'social'],
    canvas: { width: 1080, height: 1920, fps: 30, fit: 'cover', background: '#08090d' },
    accent: '#a88af8',
    cover: { label: 'A/B', motif: 'split' },
    slots: [
      { duration: 3, transform: { scale: 1.02 }, transition: 'none' },
      { duration: 3, transform: { scale: 1.02 }, transition: 'slide' },
    ],
    text: [
      { text: 'BEFORE', start: 0.2, end: 2.8, position: 'top', size: 0.052, animation: 'fade' },
      { text: 'AFTER', start: 3.15, end: 5.9, position: 'top', size: 0.052, animation: 'pop', background: '#a88af8dd' },
    ],
  },
  {
    id: 'minimal-journal',
    name: 'Minimal Journal',
    category: 'Social',
    description: 'Editorial 4:5 pacing for daily looks, food, interiors, and quiet stories.',
    tags: ['minimal', 'journal', 'fashion', 'food', 'instagram'],
    canvas: { width: 1080, height: 1350, fps: 30, fit: 'cover', background: '#eeebe4' },
    accent: '#f1eee6',
    cover: { label: 'DAY 01', motif: 'minimal' },
    slots: [
      { duration: 3, transform: { scale: 1.03 }, transition: 'none' },
      { duration: 3, transform: { scale: 1.1, x: -3 }, transition: 'fade' },
      { duration: 3, transform: { scale: 1.04, x: 2 }, transition: 'crossfade' },
    ],
    text: [
      { text: 'A QUIET DAY', start: 0.25, end: 2.7, position: 'center', size: 0.055, animation: 'fade', color: '#181711', background: '#f1eee6dd', fontFamily: 'Georgia' },
      { text: 'small details, good light', start: 6.2, end: 8.8, position: 'bottom', size: 0.035, animation: 'fade', color: '#181711', background: '#f1eee6cc', fontFamily: 'Georgia' },
    ],
  },
];

export function getTemplate(id) {
  return TEMPLATES.find((template) => template.id === id) || null;
}

export function templateDuration(template) {
  return template.slots.reduce((total, slot) => total + slot.duration, 0);
}

export function ratioLabel(template) {
  const { width, height } = template.canvas;
  if (width === 1080 && height === 1920) return '9:16';
  if (width === 1920 && height === 1080) return '16:9';
  if (width === 1080 && height === 1350) return '4:5';
  if (width === height) return '1:1';
  return `${width}:${height}`;
}
