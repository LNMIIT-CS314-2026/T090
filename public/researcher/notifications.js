import { mountNotificationsPage } from '/js/notifications.js';

mountNotificationsPage({
  role: 'RESEARCHER',
  recordHref: (n) => `/researcher/publications/${n.publicationId}/outcome`,
});
