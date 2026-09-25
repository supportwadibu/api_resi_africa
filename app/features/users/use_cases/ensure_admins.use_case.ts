import HashService from '#services/hash_service'
import { DomainError } from '#utils/domain_error'

import type { AdminSeed } from '../admin_seeds.ts'

import UserRepository from '../repositories/user_repository.ts'

export interface EnsureAdminsReport {
  created: string[]
  /** Déjà administrateurs : laissés tels quels, mot de passe compris. */
  existing: string[]
  /** E-mails non traités, avec la raison. */
  conflicts: { email: string; reason: string }[]
}

/**
 * Garantit l'existence de comptes administrateurs.
 *
 * Rejouable à chaque démarrage : un compte déjà admin n'est jamais réécrit —
 * son mot de passe a pu être changé depuis, et le remettre à la valeur de
 * départ serait une régression silencieuse. Un compte d'un autre rôle n'est
 * jamais promu : un `proprio` devenu admin laisserait logements, réservations
 * et abonnement orphelins.
 *
 * Traitement en série : deux entrées portant le même téléphone doivent
 * s'ordonner, la seconde échouant proprement sur le contrôle d'unicité.
 */
export class EnsureAdminsUseCase {
  constructor(
    private repo: Pick<
      UserRepository,
      'findRoleId' | 'findByEmail' | 'createAccount'
    > = new UserRepository(),
    private hash: (value: string) => Promise<string> = (value) => HashService.make(value)
  ) {}

  async execute(admins: AdminSeed[]): Promise<EnsureAdminsReport> {
    const report: EnsureAdminsReport = { created: [], existing: [], conflicts: [] }
    if (admins.length === 0) return report

    const roleId = await this.repo.findRoleId('admin')
    if (!roleId) {
      throw new DomainError(
        'role_not_found',
        'Rôle « admin » absent : lancez d’abord `node ace seed:roles`.',
        500
      )
    }

    for (const admin of admins) {
      const existing = await this.repo.findByEmail(admin.email)
      if (existing) {
        if (existing.role_id === roleId) {
          report.existing.push(admin.email)
        } else {
          report.conflicts.push({
            email: admin.email,
            reason: 'e-mail déjà porté par un compte d’un autre rôle, non modifié',
          })
        }
        continue
      }

      try {
        await this.repo.createAccount({
          role_id: roleId,
          full_name: admin.full_name,
          email: admin.email,
          phone: admin.phone ?? null,
          password: await this.hash(admin.password),
          auth_channel: 'email',
          // Pas d'OTP : le compte est déclaré par qui administre le serveur.
          is_verified: true,
          is_active: true,
        })
        report.created.push(admin.email)
      } catch (error) {
        // `User.create` lève un `Error` brut quand le téléphone est déjà pris.
        report.conflicts.push({
          email: admin.email,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return report
  }
}

export default EnsureAdminsUseCase
