import { COLLECTIONS, collection, toDoc, toDocs, toPayload, type WithId } from '#firebase/firestore'
import { OwnerValidationStatusEnum } from '#utils/enums/owner_validation_status'
import { FieldValue } from 'firebase-admin/firestore'

import type { IdDocumentType } from '#utils/enums/id_document_type'
import type { OwnerValidationStatus } from '#utils/enums/owner_validation_status'

export const AUTH_CHANNELS = ['email', 'phone', 'google'] as const
export type AuthChannel = (typeof AUTH_CHANNELS)[number]

/** Fournisseurs d'identité externes supportés. */
export const AUTH_PROVIDERS = ['google'] as const
export type AuthProviderName = (typeof AUTH_PROVIDERS)[number]

/**
 * Identité fournie par un provider OAuth/OIDC externe.
 * `provider_user_id` est le `sub` du token — stable et unique chez le provider.
 */
export interface AuthProviderLink {
  provider: AuthProviderName
  provider_user_id: string
  email: string | null
  linked_at: Date
}

export interface UserProfile {
  company_name: string | null
  siret: string | null
  cin: string | null
  date_of_birth: Date | null

  /** Coordonnées postales, renseignées lors du dépôt du dossier. */
  address: string | null
  city: string | null
  country: string | null

  /**
   * Justificatif d'identité déposé pour la validation du compte.
   *
   * Les deux champs `*_public_id` référencent des ressources chez l'hébergeur
   * de fichiers, jamais des URLs : une URL signée expire, et la persister
   * produirait des liens morts. L'URL de consultation est régénérée à chaque
   * lecture.
   */
  id_document_type: IdDocumentType | null
  id_document_number: string | null
  id_document_front_public_id: string | null
  id_document_back_public_id: string | null

  /**
   * Date de dépôt du dossier complet.
   *
   * Fait aussi office de drapeau « dossier soumis » : tant qu'elle est nulle,
   * l'utilisateur n'a rien envoyé et le cron de fin d'essai le suspendra.
   */
  submitted_at: Date | null
}

export interface UserMetadata {
  created_by: string | null
  created_at: Date
  updated_at: Date
}

export interface UserDocument {
  role_id: string

  full_name: string
  email: string | null
  phone: string | null
  avatar_url: string | null

  auth_channel: AuthChannel
  /**
   * Absent pour les comptes créés via un provider externe (ex. Google).
   * L'unique flux qui le lit (login par mot de passe) doit donc gérer le cas null.
   */
  password: string | null
  /** Identités externes liées à ce compte. Un provider au plus par utilisateur. */
  auth_providers: AuthProviderLink[]
  is_verified: boolean
  is_active: boolean
  last_login_at: Date | null

  profile: UserProfile

  /**
   * Statut de validation administrative.
   * Pertinent uniquement pour les utilisateurs de rôle "proprio".
   */
  owner_status: OwnerValidationStatus

  validated_by: string | null
  validated_at: Date | null
  rejection_reason: string | null

  /**
   * Clé de recherche des identités externes, sous la forme
   * `"<provider>:<provider_user_id>"`.
   *
   * Firestore ne sait pas filtrer sur deux champs d'un même élément de tableau :
   * `where('auth_providers.provider', ...)` combiné à
   * `where('auth_providers.provider_user_id', ...)` testerait les deux
   * conditions sur des éléments *différents* et rattacherait la mauvaise
   * identité. Un tableau de clés composées permet un `array-contains` exact,
   * qui reproduit l'index unique composé de Mongo.
   */
  auth_provider_keys: string[]

  metadata: UserMetadata
}

export type UserRecord = WithId<UserDocument>

/** Construit la clé de recherche d'une identité externe. */
export function authProviderKey(provider: AuthProviderName, providerUserId: string): string {
  return `${provider}:${providerUserId}`
}

function users() {
  return collection<UserDocument>(COLLECTIONS.users)
}

/** Valeurs par défaut, équivalent des `default:` du schéma Mongoose. */
function withDefaults(input: Partial<UserDocument>): UserDocument {
  const now = new Date()
  const providers = input.auth_providers ?? []

  return {
    role_id: input.role_id ?? '',
    full_name: input.full_name ?? '',
    email: input.email ?? null,
    phone: input.phone ?? null,
    avatar_url: input.avatar_url ?? null,
    auth_channel: input.auth_channel ?? 'email',
    password: input.password ?? null,
    auth_providers: providers,
    is_verified: input.is_verified ?? false,
    is_active: input.is_active ?? true,
    last_login_at: input.last_login_at ?? null,
    profile: {
      company_name: input.profile?.company_name ?? null,
      siret: input.profile?.siret ?? null,
      cin: input.profile?.cin ?? null,
      date_of_birth: input.profile?.date_of_birth ?? null,
      address: input.profile?.address ?? null,
      city: input.profile?.city ?? null,
      country: input.profile?.country ?? null,
      id_document_type: input.profile?.id_document_type ?? null,
      id_document_number: input.profile?.id_document_number ?? null,
      id_document_front_public_id: input.profile?.id_document_front_public_id ?? null,
      id_document_back_public_id: input.profile?.id_document_back_public_id ?? null,
      submitted_at: input.profile?.submitted_at ?? null,
    },
    owner_status: input.owner_status ?? OwnerValidationStatusEnum.PENDING,
    validated_by: input.validated_by ?? null,
    validated_at: input.validated_at ?? null,
    rejection_reason: input.rejection_reason ?? null,
    auth_provider_keys: providers.map((p) => authProviderKey(p.provider, p.provider_user_id)),
    metadata: {
      created_by: input.metadata?.created_by ?? null,
      created_at: input.metadata?.created_at ?? now,
      updated_at: now,
    },
  }
}

/**
 * Utilisateur mutable, façon document Mongoose.
 *
 * Les use cases modifient des champs puis appellent `save()`. On conserve ce
 * contrat : seuls les champs réellement touchés sont réécrits, ce qui évite
 * d'écraser une modification concurrente sur le reste du document.
 */
export class UserEntity {
  private readonly dirty = new Set<keyof UserDocument>()

  constructor(private readonly data: UserRecord) {}

  get _id(): string {
    return this.data._id
  }

  /** Vue lecture seule du document, pour les DTO et les transformers. */
  get raw(): UserRecord {
    return this.data
  }

  get role_id(): string {
    return this.data.role_id
  }
  get full_name(): string {
    return this.data.full_name
  }
  get email(): string | null {
    return this.data.email
  }
  get phone(): string | null {
    return this.data.phone
  }
  get password(): string | null {
    return this.data.password
  }
  get is_verified(): boolean {
    return this.data.is_verified
  }
  get is_active(): boolean {
    return this.data.is_active
  }
  get owner_status(): OwnerValidationStatus {
    return this.data.owner_status
  }
  get auth_channel(): AuthChannel {
    return this.data.auth_channel
  }
  get avatar_url(): string | null {
    return this.data.avatar_url
  }
  get auth_providers(): AuthProviderLink[] {
    return this.data.auth_providers
  }
  get last_login_at(): Date | null {
    return this.data.last_login_at
  }
  get profile(): UserProfile {
    return this.data.profile
  }
  get metadata(): UserMetadata {
    return this.data.metadata
  }

  set full_name(value: string) {
    this.data.full_name = value
    this.dirty.add('full_name')
  }
  set email(value: string | null) {
    this.data.email = value
    this.dirty.add('email')
  }
  set phone(value: string | null) {
    this.data.phone = value
    this.dirty.add('phone')
  }
  set password(value: string | null) {
    this.data.password = value
    this.dirty.add('password')
  }
  set avatar_url(value: string | null) {
    this.data.avatar_url = value
    this.dirty.add('avatar_url')
  }
  set is_verified(value: boolean) {
    this.data.is_verified = value
    this.dirty.add('is_verified')
  }
  set is_active(value: boolean) {
    this.data.is_active = value
    this.dirty.add('is_active')
  }
  set last_login_at(value: Date | null) {
    this.data.last_login_at = value
    this.dirty.add('last_login_at')
  }
  set owner_status(value: OwnerValidationStatus) {
    this.data.owner_status = value
    this.dirty.add('owner_status')
  }

  /**
   * Remplace le profil complet.
   *
   * Le profil est réécrit en bloc plutôt que champ par champ : Firestore
   * remplace un objet imbriqué dans son intégralité lors d'un `update`, et une
   * écriture partielle effacerait silencieusement les champs non transmis.
   * L'appelant doit donc fusionner sur la valeur lue.
   */
  set profile(value: UserProfile) {
    this.data.profile = value
    this.dirty.add('profile')
  }

  /**
   * Remplace les identités externes liées.
   * Maintient `auth_provider_keys` en cohérence — l'oublier rendrait le compte
   * introuvable à la prochaine connexion via ce provider.
   */
  set auth_providers(value: AuthProviderLink[]) {
    this.data.auth_providers = value
    this.data.auth_provider_keys = value.map((p) => authProviderKey(p.provider, p.provider_user_id))
    this.dirty.add('auth_providers')
    this.dirty.add('auth_provider_keys')
  }

  /** Persiste les seuls champs modifiés depuis la lecture. */
  async save(): Promise<void> {
    if (this.dirty.size === 0) return

    const patch: Record<string, unknown> = {}
    for (const key of this.dirty) {
      patch[key] = this.data[key]
    }
    patch.metadata = { ...this.data.metadata, updated_at: new Date() }

    await users().doc(this.data._id).update(toPayload(patch))
    this.dirty.clear()
  }
}

/**
 * Accès à la collection `users`.
 *
 * Conserve les noms de Mongoose (`findOne`, `findById`, `create`) : les use
 * cases n'ont pas à connaître le moteur de stockage sous-jacent.
 */
const User = {
  async findById(id: string): Promise<UserEntity | null> {
    if (!id) return null
    const snapshot = await users().doc(id).get()
    const doc = toDoc<UserDocument>(snapshot)
    return doc ? new UserEntity(doc) : null
  },

  /**
   * Recherche par e-mail, téléphone ou identité externe.
   *
   * Seules ces trois formes sont utilisées par les flux d'authentification ;
   * les exposer explicitement évite de reconstruire un traducteur de requêtes
   * Mongo, et rend visible tout index nécessaire.
   */
  async findOne(filter: {
    email?: string | null
    phone?: string | null
    auth_provider?: { provider: AuthProviderName; provider_user_id: string }
  }): Promise<UserEntity | null> {
    let query = users().limit(1)

    if (filter.auth_provider) {
      query = query.where(
        'auth_provider_keys',
        'array-contains',
        authProviderKey(filter.auth_provider.provider, filter.auth_provider.provider_user_id)
      )
    } else if (filter.email) {
      query = query.where('email', '==', filter.email)
    } else if (filter.phone) {
      query = query.where('phone', '==', filter.phone)
    } else {
      return null
    }

    const snapshot = await query.get()
    if (snapshot.empty) return null

    const doc = toDoc<UserDocument>(snapshot.docs[0])
    return doc ? new UserEntity(doc) : null
  },

  /**
   * Crée un utilisateur.
   *
   * Firestore n'a pas d'index unique : l'unicité de `email` et `phone` est
   * vérifiée par lecture préalable. Ce contrôle n'est pas atomique — deux
   * inscriptions simultanées avec le même e-mail peuvent passer. Les règles de
   * sécurité et le flux OTP limitent la portée du problème ; une garantie
   * stricte demanderait une collection de réservation dédiée.
   */
  async create(input: Partial<UserDocument>): Promise<UserEntity> {
    if (input.email) {
      const existing = await User.findOne({ email: input.email })
      if (existing) {
        throw new Error(`Un compte existe déjà avec l'e-mail ${input.email}.`)
      }
    }
    if (input.phone) {
      const existing = await User.findOne({ phone: input.phone })
      if (existing) {
        throw new Error(`Un compte existe déjà avec le numéro ${input.phone}.`)
      }
    }

    const payload = withDefaults(input)
    const docRef = await users().add(toPayload(payload) as unknown as UserDocument)

    return new UserEntity({ ...payload, _id: docRef.id })
  },

  async findByIdAndUpdate(id: string, patch: Partial<UserDocument>): Promise<UserEntity | null> {
    const updates: Record<string, unknown> = { ...patch }
    updates['metadata.updated_at'] = new Date()

    await users().doc(id).update(toPayload(updates))
    return User.findById(id)
  },

  /** Liste paginée des utilisateurs d'un rôle, filtrée par statut de validation. */
  async findByRole(
    roleId: string,
    options: { status?: OwnerValidationStatus | null; limit: number; offset: number }
  ): Promise<UserRecord[]> {
    let query = users().where('role_id', '==', roleId)

    if (options.status) {
      query = query.where('owner_status', '==', options.status)
    }

    const snapshot = await query
      .orderBy('metadata.created_at', 'desc')
      .offset(options.offset)
      .limit(options.limit)
      .get()

    return toDocs<UserDocument>(snapshot.docs)
  },

  /**
   * Compte les utilisateurs d'un rôle, éventuellement filtrés par statut.
   * S'appuie sur l'agrégat serveur : le volume de documents n'a pas d'impact
   * sur le coût.
   */
  async countByRole(roleId: string, status?: OwnerValidationStatus | null): Promise<number> {
    let query = users().where('role_id', '==', roleId) as FirebaseFirestore.Query<UserDocument>

    if (status) {
      query = query.where('owner_status', '==', status)
    }

    const snapshot = await query.count().get()
    return snapshot.data().count
  },

  /** Lecture ciblée : le document existe et porte bien le rôle attendu. */
  async findByIdAndRole(id: string, roleId: string): Promise<UserEntity | null> {
    const user = await User.findById(id)
    if (!user || user.role_id !== roleId) return null
    return user
  },

  /** Horodate la dernière connexion sans relire le document. */
  async touchLastLogin(id: string): Promise<void> {
    await users().doc(id).update({
      'last_login_at': FieldValue.serverTimestamp(),
      'metadata.updated_at': FieldValue.serverTimestamp(),
    })
  },
}

export default User
