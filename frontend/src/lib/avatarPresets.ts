import type { Role } from '@/providers/AuthProvider';

// Every avatar file under src/assets/avatars/<folder>/, keyed by its full path.
// Vite resolves each to its built asset URL (same as a normal `import img from '...'`).
const avatarModules = import.meta.glob<string>('../assets/avatars/**/*.{jpg,jpeg,png}', {
  eager: true,
  import: 'default',
});

// Only 5 avatar sets exist. 'librarian' has no dedicated folder — librarians share the
// same staff dashboard/context as managers, so they draw from the 'staff' pool too.
const ROLE_FOLDERS: Record<Role, string> = {
  admin: 'admin',
  manager: 'staff',
  librarian: 'staff',
  member: 'member',
  guardian: 'guardian',
  'it-head': 'it-head',
};

function loadFolder(folder: string): string[] {
  return Object.keys(avatarModules)
    .filter((path) => path.includes(`/avatars/${folder}/`))
    .sort()
    .map((path) => avatarModules[path]);
}

/** Returns the avatar preset image URLs for the given role's picker. */
export function getAvatarPresets(role: Role): string[] {
  const folder = ROLE_FOLDERS[role];
  return loadFolder(folder);
}

/** Returns the avatar preset images for registration (from Preset_Image if present, or role folder). */
export function getRegistrationAvatarPresets(role: Role = 'member'): string[] {
  const presetImages = Object.keys(avatarModules)
    .filter((path) => path.toLowerCase().includes('preset_image'))
    .sort()
    .map((path) => avatarModules[path]);

  if (presetImages.length > 0) {
    return presetImages;
  }
  return getAvatarPresets(role);
}

/** Resolves any stored avatar URL/filename to a valid asset URL. */
export function resolveAvatarUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }

  // 1. Check if url matches an exact resolved asset URL in avatarModules
  const values = Object.values(avatarModules);
  if (values.includes(url)) {
    return url;
  }

  // 2. Extract the base filename (e.g. "member_female9.jpg")
  const baseName = url.split('/').pop()?.split('?')[0];
  if (baseName) {
    for (const [path, resolvedUrl] of Object.entries(avatarModules)) {
      if (path.endsWith(baseName) || resolvedUrl.includes(baseName)) {
        return resolvedUrl;
      }
    }
  }

  return url;
}
