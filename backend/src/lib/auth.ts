import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { CookieOptions, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import prisma from './prisma';

export const BCRYPT_SALT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 6;
export const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
export const REFRESH_TOKEN_DAYS = Math.max(
  1,
  Number(process.env.REFRESH_TOKEN_DAYS || 7) || 7
);
export const REFRESH_COOKIE_NAME = 'dms_refresh_token';

const JWT_SECRET = process.env.JWT_SECRET || 'dms-secret-key';

export interface AuthTokenPayload {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  if (!plainPassword || !hashedPassword) {
    return false;
  }
  if (!isBcryptHash(hashedPassword)) {
    return false;
  }
  return bcrypt.compare(plainPassword, hashedPassword);
}

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  }
  return null;
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

export function generateRawRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function getRefreshCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshTokenCookie(res: Response, rawToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, getRefreshCookieOptions());
}

export function clearRefreshTokenCookie(res: Response): void {
  const opts = getRefreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
  });
}

export async function issueRefreshToken(userId: number): Promise<string> {
  const rawToken = generateRawRefreshToken();
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  return rawToken;
}

export async function revokeUserRefreshTokens(userId: number): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export const DEFAULT_DEMO_PASSWORD = '123456';

/**
 * Ensures any legacy plaintext passwords in the User table are hashed with bcryptjs.
 * Legacy demo passwords ('123') are upgraded to DEFAULT_DEMO_PASSWORD ('123456') before hashing.
 * Safe to run idempotently on server bootstrap and after seeding.
 */
export async function ensureHashedUserPasswords(client: PrismaClient): Promise<number> {
  const users = await client.user.findMany({
    select: { id: true, password: true },
  });

  let updatedCount = 0;
  for (const user of users) {
    if (!isBcryptHash(user.password)) {
      const plain = user.password === '123' ? DEFAULT_DEMO_PASSWORD : user.password;
      const hashed = await hashPassword(plain);
      await client.user.update({
        where: { id: user.id },
        data: { password: hashed },
      });
      updatedCount += 1;
    }
  }
  return updatedCount;
}
