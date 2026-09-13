import AuthController from '#controllers/auth/auth_controller'

export default class ProfileController {
  show = new AuthController().me
}
