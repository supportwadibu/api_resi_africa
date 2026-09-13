/**
 * Mappe un motif d'échec OTP vers un message lisible utilisateur.
 */
export function otpReasonMessage(reason: string): string {
  switch (reason) {
    case 'expired':
      return 'Le code OTP a expiré.'
    case 'max_attempts':
      return 'Trop de tentatives. Demandez un nouveau code.'
    case 'invalid_code':
      return 'Code OTP invalide.'
    default:
      return 'Vérification OTP échouée.'
  }
}
