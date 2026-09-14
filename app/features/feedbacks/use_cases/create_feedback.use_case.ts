import User from '#models/user'
import { DomainError } from '#utils/domain_error'

import type { CreateFeedbackInput, FeedbackDto } from '../dto/feedback.dto.ts'
import FeedbackRepository from '../repositories/feedback_repository.ts'

/**
 * Délai minimal entre deux envois d'un même utilisateur.
 *
 * Un feedback n'a pas de clé d'idempotence — il n'y a rien d'unique à comparer
 * dans « le calendrier bug ». Cette fenêtre est la protection qui remplace :
 * elle absorbe le double appui sur « Envoyer » et le renvoi immédiat après un
 * timeout réseau, sans empêcher quiconque d'écrire deux fois dans la journée.
 */
const MIN_INTERVAL_MS = 60_000

export class CreateFeedbackUseCase {
  constructor(private repo: FeedbackRepository = new FeedbackRepository()) {}

  async execute(input: CreateFeedbackInput): Promise<FeedbackDto> {
    const user = await User.findById(input.user_id)
    if (!user) {
      throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)
    }

    const lastAt = await this.repo.lastCreatedAt(input.user_id)
    if (lastAt && Date.now() - lastAt.getTime() < MIN_INTERVAL_MS) {
      throw new DomainError(
        'feedback_too_frequent',
        'Merci de patienter un instant avant d’envoyer un nouvel avis.',
        429
      )
    }

    const doc = await this.repo.create({
      ...input,
      // L'auteur est figé ici, jamais reçu du client : il ne doit pas pouvoir
      // signer son message d'un autre nom.
      user_snapshot: {
        full_name: user.full_name,
        phone: user.phone,
        email: user.email,
      },
    })

    return FeedbackRepository.toDto(doc)
  }
}

export default CreateFeedbackUseCase
