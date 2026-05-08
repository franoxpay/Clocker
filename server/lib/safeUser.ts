import type { User } from "@shared/schema";

const SENSITIVE_FIELDS = ["password"] as const;

export type SafeUser = Omit<User, "password">;

export function toSafeUser(user: User): SafeUser {
  const safe = { ...user } as any;
  for (const field of SENSITIVE_FIELDS) {
    delete safe[field];
  }
  return safe as SafeUser;
}

export function toSafeUsers(users: User[]): SafeUser[] {
  return users.map(toSafeUser);
}
