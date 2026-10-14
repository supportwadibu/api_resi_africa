/**
 * Erreur métier générique. Convertie en réponse JSON par le HttpExceptionHandler.
 * À utiliser dans les usecases pour signaler une violation des règles métier.
 */
export class DomainError extends Error {
  status: number
  code: string

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.status = status
  }
}

export default DomainError
