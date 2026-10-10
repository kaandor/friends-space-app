const PROFILE_KEY = 'friends-space:profile-id'

export function getActiveProfileId() {
  return localStorage.getItem(PROFILE_KEY) || 'anonymous'
}

