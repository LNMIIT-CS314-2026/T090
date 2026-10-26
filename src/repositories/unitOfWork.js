'use strict';

/**
 * IUnitOfWork (SRS 40.3). run(fn) executes fn in one database transaction; a nested run() joins the
 * outer transaction. afterCommit(cb) callbacks run only after the outermost transaction commits and are
 * discarded on rollback. A failing callback is logged and never undoes the committed work.
 */
function createUnitOfWork(db) {
  let depth = 0;
  let callbacks = [];

  function run(fn) {
    if (depth > 0) {
      depth++;
      try {
        return fn();
      } finally {
        depth--;
      }
    }
    depth = 1;
    callbacks = [];
    let result;
    try {
      result = db.transaction(fn)();
    } catch (err) {
      callbacks = [];
      throw err;
    } finally {
      depth = 0;
    }
    const pending = callbacks;
    callbacks = [];
    for (const cb of pending) {
      try {
        cb();
      } catch (err) {
        console.error('[after-commit] action failed:', err);
      }
    }
    return result;
  }

  function afterCommit(cb) {
    if (depth === 0) cb();
    else callbacks.push(cb);
  }

  return { run, afterCommit };
}

module.exports = { createUnitOfWork };
