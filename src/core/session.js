// In-memory session store for stateful booking conversations
// Keyed by userId, expires after SESSION_TTL_MS

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

const sessions = new Map();

function getSession(userId) {
  const entry = sessions.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > SESSION_TTL_MS) {
    sessions.delete(userId);
    return null;
  }
  return entry.data;
}


function setSession(userId, newData) {
  const prev = sessions.get(userId)?.data || {};
  sessions.set(userId, {
    data: { ...prev, ...newData, lastUpdated: Date.now() },
    updatedAt: Date.now(),
  });
}

// isSessionExpired checks data.lastUpdated (set by setSession above).
// Timeout aligned with SESSION_TTL_MS = 10 min.
function isSessionExpired(session, minutes = 10) {
  if (!session || !session.lastUpdated) return true;
  return Date.now() - session.lastUpdated > minutes * 60 * 1000;
}

function clearSession(userId) {
  sessions.delete(userId);
}

// Prune expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of sessions.entries()) {
    if (now - entry.updatedAt > SESSION_TTL_MS) {
      sessions.delete(userId);
    }
  }
}, 5 * 60 * 1000);

module.exports = { getSession, setSession, clearSession, isSessionExpired };
