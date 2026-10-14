import type { UserDocument } from '#models/user'

import { BaseTransformer } from '@adonisjs/core/transformers'

export default class UserTransformer extends BaseTransformer<UserDocument> {
  toObject() {
    return {
      full_name: this.resource.full_name,
      email: this.resource.email,
      phone: this.resource.phone,
      avatar_url: this.resource.avatar_url,
      auth_channel: this.resource.auth_channel,
      is_verified: this.resource.is_verified,
      is_active: this.resource.is_active,
      owner_status: this.resource.owner_status,
    }
  }
}
