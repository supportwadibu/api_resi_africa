import NotificationRepository from '../repositories/notification_repository.ts'

/**
 * Enregistre l'appareil d'un compte pour les notifications push.
 *
 * Appelé à chaque connexion et à chaque renouvellement du jeton par FCM :
 * l'écriture est idempotente, le jeton désignant son propre document.
 */
export class RegisterDeviceTokenUseCase {
  constructor(private repo: NotificationRepository = new NotificationRepository()) {}

  async execute(input: {
    user_id: string
    role: string
    token: string
    platform: 'android' | 'ios' | 'web'
  }): Promise<void> {
    await this.repo.registerDevice(input)
  }
}

/** Retire l'appareil du compte, à la déconnexion : il ne doit plus rien recevoir. */
export class UnregisterDeviceTokenUseCase {
  constructor(private repo: NotificationRepository = new NotificationRepository()) {}

  async execute(userId: string, token: string): Promise<void> {
    await this.repo.unregisterDevice(token, userId)
  }
}

export default RegisterDeviceTokenUseCase
