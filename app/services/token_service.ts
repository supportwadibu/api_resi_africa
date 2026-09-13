import crypto from 'node:crypto'

import env from '#start/env'
import jwt, { type SignOptions } from 'jsonwebtoken'

export interface AccessTokenPayload {
  sub: string // user_id
  role: string // role name
  jti: string
}

export interface RefreshTokenPayload {
  sub: string
  jti: string
  type: 'refresh'
}

const ACCESS_TTL = env.get('JWT_ACCESS_TTL') ?? '15m'
const REFRESH_TTL = env.get('JWT_REFRESH_TTL') ?? '30d'

export class TokenService {
  /** Crée un access token JWT signé. */
  static signAccess(payload: Omit<AccessTokenPayload, 'jti'> & { jti?: string }): {
    token: string
    jti: string
    expiresIn: string
  } {
    const jti = payload.jti ?? crypto.randomUUID()
    const token = jwt.sign({ ...payload, jti }, env.get('JWT_ACCESS_SECRET'), {
      expiresIn: ACCESS_TTL as SignOptions['expiresIn'],
    })
    return { token, jti, expiresIn: ACCESS_TTL }
  }

  /** Crée un refresh token JWT signé. */
  static signRefresh(payload: Omit<RefreshTokenPayload, 'jti' | 'type'>): {
    token: string
    jti: string
    expiresIn: string
  } {
    const jti = crypto.randomUUID()
    const options: SignOptions = { expiresIn: REFRESH_TTL as SignOptions['expiresIn'] }
    const token = jwt.sign(
      { ...payload, jti, type: 'refresh' },
      env.get('JWT_REFRESH_SECRET'),
      options
    )
    return { token, jti, expiresIn: REFRESH_TTL }
  }

  static verifyAccess(token: string): AccessTokenPayload {
    return jwt.verify(token, env.get('JWT_ACCESS_SECRET')) as AccessTokenPayload
  }

  static verifyRefresh(token: string): RefreshTokenPayload {
    return jwt.verify(token, env.get('JWT_REFRESH_SECRET')) as RefreshTokenPayload
  }

  /** Hash SHA-256 d'un refresh token pour stockage en base. */
  static hashRefresh(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }
}

export default TokenService
