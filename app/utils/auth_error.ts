/**
 * Erreur métier pour le flux d'authentification.
 * Convertie en réponse JSON par le HttpExceptionHandler.
 */
export class AuthError extends Error {
  status: number
  code: string

  constructor(code: string, message: string, status = 400, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AuthError'
    this.code = code
    this.status = status
  }
}

export default AuthError
