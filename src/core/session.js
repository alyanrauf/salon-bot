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

// function setSession(userId, data) {
//   sessions.set(userId, { data, updatedAt: Date.now() });
// }


function setSession(userId, newData) {
  sessions[userId] = {
    ...sessions[userId],
    ...newData,
    lastUpdated: Date.now()
  };
}

function isSessionExpired(session, minutes = 5) {
  if (!session || !session.lastUpdated) return true;
  const diff = Date.now() - session.lastUpdated;
  return diff > minutes * 60 * 1000; // 5 minutes in ms
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

//module.exports = { getSession, setSession, clearSession };
module.exports = {
  getSession,
  setSession,
  clearSession,
  isSessionExpired
};
