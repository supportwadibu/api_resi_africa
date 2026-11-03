import crypto from 'node:crypto'

import env from '#start/env'
import jwt, { type SignOptions, type VerifyOptions } from 'jsonwebtoken'

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

/**
 * Algorithme épinglé : la bibliothèque déduit sinon les algorithmes admis du
 * type de clé, et un changement de clé ou de version ne doit pas élargir ce
 * qu'elle accepte.
 */
const VERIFY_OPTIONS: VerifyOptions = { algorithms: ['HS256'] }

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

  /**
   * Un refresh token est refusé ici même s'il est correctement signé : si les
   * deux secrets venaient à être identiques, il passerait sinon pour un access
   * token valable trente jours, que la déconnexion ne révoquerait pas — la
   * révocation se lit sur le `jti` de l'access token.
   */
  static verifyAccess(token: string): AccessTokenPayload {
    const payload = jwt.verify(token, env.get('JWT_ACCESS_SECRET'), VERIFY_OPTIONS) as
      | AccessTokenPayload
      | RefreshTokenPayload
    if ('type' in payload && payload.type === 'refresh') {
      throw new jwt.JsonWebTokenError('refresh token présenté comme access token')
    }
    return payload as AccessTokenPayload
  }

  static verifyRefresh(token: string): RefreshTokenPayload {
    const payload = jwt.verify(
      token,
      env.get('JWT_REFRESH_SECRET'),
      VERIFY_OPTIONS
    ) as RefreshTokenPayload
    if (payload.type !== 'refresh') {
      throw new jwt.JsonWebTokenError('access token présenté comme refresh token')
    }
    return payload
  }

  /** Hash SHA-256 d'un refresh token pour stockage en base. */
  static hashRefresh(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }
}

export default TokenService
