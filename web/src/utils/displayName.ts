export function validateDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();

  if (!trimmed) {
    return "Display name is required.";
  }
  if (trimmed.length < 2) {
    return "Display name must be at least 2 characters.";
  }
  if (trimmed.length > 40) {
    return "Display name must be 40 characters or fewer.";
  }

  return null;
}
