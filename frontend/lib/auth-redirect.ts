export function getAdminLoginRedirect(customPath?: string): string {
  const targetPath = customPath || '/admin';
  return `/api/auth/signin?callbackUrl=${encodeURIComponent(targetPath)}`;
}
