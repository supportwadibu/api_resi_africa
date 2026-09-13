import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

export class HashService {
  static async make(value: string): Promise<string> {
    return bcrypt.hash(value, SALT_ROUNDS)
  }

  static async verify(value: string, hash: string): Promise<boolean> {
    return bcrypt.compare(value, hash)
  }
}

export default HashService
