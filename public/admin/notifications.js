import { mountNotificationsPage } from '/js/notifications.js';

mountNotificationsPage({
  role: 'RESEARCH_ADMIN',
  recordHref: (n) => `/admin/publications/${n.publicationId}`,
});
