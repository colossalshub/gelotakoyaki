const BLOCKED = new Set([
  "password",
  "password123",
  "password1234",
  "admin123",
  "admin123456",
  "changeme",
  "changeme123",
  "gelos",
  "gelostakoyaki",
  "ownerpassword",
  "letmein12345",
]);

export function passwordError(password: string): string | null {
  if (password.length < 12 || password.length > 200) {
    return "Use a password between 12 and 200 characters.";
  }
  if (BLOCKED.has(password.toLowerCase())) {
    return "That password is too common. Choose a different one.";
  }
  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeSku(sku: string): string {
  return sku.trim().replace(/\s+/g, " ").toUpperCase();
}
