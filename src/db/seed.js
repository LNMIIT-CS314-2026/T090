'use strict';
/*
 * Demo data (instruction.md section 9). seed(db) fills an empty database.
 * Run directly: `node src/db/seed.js --reset` (npm run reset) clears every table and seeds again.
 * Reset works on the open file, so it is safe even while the server is running.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { UserRepository } = require('../repositories/UserRepository');
const { PublicationRepository } = require('../repositories/PublicationRepository');
const { VerificationRepository } = require('../repositories/VerificationRepository');
const { MetricRepository } = require('../repositories/MetricRepository');
const { NotificationRepository } = require('../repositories/NotificationRepository');
const { AuditRepository } = require('../repositories/AuditRepository');
const { MetricCalculator } = require('../services/MetricCalculator');
const { normalizeTitle, normalizeDoi } = require('../domain/normalize');

const DEMO_PASSWORD = 'demo123';
const LAST_SEEDED_NUMBER = 1119; // the next new public ID is P-1120

/** ISO timestamp `daysAgo` days before now at hh:mm India time. */
function at(daysAgo, hh, mm) {
  const IST = 330 * 60000;
  const d = new Date(Date.now() - daysAgo * 86400000 + IST);
  d.setUTCHours(hh, mm, 0, 0);
  return new Date(d.getTime() - IST).toISOString();
}

function isSeeded(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
}

function clearAll(db) {
  db.transaction(() => {
    for (const t of ['reports', 'audit_logs', 'notifications', 'impact_metrics', 'status_history', 'verifications', 'publications']) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
    db.prepare('UPDATE departments SET head_user_id = NULL').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM departments').run();
    db.prepare('DELETE FROM sequences').run();
  })();
}

function seed(db) {
  const users = new UserRepository(db);
  const pubs = new PublicationRepository(db);
  const verifications = new VerificationRepository(db);
  const notifications = new NotificationRepository(db);
  const audit = new AuditRepository(db);
  const calculator = new MetricCalculator({ publications: pubs, metricRepo: new MetricRepository(db) });
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  db.transaction(() => {
    // --- departments and users ---
    const CSE = users.insertDepartment({ name: 'Computer Science & Engineering', code: 'CSE' });
    const ECE = users.insertDepartment({ name: 'Electronics & Communication Engineering', code: 'ECE' });
    const MTH = users.insertDepartment({ name: 'Mathematics', code: 'MTH' });
    const CCE = users.insertDepartment({ name: 'Computer & Communication Engineering', code: 'CCE' });
    const ME = users.insertDepartment({ name: 'Mechanical Engineering', code: 'ME' });

    const u = (name, email, role, departmentId, designation, accountStatus = 'ACTIVE') =>
      users.insertUser({ name, email, passwordHash: hash, role, departmentId, designation, accountStatus });

    const sourabh = u('Dr. Sourabh', 'sourabh@lnmiit.ac.in', 'RESEARCHER', CSE, 'Associate Professor');
    const prayag = u('Prayag Vijay', 'prayag.vijay@lnmiit.ac.in', 'RESEARCH_ADMIN', null, 'Research Office');
    const pulkit = u('Pulkit Mittal', 'pulkit.mittal@lnmiit.ac.in', 'RESEARCH_ADMIN', null, 'Research Office');
    const lakshya = u('Lakshya Singhal', 'lakshya.singhal@lnmiit.ac.in', 'HOD', CSE, 'Professor and Head');
    const kartik = u('Kartik Mantri', 'kartik.mantri@lnmiit.ac.in', 'HOD', ECE, 'Professor and Head');
    const neha = u('Dr. Neha Kulkarni', 'neha.kulkarni@lnmiit.ac.in', 'RESEARCHER', ECE, 'Assistant Professor');
    const arjun = u('Dr. Arjun Bhatt', 'arjun.bhatt@lnmiit.ac.in', 'RESEARCHER', CSE, 'Assistant Professor');
    const ritu = u('Dr. Ritu Saxena', 'ritu.saxena@lnmiit.ac.in', 'RESEARCHER', MTH, 'Associate Professor', 'DEACTIVATED');
    // Second increment: institute-level roles (FR-030, FR-034, FR-004, FR-009).
    u('Dr. Meenakshi Rao', 'meenakshi.rao@lnmiit.ac.in', 'INSTITUTE_MGMT', null, 'Dean, Research & Development');
    u('Vikram Joshi', 'vikram.joshi@lnmiit.ac.in', 'SYSTEM_ADMIN', null, 'IT Services');
    // Heads of the other departments, and one researcher each for CCE and ME (added after the
    // first-increment accounts, so their user IDs stay the same).
    const anjali = u('Dr. Anjali Verma', 'anjali.verma@lnmiit.ac.in', 'HOD', MTH, 'Professor and Head');
    const rajesh = u('Dr. Rajesh Khanna', 'rajesh.khanna@lnmiit.ac.in', 'HOD', CCE, 'Professor and Head');
    const suresh = u('Dr. Suresh Patil', 'suresh.patil@lnmiit.ac.in', 'HOD', ME, 'Professor and Head');
    const priya = u('Dr. Priya Nair', 'priya.nair@lnmiit.ac.in', 'RESEARCHER', CCE, 'Assistant Professor');
    const vivek = u('Dr. Vivek Chauhan', 'vivek.chauhan@lnmiit.ac.in', 'RESEARCHER', ME, 'Associate Professor');
    users.setDepartmentHead(CSE, lakshya);
    users.setDepartmentHead(ECE, kartik);
    users.setDepartmentHead(MTH, anjali);
    users.setDepartmentHead(CCE, rajesh);
    users.setDepartmentHead(ME, suresh);

    // Researcher profiles (FR-006, FR-007).
    const profile = (id, researchAreas, phone) => {
      const r = users.findById(id);
      users.updateProfile(id, { name: r.name, designation: r.designation, researchAreas, phone });
    };
    profile(sourabh, 'Bibliometrics, scholarly data pipelines, citation analysis', '+91 141 2688 101');
    profile(arjun, 'Edge computing, recommender systems, information retrieval', '+91 141 2688 117');
    profile(neha, 'RF circuit design, antennas, 5G receivers', '+91 141 2688 214');
    profile(ritu, 'Spectral graph theory', null);
    profile(priya, 'Wireless sensor networks, network security, IoT', '+91 141 2688 305');
    profile(vivek, 'Additive manufacturing, composite materials, finite element analysis', '+91 141 2688 412');

    pubs.initSequence(LAST_SEEDED_NUMBER);

    /** Inserts a publication and replays its lifecycle into status_history, verifications and audit_logs. */
    function pub(p) {
      const events = [{ from: null, to: 'DRAFT_ENTERED', actor: p.owner, at: p.created }];
      if (p.submitted) events.push({ from: 'DRAFT_ENTERED', to: 'SUBMITTED', actor: p.owner, at: p.submitted });
      if (p.opened) events.push({ from: 'SUBMITTED', to: 'UNDER_REVIEW', actor: p.opened.by, at: p.opened.at });
      if (p.decision) events.push({ from: 'UNDER_REVIEW', to: p.decision.decision, actor: p.decision.by, at: p.decision.at });
      const last = events[events.length - 1];

      const id = pubs.insert({
        publicId: p.publicId,
        ownerId: p.owner,
        title: p.title,
        authors: p.authors,
        publicationType: p.type,
        venue: p.venue,
        year: p.year,
        doiLink: p.doi || null,
        citationCount: p.citations,
        normalizedTitle: normalizeTitle(p.title),
        normalizedDoi: normalizeDoi(p.doi),
        status: last.to,
        duplicateFlag: !!p.duplicateFlag,
        reviewerId: p.opened ? p.opened.by : null,
        createdAt: p.created,
        updatedAt: last.at,
        submittedAt: p.submitted || null,
        version: events.length,
      });
      for (const e of events) pubs.insertHistory(id, e.from, e.to, e.actor, e.at);
      if (p.decision) {
        verifications.insert({
          publicationId: id,
          administratorId: p.decision.by,
          decision: p.decision.decision,
          comments: p.decision.comments || null,
          decisionDate: p.decision.at,
        });
        audit.insert({
          action: p.decision.decision === 'VERIFIED' ? 'VERIFY' : 'REJECT',
          actorId: p.decision.by,
          targetId: p.publicId,
          details: p.decision.comments || null,
          at: p.decision.at,
        });
      }
      return id;
    }

    const review = (by, daysAgo, hh, mm) => ({ by, at: at(daysAgo, hh, mm) });
    const decide = (by, decision, daysAgo, hh, mm, comments) => ({ by, decision, at: at(daysAgo, hh, mm), comments });

    // --- Dr. Sourabh (SRS Figure 7 sample: 25 / 2 / 2) ---
    pub({
      publicId: 'P-0987', owner: sourabh, title: 'Scalable Bibliometric Pipelines', authors: 'Sourabh, R. Jain, P. Verma',
      type: 'CONFERENCE', venue: 'ICDE Workshops', year: 2024, doi: '10.1109/ICDEW.2024.00987', citations: 14,
      created: at(43, 11, 5), submitted: at(42, 9, 40), opened: review(pulkit, 41, 15, 10),
      decision: decide(pulkit, 'VERIFIED', 41, 15, 22),
    });
    const p1042 = pub({
      publicId: 'P-1042', owner: sourabh, title: 'Graph-Based Citation Analysis', authors: 'Sourabh, A. Gupta',
      type: 'JOURNAL', venue: 'IEEE Access', year: 2025, doi: '10.1109/ACCESS.2025.3361042', citations: 11,
      created: at(42, 16, 30), submitted: at(41, 9, 15), opened: review(prayag, 40, 10, 18),
      decision: decide(prayag, 'VERIFIED', 40, 10, 31, 'Details match DOI record'),
    });
    const p1088 = pub({
      publicId: 'P-1088', owner: sourabh, title: 'Deep Learning for Citation Prediction', authors: 'Sourabh, A. Gupta, S. Mehra',
      type: 'CONFERENCE', venue: 'COMSNETS', year: 2026, doi: '10.1109/COMSNETS.2026.1088', citations: 0,
      created: at(21, 12, 0), submitted: at(20, 10, 20), opened: review(prayag, 6, 15, 48),
      decision: decide(prayag, 'REJECTED', 6, 16, 5,
        'DOI does not resolve and the venue name does not match the proceedings. Please check the DOI and resubmit.'),
    });
    const p1095 = pub({
      publicId: 'P-1095', owner: sourabh, title: 'Open Data Policies in Indian HEIs', authors: 'Sourabh, K. Rao',
      type: 'BOOK_CHAPTER', venue: 'Springer — Open Science in Asia', year: 2025, citations: 2,
      created: at(16, 14, 10), submitted: at(14, 11, 2),
    });
    const p1110 = pub({
      publicId: 'P-1110', owner: sourabh, title: 'Graph Based Citation Analysis', authors: 'Sourabh, A. Gupta',
      type: 'JOURNAL', venue: 'IEEE Access', year: 2025, doi: '10.1109/ACCESS.2025.3361042', citations: 12,
      created: at(9, 17, 45), submitted: at(8, 9, 30), duplicateFlag: true,
    });
    pub({
      publicId: 'P-1101', owner: sourabh, title: 'Federated Indexing of Theses', authors: 'Sourabh, N. Agarwal',
      type: 'JOURNAL', venue: 'Journal of Information Science', year: 2026, citations: 3,
      created: at(3, 13, 25),
    });

    // --- Dr. Arjun Bhatt (CSE) ---
    pub({
      publicId: 'P-1060', owner: arjun, title: 'Energy-Aware Scheduling for Edge Clusters', authors: 'A. Bhatt, V. Iyer',
      type: 'CONFERENCE', venue: 'IEEE CLOUD', year: 2025, doi: '10.1109/CLOUD.2025.01060', citations: 9,
      created: at(33, 10, 0), submitted: at(32, 12, 15), opened: review(prayag, 30, 11, 0),
      decision: decide(prayag, 'VERIFIED', 30, 11, 12, 'Matches proceedings listing'),
    });
    const p1098 = pub({
      publicId: 'P-1098', owner: arjun, title: 'Benchmarking Vector Databases for Scholarly Search', authors: 'A. Bhatt, S. Kapoor',
      type: 'JOURNAL', venue: 'Information Processing & Management', year: 2026, citations: 1,
      created: at(13, 15, 0), submitted: at(12, 10, 5),
    });
    pub({
      publicId: 'P-1104', owner: arjun, title: 'A Survey of Explainable Recommender Systems', authors: 'A. Bhatt, M. Khanna, R. Das',
      type: 'JOURNAL', venue: 'ACM Computing Surveys', year: 2024, doi: '10.1145/3651104', citations: 27,
      created: at(24, 9, 30), submitted: at(22, 16, 40), opened: review(pulkit, 2, 9, 58),
    });

    // --- Dr. Neha Kulkarni (ECE) ---
    pub({
      publicId: 'P-1012', owner: neha, title: 'Low-Power LNA Design for 5G Receivers', authors: 'N. Kulkarni, P. Deshmukh',
      type: 'JOURNAL', venue: 'IEEE Transactions on Microwave Theory and Techniques', year: 2023,
      doi: '10.1109/TMTT.2023.1012', citations: 18,
      created: at(40, 10, 10), submitted: at(39, 11, 0), opened: review(pulkit, 35, 14, 0),
      decision: decide(pulkit, 'VERIFIED', 35, 14, 9),
    });
    pub({
      publicId: 'P-1031', owner: neha, title: 'Compact MIMO Antenna for Wearables', authors: 'N. Kulkarni, A. Joshi',
      type: 'CONFERENCE', venue: 'IEEE Antennas and Propagation Symposium', year: 2024, doi: '10.1109/APS.2024.1031', citations: 10,
      created: at(31, 12, 40), submitted: at(30, 9, 50), opened: review(prayag, 28, 12, 20),
      decision: decide(prayag, 'VERIFIED', 28, 12, 34),
    });
    const p1099 = pub({
      publicId: 'P-1099', owner: neha, title: 'Reconfigurable Intelligent Surfaces: A Measurement Study', authors: 'N. Kulkarni, R. Menon',
      type: 'CONFERENCE', venue: 'IEEE ICC', year: 2026, citations: 0,
      created: at(6, 11, 15), submitted: at(5, 14, 45),
    });

    // --- Dr. Ritu Saxena (MTH, deactivated) ---
    pub({
      publicId: 'P-0950', owner: ritu, title: 'Spectral Bounds for Sparse Graphs', authors: 'R. Saxena',
      type: 'JOURNAL', venue: 'Discrete Mathematics', year: 2023, doi: '10.1016/j.disc.2023.0950', citations: 6,
      created: at(39, 9, 0), submitted: at(39, 9, 20), opened: review(prayag, 38, 10, 0),
      decision: decide(prayag, 'VERIFIED', 38, 10, 6),
    });

    // --- Dr. Priya Nair (CCE) ---
    pub({
      publicId: 'P-1005', owner: priya, title: 'Lightweight Key Management for IoT Sensor Networks', authors: 'P. Nair, S. Ghosh',
      type: 'JOURNAL', venue: 'IEEE Internet of Things Journal', year: 2023, doi: '10.1109/JIOT.2023.1005', citations: 21,
      created: at(45, 10, 0), submitted: at(44, 9, 30), opened: review(pulkit, 43, 11, 0),
      decision: decide(pulkit, 'VERIFIED', 43, 11, 20),
    });
    pub({
      publicId: 'P-1024', owner: priya, title: 'Energy-Efficient Routing in Multi-Hop Wireless Networks', authors: 'P. Nair, R. Khanna',
      type: 'CONFERENCE', venue: 'IEEE WCNC', year: 2024, doi: '10.1109/WCNC.2024.1024', citations: 7,
      created: at(37, 14, 0), submitted: at(36, 10, 15), opened: review(prayag, 34, 9, 40),
      decision: decide(prayag, 'VERIFIED', 34, 9, 55),
    });
    pub({
      publicId: 'P-1050', owner: priya, title: 'Detecting Spoofed Nodes with Graph Neural Networks', authors: 'P. Nair, A. Iyer',
      type: 'JOURNAL', venue: 'Computer Networks', year: 2025, doi: '10.1016/j.comnet.2025.1050', citations: 4,
      created: at(29, 11, 30), submitted: at(28, 9, 10), opened: review(prayag, 26, 15, 0),
      decision: decide(prayag, 'VERIFIED', 26, 15, 12),
    });

    // --- Dr. Vivek Chauhan (ME) ---
    pub({
      publicId: 'P-0970', owner: vivek, title: 'Fatigue Behaviour of 3D-Printed Lattice Structures', authors: 'V. Chauhan, S. Patil',
      type: 'JOURNAL', venue: 'Additive Manufacturing', year: 2023, doi: '10.1016/j.addma.2023.0970', citations: 16,
      created: at(44, 15, 0), submitted: at(43, 10, 0), opened: review(pulkit, 42, 10, 30),
      decision: decide(pulkit, 'VERIFIED', 42, 10, 45),
    });
    pub({
      publicId: 'P-1036', owner: vivek, title: 'Finite Element Study of Natural-Fibre Composite Panels', authors: 'V. Chauhan, K. Bansal',
      type: 'CONFERENCE', venue: 'ASME IMECE', year: 2024, doi: '10.1115/IMECE2024.1036', citations: 3,
      created: at(36, 12, 20), submitted: at(35, 11, 0), opened: review(prayag, 33, 14, 10),
      decision: decide(prayag, 'VERIFIED', 33, 14, 25),
    });

    // --- impact metrics, computed with the real recompute(), dated at the triggering verification ---
    calculator.recompute(sourabh, 'P-1042', at(40, 10, 32));
    calculator.recompute(arjun, 'P-1060', at(30, 11, 13));
    calculator.recompute(neha, 'P-1031', at(28, 12, 35));
    calculator.recompute(ritu, 'P-0950', at(38, 10, 7));
    calculator.recompute(priya, 'P-1050', at(26, 15, 13));
    calculator.recompute(vivek, 'P-1036', at(33, 14, 26));

    // --- notifications (e-mails already sent) ---
    const note = (recipientId, type, message, publicationId, createdAt, readStatus = 'UNREAD') =>
      notifications.insert({ recipientId, type, message, publicationId, createdAt, readStatus, emailStatus: 'SENT' });

    note(sourabh, 'PUBLICATION_VERIFIED', "P-1042 'Graph-Based Citation Analysis' was verified by Prayag Vijay.", p1042, at(40, 10, 31), 'READ');
    note(sourabh, 'PUBLICATION_REJECTED',
      "P-1088 'Deep Learning for Citation Prediction' was rejected: DOI does not resolve and the venue name does not match the proceedings. Please check the DOI and resubmit.",
      p1088, at(6, 16, 5));

    const pending = [
      [p1095, "Dr. Sourabh submitted P-1095 'Open Data Policies in Indian HEIs' for verification.", at(14, 11, 2)],
      [p1098, "Dr. Arjun Bhatt submitted P-1098 'Benchmarking Vector Databases for Scholarly Search' for verification.", at(12, 10, 5)],
      [p1110, "Dr. Sourabh submitted P-1110 'Graph Based Citation Analysis' for verification.", at(8, 9, 30)],
      [p1099, "Dr. Neha Kulkarni submitted P-1099 'Reconfigurable Intelligent Surfaces: A Measurement Study' for verification.", at(5, 14, 45)],
    ];
    for (const admin of [prayag, pulkit]) {
      for (const [pid, msg, when] of pending) note(admin, 'NEW_RECORD_PENDING', msg, pid, when);
    }
  })();
}

module.exports = { seed, isSeeded, clearAll, DEMO_PASSWORD };

if (require.main === module) {
  const { openDb } = require('./connection');
  const dataDir = path.join(__dirname, '..', '..', 'data');
  const db = openDb(path.join(dataDir, 'researchpulse.db'));
  if (process.argv.includes('--reset')) {
    clearAll(db);
    fs.rmSync(path.join(dataDir, 'mail.log'), { force: true });
    seed(db);
    console.log('Demo data restored (data/researchpulse.db). Restart the server to clear existing sessions.');
  } else if (!isSeeded(db)) {
    seed(db);
    console.log('Database seeded.');
  } else {
    console.log('Database already contains data. Use `npm run reset` to restore the demo data.');
  }
  db.close();
}
