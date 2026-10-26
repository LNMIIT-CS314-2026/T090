// My Publications: the W01 toolbar and table without the metric boxes.
import { initPage } from '/js/layout.js';
import { mountPublicationList } from '/researcher/pubtable.js';

const page = await initPage({
  active: 'publications',
  title: 'My Publications',
  subtitle: 'All your publication records, newest first.',
  roles: ['RESEARCHER'],
});

if (page) mountPublicationList(page.content);
